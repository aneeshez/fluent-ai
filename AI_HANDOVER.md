# FluentAI — System Briefing & Project Handover for AI Engineers

---

## 1. Project Overview & Identity
- **Project Name:** FluentAI
- **Repository Path:** `c:\Users\Aneesh\Desktop\workspace\projects\fluent-ai`
- **Core Purpose:** An AI-powered English communication & speech tutoring web application. It offers real-time spoken conversation practice with an animated AI tutor ("Luna"), automated speech confidence analysis, structured speaking challenges, and an automated essay writing evaluation engine.
- **Key Design Philosophy:** Zero runtime external audio API cost. Audio processing relies on native browser APIs, with AI intelligence powered by Groq's high-speed inference tier.

```
                      ┌──────────────────────────────────────────────┐
                      │              Browser Frontend                │
                      │  - Web Speech API (Microphone → Text)        │
                      │  - SpeechSynthesis API (Audio Output)        │
                      │  - HTML5 Canvas Procedural Avatar            │
                      │  - Confidence Analyzer (WPM, fillers, etc.)  │
                      └───────────────┬──────────────────────────────┘
                                      │ HTTP POST (JSON)
                                      ▼
                      ┌──────────────────────────────────────────────┐
                      │            Django 5.x Backend                │
                      │  - /api/chat/ (tutor conversation & DB save) │
                      │  - /api/analyze-writing/ (essay evaluation)  │
                      │  - SQLite (UserProfile, Session, Transcript) │
                      └───────────────┬──────────────────────────────┘
                                      │ REST API (Groq SDK)
                                      ▼
                      ┌──────────────────────────────────────────────┐
                      │                  Groq Cloud                  │
                      │  - Model: qwen/qwen3.8-27b                   │
                      │  - Fallback: openai/gpt-oss-120b             │
                      └──────────────────────────────────────────────┘
```

---

## 2. Architecture & Tech Stack

| Layer | Component | Detail |
|---|---|---|
| **Backend** | Python 3.10+ / Django 5.x+ | Located in `backend/`. Project settings in `backend/fluent_ai/`, core app in `backend/tutor/`. Serves both REST APIs and frontend static files in development. |
| **Database** | SQLite3 (`backend/db.sqlite3`) | Models in `backend/tutor/models.py`: `UserProfile`, `PracticeSession`, `Transcript`, `Feedback`. |
| **LLM Inference** | Groq API (`groq` Python client) | Configured in `backend/tutor/nlp.py` and `backend/tutor/views.py`. Uses `qwen/qwen3.8-27b` (with fallback to `openai/gpt-oss-120b`). |
| **Speech-to-Text (STT)** | Browser Web Speech API | `webkitSpeechRecognition` in `frontend/js/practice.js`. Zero cloud cost, live streaming in-browser transcription. |
| **Text-to-Speech (TTS)** | Browser SpeechSynthesis API | `window.speechSynthesis.speak()` in `frontend/js/practice.js`. Zero latency/cloud dependencies. |
| **Avatar Engine** | Canvas 2D (`frontend/js/animated-avatar.js`) | Fully procedural JavaScript Canvas avatar. Real-time blinking, procedural mouth opening/lip-sync based on speaking state, idle sway, head-tilting, and mood aura effects (Speaking, Listening, Thinking, Happy). |
| **Speech Metrics** | Client-side confidence engine (`frontend/js/confidence.js`) | Evaluates 5 signals in real time: filler word frequency, speaking pace (words-per-minute), vocabulary sophistication, hesitation pauses, and response length. |
| **Frontend UI** | Vanilla HTML5, CSS3, JS ES6+ | No React/Vite/Webpack bundler required. 9 static HTML files in `frontend/`, styled with `frontend/css/design-system.css` and `frontend/css/layout.css`. |

---

## 3. What Has Been Done Till Now (Chronological Evolution)

1. **Phase 1: Initial Prototype (Flask + WebSockets + Deepgram + Edge-TTS)**
   - Originally created as a Flask backend with Socket.IO, Deepgram WebSocket streaming for STT, and Edge-TTS for audio synthesis.
   - Prototyped initial speaking challenges, writing analysis, and avatar concept.
2. **Phase 2: Architectural Migration to Django + Browser Native Speech**
   - Eliminated high latency and third-party WebSocket audio streaming issues by migrating from Flask to Django 5.x.
   - Replaced Deepgram and Edge-TTS with native Web Speech API and SpeechSynthesis API, drastically reducing complexity and API key friction.
   - Integrated the Groq Python SDK for sub-second conversational replies.
3. **Phase 3: Codebase Pruning & Scaffolding Cleanup**
   - Cleaned up obsolete monolithic files (`frontend/main.js`, `frontend/style.css`, legacy Flask files, dead `luna-avatar.png` files, `package.json`, and stale `.pyc` caches).
   - Documented architecture and setup in `README.md`.
4. **Phase 4: Design System & Visual Identity Overhaul**
   - The user requested replacing an amateur emoji-heavy look with a modern, high-end "Obsidian Dark / Electric Indigo" aesthetic.
   - Replaced all playful emojis across all 9 pages with sharp, accessible inline SVG icons.
   - Updated typography to Google Fonts: **Plus Jakarta Sans** (headings/body) and **JetBrains Mono** (metrics/code).
   - Replaced external static avatar images with the pure Canvas-based animated avatar module.
   - Added branding assets (`frontend/images/logo.jpg`, `logo-icon.jpg`, `logo-full.jpg`).

---

## 4. File Structure & Key Paths

```
fluent-ai/
├── README.md                      # System overview and quick-start guide
├── AI_HANDOVER.md                 # This system briefing document
├── backend/                       # Django Backend
│   ├── manage.py                  # Django CLI runner
│   ├── requirements.txt           # Minimal dependencies (django, cors-headers, groq, python-dotenv)
│   ├── .env.example               # Local environment variable template
│   ├── db.sqlite3                 # Local SQLite database
│   ├── fluent_ai/                 # Django project settings
│   │   ├── settings.py            # App settings, template paths, static paths
│   │   ├── urls.py                # Root router & static file fallback
│   │   └── wsgi.py
│   └── tutor/                     # Main application logic
│       ├── models.py              # UserProfile, PracticeSession, Transcript, Feedback, WritingSubmission
│       ├── views.py               # Auth, chat, session, writing, dashboard, and export APIs
│       ├── urls.py                # Auth, practice, writing, dashboard, export, and health routes
│       ├── nlp.py                 # Groq client, conversational system prompts, scenario prompts
│       └── migrations/            # Initial schema and account/writing persistence migration
└── frontend/                      # Frontend Application (Served by Django)
    ├── index.html                 # Marketing landing page
    ├── practice.html              # Core speaking practice interface with Luna
    ├── challenges.html            # 8 structured practice scenario cards
    ├── writing.html               # Essay & paragraph writing assessment tool
    ├── dashboard.html             # User stats, streaks, XP, session history
    ├── profile.html               # User profile, badges, settings
    ├── about.html                 # Mission, tech stack overview, pedagogical rationale
    ├── login.html                 # Authentication login view
    ├── signup.html                # Authentication signup view
    ├── css/
    │   ├── design-system.css      # CSS variables, color palette, buttons, cards, typography
    │   └── layout.css             # Navigation, headers, grid layouts, responsive breakpoints
    ├── js/
    │   ├── api.js                 # CSRF-aware same-origin API client
    │   ├── auth.js                # Django-backed account registration and login
    │   ├── dashboard.js           # Account progress and saved session history
    │   ├── navigation.js          # Responsive mobile navigation
    │   ├── practice.js            # Web Speech STT, SpeechSynthesis TTS, chat flow & timers
    │   ├── animated-avatar.js     # HTML5 Canvas 2D animated avatar engine
    │   ├── confidence.js          # Live 5-signal speech confidence metrics calculation
    │   ├── profile.js             # Profile, password, export, reset, and deletion
    │   └── writing.js             # Writing prompts, drafts, and AI feedback display
    └── images/
        ├── logo.jpg               # Navbar logo mark
        ├── logo-icon.jpg          # Icon-only mark
        └── logo-full.jpg          # Full horizontal lockup
```

---

## 5. Current Status

- **Working Directory State:** On branch `master`. The initial redesign changes and the follow-up implementation are present in the working tree. The repository is connected to `origin` (`https://github.com/aneeshez/fluent-ai.git`).
- **Accounts:** Django email/password registration and login use hashed passwords and session cookies. Profile and password updates, logout, account deletion, CSRF protection, and authenticated API access are implemented.
- **Progress and Persistence:** Speaking sessions, transcripts, challenge XP, writing submissions, and analysis JSON are associated with accounts in SQLite. Dashboard and profile totals are computed from saved records. Progress export and reset are connected to saved data.
- **Browser Support:** Speaking practice explains that speech recognition requires a supported browser and microphone access over localhost or HTTPS. The mobile menu is available across the main application pages.
- **Operational Health:** Django checks and database migrations pass. Account, session, writing, progress, reset, and deletion flows have been exercised with CSRF checks. Both live Groq paths have been verified with synthetic text. `GROQ_API_KEY` must be configured in the ignored `backend/.env` file for AI feedback.

---

## 6. Follow-up Work Completed

- Added Django-backed email/password accounts, CSRF-aware API requests, account profile/password controls, logout, progress reset, and account deletion.
- Connected practice sessions and writing assessments to the signed-in account and SQLite; dashboard/profile data now comes from saved records.
- Added full data export, responsive mobile navigation, favicon branding, and clear unsupported-browser messaging for speech recognition.
- Replaced invented landing-page usage numbers and testimonials with descriptions of the actual product features.
- Verified Django checks, migrations, route loading, the account/session/writing API flows, and live Groq conversation and writing calls with synthetic sample text.

---

## 7. Key Technical Details Incoming AI Needs to Know

1. **Backend Routing & Static Serving:**
   - In `backend/fluent_ai/urls.py`, Django uses `django.views.static.serve` on `settings.FRONTEND_DIR` to serve all HTML files directly at their root paths (e.g. `/practice.html`, `/css/design-system.css`).
2. **Groq Model Configuration:**
   - In `backend/tutor/nlp.py` and `backend/tutor/views.py`, the active model is `qwen/qwen3.8-27b` with temperature `0.7` for speech and `0.3` for writing analysis. If Groq updates its models, adjust this ID in `nlp.py` and `views.py`.
3. **Session State & Auth:**
   - Django session authentication is authoritative. Passwords are hashed by Django and are never stored in browser storage.
   - The UI caches a small user display object and keeps per-account drafts/settings in `localStorage`; authenticated account and progress APIs use the server-side session.
4. **Speaking Practice Flow:**
   - `practice.js` initializes `webkitSpeechRecognition`.
   - Silence detection auto-submits transcript to `POST /api/chat/`.
   - AI response is received, added to conversation history, and spoken aloud using `speechSynthesis.speak()`.
   - Responses include a structured correction and optional language tip, which are saved with the transcript feedback.
   - Simultaneously, `window.lunaAvatar.setState(AvatarState.SPEAKING)` drives the Canvas mouth animation until `speechSynthesis.onend`.

---

## 8. Remaining Work

1. **Deployment Configuration:** Before production deployment, provide a unique `DJANGO_SECRET_KEY`, set `DEBUG=False`, configure the real host names and HTTPS, and use a production static-file server rather than Django's development static serving.
2. **Optional Identity Providers:** Google buttons currently explain that Google sign-in is not configured. Add a real OAuth client and server-side token verification before advertising Google authentication as available.
3. **Optional Email Password Recovery:** Password changes are available from the signed-in profile. A lost-password flow still needs a configured email provider and expiring reset links.
