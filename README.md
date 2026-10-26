# FluentAI — AI English Communication Tutor

An AI-powered English tutor that helps you practice speaking and writing. Talk with Luna (the AI tutor) in real-time, get instant feedback on your writing, and track your progress over time.

## Features

- **Speaking Practice** — Converse with Luna, an AI English tutor, using your microphone
- **Animated AI Avatar** — Canvas-based avatar reacts when Luna is speaking, listening, or thinking
- **Confidence Meter** — Tracks 5 speech signals (fillers, pace, vocabulary, hesitation, response length)
- **8 Practice Challenges** — Self-introduction, describe your home, favorite food, storytelling, mock interview, debate, and more
- **Writing Analysis** — Submit short essays and get grammar, vocabulary, and coherence scores with corrections
- **Secure Accounts** — Django-managed email/password accounts and session-based login
- **Saved Progress** — Speaking transcripts, challenge XP, writing feedback, and dashboard totals stored in SQLite
- **Progress Dashboard** — Track XP, streaks, session history, and achievements

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML, CSS, Vanilla JavaScript |
| Backend | Python + Django |
| AI / LLM | Groq API (requires a Groq API key) |
| Speech-to-Text | Web Speech API (built into supported browsers; no separate key) |
| Text-to-Speech | Browser SpeechSynthesis API (built-in, free) |
| Database | SQLite |

## Quick Start

### Prerequisites
- Python 3.10 or newer

### Setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux
pip install -r requirements.txt
```

### Configure API Key

Copy `backend/.env.example` to `backend/.env` and add your Groq key. Set a unique `DJANGO_SECRET_KEY` before deploying:

```
DJANGO_SECRET_KEY=replace-with-a-long-random-value
DEBUG=True
GROQ_API_KEY=your_key_here
```

Get a free key at [console.groq.com](https://console.groq.com)

### Run

```bash
python manage.py migrate
python manage.py runserver
```

Open `http://127.0.0.1:8000`. Speaking recognition works in supported browsers such as current Chrome and Edge; microphone access requires localhost or HTTPS. Create an account to save writing and progress.

## Project Structure

```
fluent-ai/
├── backend/              # Django project
│   ├── fluent_ai/        # Django project settings and URL config
│   ├── tutor/            # Main Django app (views, models, NLP)
│   ├── requirements.txt
│   └── manage.py
└── frontend/             # Static HTML/CSS/JS files
    ├── index.html        # Landing page
    ├── practice.html     # Speaking practice
    ├── writing.html      # Writing test
    ├── dashboard.html    # Progress dashboard
    ├── challenges.html   # Challenge picker
    ├── about.html        # About page
    ├── login.html        # Login page
    ├── signup.html       # Signup page
    ├── profile.html      # User profile
    ├── css/              # Stylesheets
    └── js/               # JavaScript modules
```

## How It Works

```
User speaks → Browser microphone
                    ↓
          Web Speech API (free, built-in)
                    ↓
           Transcript text sent to Django
                    ↓
          Groq API → Luna's AI response
                    ↓
     Browser SpeechSynthesis speaks the reply
                    ↓
       Animated avatar reacts + transcript shown
```
