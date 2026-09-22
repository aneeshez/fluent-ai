import logging
import os
import time

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room

from models import init_db, Session, User
from nlp import analyze_text
from utils import ensure_ffmpeg

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai-tutor")

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), '..', 'frontend')

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='')
app.config["SECRET_KEY"] = os.getenv("FLASK_SECRET", "devsecret")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading", max_http_buffer_size=10 * 1024 * 1024)

engine, SessionLocal = init_db(os.getenv("DATABASE_URL", "sqlite:///database.db"))

# In-memory history keyed by socket session id
session_histories = {}  # sid -> [{"type": "user"/"ai", "text": "..."}]

# --- HTTP routes ---

@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/")
def serve_index():
    return send_from_directory(FRONTEND_DIR, 'practice.html')

@app.route("/<path:filename>")
def serve_frontend(filename):
    return send_from_directory(FRONTEND_DIR, filename)

@app.route("/api/deepgram-key")
def deepgram_key():
    key = os.getenv("DEEPGRAM_API_KEY", "")
    if not key:
        return jsonify({"error": "DEEPGRAM_API_KEY not set in .env"}), 500
    return jsonify({"key": key})



# --- Socket handlers ---

@socketio.on("connect")
def on_connect():
    sid = request.sid
    session_histories[sid] = []
    logger.info(f"🔌 Client connected: {sid}")
    emit("server-ready", {"message": "connected"})

@socketio.on("disconnect")
def on_disconnect():
    sid = request.sid
    session_histories.pop(sid, None)
    logger.info(f"🔌 Client disconnected: {sid}")

@socketio.on("join")
def on_join(data):
    room = data.get("room", "default")
    join_room(room)
    emit("joined", {"room": room})

@socketio.on("clear-history")
def on_clear_history():
    sid = request.sid
    session_histories[sid] = []
    logger.info(f"🧹 History cleared for {sid}")

@socketio.on("speak-greeting")
def on_speak_greeting(data):
    """Generate TTS audio for the greeting message so Luna speaks it aloud."""
    text = data.get("text", "").strip()
    if not text:
        return
    logger.info(f"🎤 Greeting TTS: '{text[:60]}'")
    try:
        from tts import text_to_pcm16
        import base64
        pcm = text_to_pcm16(text)
        if pcm:
            CHUNK = 32000
            total = (len(pcm) + CHUNK - 1) // CHUNK
            for i in range(0, len(pcm), CHUNK):
                chunk = pcm[i:i+CHUNK]
                emit("tts-audio", {
                    "audio": base64.b64encode(chunk).decode(),
                    "index": i // CHUNK,
                    "total": total,
                    "done": (i + CHUNK) >= len(pcm)
                })
            logger.info(f"🔊 Greeting: sent {total} audio chunks ({len(pcm)} bytes)")
    except Exception as e:
        logger.error(f"Greeting TTS error: {e}")

@socketio.on("text-input")
def on_text_input(data):
    """Handle transcribed text — get AI response with full conversation context."""
    text = data.get("text", "").strip()
    if not text or len(text) < 2:
        return

    logger.info(f"📝 Input: '{text}'")
    sid = request.sid
    challenge = data.get("challenge", None)
    confidence_level = data.get("confidence_level", None)

    if challenge:
        logger.info(f"🎯 Challenge: {challenge}")
    if confidence_level:
        logger.info(f"🎯 Confidence: {confidence_level} (score: {data.get('confidence_score', '?')})")

    # Add user message to history
    if sid not in session_histories:
        session_histories[sid] = []
    session_histories[sid].append({"type": "user", "text": text})

    try:
        t0 = time.time()
        analysis = analyze_text(
            text,
            challenge=challenge,
            confidence_level=confidence_level,
            conversation_history=session_histories.get(sid, [])
        )
        elapsed = time.time() - t0
        response_text = analysis.get('teacher_response', '')
        logger.info(f"⚡ AI response in {elapsed:.2f}s: '{response_text[:80]}'")

        # Add AI response to history
        if response_text:
            session_histories[sid].append({"type": "ai", "text": response_text})

        # Keep history manageable (max 20 messages)
        if len(session_histories.get(sid, [])) > 20:
            session_histories[sid] = session_histories[sid][-20:]

        # Send text immediately for display
        emit("ai-feedback", analysis)

        # Generate Deepgram TTS audio and send to frontend for Simli lip-sync
        if response_text:
            try:
                from tts import text_to_pcm16
                import base64
                pcm = text_to_pcm16(response_text)
                if pcm:
                    # Send in chunks (32KB each ~1s of audio at 16kHz 16-bit mono)
                    CHUNK = 32000
                    total = (len(pcm) + CHUNK - 1) // CHUNK
                    for i in range(0, len(pcm), CHUNK):
                        chunk = pcm[i:i+CHUNK]
                        emit("tts-audio", {
                            "audio": base64.b64encode(chunk).decode(),
                            "index": i // CHUNK,
                            "total": total,
                            "done": (i + CHUNK) >= len(pcm)
                        })
                    logger.info(f"🔊 Sent {total} audio chunks ({len(pcm)} bytes)")
            except Exception as tts_err:
                logger.error(f"TTS error: {tts_err}")

    except Exception as exc:
        logger.error(f"Error: {exc}", exc_info=True)
        emit("error", {"message": str(exc)})

# --- Writing analysis ---
WRITING_SYSTEM = """You are an expert English writing tutor. Analyze the student's writing and return a JSON object with these exact fields:
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

@app.route("/api/analyze-writing", methods=["POST", "OPTIONS"])
def analyze_writing():
    if request.method == "OPTIONS":
        return jsonify({}), 200

    data = request.get_json()
    text = data.get("text", "").strip()
    prompt = data.get("prompt", "").strip()

    if not text or len(text.split()) < 20:
        return jsonify({"error": "Please write at least 20 words."}), 400

    try:
        from groq import Groq
        client = Groq(api_key=os.getenv("GROQ_API_KEY", ""))
        user_msg = f"Writing prompt: \"{prompt}\"\n\nStudent's writing:\n\"{text}\""
        comp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": WRITING_SYSTEM},
                {"role": "user", "content": user_msg},
            ],
            max_tokens=800,
            temperature=0.3,
        )
        reply = comp.choices[0].message.content or "{}"
        import json as json_mod
        reply = reply.strip()
        if reply.startswith("```"):
            reply = reply.split("\n", 1)[1] if "\n" in reply else reply[3:]
            reply = reply.rsplit("```", 1)[0]
        reply = reply.strip()
        result = json_mod.loads(reply)
        logger.info(f"Writing analysis complete: grammar score={result.get('grammar_score')}")
        return jsonify(result)
    except Exception as e:
        logger.error(f"Writing analysis error: {e}")
        return jsonify({"error": str(e)}), 500

# CORS handled by flask-cors
CORS(app)

def seed_demo_user():
    db = SessionLocal()
    user = db.query(User).filter_by(email="demo@example.com").first()
    if not user:
        user = User(name="Demo User", email="demo@example.com")
        db.add(user)
        db.commit()
    db.close()

if __name__ == "__main__":
    ensure_ffmpeg()
    seed_demo_user()
    logger.info("Starting FluentAI backend on port 5000")
    socketio.run(app, host="0.0.0.0", port=5000, debug=True, allow_unsafe_werkzeug=True)
