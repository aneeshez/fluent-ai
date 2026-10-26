# FluentAI

## Introduction

FluentAI is an English communication practice app for people who want to speak and write with more confidence. Learners can talk with Luna, an AI tutor, practice real-life situations, get feedback on their writing, and follow their progress over time.

The project brings together a browser-based interface, a Django backend, and Groq-powered AI feedback. Speech recognition and spoken replies use browser features, so learners can practice without installing a separate speech app.

## What you can do

- Practice spoken English with Luna and review conversation transcripts
- Choose from eight guided speaking challenges, including introductions, storytelling, and interviews
- Submit writing for grammar, vocabulary, coherence, and task feedback
- Create an account to save writing and speaking progress
- Track practice sessions, words spoken, streaks, and XP on the dashboard
- Use the animated tutor avatar and confidence meter during speaking practice

Google sign-in is not configured. A Groq API key is needed for AI writing feedback and live AI conversation. Without the key, speaking practice uses a basic fallback response and writing analysis is unavailable.

## Technology

- **Frontend:** HTML, CSS, and vanilla JavaScript
- **Backend:** Python 3.10+ and Django
- **AI:** Groq API
- **Speech:** Browser Web Speech API and SpeechSynthesis API
- **Local database:** SQLite

Speech recognition and microphone access depend on the browser. Use a supported browser and allow microphone access; localhost is allowed for development, while hosted sites need HTTPS.

## Get started

### Requirements

- Python 3.10 or newer
- A Groq API key for AI features ([create one in the Groq console](https://console.groq.com))

### Install

From the project folder, create a virtual environment and install the backend packages:

```powershell
cd backend
py -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

On macOS or Linux, activate the environment with `source .venv/bin/activate` and copy `.env.example` to `.env`.

Open `backend/.env` and set `DJANGO_SECRET_KEY` to a unique random value. For local work, set `DEBUG=True` and add your `GROQ_API_KEY`. Keep this file private; it is ignored by Git.

### Start the app

Run these commands from the `backend/` folder:

```powershell
python manage.py migrate
python manage.py runserver
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000) in your browser. Create an account to save writing submissions and view your progress. To run the automated backend checks, use `python manage.py test` from `backend/`.

The local SQLite database is created at `backend/db.sqlite3`. It is ignored by Git and contains local account and practice data, so keep a backup if you need to preserve it.

## Configuration

The available environment variables are listed in `backend/.env.example`.

| Variable | Use |
|---|---|
| `DJANGO_SECRET_KEY` | Django session and signing key; use a unique random value |
| `DEBUG` | Local debugging; should be `False` on a public deployment |
| `ALLOWED_HOSTS` | Comma-separated hostnames accepted by Django |
| `GROQ_API_KEY` | Enables Groq-powered conversation and writing analysis |
| `CORS_ALLOW_ALL_ORIGINS` | Keep disabled unless a separate frontend origin is required |
| `SECURE_SSL_REDIRECT` | Redirect HTTP requests after HTTPS is set up |
| `SECURE_HSTS_SECONDS` | HSTS duration; configure only after confirming HTTPS is enforced |
| `SESSION_COOKIE_SECURE` | Restrict session cookies to HTTPS |
| `CSRF_COOKIE_SECURE` | Restrict CSRF cookies to HTTPS |

## Project files

```text
backend/
  fluent_ai/       Django settings and URL configuration
  tutor/           API, database models, AI integration, and tests
  .env.example     Environment variable template
  manage.py        Django management commands
frontend/
  *.html           Website pages
  css/             Page styles and shared design system
  js/              Frontend behavior and API calls
  images/          Brand assets
```

## Checks

Run from `backend/` before making a change or preparing a deployment:

```powershell
python manage.py check
python manage.py test
python manage.py makemigrations --check --dry-run
python manage.py check --deploy
```

The tests cover core API behavior. They do not test a live Groq account, browser speech, responsive layouts, load, or the hosting environment.

## Production readiness

FluentAI is currently a development project, **not ready for a public production launch**. Before opening it to real users:

- Bind guest practice sessions to the browser or account that created them; currently, another guest who learns a session ID may access or finish that session.
- Serve frontend assets through a production web server or static-file service instead of Django's development static-file view.
- Add rate limits for login, signup, and AI endpoints.
- Replace SQLite with a production database and configure backups and recovery.
- Configure HTTPS, a unique secret, secure cookies, allowed hosts, logging, monitoring, and deployment checks for the selected host.
- Finish email verification and password recovery, and replace the placeholder privacy and terms links before collecting real user data.

`python manage.py check --deploy` should be reviewed with the production environment configured. A passing local test suite alone does not confirm that the hosted app, Groq integration, microphone access, or production operations are ready.
