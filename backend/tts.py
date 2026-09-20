"""
Text-to-speech synthesis with Edge-TTS and Deepgram Aura fallback.
Generates PCM16 16kHz mono audio for client-side audio playback and lip-sync.
"""
import asyncio
import io
import logging
import os
import struct
import requests

logger = logging.getLogger(__name__)

# Edge-TTS settings
EDGE_VOICE = "en-US-JennyNeural"

async def _edge_tts_async(text: str) -> bytes:
    """Generate PCM16 16kHz mono audio using Edge-TTS."""
    try:
        import edge_tts
        communicate = edge_tts.Communicate(text, EDGE_VOICE, rate="+5%")
        mp3_chunks = []
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                mp3_chunks.append(chunk["data"])

        if not mp3_chunks:
            return b""

        mp3_data = b"".join(mp3_chunks)

        # Convert MP3 to PCM16 16kHz mono using pydub
        from pydub import AudioSegment
        audio = AudioSegment.from_mp3(io.BytesIO(mp3_data))
        audio = audio.set_frame_rate(16000).set_channels(1).set_sample_width(2)
        raw = audio.raw_data
        logger.info(f"Edge-TTS audio ready: {len(raw)} bytes ({len(raw)/32000:.1f}s)")
        return raw

    except Exception as e:
        logger.error(f"Edge-TTS error: {e}")
        return b""


def _edge_tts_sync(text: str) -> bytes:
    """Synchronous wrapper for Edge-TTS."""
    try:
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(_edge_tts_async(text))
        loop.close()
        return result
    except Exception as e:
        logger.error(f"Edge-TTS sync error: {e}")
        return b""


# Deepgram Aura fallback
DEEPGRAM_TTS_URL = "https://api.deepgram.com/v1/speak"
DEEPGRAM_VOICE = "aura-asteria-en"

def _deepgram_tts(text: str) -> bytes:
    """Convert text to PCM16 16kHz mono using Deepgram Aura TTS."""
    key = os.getenv("DEEPGRAM_API_KEY", "")
    if not key:
        return b""

    try:
        resp = requests.post(
            f"{DEEPGRAM_TTS_URL}?model={DEEPGRAM_VOICE}&encoding=linear16&sample_rate=16000&container=none",
            headers={
                "Authorization": f"Token {key}",
                "Content-Type": "text/plain",
            },
            data=text.encode("utf-8"),
            timeout=10,
        )
        if resp.status_code != 200:
            logger.error(f"Deepgram TTS error {resp.status_code}: {resp.text[:200]}")
            return b""

        raw = resp.content
        logger.info(f"Deepgram TTS audio ready: {len(raw)} bytes ({len(raw)/32000:.1f}s)")
        return raw

    except Exception as e:
        logger.error(f"Deepgram TTS error: {e}")
        return b""


# Main TTS interface
def text_to_pcm16(text: str) -> bytes:
    """Convert text to PCM16 audio. Uses Edge-TTS with Deepgram fallback."""
    if not text or not text.strip():
        return b""

    # Try Edge-TTS first
    pcm = _edge_tts_sync(text)
    if pcm:
        return pcm

    # Fallback to Deepgram
    logger.info("Edge-TTS unavailable, falling back to Deepgram...")
    pcm = _deepgram_tts(text)
    if pcm:
        return pcm

    logger.warning("All TTS options failed to synthesize audio")
    return b""
