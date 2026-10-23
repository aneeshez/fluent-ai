import json
import logging
import os
import time

from django.http import JsonResponse, HttpResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt

from .models import UserProfile, PracticeSession, Transcript, Feedback
from .nlp import analyze_text, CHALLENGE_GREETINGS

logger = logging.getLogger(__name__)


def index(request):
    """Serve the primary practice dashboard."""
    return render(request, "practice.html")


def health_check(request):
    """Simple health check endpoint."""
    return JsonResponse({"status": "ok", "framework": "django"})


@csrf_exempt
def chat_view(request):
    """
    Handle user speech text input and return AI tutor response.
    Saves transcripts and session history in SQLite.
    """
    if request.method != "POST":
        return JsonResponse({"error": "POST method required"}, status=405)

    try:
        data = json.loads(request.body.decode("utf-8"))
    except Exception:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    text = data.get("text", "").strip()
    if not text:
        return JsonResponse({"error": "Text is required"}, status=400)

    challenge = data.get("challenge")
    confidence_level = data.get("confidence_level")
    conversation_history = data.get("conversation_history", [])
    session_id = data.get("session_id")

    # Get or create practice session in DB
    session = None
    if session_id:
        session = PracticeSession.objects.filter(id=session_id).first()
    if not session:
        session = PracticeSession.objects.create(challenge=challenge)

    # Save user transcript
    user_tr = Transcript.objects.create(session=session, speaker="user", text=text)

    # Generate AI response via Groq
    t0 = time.time()
    analysis = analyze_text(
        transcript=text,
        challenge=challenge,
        confidence_level=confidence_level,
        conversation_history=conversation_history
    )
    elapsed = time.time() - t0

    response_text = analysis.get("teacher_response", "")
    logger.info(f"AI response generated in {elapsed:.2f}s: '{response_text[:60]}'")

    # Save AI response in DB
    if response_text:
        ai_tr = Transcript.objects.create(session=session, speaker="ai", text=response_text)
        Feedback.objects.create(
            transcript=user_tr,
            corrected_text=analysis.get("corrected_text", ""),
            tips_json=json.dumps(analysis.get("tips", [])),
            teacher_response=response_text
        )

    return JsonResponse({
        "teacher_response": response_text,
        "corrected_text": analysis.get("corrected_text", text),
        "tips": analysis.get("tips", []),
        "session_id": session.id
    })


@csrf_exempt
def analyze_writing_view(request):
    """Analyze student writing submission using Groq."""
    if request.method != "POST":
        return JsonResponse({"error": "POST method required"}, status=405)

    try:
        data = json.loads(request.body.decode("utf-8"))
    except Exception:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    text = data.get("text", "").strip()
    prompt = data.get("prompt", "").strip()

    if not text or len(text.split()) < 20:
        return JsonResponse({"error": "Please write at least 20 words."}, status=400)

    writing_system = """You are an expert English writing tutor. Analyze the student's writing and return a JSON object with these exact fields:
{
  "grammar_score": <int 0-100>,
  "vocabulary_score": <int 0-100>,
  "coherence_score": <int 0-100>,
  "task_score": <int 0-100>,
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "improvements": ["<improvement 1>", "<improvement 2>", "<improvement 3>"],
  "corrected_text": "<the full text with grammar errors corrected>",
  "errors": [
    {"original": "<wrong phrase>", "corrected": "<correct phrase>", "rule": "<grammar rule>"}
  ]
}
Be specific and helpful. Point out actual errors in the text. Give genuine scores based on the quality. Return ONLY valid JSON, no extra text."""

    try:
        from groq import Groq
        client = Groq(api_key=os.getenv("GROQ_API_KEY", ""))
        user_msg = f"Writing prompt: \"{prompt}\"\n\nStudent's writing:\n\"{text}\""
        comp = client.chat.completions.create(
            model="qwen/qwen3.8-27b",
            messages=[
                {"role": "system", "content": writing_system},
                {"role": "user", "content": user_msg},
            ],
            max_tokens=800,
            temperature=0.3,
        )
        reply = comp.choices[0].message.content or "{}"
        reply = reply.strip()
        if reply.startswith("```"):
            reply = reply.split("\n", 1)[1] if "\n" in reply else reply[3:]
            reply = reply.rsplit("```", 1)[0]
        reply = reply.strip()
        result = json.loads(reply)
        return JsonResponse(result)
    except Exception as e:
        logger.error(f"Writing analysis error: {e}")
        return JsonResponse({"error": str(e)}, status=500)
