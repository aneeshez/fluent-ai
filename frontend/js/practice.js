// Conversation controller and audio pipeline using Web Speech API and Django REST backend

// Auth state
let user = JSON.parse(localStorage.getItem('fluentai_user') || 'null');
if (!user) {
    user = { name: 'Guest', email: 'guest@fluentai.com' };
    localStorage.setItem('fluentai_user', JSON.stringify(user));
}
const avatarEl = document.getElementById('userAvatar');
if (avatarEl && user) {
    if (user.picture) avatarEl.innerHTML = `<img src="${user.picture}" alt="">`;
    else avatarEl.textContent = (user.name || 'U')[0].toUpperCase();
}

// Session state
let mediaStream = null;
let isRecording = false;
let isMuted = false;
let isAISpeaking = false;
let isAIThinking = false;
let sessionStartTime = null;
let sessionTimer = null;
let wordCount = 0;
let selectedVoice = null;
let activeChallenge = null;
let challengeTimerInterval = null;
let conversationLog = [];
let confidenceAnalyzer = null;
let recognition = null;
let currentSessionId = null;
let silenceTimer = null;
let accumulatedTranscript = '';

// Backend endpoint
const BACKEND = '';

// Challenge configuration
const CHALLENGES = {
    self_intro: {
        id: 'self_intro',
        title: 'Self Introduction',
        description: 'Practice introducing yourself: name, background, hobbies, and goals.',
        timeLimit: 120,
        xp: 20,
        greeting: "Hi there! Let's practice introducing yourself. Start by telling me your name and what you do!",
        tips: ['Use "My name is..."', 'Mention where you\'re from', 'Share your hobbies']
    },
    describe_home: {
        id: 'describe_home',
        title: 'Describe Your Home',
        description: 'Describe your home: rooms, furniture, and what you like about it.',
        timeLimit: 180,
        xp: 25,
        greeting: "Welcome! Let's talk about your home. What kind of place do you live in?",
        tips: ['Use adjectives (cozy, spacious)', 'Describe each room', 'Use spatial words']
    },
    favorite_food: {
        id: 'favorite_food',
        title: 'Favorite Food',
        description: 'Describe your favorite dish, how it\'s made, and why you love it.',
        timeLimit: 180,
        xp: 35,
        greeting: "I love talking about food! What is your absolute favorite dish?",
        tips: ['Use sensory words (delicious, crunchy)', 'Explain ingredients', 'Share memories']
    },
    story_telling: {
        id: 'story_telling',
        title: 'Story Telling',
        description: 'Tell a short story about an interesting experience you had.',
        timeLimit: 240,
        xp: 40,
        greeting: "Tell me a short story! What is an interesting experience that happened to you recently?",
        tips: ['Use past tense', 'Add connectors (first, then, suddenly)', 'Include emotions']
    },
    job_interview: {
        id: 'job_interview',
        title: 'Mock Interview',
        description: 'Practice answering common job interview questions professionally.',
        timeLimit: 300,
        xp: 75,
        greeting: "Hello! Welcome to our mock interview. To start off, could you tell me a little bit about yourself?",
        tips: ['Use formal language', 'Be confident and concise', 'Give specific examples']
    },
    morning_routine: {
        id: 'morning_routine',
        title: 'Morning Routine',
        description: 'Describe your typical morning step by step.',
        timeLimit: 180,
        xp: 50,
        greeting: "Good morning! Walk me through your typical morning routine step by step.",
        tips: ['Use sequence words (first, then)', 'Mention times', 'Describe habits']
    },
    interview_prep: {
        id: 'interview_prep',
        title: 'Interview Preparation',
        description: 'Learn interview techniques: STAR method, elevator pitch, power words.',
        timeLimit: 300,
        xp: 60,
        greeting: "Today we will work on interview technique. Have you ever practiced answering with the STAR method?",
        tips: ['Learn the STAR method', 'Practice your elevator pitch', 'Use power words']
    },
    debate: {
        id: 'debate',
        title: 'Debate Practice',
        description: 'Argue for or against a topic. Practice persuasion and reasoning.',
        timeLimit: 300,
        xp: 80,
        greeting: "Let's debate! Topic: 'Social media does more harm than good.' Do you agree or disagree?",
        tips: ['Pick a clear side', 'Give 2-3 strong arguments', 'Address counter-points']
    }
};

function initChallenge() {
    const params = new URLSearchParams(window.location.search);
    const challengeId = params.get('challenge');
    if (challengeId && CHALLENGES[challengeId]) {
        activeChallenge = CHALLENGES[challengeId];
        showChallengeBanner();
    }
}

function showChallengeBanner() {
    if (!activeChallenge) return;
    const banner = document.getElementById('challengeBanner');
    const titleEl = document.getElementById('challengeTitle');
    const xpEl = document.getElementById('challengeXP');
    const descEl = document.getElementById('challengeDesc');
    const limitEl = document.getElementById('challengeLimit');
    const convTitle = document.querySelector('.transcript-header h3');

    if (banner) banner.style.display = 'block';
    if (titleEl) titleEl.textContent = activeChallenge.title;
    if (xpEl) xpEl.textContent = `${activeChallenge.xp} XP`;
    if (descEl) descEl.textContent = activeChallenge.description;
    if (limitEl) {
        const m = Math.floor(activeChallenge.timeLimit / 60);
        const s = activeChallenge.timeLimit % 60;
        limitEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    }
    if (convTitle) convTitle.textContent = activeChallenge.title;
}

function updateChallengeTimer() {
    if (!activeChallenge || !sessionStartTime) return;
    const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
    const remaining = Math.max(0, activeChallenge.timeLimit - elapsed);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    const timerEl = document.getElementById('challengeTimer');
    const progressEl = document.getElementById('challengeProgress');

    if (timerEl) timerEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    if (progressEl) {
        const pct = Math.min(100, (elapsed / activeChallenge.timeLimit) * 100);
        progressEl.style.width = `${pct}%`;
        if (pct > 80) progressEl.style.background = 'linear-gradient(90deg, #f59e0b, #ef4444)';
        else if (pct > 60) progressEl.style.background = 'linear-gradient(90deg, #8b5cf6, #f59e0b)';
    }

    if (remaining <= 0 && isRecording) {
        addMessage("Time's up! Challenge complete!", 'system');
        completeChallenge();
        stopSession();
    }
}

function completeChallenge() {
    if (!activeChallenge) return;
    const progress = JSON.parse(localStorage.getItem('fluentai_progress') || '{}');
    progress.xp = (progress.xp || 0) + activeChallenge.xp;
    progress.challengesCompleted = (progress.challengesCompleted || 0) + 1;

    const completed = JSON.parse(localStorage.getItem('fluentai_challenges') || '[]');
    if (!completed.includes(activeChallenge.id)) {
        completed.push(activeChallenge.id);
    }
    localStorage.setItem('fluentai_challenges', JSON.stringify(completed));
    localStorage.setItem('fluentai_progress', JSON.stringify(progress));

    const banner = document.getElementById('challengeBanner');
    if (banner) {
        banner.style.background = 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(34,197,94,0.1))';
        banner.style.borderColor = 'rgba(16,185,129,0.4)';
        const titleEl = document.getElementById('challengeTitle');
        const xpEl = document.getElementById('challengeXP');
        if (titleEl) titleEl.textContent = 'Challenge Complete!';
        if (xpEl) xpEl.textContent = `+${activeChallenge.xp} XP Earned!`;
    }
}

// DOM Elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const muteBtn = document.getElementById('muteBtn');
const aiStatus = document.getElementById('aiStatus');
const connectionDot = document.getElementById('connectionDot');
const connectionText = document.getElementById('connectionText');
const sessionTimeEl = document.getElementById('sessionTime');
const wordCountEl = document.getElementById('wordCount');
const transcriptContent = document.getElementById('transcriptContent');
const feedbackSection = document.getElementById('feedbackSection');
const correctedText = document.getElementById('correctedText');
const feedbackTips = document.getElementById('feedbackTips');
const clearBtn = document.getElementById('clearBtn');

// Voice synthesis setup (Native Web Speech API)
function pickVoice() {
    if (!('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;
    const prefs = ['Jenny', 'Aria', 'Zira', 'Samantha', 'Google US English', 'Natural', 'Female'];
    for (const p of prefs) {
        const v = voices.find(v => v.name.includes(p) && v.lang.startsWith('en'));
        if (v) { selectedVoice = v; return; }
    }
    const enVoice = voices.find(v => v.lang.startsWith('en-US')) || voices.find(v => v.lang.startsWith('en'));
    if (enVoice) selectedVoice = enVoice;
}

if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = pickVoice;
    pickVoice();
}

// Speak AI reply via browser SpeechSynthesis
function speak(text) {
    if (!text || !('speechSynthesis' in window)) {
        onSpeakingDone();
        return;
    }

    window.speechSynthesis.cancel();
    isAISpeaking = true;
    setStatus('Luna speaking...');
    if (aiStatus) aiStatus.textContent = 'Speaking...';

    if (window.lunaAvatar) {
        window.lunaAvatar.setState('speaking');
    }

    const utterance = new SpeechSynthesisUtterance(text);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onend = () => {
        onSpeakingDone();
    };

    utterance.onerror = (e) => {
        console.warn('[TTS] Synthesis event:', e);
        onSpeakingDone();
    };

    window.speechSynthesis.speak(utterance);
}

function onSpeakingDone() {
    isAISpeaking = false;
    if (aiStatus) aiStatus.textContent = 'Listening...';
    setStatus('Live — speak now');
    if (confidenceAnalyzer) confidenceAnalyzer.markAIFinished();

    if (window.lunaAvatar) {
        window.lunaAvatar.setState('listening');
    }
}

// Native Web Speech Recognition (Zero cost, 100% free, no API key)
function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert('Your browser does not support Web Speech Recognition. Please use Chrome, Edge, or Brave.');
        return null;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onstart = () => {
        setStatus('Live — speak now');
        if (aiStatus) aiStatus.textContent = 'Listening...';
        if (connectionDot) { connectionDot.classList.add('connected'); connectionDot.classList.remove('disconnected'); }
        if (connectionText) connectionText.textContent = 'Ready';
    };

    rec.onresult = (event) => {
        if (!isRecording || isMuted || isAISpeaking || isAIThinking) return;

        let interimText = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                accumulatedTranscript += ' ' + transcript;
            } else {
                interimText += transcript;
            }
        }

        if (interimText.trim()) {
            showInterim(interimText.trim());
            setStatus('Hearing you...');
        }

        // Reset silence timer on every speech event
        if (silenceTimer) clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
            const finalSpeech = (accumulatedTranscript + ' ' + interimText).trim();
            if (finalSpeech.length >= 2 && !isAIThinking && !isAISpeaking) {
                clearInterim();
                accumulatedTranscript = '';
                addMessage(finalSpeech, 'user');
                countWords(finalSpeech);
                sendToDjangoTutor(finalSpeech);
            }
        }, 1200);
    };

    rec.onerror = (event) => {
        if (event.error === 'no-speech') return;
        console.warn('[STT] Speech recognition warning:', event.error);
    };

    rec.onend = () => {
        // Automatically restart listening if user is still in active session
        if (isRecording && !isMuted) {
            try {
                rec.start();
            } catch (e) { }
        }
    };

    return rec;
}

// Send text to Django REST endpoint (/api/chat/)
async function sendToDjangoTutor(text) {
    if (!text?.trim() || isAIThinking) return;

    isAIThinking = true;
    if (feedbackSection) feedbackSection.style.display = 'none';
    if (aiStatus) aiStatus.textContent = 'Thinking...';
    setStatus('Luna thinking...');

    if (window.lunaAvatar) {
        window.lunaAvatar.setState('thinking');
    }

    const payload = {
        text: text.trim(),
        challenge: activeChallenge ? activeChallenge.id : null,
        conversation_history: conversationLog.slice(-10),
        session_id: currentSessionId
    };

    if (confidenceAnalyzer) {
        const cd = confidenceAnalyzer.getConfidenceData();
        payload.confidence_level = cd.level;
        payload.confidence_score = cd.score;
    }

    try {
        const data = await FluentAPI.request(`${BACKEND}/api/chat/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        isAIThinking = false;

        if (data.session_id) {
            currentSessionId = data.session_id;
        }

        const reply = data.teacher_response || "That's interesting! Tell me more.";
        addMessage(reply, 'ai');
        speak(reply);

        if ((data.corrected_text && data.corrected_text !== text.trim()) || (data.tips && data.tips.length)) {
            showFeedback(data);
        }

    } catch (err) {
        console.error('[Tutor API] Error:', err);
        isAIThinking = false;
        setStatus('Error contacting tutor');
        const fallbackMsg = "I had a small hiccup connecting. Could you please repeat that?";
        addMessage(fallbackMsg, 'ai');
        speak(fallbackMsg);
    }
}

// Session control
async function startSession() {
    if (isRecording) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        setStatus('Speech recognition is unavailable in this browser');
        alert('Speaking practice needs browser speech recognition. Please open FluentAI in the latest Chrome or Microsoft Edge.');
        return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('Microphone access requires localhost or HTTPS');
        alert('Open FluentAI at localhost or on an HTTPS site to use your microphone.');
        return;
    }
    setStatus('Starting...');

    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: true
        });

        isRecording = true;
        isAIThinking = false;
        sessionStartTime = Date.now();
        currentSessionId = null;
        wordCount = 0;
        conversationLog = [];
        accumulatedTranscript = '';

        if (window.ConfidenceAnalyzer) {
            confidenceAnalyzer = new ConfidenceAnalyzer();
            const meter = document.getElementById('confidenceMeter');
            if (meter) meter.style.display = 'flex';
            const panel = document.getElementById('confidencePanel');
            if (panel) panel.classList.add('show');
            updateConfidenceUI();
        }

        startBtn.style.display = 'none';
        stopBtn.style.display = 'flex';
        stopBtn.disabled = false;
        muteBtn.disabled = false;
        transcriptContent.innerHTML = '';
        sessionTimer = setInterval(updateTimer, 1000);

        if (!recognition) {
            recognition = initSpeechRecognition();
        }
        if (recognition) {
            try { recognition.start(); } catch (e) { }
        }

        let greeting;
        if (activeChallenge) {
            greeting = activeChallenge.greeting;
            challengeTimerInterval = setInterval(updateChallengeTimer, 500);
        } else {
            greeting = "Hi! I'm Luna, your English tutor. Let's have a conversation — speak naturally and I'll help you practice!";
        }

        addMessage(greeting, 'ai');
        speak(greeting);

    } catch (err) {
        console.error('[Session] Access denied:', err);
        setStatus('Microphone permission needed');
        alert('Please allow microphone access to practice speaking.');
    }
}

function stopSession() {
    const finishedSessionId = currentSessionId;
    isRecording = false;
    isAIThinking = false;
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
    if (silenceTimer) clearTimeout(silenceTimer);
    if (recognition) {
        try { recognition.stop(); } catch (e) { }
    }
    if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null;
    }

    clearInterval(sessionTimer);
    if (challengeTimerInterval) {
        clearInterval(challengeTimerInterval);
        challengeTimerInterval = null;
    }

    startBtn.style.display = 'flex';
    stopBtn.style.display = 'none';
    muteBtn.disabled = true;
    if (aiStatus) aiStatus.textContent = 'Ended';
    setStatus('Session ended');
    saveProgress();
    saveSessionRecording();
    if (finishedSessionId) {
        FluentAPI.request('/api/session/finish/', {
            method: 'POST',
            body: JSON.stringify({ session_id: finishedSessionId })
        }).catch(error => console.error('[Session] Could not save completion:', error));
    }

    if (window.lunaAvatar) {
        window.lunaAvatar.setState('idle');
    }

    if (activeChallenge && !document.getElementById('challengeTitle')?.textContent?.includes('Complete')) {
        completeChallenge();
        addMessage(`Challenge complete! You earned ${activeChallenge.xp} XP!`, 'ai');
    }
}

function toggleMute() {
    isMuted = !isMuted;
    muteBtn.innerHTML = isMuted
        ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>'
        : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
    if (isMuted) {
        muteBtn.classList.add('active');
        setStatus('Muted');
        if (recognition) {
            try { recognition.stop(); } catch (e) { }
        }
    } else {
        muteBtn.classList.remove('active');
        setStatus('Live — speak now');
        if (recognition) {
            try { recognition.start(); } catch (e) { }
        }
    }
}

function setStatus(text) {
    const el = document.getElementById('micStatusText');
    const dot = document.querySelector('.mic-dot');
    if (el) el.textContent = text;
    if (dot) {
        if (text.includes('Error') || text.includes('denied') || text.includes('needed'))
            dot.style.background = '#ef4444';
        else if (text.includes('Muted') || text.includes('ended'))
            dot.style.background = '#9ca3af';
        else if (text.includes('thinking'))
            dot.style.background = '#fbbf24';
        else
            dot.style.background = '#22c55e';
    }
}

function addMessage(text, type) {
    if (type !== 'system') {
        conversationLog.push({ text, type, time: new Date().toISOString() });
    }

    if (type === 'user' && confidenceAnalyzer) {
        confidenceAnalyzer.analyzeSpeech(text);
        updateConfidenceUI();
    }

    if (type === 'system') {
        const el = document.createElement('div');
        el.style.cssText = 'text-align:center;font-size:0.85rem;color:#a78bfa;padding:0.5rem;';
        el.textContent = text;
        transcriptContent.appendChild(el);
    } else {
        const msg = document.createElement('div');
        msg.className = `message ${type}`;
        msg.textContent = text;
        transcriptContent.appendChild(msg);
    }
    transcriptContent.scrollTop = transcriptContent.scrollHeight;
}

function showInterim(text) {
    let el = transcriptContent.querySelector('.interim');
    if (!el) {
        el = document.createElement('div');
        el.className = 'message user interim';
        el.style.opacity = '0.5';
        el.style.fontStyle = 'italic';
        transcriptContent.appendChild(el);
    }
    el.textContent = text + '...';
    transcriptContent.scrollTop = transcriptContent.scrollHeight;
}

function clearInterim() {
    const el = transcriptContent.querySelector('.interim');
    if (el) el.remove();
}

function showFeedback(data) {
    const hasCorrection = Boolean(data.corrected_text && correctedText && data.corrected_text !== conversationLog.at(-2)?.text);
    const correctionItem = correctedText?.closest('.feedback-item');
    const tipsItem = feedbackTips?.closest('.feedback-item');
    if (correctionItem) correctionItem.hidden = !hasCorrection;
    if (tipsItem) tipsItem.hidden = !data.tips?.length;
    if (hasCorrection) correctedText.textContent = data.corrected_text;
    if (data.tips?.length && feedbackTips) feedbackTips.textContent = data.tips.join('\n');
    if (feedbackSection) feedbackSection.style.display = hasCorrection || Boolean(data.tips?.length) ? 'block' : 'none';
}

function countWords(text) {
    wordCount += text.trim().split(/\s+/).filter(w => w.length > 0).length;
    if (wordCountEl) wordCountEl.textContent = `${wordCount} words`;
}

function updateTimer() {
    if (!sessionStartTime) return;
    const s = Math.floor((Date.now() - sessionStartTime) / 1000);
    if (sessionTimeEl) sessionTimeEl.textContent = `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function saveProgress() {
    const p = JSON.parse(localStorage.getItem('fluentai_progress') || '{}');
    p.wordsSpoken = (p.wordsSpoken || 0) + wordCount;
    p.sessionsCompleted = (p.sessionsCompleted || 0) + 1;
    const elapsed = sessionStartTime ? Math.floor((Date.now() - sessionStartTime) / 60000) : 0;
    p.totalMinutes = (p.totalMinutes || 0) + elapsed;
    localStorage.setItem('fluentai_progress', JSON.stringify(p));
}

function saveSessionRecording() {
    if (conversationLog.length < 2) return;
    const elapsed = sessionStartTime ? Math.floor((Date.now() - sessionStartTime) / 1000) : 0;
    const session = {
        id: Date.now(),
        date: new Date().toISOString(),
        duration: elapsed,
        wordCount: wordCount,
        challenge: activeChallenge ? activeChallenge.title : null,
        challengeId: activeChallenge ? activeChallenge.id : null,
        messages: conversationLog.slice(),
        confidence: confidenceAnalyzer ? confidenceAnalyzer.getConfidenceData() : null
    };

    const sessions = JSON.parse(localStorage.getItem('fluentai_sessions') || '[]');
    sessions.unshift(session);
    if (sessions.length > 20) sessions.pop();
    localStorage.setItem('fluentai_sessions', JSON.stringify(sessions));
}

function updateConfidenceUI() {
    if (!confidenceAnalyzer) return;
    const data = confidenceAnalyzer.getConfidenceData();

    const gaugeCircle = document.getElementById('gaugeCircle');
    const gaugeText = document.getElementById('gaugeText');
    const confidenceLabel = document.getElementById('confidenceLabel');

    if (gaugeCircle) {
        const circumference = 94.2;
        const offset = circumference - (data.score / 100) * circumference;
        gaugeCircle.style.strokeDashoffset = offset;
        gaugeCircle.style.stroke = data.color;
    }
    if (gaugeText) { gaugeText.textContent = data.score; gaugeText.style.color = data.color; }
    if (confidenceLabel) { confidenceLabel.textContent = data.label; confidenceLabel.style.color = data.color; }

    const cpScore = document.getElementById('cpScore');
    const cpLevel = document.getElementById('cpLevel');
    if (cpScore) { cpScore.textContent = data.score; cpScore.style.color = data.color; }
    if (cpLevel) { cpLevel.textContent = `${data.emoji} ${data.label}`; cpLevel.style.color = data.color; }
}

function clearTranscript() {
    transcriptContent.innerHTML = '';
    if (feedbackSection) feedbackSection.style.display = 'none';
}

// Event listeners
startBtn.addEventListener('click', startSession);
stopBtn.addEventListener('click', stopSession);
muteBtn.addEventListener('click', toggleMute);
if (clearBtn) clearBtn.addEventListener('click', clearTranscript);

initChallenge();
if (typeof initAnimatedAvatar === 'function') {
    initAnimatedAvatar();
}
