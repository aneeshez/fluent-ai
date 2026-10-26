import json
import logging
import os
import time
from datetime import datetime, timedelta

from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.db.models import Sum
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from .models import Feedback, PracticeSession, Transcript, UserProfile, WritingSubmission
from .nlp import analyze_text

logger = logging.getLogger(__name__)


def _email_is_valid(email):
    try:
        validate_email(email)
        return True
    except ValidationError:
        return False

CHALLENGE_XP = {
    "self_intro": 20,
    "describe_home": 25,
    "favorite_food": 35,
    "story_telling": 40,
    "job_interview": 75,
    "morning_routine": 50,
    "interview_prep": 60,
    "debate": 80,
}


def index(request):
    return render(request, "index.html")


def _json_body(request):
    try:
        data = json.loads(request.body or b"{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None, JsonResponse({"error": "Invalid JSON body."}, status=400)
    if not isinstance(data, dict):
        return None, JsonResponse({"error": "A JSON object is required."}, status=400)
    return data, None


def _auth_required(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Please log in to continue."}, status=401)
    return None


@ensure_csrf_cookie
@require_GET
def csrf_token_view(request):
    return JsonResponse({"csrfToken": get_token(request)})


@require_GET
def health_check(request):
    return JsonResponse({"status": "ok", "framework": "django"})


@require_POST
def register_view(request):
    data, error = _json_body(request)
    if error:
        return error

    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = data.get("password", "")
    if len(name) < 2 or len(name) > 100:
        return JsonResponse({"error": "Enter a name between 2 and 100 characters."}, status=400)
    if len(email) > 254 or not _email_is_valid(email):
        return JsonResponse({"error": "Enter a valid email address."}, status=400)
    if not isinstance(password, str):
        return JsonResponse({"error": "Enter a valid password."}, status=400)
    if request.user.is_authenticated:
        return JsonResponse({"error": "Log out before creating another account."}, status=400)

    from django.contrib.auth import get_user_model
    User = get_user_model()
    if User.objects.filter(email__iexact=email).exists() or User.objects.filter(username__iexact=email).exists():
        return JsonResponse({"error": "This email is already registered. Try logging in."}, status=409)

    candidate = User(username=email, email=email, first_name=name[:150])
    try:
        validate_password(password, user=candidate)
    except ValidationError as exc:
        return JsonResponse({"error": " ".join(exc.messages)}, status=400)

    try:
        with transaction.atomic():
            candidate.set_password(password)
            candidate.save()
            UserProfile.objects.create(user=candidate, email=email, name=name)
    except Exception:
        logger.exception("Account creation failed")
        return JsonResponse({"error": "We could not create your account. Please try again."}, status=500)

    login(request, candidate)
    return JsonResponse({"user": _serialize_user(candidate)}, status=201)


@require_POST
def login_view(request):
    data, error = _json_body(request)
    if error:
        return error
    email = str(data.get("email", "")).strip().lower()
    password = data.get("password", "")
    if not email or not isinstance(password, str) or not password:
        return JsonResponse({"error": "Enter your email and password."}, status=400)

    from django.contrib.auth import get_user_model
    User = get_user_model()
    account = User.objects.filter(email__iexact=email).only("username").first()
    user = authenticate(request, username=account.username if account else email, password=password)
    if user is None:
        return JsonResponse({"error": "The email or password is incorrect."}, status=401)
    login(request, user)
    return JsonResponse({"user": _serialize_user(user)})


def _serialize_user(user):
    profile, _ = UserProfile.objects.get_or_create(
        user=user,
        defaults={"name": user.get_full_name() or user.email, "email": user.email},
    )
    return {
        "id": user.pk,
        "name": profile.name,
        "email": user.email,
        "createdAt": profile.created_at.isoformat(),
        "provider": "email",
    }


@require_GET
def current_user_view(request):
    denied = _auth_required(request)
    if denied:
        return denied
    return JsonResponse({"user": _serialize_user(request.user)})


@require_POST
def logout_view(request):
    logout(request)
    return JsonResponse({"status": "ok"})


@require_POST
def update_profile_view(request):
    denied = _auth_required(request)
    if denied:
        return denied
    data, error = _json_body(request)
    if error:
        return error
    name = str(data.get("name", "")).strip()
    email = str(data.get("email", request.user.email)).strip().lower()
    if len(name) < 2 or len(name) > 100:
        return JsonResponse({"error": "Enter a name between 2 and 100 characters."}, status=400)
    if len(email) > 254 or not _email_is_valid(email):
        return JsonResponse({"error": "Enter a valid email address."}, status=400)
    from django.contrib.auth import get_user_model
    if get_user_model().objects.filter(email__iexact=email).exclude(pk=request.user.pk).exists():
        return JsonResponse({"error": "That email address is already in use."}, status=409)
    profile, _ = UserProfile.objects.get_or_create(
        user=request.user,
        defaults={"name": name, "email": request.user.email},
    )
    profile.name = name
    profile.save(update_fields=["name"])
    request.user.first_name = name
    request.user.email = email
    request.user.username = email
    request.user.save(update_fields=["first_name", "email", "username"])
    profile.email = email
    profile.save(update_fields=["email"])
    return JsonResponse({"user": _serialize_user(request.user)})


@require_POST
def change_password_view(request):
    denied = _auth_required(request)
    if denied:
        return denied
    data, error = _json_body(request)
    if error:
        return error
    current = data.get("current_password", "")
    new_password = data.get("new_password", "")
    if not isinstance(current, str):
        return JsonResponse({"error": "Enter your current password."}, status=400)
    if not request.user.check_password(current):
        return JsonResponse({"error": "Current password is incorrect."}, status=400)
    if not isinstance(new_password, str):
        return JsonResponse({"error": "Enter a valid new password."}, status=400)
    try:
        validate_password(new_password, user=request.user)
    except ValidationError as exc:
        return JsonResponse({"error": " ".join(exc.messages)}, status=400)
    request.user.set_password(new_password)
    request.user.save(update_fields=["password"])
    update_session_auth_hash(request, request.user)
    return JsonResponse({"status": "ok"})


@require_POST
def reset_progress_view(request):
    denied = _auth_required(request)
    if denied:
        return denied
    profile = UserProfile.objects.filter(user=request.user).first()
    if profile:
        PracticeSession.objects.filter(user=profile).delete()
    WritingSubmission.objects.filter(user=request.user).delete()
    return JsonResponse({"status": "ok"})


@require_POST
def delete_account_view(request):
    denied = _auth_required(request)
    if denied:
        return denied
    data, error = _json_body(request)
    if error:
        return error
    password = data.get("password", "")
    if not isinstance(password, str) or not request.user.check_password(password):
        return JsonResponse({"error": "Your password is incorrect."}, status=400)
    user = request.user
    logout(request)
    user.delete()
    return JsonResponse({"status": "ok"})


@require_POST
def chat_view(request):
    data, error = _json_body(request)
    if error:
        return error

    text = str(data.get("text", "")).strip()
    if not text:
        return JsonResponse({"error": "Text is required."}, status=400)
    if len(text) > 5000:
        return JsonResponse({"error": "Please keep each message under 5,000 characters."}, status=400)

    challenge = str(data.get("challenge") or "")[:50] or None
    if challenge not in CHALLENGE_XP:
        challenge = None
    confidence_level = data.get("confidence_level")
    conversation_history = data.get("conversation_history", [])
    if not isinstance(conversation_history, list):
        conversation_history = []
    conversation_history = [
        {"type": "user" if item.get("type") == "user" else "ai", "text": str(item.get("text", ""))[:5000]}
        for item in conversation_history[-10:]
        if isinstance(item, dict)
    ]

    profile = None
    if request.user.is_authenticated:
        profile, _ = UserProfile.objects.get_or_create(
            user=request.user,
            defaults={"name": request.user.get_full_name() or request.user.email, "email": request.user.email},
        )

    session = None
    session_id = data.get("session_id")
    if session_id:
        sessions = PracticeSession.objects.filter(id=session_id)
        if profile:
            sessions = sessions.filter(user=profile)
        else:
            sessions = sessions.filter(user__isnull=True)
        session = sessions.first()
    if not session:
        session = PracticeSession.objects.create(user=profile, challenge=challenge)

    user_transcript = Transcript.objects.create(session=session, speaker="user", text=text)
    started = time.monotonic()
    analysis = analyze_text(
        transcript=text,
        challenge=challenge,
        confidence_level=confidence_level,
        conversation_history=conversation_history,
    )
    logger.info("Tutor response generated in %.2fs", time.monotonic() - started)

    response_text = analysis.get("teacher_response") or "Nice effort! Keep practicing, you're doing well!"
    Transcript.objects.create(session=session, speaker="ai", text=response_text)
    Feedback.objects.create(
        transcript=user_transcript,
        corrected_text=analysis.get("corrected_text", text),
        tips_json=json.dumps(analysis.get("tips", [])),
        teacher_response=response_text,
    )
    return JsonResponse({
        "teacher_response": response_text,
        "corrected_text": analysis.get("corrected_text", text),
        "tips": analysis.get("tips", []),
        "session_id": session.pk,
    })


@require_POST
def finish_session_view(request):
    data, error = _json_body(request)
    if error:
        return error
    session_id = data.get("session_id")
    if not session_id:
        return JsonResponse({"error": "Session not found."}, status=404)
    sessions = PracticeSession.objects.filter(pk=session_id)
    if request.user.is_authenticated:
        profile = UserProfile.objects.filter(user=request.user).first()
        sessions = sessions.filter(user=profile) if profile else sessions.none()
    else:
        sessions = sessions.filter(user__isnull=True)
    session = sessions.first()
    if not session:
        return JsonResponse({"error": "Session not found."}, status=404)
    if session.ended_at is None:
        session.ended_at = timezone.now()
        session.duration_seconds = max(0, int((session.ended_at - session.started_at).total_seconds()))
        has_user_speech = session.transcripts.filter(speaker="user").exists()
        session.xp_earned = (CHALLENGE_XP.get(session.challenge, 0) if session.challenge else 10) if has_user_speech else 0
        session.save(update_fields=["ended_at", "duration_seconds", "xp_earned"])
    return JsonResponse({"status": "ok", "xp_earned": session.xp_earned})


def _writing_analysis(text, prompt):
    system = """You are an expert English writing tutor. Return only a JSON object with these fields:
{"grammar_score":0,"vocabulary_score":0,"coherence_score":0,"task_score":0,"strengths":[""],"improvements":[""],"corrected_text":"","errors":[{"original":"","corrected":"","rule":""}]}
Scores must be integers from 0 to 100. Be specific, supportive, and point out only actual errors. corrected_text must preserve the student's meaning."""
    from groq import Groq
    client = Groq(api_key=os.getenv("GROQ_API_KEY", ""))
    completion = client.chat.completions.create(
        model="qwen/qwen3.8-27b",
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": f"Writing prompt: {prompt}\n\nStudent writing:\n{text}"},
        ],
        response_format={"type": "json_object"},
        max_tokens=1200,
        temperature=0.3,
    )
    result = json.loads(completion.choices[0].message.content or "{}")
    for field in ("grammar_score", "vocabulary_score", "coherence_score", "task_score"):
        result[field] = max(0, min(100, int(result.get(field, 0))))
    for field in ("strengths", "improvements", "errors"):
        if not isinstance(result.get(field), list):
            result[field] = []
    result["corrected_text"] = str(result.get("corrected_text") or text)
    return result


@require_POST
def analyze_writing_view(request):
    denied = _auth_required(request)
    if denied:
        return denied
    data, error = _json_body(request)
    if error:
        return error
    text = str(data.get("text", "")).strip()
    prompt = str(data.get("prompt", "")).strip()
    if len(text.split()) < 20:
        return JsonResponse({"error": "Please write at least 20 words."}, status=400)
    if len(text) > 30000:
        return JsonResponse({"error": "Please keep your writing under 30,000 characters."}, status=400)
    if len(prompt) > 3000:
        return JsonResponse({"error": "Please keep the writing prompt under 3,000 characters."}, status=400)
    if not os.getenv("GROQ_API_KEY"):
        return JsonResponse({"error": "Writing analysis is unavailable until a Groq API key is configured."}, status=503)
    try:
        result = _writing_analysis(text, prompt)
    except Exception:
        logger.exception("Writing analysis failed")
        return JsonResponse({"error": "We could not analyze this response right now. Please try again."}, status=502)
    submission = WritingSubmission.objects.create(
        user=request.user,
        prompt=prompt,
        text=text,
        result_json=result,
    )
    result["submission_id"] = submission.pk
    return JsonResponse(result)


@require_GET
def dashboard_view(request):
    denied = _auth_required(request)
    if denied:
        return denied
    profile = UserProfile.objects.filter(user=request.user).first()
    sessions = PracticeSession.objects.filter(user=profile) if profile else PracticeSession.objects.none()
    finished_sessions = sessions.filter(ended_at__isnull=False)
    writings = WritingSubmission.objects.filter(user=request.user)
    words = 0
    for transcript in Transcript.objects.filter(session__in=finished_sessions, speaker="user").only("text"):
        words += len(transcript.text.split())
    session_count = finished_sessions.count()
    minutes = int((finished_sessions.aggregate(total=Sum("duration_seconds"))["total"] or 0) // 60)
    xp = (finished_sessions.aggregate(total=Sum("xp_earned"))["total"] or 0) + (writings.aggregate(total=Sum("xp_earned"))["total"] or 0)
    today = timezone.localdate()
    week_start_date = today - timedelta(days=today.weekday())
    week_start = timezone.make_aware(datetime.combine(week_start_date, datetime.min.time()))
    weekly_sessions = finished_sessions.filter(started_at__gte=week_start)
    weekly_words = 0
    for transcript in Transcript.objects.filter(session__in=weekly_sessions, speaker="user").only("text"):
        weekly_words += len(transcript.text.split())
    weekly = {
        "sessionsCompleted": weekly_sessions.count(),
        "wordsSpoken": weekly_words,
        "writingsCompleted": writings.filter(created_at__gte=week_start).count(),
        "challengesCompleted": weekly_sessions.exclude(challenge__isnull=True).exclude(challenge="").count(),
    }
    practice_dates = {
        timezone.localtime(value).date()
        for value in finished_sessions.values_list("started_at", flat=True)
    }
    streak = 0
    streak_date = today if today in practice_dates else today - timedelta(days=1)
    while streak_date in practice_dates:
        streak += 1
        streak_date -= timedelta(days=1)
    level = "Beginner"
    for threshold, title in ((500, "Elementary"), (1500, "Intermediate"), (3000, "Advanced"), (5000, "Expert")):
        if xp >= threshold:
            level = title
    recent_sessions = []
    for session in sessions.order_by("-started_at")[:10]:
        recent_sessions.append({
            "id": session.pk,
            "challenge": session.challenge or "Free Talk",
            "started_at": session.started_at.isoformat(),
            "duration_seconds": session.duration_seconds,
            "xp_earned": session.xp_earned,
            "transcripts": list(session.transcripts.order_by("timestamp").values("speaker", "text")),
        })
    recent_writings = list(writings.order_by("-created_at").values("id", "prompt", "created_at", "result_json")[:5])
    return JsonResponse({
        "user": _serialize_user(request.user),
        "stats": {
            "wordsSpoken": words,
            "sessionsCompleted": session_count,
            "totalMinutes": minutes,
            "xp": xp,
            "writingsCompleted": writings.count(),
            "challengesCompleted": finished_sessions.exclude(challenge__isnull=True).exclude(challenge="").count(),
            "streak": streak,
            "level": level,
        },
        "weekly": weekly,
        "sessions": recent_sessions,
        "writings": recent_writings,
    })


@require_GET
def export_data_view(request):
    denied = _auth_required(request)
    if denied:
        return denied
    profile = UserProfile.objects.filter(user=request.user).first()
    sessions = PracticeSession.objects.filter(user=profile).order_by("-started_at") if profile else PracticeSession.objects.none()
    session_data = []
    for session in sessions:
        session_data.append({
            "id": session.pk,
            "challenge": session.challenge,
            "started_at": session.started_at.isoformat(),
            "ended_at": session.ended_at.isoformat() if session.ended_at else None,
            "duration_seconds": session.duration_seconds,
            "xp_earned": session.xp_earned,
            "transcripts": list(session.transcripts.order_by("timestamp").values("speaker", "text", "timestamp")),
        })
    writings = list(WritingSubmission.objects.filter(user=request.user).order_by("-created_at").values(
        "id", "prompt", "text", "result_json", "xp_earned", "created_at"
    ))
    return JsonResponse({
        "user": _serialize_user(request.user),
        "sessions": session_data,
        "writings": writings,
        "settings": {},
        "exported_at": timezone.now().isoformat(),
    })
