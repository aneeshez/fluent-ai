# 🎓 FluentAI — AI English Communication Tutor

A real-time AI-powered English communication tutor with speaking practice, writing analysis, confidence detection, and structured challenges.

## Features

- **🎤 Speaking Practice** — Talk with Luna (AI tutor) in real-time with live transcription
- **🤖 Animated AI Avatar** — Canvas-based avatar that reacts to speaking/listening/thinking states
- **🎯 Confidence Detection** — Analyzes 5 speech signals (fillers, pace, vocabulary, hesitation, response length)
- **🏆 8 Structured Challenges** — Self-intro, describe home, food, storytelling, interview, debate, etc.
- **✍️ Writing Analysis** — AI grammar/vocabulary/coherence scoring with detailed corrections
- **📊 Dashboard** — XP, streaks, session recordings with playback, achievement tracking

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML, CSS, JavaScript (vanilla) |
| Backend | Python Flask + Flask-SocketIO |
| AI/LLM | Groq (LLaMA 3.3 70B) — FREE |
| Speech-to-Text | Deepgram Nova-2 (WebSocket) — FREE |
| Text-to-Speech | Edge-TTS (primary, free) + Deepgram Aura (fallback) |
| Avatar | Canvas animated avatar with state reactions |
| Database | SQLite via SQLAlchemy |

## Quick Start

### Prerequisites
- Python 3.10+
- ffmpeg (optional, for Edge-TTS audio conversion)

### 1. Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
python app.py                # Runs on http://localhost:5000
```

### 2. Open Browser
Navigate to `http://localhost:5000` — Flask serves the frontend automatically.

## API Keys (in `backend/.env`)

Only **2 free API keys** needed:

| Service | Purpose | Get Key |
|---------|---------|---------|
| **Groq** | AI tutor responses | [console.groq.com](https://console.groq.com) |
| **Deepgram** | Speech-to-text + TTS fallback | [console.deepgram.com](https://console.deepgram.com) |

## Architecture

```
User speaks → Mic → Deepgram WebSocket (real-time STT)
                          ↓
                   Transcript text
                          ↓
              ConfidenceAnalyzer (score + level)
                          ↓
              Socket.IO "text-input" → Flask backend
                          ↓
              Groq API (LLaMA 3.3 70B) → AI response
                          ↓
              Edge-TTS → PCM16 audio → Socket.IO "tts-audio"
                          ↓
              Browser plays audio + animated avatar lip-sync
```
