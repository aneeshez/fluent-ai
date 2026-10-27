# FluentAI

## Introduction

FluentAI is an English communication practice app for people who want to speak and write with more confidence. Learners can practice real-life conversations with Luna, get feedback on their writing, and follow their progress over time.

The website uses a Django backend with a browser-based frontend. Groq provides AI feedback, while speech recognition and spoken replies use supported browser features.

## Features

- Spoken English practice with an AI tutor, transcripts, and pronunciation-friendly speech controls
- Eight guided speaking challenges, including introductions, storytelling, and interviews
- Writing assessments with grammar, vocabulary, coherence, and task feedback
- Email/password accounts with email verification, password recovery, and secure session login
- Progress dashboard with sessions, words spoken, streaks, challenge history, and XP
- Animated tutor avatar and a confidence meter during speaking practice

Google sign-in is not offered because OAuth is not configured. A Groq API key is required for AI feedback; the app uses a basic response when the key is absent.

## Technology

- **Frontend:** HTML, CSS, and vanilla JavaScript
- **Backend:** Python 3.12+ and Django 6.1
- **AI:** Groq API
- **Speech:** Browser Web Speech API and SpeechSynthesis API
- **Local database:** SQLite
- **Production database:** PostgreSQL
- **Production web server:** Gunicorn with WhiteNoise for collected static files

Microphone access requires a supported browser. Browsers allow microphone access on localhost during development; hosted sites must use HTTPS.

## Run locally

### Requirements

- Python 3.12 or newer
- A Groq API key for live AI features ([Groq console](https://console.groq.com))

### Install

From the project folder:

```powershell
cd backend
py -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

On macOS or Linux, activate the environment with `source .venv/bin/activate` and copy `.env.example` to `.env`.

Edit `backend/.env`: set `DJANGO_SECRET_KEY` to a unique random value, keep `DEBUG=True` for local development, and add your `GROQ_API_KEY`. Keep this file private; Git ignores it.

The development email backend prints verification and password-reset links in the `runserver` terminal. Existing account profiles must verify their email once after applying the new email-verification migration; the login page provides a resend action.

### Start

Run these commands from `backend/`:

```powershell
python manage.py migrate
python manage.py runserver
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). Use `python manage.py test` to run the backend test suite.

The local database is `backend/db.sqlite3`. It is ignored by Git and contains account and practice data; back it up if you need to preserve it.

## Production deployment

The repository includes a Dockerfile for a Gunicorn deployment. The host must provide PostgreSQL, SMTP email, HTTPS termination, and persistent secret configuration.

Create an untracked `.env.production` file in the project root with these values:

```dotenv
DEBUG=False
DJANGO_SECRET_KEY=<unique-random-secret-at-least-50-characters>
ALLOWED_HOSTS=your-domain.example
DATABASE_URL=postgresql://user:password@your-postgres-host:5432/fluentai
GROQ_API_KEY=<your-groq-api-key>
EMAIL_HOST=smtp.your-provider.example
EMAIL_PORT=587
EMAIL_HOST_USER=<your-smtp-user>
EMAIL_HOST_PASSWORD=<your-smtp-password>
EMAIL_USE_TLS=True
DEFAULT_FROM_EMAIL=FluentAI <no-reply@your-domain.example>
SECURE_SSL_REDIRECT=True
TRUST_PROXY_SSL_HEADER=True
TRUST_PROXY_IP_HEADER=True
CSRF_TRUSTED_ORIGINS=https://your-domain.example
```

Use a PostgreSQL URL with URL-encoded credentials if they contain reserved characters. The application requires HTTPS in production. Set the proxy flags only behind a trusted proxy that replaces incoming `X-Forwarded-Proto` and `X-Forwarded-For` headers. HSTS defaults to one year; subdomain coverage and browser preload remain off until you explicitly confirm they are appropriate for your domain.

Build the image, apply database migrations, and start the app:

```powershell
docker build -t fluentai .
docker run --rm --env-file .env.production fluentai python manage.py migrate
docker run -d --restart unless-stopped --name fluentai -p 127.0.0.1:8000:8000 --env-file .env.production fluentai
```

Configure the HTTPS proxy on the host to forward traffic to `127.0.0.1:8000` and pass the trusted forwarded headers. Check the app through the proxy at `/health/`; this endpoint checks PostgreSQL readiness. Schedule `python manage.py purge_rate_limits` daily to remove expired rate-limit records. Schedule database backups and test restoring them before launch.

## Configuration reference

`backend/.env.example` shows the local settings. Production settings use:

| Variable | Purpose |
|---|---|
| `DJANGO_SECRET_KEY` | Unique secret used for signing and sessions |
| `DEBUG` | Must be `False` in production |
| `ALLOWED_HOSTS` | Comma-separated public hostnames |
| `DATABASE_URL` | PostgreSQL connection string; production connections require SSL |
| `GROQ_API_KEY` | Enables AI conversation and writing feedback |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` | SMTP used for verification and password recovery |
| `DEFAULT_FROM_EMAIL` | Sender shown on account emails |
| `SECURE_SSL_REDIRECT` | Redirects HTTP to HTTPS |
| `TRUST_PROXY_SSL_HEADER` | Trusts HTTPS state forwarded by the configured reverse proxy |
| `TRUST_PROXY_IP_HEADER` | Uses the client IP forwarded by a trusted proxy for rate limits |
| `CSRF_TRUSTED_ORIGINS` | HTTPS origins accepted for Django CSRF protection |
| `SECURE_HSTS_SECONDS` | HSTS duration; defaults to one year in production |

## Project structure

```text
backend/
  fluent_ai/       Django settings, URL configuration, WSGI and ASGI entry points
  tutor/           API, models, migrations, email flows, and tests
  .env.example     Local environment template
frontend/
  *.html           Website pages
  css/             Styles and shared design system
  js/              Frontend behavior and API calls
  images/          Brand assets
Dockerfile         Production Gunicorn image
.dockerignore      Excludes local data and secrets from the image
README.md          Setup and deployment guide
```

## Checks

Run from `backend/`:

```powershell
python manage.py check
python manage.py test
python manage.py makemigrations --check --dry-run
python manage.py check --deploy
```

The test suite covers account verification and recovery, CSRF, rate limits, guest-session isolation, API behavior, and static page delivery. It cannot validate your live Groq and SMTP credentials, proxy, microphone permissions, hosting limits, or restore process.

## Production readiness

The app now has production-oriented settings, PostgreSQL support, HTTPS cookie and redirect defaults, collected static assets, shared throttling, guest-session ownership, email verification, password recovery, logging, and a Docker/Gunicorn deployment path.

It still needs a real deployment environment and a final launch review. Configure valid PostgreSQL, SMTP, Groq, domain, and proxy credentials; verify HTTPS and email delivery; replace the placeholder Privacy Policy and Terms links with owner-reviewed content; and run browser, load, and backup-restore checks on the chosen host. `check --deploy` can also report HSTS subdomain and preload warnings; enable those only after confirming your domain and every affected subdomain meet the HTTPS requirements.
