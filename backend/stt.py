"""
Speech-to-text integration using Groq Whisper.
"""
import logging
import os
import tempfile

logger = logging.getLogger(__name__)

_groq_client = None

# Common Whisper artifacts / filler utterances to ignore
HALLUCINATIONS = {
    "", "you", "the", "a", "i", "um", "uh", "hmm", "ah", "oh",
    "bye", "okay", "ok", "hey", "hi", "hello",
    "thank you", "thanks", "thank you.", "thanks.",
    "thanks for watching", "thank you for watching",
    "subscribe", "like and subscribe",
    "thanks for listening", "see you next time",
    "subtitles by", "translated by", "amara.org",
    "you're welcome", "goodbye", "see you",
    "thank you for watching.", "thanks for watching.",
    "please subscribe", "please like and subscribe",
    "music", "applause", "laughter",
    "...", ".", ",",
}


def _get_groq():
    global _groq_client
    if _groq_client is None:
        key = os.getenv("GROQ_API_KEY", "")
        if not key:
            logger.error("GROQ_API_KEY not set!")
            return None
        from groq import Groq
        _groq_client = Groq(api_key=key)
        logger.info("Groq client ready")
    return _groq_client


def transcribe_audio_bytes(audio_bytes, language="en", audio_format="webm"):
    """Transcribe audio using Groq Whisper API. Returns text or empty string."""
    client = _get_groq()
    if not client:
        logger.error("No Groq client available")
        return ""

    # Map format to file extension
    ext_map = {"webm": "webm", "ogg": "ogg", "mp4": "mp4", "wav": "wav", "mp3": "mp3", "mpeg": "mp3"}
    ext = ext_map.get(audio_format.lower(), "webm")

    logger.info(f"Transcribing {len(audio_bytes)} bytes (.{ext})...")

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}") as f:
            f.write(audio_bytes)
            tmp = f.name

        with open(tmp, "rb") as af:
            result = client.audio.transcriptions.create(
                model="whisper-large-v3",
                file=af,
                language=language,
                response_format="text",
            )

        text = result.strip() if isinstance(result, str) else str(result).strip()
        
        # Filter hallucinations
        cleaned = text.lower().rstrip(".!?,").strip()
        if cleaned in HALLUCINATIONS or (len(cleaned.split()) == 1 and len(cleaned) <= 3):
            logger.info(f"Filtered hallucination: '{text}'")
            return ""

        logger.info(f"Transcribed: '{text}'")
        return text

    except Exception as e:
        logger.error(f"Groq transcribe error: {e}")
        return ""
    finally:
        try:
            os.unlink(tmp)
        except:
            pass
