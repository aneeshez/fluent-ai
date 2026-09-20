import io
import logging
import os
import shutil
import subprocess
from typing import Tuple

logger = logging.getLogger(__name__)


def ensure_ffmpeg():
    """Verify ffmpeg exists in PATH (needed for Edge-TTS audio conversion)."""
    if shutil.which("ffmpeg"):
        logger.info("ffmpeg binary found")
        return True
    logger.warning(
        "ffmpeg not found in PATH. Audio conversion will fall back to Deepgram TTS. "
        "Install ffmpeg: https://ffmpeg.org/download.html"
    )
    return False


def save_temp_wav(audio_bytes: bytes, input_format: str = "webm") -> bytes:
    """
    Convert input audio bytes to WAV using pydub/ffmpeg.
    Returns wav bytes suitable for STT models.
    """
    try:
        from pydub import AudioSegment

        if not shutil.which("ffmpeg"):
            logger.error("ffmpeg not found — audio conversion unavailable")
            raise RuntimeError("ffmpeg not found. Please install: https://ffmpeg.org/download.html")

        # For WebM/Opus fragments, use ffmpeg pipe for robustness
        if input_format.lower() in ("webm", "opus"):
            cmd = [
                "ffmpeg", "-i", "pipe:0",
                "-f", "wav", "-acodec", "pcm_s16le",
                "-ar", "16000", "-ac", "1", "-y", "pipe:1"
            ]
            proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            stdout, stderr = proc.communicate(input=audio_bytes)

            if proc.returncode != 0:
                # Fallback to pydub
                logger.warning("ffmpeg pipe failed, trying pydub fallback...")
                audio_seg = AudioSegment.from_file(io.BytesIO(audio_bytes), format=input_format)
                out = io.BytesIO()
                audio_seg.export(out, format="wav")
                return out.getvalue()

            return stdout
        else:
            audio_seg = AudioSegment.from_file(io.BytesIO(audio_bytes), format=input_format)
            out = io.BytesIO()
            audio_seg.export(out, format="wav")
            return out.getvalue()

    except Exception as exc:
        logger.error("Audio conversion failed: %s", exc)
        raise


def run_cmd(cmd: str) -> Tuple[int, str]:
    """Run shell command, return (exit_code, output)."""
    proc = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    out, _ = proc.communicate()
    return proc.returncode, out.decode()
