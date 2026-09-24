// Conversation controller and audio pipeline

// Auth
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

// State
let socket = null;
// dgSocket is declared in the Deepgram STT section below
let mediaStream = null;
let audioContext = null;
let processorNode = null;
let sourceNode = null;
let isRecording = false;
let isMuted = false;
let isAISpeaking = false;
let isAIThinking = false;  // Prevent duplicate sends while AI processes
let sessionStartTime = null;
let sessionTimer = null;
let wordCount = 0;
let selectedVoice = null;
let activeChallenge = null;
let challengeTimerInterval = null;
let conversationLog = [];
let confidenceAnalyzer = null;



// Default backend host (detect current origin or fallback to local port)
const BACKEND = (window.location.origin && window.location.origin !== 'null' && !window.location.origin.startsWith('file'))
    ? window.location.origin
    : 'http://localhost:5000';

// Challenge configuration
const CHALLENGES = {
    self_intro: {
        id: 'self_intro',
        title: '🗣️ Self Introduction',
        description: 'Practice introducing yourself: name, background, hobbies, and goals.',
        timeLimit: 120,
        xp: 20,
        greeting: null,  // Will come from backend
        tips: ['Use "My name is..."', 'Mention where you\'re from', 'Share your hobbies']
    },
    describe_home: {
        id: 'describe_home',
        title: '🏠 Describe Your Home',
        description: 'Describe your home: rooms, furniture, and what you like about it.',
        timeLimit: 180,
        xp: 25,
        greeting: null,
        tips: ['Use adjectives (cozy, spacious)', 'Describe each room', 'Use spatial words']
    },
    favorite_food: {
        id: 'favorite_food',
        title: '🍽️ Favorite Food',
        description: 'Describe your favorite dish, how it\'s made, and why you love it.',
        timeLimit: 180,
        xp: 35,
        greeting: null,
        tips: ['Use sensory words (delicious, crunchy)', 'Explain ingredients', 'Share memories']
    },
    story_telling: {
        id: 'story_telling',
        title: '📖 Story Telling',
        description: 'Tell a short story about an interesting experience you had.',
        timeLimit: 240,
        xp: 40,
        greeting: null,
        tips: ['Use past tense', 'Add connectors (first, then, suddenly)', 'Include emotions']
    },
    job_interview: {
        id: 'job_interview',
        title: '💼 Mock Interview',
        description: 'Practice answering common job interview questions professionally.',
        timeLimit: 300,
        xp: 75,
        greeting: null,
        tips: ['Use formal language', 'Be confident and concise', 'Give specific examples']
    },
    morning_routine: {
        id: 'morning_routine',
        title: '☀️ Morning Routine',
        description: 'Describe your typical morning step by step.',
        timeLimit: 180,
        xp: 50,
        greeting: null,
        tips: ['Use sequence words (first, then)', 'Mention times', 'Describe habits']
    },
    interview_prep: {
        id: 'interview_prep',
        title: '🎯 Interview Preparation',
        description: 'Learn interview techniques: STAR method, elevator pitch, power words.',
        timeLimit: 300,
        xp: 60,
        greeting: null,
        tips: ['Learn the STAR method', 'Practice your elevator pitch', 'Use power words']
    },
    debate: {
        id: 'debate',
        title: '🎙️ Debate Practice',
        description: 'Argue for or against a topic. Practice persuasion and reasoning.',
        timeLimit: 300,
        xp: 80,
        greeting: null,
        tips: ['Pick a clear side', 'Give 2-3 strong arguments', 'Address counter-points']
    }
};

// Read challenge from URL params
function initChallenge() {
    const params = new URLSearchParams(window.location.search);
    const challengeId = params.get('challenge');
    if (challengeId && CHALLENGES[challengeId]) {
        activeChallenge = CHALLENGES[challengeId];
        showChallengeBanner();
        console.log(`[Challenge] Active: ${activeChallenge.title}`);
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
    if (titleEl) titleEl.textContent = `🎯 ${activeChallenge.title}`;
    if (xpEl) xpEl.textContent = `⚡ ${activeChallenge.xp} XP`;
    if (descEl) descEl.textContent = activeChallenge.description;
    if (limitEl) {
        const m = Math.floor(activeChallenge.timeLimit / 60);
        const s = activeChallenge.timeLimit % 60;
        limitEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    }
    if (convTitle) convTitle.textContent = `🎯 ${activeChallenge.title}`;
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
        addMessage(`⏰ Time's up! Challenge complete!`, 'system');
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
        if (titleEl) titleEl.textContent = '✅ Challenge Complete!';
        if (xpEl) xpEl.textContent = `⚡ +${activeChallenge.xp} XP Earned!`;
    }

    console.log(`[Challenge] Completed: ${activeChallenge.title} (+${activeChallenge.xp} XP)`);
}

// DOM
const localVideo = document.getElementById('localVideo');
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
const aiAudio = document.getElementById('aiAudio');
const clearBtn = document.getElementById('clearBtn');

// Voice selection for speech synthesis fallback
function pickVoice() {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;
    const prefs = ['Jenny', 'Aria', 'Zira', 'Samantha', 'Female'];
    for (const p of prefs) {
        const v = voices.find(v => v.name.includes(p) && v.lang.startsWith('en'));
        if (v) { selectedVoice = v; console.log('[TTS] Voice:', v.name); return; }
    }
    const enVoice = voices.find(v => v.lang.startsWith('en-US')) || voices.find(v => v.lang.startsWith('en'));
    if (enVoice) { selectedVoice = enVoice; console.log('[TTS] Voice:', enVoice.name); }
}
window.speechSynthesis.onvoiceschanged = pickVoice;
pickVoice();

// Handle speech synthesis and speaking state
let simliAudioTimer = null;

function speak(text) {
    if (!text) return;
    isAISpeaking = true;
    setStatus('Luna speaking...');
    if (aiStatus) aiStatus.textContent = 'Speaking...';
    // Trigger avatar speaking animation
    if (typeof avatarSpeaking === 'function') avatarSpeaking();
    if (typeof startAvatarSpeaking === 'function') startAvatarSpeaking();
    // Audio comes from backend via tts-audio Socket.IO event
    // Safety timeout in case audio never arrives
    const safetyMs = Math.max(5000, Math.min(25000, text.length * 120));
    if (simliAudioTimer) clearTimeout(simliAudioTimer);
    simliAudioTimer = setTimeout(() => {
        if (isAISpeaking) {
            console.log('[TTS] Safety reset — no audio received');
            onSimliAudioDone();
        }
    }, safetyMs);
}

function onSimliAudioDone() {
    isAISpeaking = false;
    if (aiStatus) aiStatus.textContent = 'Listening...';
    setStatus('🟢 Live — speak now!');
    if (confidenceAnalyzer) confidenceAnalyzer.markAIFinished();
    // Reset avatar to listening state
    if (typeof avatarListening === 'function') avatarListening();
    if (typeof stopAvatarSpeaking === 'function') stopAvatarSpeaking();
}

// Raw PCM16 audio playback buffer
let ttsAudioCtx = null;
let ttsNextStart = 0;

function playPCM16Audio(uint8Array) {
    try {
        if (!ttsAudioCtx || ttsAudioCtx.state === 'closed') {
            ttsAudioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            ttsNextStart = 0;
        }
        if (ttsAudioCtx.state === 'suspended') {
            ttsAudioCtx.resume();
        }

        // Convert PCM16 (Int16) to Float32
        const int16 = new Int16Array(uint8Array.buffer, uint8Array.byteOffset, uint8Array.length / 2);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
            float32[i] = int16[i] / 32768;
        }

        // Create audio buffer
        const buffer = ttsAudioCtx.createBuffer(1, float32.length, 16000);
        buffer.getChannelData(0).set(float32);

        const source = ttsAudioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(ttsAudioCtx.destination);

        // Schedule playback sequentially
        const now = ttsAudioCtx.currentTime;
        const startAt = Math.max(now, ttsNextStart);
        source.start(startAt);
        ttsNextStart = startAt + buffer.duration;
    } catch (e) {
        console.error('[TTS Play] Error:', e);
    }
}

// Socket.IO connection and message handlers
function initSocket() {
    socket = io(BACKEND, { transports: ['websocket', 'polling'] });
    socket.on('connect', () => {
        console.log('[IO] Connected to backend');
        if (connectionDot) { connectionDot.classList.add('connected'); connectionDot.classList.remove('disconnected'); }
        if (connectionText) connectionText.textContent = 'Connected';
        socket.emit('join', { room: 'practice' });
    });
    socket.on('disconnect', () => {
        if (connectionDot) { connectionDot.classList.remove('connected'); connectionDot.classList.add('disconnected'); }
        if (connectionText) connectionText.textContent = 'Disconnected';
    });

    // AI response
    socket.on('ai-feedback', (data) => {
        const reply = data.teacher_response;
        console.log('[AI] ⚡', reply);
        isAIThinking = false;  // AI done thinking
        if (reply) {
            addMessage(reply, 'ai');
            speak(reply);
        }
        if (data.corrected_text || data.tips?.length) showFeedback(data);
    });

    // Simli PCM16 audio chunks
    socket.on('tts-audio', (data) => {
        if (!data.audio) return;
        try {
            const binary = atob(data.audio);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }

            // Send to Simli for lip-sync (Simli also plays the audio)
            let simliHandled = false;
            if (typeof sendAudioToSimli === 'function') {
                simliHandled = sendAudioToSimli(bytes);
                if (simliHandled) {
                    console.log(`[Audio] Chunk ${data.index + 1}/${data.total} to Simli`);
                }
            }

            // Fallback: play via AudioContext only if Simli didn't handle it
            if (!simliHandled) {
                playPCM16Audio(bytes);
            }

            if (data.done) {
                const totalBytes = data.total * 32000;
                const durationMs = (totalBytes / 32000) * 1000 + 500;

                if (simliAudioTimer) clearTimeout(simliAudioTimer);
                simliAudioTimer = setTimeout(() => {
                    onSimliAudioDone();
                }, durationMs);
            }
        } catch (e) {
            console.error('[Audio] Error:', e);
        }
    });
}

// Deepgram WebSocket streaming for transcription
let dgSocket = null;
let dgReady = false;
let dgReconnectAttempts = 0;
const DG_MAX_RECONNECTS = 5;
let dgKeepAlive = null;

async function startDeepgram() {
    try {
        const res = await fetch(BACKEND + '/api/deepgram-key');
        const data = await res.json();
        if (!data.key) { console.error('[DG] No API key'); return; }

        // Get mic sample rate
        audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
        const sampleRate = audioContext.sampleRate;

        const url = `wss://api.deepgram.com/v1/listen?model=nova-2&language=en&smart_format=true&interim_results=true&utterance_end_ms=1000&vad_events=true&encoding=linear16&sample_rate=${sampleRate}&channels=1&endpointing=300`;

        dgSocket = new WebSocket(url, ['token', data.key]);

        dgSocket.onopen = () => {
            console.log('[DG] ✅ Connected to Deepgram');
            dgReady = true;
            dgReconnectAttempts = 0;
            setStatus('🟢 Live — speak now!');
            if (aiStatus) aiStatus.textContent = 'Listening...';

            // KeepAlive every 8 seconds
            if (dgKeepAlive) clearInterval(dgKeepAlive);
            dgKeepAlive = setInterval(() => {
                if (dgSocket?.readyState === WebSocket.OPEN) {
                    dgSocket.send(JSON.stringify({ type: 'KeepAlive' }));
                }
            }, 8000);

            // Start audio capture
            startAudioCapture(sampleRate);
        };

        let fullSentence = '';

        dgSocket.onmessage = (event) => {
            const msg = JSON.parse(event.data);

            if (msg.type === 'SpeechStarted') {
                setStatus('🔴 Listening...');
                return;
            }

            if (msg.type === 'UtteranceEnd') {
                if (fullSentence.trim()) {
                    sendToAI(fullSentence.trim());
                }
                fullSentence = '';
                return;
            }

            if (msg.type === 'Results') {
                const transcript = msg.channel?.alternatives?.[0]?.transcript || '';
                if (!transcript.trim()) return;

                if (msg.is_final) {
                    clearInterim();
                    fullSentence += (fullSentence ? ' ' : '') + transcript;
                    addMessage(transcript, 'user');
                    countWords(transcript);
                    if (msg.speech_final) {
                        sendToAI(fullSentence.trim());
                        fullSentence = '';
                    }
                } else {
                    showInterim(transcript);
                    setStatus('🔴 Hearing you...');
                }
            }
        };

        dgSocket.onerror = (err) => {
            console.error('[DG] WebSocket error:', err);
        };

        dgSocket.onclose = () => {
            console.log('[DG] Connection closed');
            dgReady = false;
            if (dgKeepAlive) { clearInterval(dgKeepAlive); dgKeepAlive = null; }

            // Auto-reconnect if session active
            if (isRecording && dgReconnectAttempts < DG_MAX_RECONNECTS) {
                dgReconnectAttempts++;
                console.log(`[DG] Reconnecting (${dgReconnectAttempts}/${DG_MAX_RECONNECTS})...`);
                setTimeout(() => { if (isRecording) startDeepgram(); }, 2000);
            }
        };

    } catch (err) {
        console.error('[DG] Start error:', err);
    }
}

function stopDeepgram() {
    dgReady = false;
    dgReconnectAttempts = DG_MAX_RECONNECTS; // Prevent reconnect
    if (dgKeepAlive) { clearInterval(dgKeepAlive); dgKeepAlive = null; }
    if (dgSocket) { try { dgSocket.close(); } catch (e) { } dgSocket = null; }
    if (processorNode) { try { processorNode.disconnect(); } catch (e) { } processorNode = null; }
    if (sourceNode) { try { sourceNode.disconnect(); } catch (e) { } sourceNode = null; }
    if (audioContext) { try { audioContext.close(); } catch (e) { } audioContext = null; }
}

function startAudioCapture(sampleRate) {
    if (!mediaStream || !audioContext) return;
    if (processorNode) { try { processorNode.disconnect(); } catch (e) { } }
    if (sourceNode) { try { sourceNode.disconnect(); } catch (e) { } }

    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    processorNode = audioContext.createScriptProcessor(4096, 1, 1);

    processorNode.onaudioprocess = (event) => {
        if (!isRecording || isMuted || isAISpeaking) return;
        if (!dgSocket || dgSocket.readyState !== WebSocket.OPEN) return;

        const float32 = event.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
            const s = Math.max(-1, Math.min(1, float32[i]));
            int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        dgSocket.send(int16.buffer);
    };

    sourceNode.connect(processorNode);
    processorNode.connect(audioContext.destination);
    console.log('[DG] ✅ Audio capture started (' + sampleRate + 'Hz)');
}

// Send input text to backend tutor
function sendToAI(text) {
    if (!socket?.connected || !text?.trim()) return;
    if (isAIThinking) {
        console.log('[AI] Skipping — already thinking');
        return;
    }
    isAIThinking = true;
    if (aiStatus) aiStatus.textContent = 'Thinking...';
    setStatus('AI thinking...');
    // Trigger avatar thinking animation
    if (typeof avatarThinking === 'function') avatarThinking();

    const payload = { text: text.trim() };
    if (activeChallenge) payload.challenge = activeChallenge.id;

    // Attach confidence data
    if (confidenceAnalyzer) {
        const cd = confidenceAnalyzer.getConfidenceData();
        payload.confidence_level = cd.level;
        payload.confidence_score = cd.score;
    }

    socket.emit('text-input', payload);
}

async function startSession() {
    if (isRecording) return;
    setStatus('Starting...');

    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 16000
            }
        });
        localVideo.srcObject = mediaStream;
        if (!socket) initSocket();

        // Clear server-side conversation history for fresh session
        if (socket?.connected) {
            socket.emit('clear-history');
        }

        isRecording = true;
        isAIThinking = false;
        sessionStartTime = Date.now();
        wordCount = 0;
        dgReconnectAttempts = 0;
        conversationLog = [];

        // Initialize confidence analyzer
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

        await startDeepgram();

        // Challenge greeting or default — send to backend for TTS
        let greeting;
        if (activeChallenge) {
            greeting = activeChallenge.greeting || `Let's practice ${activeChallenge.title}! I'm Luna, your coach. Let's begin!`;
            challengeTimerInterval = setInterval(updateChallengeTimer, 500);
        } else {
            greeting = "Hi! I'm Luna, your English communication tutor. Let's have a conversation — speak naturally and I'll help you improve!";
        }
        addMessage(greeting, 'ai');
        // Send greeting to backend for Deepgram TTS audio
        if (socket?.connected) {
            speak(greeting);
            socket.emit('speak-greeting', { text: greeting });
        }
        if (aiStatus) aiStatus.textContent = 'Luna speaking...';

    } catch (err) {
        console.error('[SESSION] Failed:', err);
        setStatus('Camera/Mic denied');
        alert('Please allow camera and microphone access to start a session.');
    }
}

function stopSession() {
    isRecording = false;
    isAIThinking = false;
    window.speechSynthesis.cancel();
    stopDeepgram();
    if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
    localVideo.srcObject = null;
    clearInterval(sessionTimer);
    if (challengeTimerInterval) { clearInterval(challengeTimerInterval); challengeTimerInterval = null; }
    startBtn.style.display = 'flex';
    stopBtn.style.display = 'none';
    muteBtn.disabled = true;
    if (aiStatus) aiStatus.textContent = 'Ended';
    setStatus('Session ended');
    saveProgress();
    saveSessionRecording();

    if (activeChallenge && !document.getElementById('challengeTitle')?.textContent?.includes('Complete')) {
        completeChallenge();
        addMessage(`Challenge complete! You earned ⚡${activeChallenge.xp} XP!`, 'ai');
    } else if (!activeChallenge) {
        addMessage('Great session! Keep practicing to improve your skills.', 'ai');
    }
}

function toggleMute() {
    isMuted = !isMuted;
    muteBtn.textContent = isMuted ? '🔇' : '🎤';
    if (isMuted) {
        muteBtn.classList.add('active');
        setStatus('Muted');
    } else {
        muteBtn.classList.remove('active');
        setStatus('🟢 Live — speak now!');
    }
}

// UI state management
function setStatus(text) {
    const el = document.getElementById('micStatusText');
    const dot = document.querySelector('.mic-dot');
    if (el) el.textContent = text;
    if (dot) {
        if (text.includes('error') || text.includes('denied') || text.includes('lost'))
            dot.style.background = '#ef4444';
        else if (text.includes('Muted') || text.includes('ended') || text.includes('speaking'))
            dot.style.background = '#9ca3af';
        else if (text.includes('Reconnecting'))
            dot.style.background = '#fbbf24';
        else
            dot.style.background = '#22c55e';
    }
}

function addMessage(text, type) {
    if (type !== 'system') {
        conversationLog.push({ text, type, time: new Date().toISOString() });
    }

    // Feed user speech to confidence analyzer
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
    if (feedbackSection) feedbackSection.style.display = 'block';
    if (data.corrected_text && correctedText) correctedText.textContent = data.corrected_text;
    if (data.tips?.length && feedbackTips) feedbackTips.innerHTML = data.tips.map(t => `• ${t}`).join('<br>');
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
    console.log(`[Session] Saved: ${conversationLog.length} messages, ${elapsed}s`);
}

// Update live confidence metrics
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

    const tooltipSignals = document.getElementById('tooltipSignals');
    if (tooltipSignals && data.signals) {
        const signalNames = [
            { key: 'fillerRatio', name: 'Filler Words', icon: '🗣️' },
            { key: 'pace', name: 'Speech Pace', icon: '⏱️' },
            { key: 'responseLength', name: 'Response Len', icon: '📏' },
            { key: 'hesitation', name: 'Hesitation', icon: '⏸️' },
            { key: 'vocabulary', name: 'Vocabulary', icon: '📚' }
        ];
        tooltipSignals.innerHTML = signalNames.map(s => {
            const val = Math.round(data.signals[s.key] || 0);
            const barColor = val >= 60 ? '#34d399' : val >= 35 ? '#fbbf24' : '#f87171';
            return `<div class="ct-signal">
                <span class="ct-signal-name">${s.icon} ${s.name}</span>
                <div class="ct-signal-bar"><div class="ct-signal-fill" style="width:${val}%;background:${barColor}"></div></div>
                <span class="ct-signal-value">${val}</span>
            </div>`;
        }).join('');
    }

    const cpScore = document.getElementById('cpScore');
    const cpLevel = document.getElementById('cpLevel');
    const cpSignals = document.getElementById('cpSignals');

    if (cpScore) { cpScore.textContent = data.score; cpScore.style.color = data.color; }
    if (cpLevel) { cpLevel.textContent = `${data.emoji} ${data.label}`; cpLevel.style.color = data.color; }

    if (cpSignals && data.signals) {
        const items = [
            { key: 'fillerRatio', name: 'Fillers', icon: '🗣️' },
            { key: 'pace', name: 'Pace', icon: '⏱️' },
            { key: 'responseLength', name: 'Length', icon: '📏' },
            { key: 'hesitation', name: 'Hesitation', icon: '⏸️' },
            { key: 'vocabulary', name: 'Vocab', icon: '📚' }
        ];
        cpSignals.innerHTML = items.map(s => {
            const val = Math.round(data.signals[s.key] || 0);
            const color = val >= 60 ? '#34d399' : val >= 35 ? '#fbbf24' : '#f87171';
            return `<div class="cp-signal-row">
                <span class="cp-signal-icon">${s.icon}</span>
                <span class="cp-signal-name">${s.name}</span>
                <div class="cp-signal-bar"><div class="cp-signal-fill" style="width:${val}%;background:${color}"></div></div>
                <span class="cp-signal-pct">${val}%</span>
            </div>`;
        }).join('');
    }
}

function clearTranscript() {
    transcriptContent.innerHTML = '';
    if (feedbackSection) feedbackSection.style.display = 'none';
}

// INIT
startBtn.addEventListener('click', startSession);
stopBtn.addEventListener('click', stopSession);
muteBtn.addEventListener('click', toggleMute);
if (clearBtn) clearBtn.addEventListener('click', clearTranscript);
initSocket();
initChallenge();
if (typeof initSimliAvatar === 'function') {
    initSimliAvatar();
} else {
    const fb = document.getElementById('avatarFallback');
    if (fb) fb.style.display = 'flex';
}
console.log('[INIT] FluentAI v14 — Professional AI Tutor + Rock-solid Deepgram');
