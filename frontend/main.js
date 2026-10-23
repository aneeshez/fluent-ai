// Configuration
const BACKEND_URL = (window.location.origin && !window.location.origin.startsWith('file')) ? window.location.origin : 'http://localhost:8000';
console.log('Backend URL:', BACKEND_URL);

// DOM Elements
const localVideo = document.getElementById('localVideo');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const muteBtn = document.getElementById('muteBtn');
const muteText = document.getElementById('muteText');
const transcriptDiv = document.getElementById('transcript');
const feedbackDiv = document.getElementById('feedback');
const aiAudioEl = document.getElementById('aiAudio');
const connectionStatus = document.getElementById('connectionStatus');
const connectionText = document.getElementById('connectionText');
const clearTranscriptBtn = document.getElementById('clearTranscript');
const detailsPanel = document.getElementById('detailsPanel');
const loadingOverlay = document.getElementById('loadingOverlay');
const avatarCircle = document.getElementById('avatarCircle');
const aiSpeaking = document.getElementById('aiSpeaking');
const userMuted = document.getElementById('userMuted');
const feedbackStatus = document.getElementById('feedbackStatus');

// State
let socket = null;
let mediaStream = null;
let isMuted = false;
let isRecording = false;
let sessionId = null;
let recognition = null; // Web Speech API
let currentTranscript = '';
let debounceTimer = null;
let isAISpeaking = false; // Prevent echo loop - pause recognition when AI speaks

// Fallback mode: Use backend Whisper when Web Speech API fails
let useBackendSTT = false;
let mediaRecorder = null;
let audioChunks = [];

// Challenge Mode State
let currentChallenge = null;
let challengeTimer = null;
let challengeTimeRemaining = 0;
let sessionStats = {
    wordsSpoken: 0,
    corrections: 0,
    startTime: null
};

// Initialize Socket.IO connection
function initSocket() {
    socket = io(BACKEND_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5
    });

    socket.on('connect', () => {
        console.log('✅ Connected to server');
        updateConnectionStatus('connected', 'Connected');
        socket.emit('join', { room: 'tutor-session' });
    });

    socket.on('disconnect', () => {
        console.log('❌ Disconnected from server');
        updateConnectionStatus('disconnected', 'Disconnected');
    });

    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        updateConnectionStatus('disconnected', 'Connection Failed');
        showError('Failed to connect to server. Make sure backend is running on ' + BACKEND_URL);
    });

    socket.on('joined', (data) => {
        console.log('Joined room:', data);
        sessionId = data.session_id || Date.now().toString();
    });

    socket.on('ai-feedback', (data) => {
        console.log('AI Feedback received:', data);
        displayFeedback(data);
        hideLoading();
    });

    socket.on('ai-audio', (data) => {
        console.log('AI Audio received');
        playAIAudio(data.audio_base64, data.mime_type || 'audio/mpeg');
    });

    // Receive transcript from backend Whisper (fallback mode)
    socket.on('transcript', (data) => {
        console.log('📝 Backend transcript received:', data);
        if (data.text) {
            displayTranscript(data.text, data.is_interim || false);
            if (!data.is_interim) {
                currentTranscript = data.text;
            }
        }
    });

    socket.on('error', (msg) => {
        console.error('Server error:', msg);
        showError(msg.message || msg);
        hideLoading();
    });
}

// Update connection status UI
function updateConnectionStatus(status, text) {
    connectionStatus.className = `status-dot ${status}`;
    connectionText.textContent = text;
}

// Initialize Web Speech API for REAL-TIME transcription
function initSpeechRecognition() {
    console.log('🔧 Initializing speech recognition...');
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        console.error('❌ Web Speech API not supported in this browser');
        console.error('Browser info:', navigator.userAgent);
        showError('Your browser does not support speech recognition. Please use Chrome.');
        return false;
    }

    console.log('✅ Web Speech API is available');

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    console.log('📝 Recognition settings:', {
        continuous: recognition.continuous,
        interimResults: recognition.interimResults,
        lang: recognition.lang
    });

    recognition.onstart = () => {
        console.log('🎤 Speech recognition STARTED - speak now!');
        console.log('🎤 Listening for speech...');
    };

    recognition.onaudiostart = () => {
        console.log('🔊 Audio capturing started');
    };

    recognition.onsoundstart = () => {
        console.log('🔊 Sound detected!');
    };

    recognition.onspeechstart = () => {
        console.log('🗣️ Speech detected!');
    };

    recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }

        // Display transcript immediately (real-time!)
        if (finalTranscript) {
            displayTranscript(finalTranscript, false);
            currentTranscript = finalTranscript;

            // Send to backend for AI analysis (debounced)
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                sendForAnalysis(finalTranscript);
            }, 500); // Wait 500ms after user stops speaking
        }

        if (interimTranscript) {
            displayTranscript(interimTranscript, true);
        }
    };

    recognition.onerror = (event) => {
        console.error('❌ Speech recognition error:', event.error);
        console.error('Error details:', event);

        switch (event.error) {
            case 'no-speech':
                console.log('⚠️ No speech detected, restarting...');
                if (isRecording && !isMuted) {
                    setTimeout(() => {
                        try { recognition.start(); } catch (e) { console.error('Restart failed:', e); }
                    }, 100);
                }
                break;
            case 'audio-capture':
                console.error('❌ MICROPHONE ERROR: No microphone found or mic capture failed');
                showError('Microphone error! Check that your mic is connected and allowed.');
                break;
            case 'not-allowed':
                console.error('❌ PERMISSION DENIED: User denied microphone access');
                showError('Microphone access denied. Please allow microphone permission in your browser.');
                break;
            case 'network':
                console.error('❌ NETWORK ERROR: Google Speech service unavailable');
                console.log('🔄 Switching to BACKEND WHISPER mode...');
                switchToBackendSTT();
                break;
            case 'aborted':
                console.log('⚠️ Speech recognition was aborted');
                break;
            case 'service-not-allowed':
                console.error('❌ SERVICE NOT ALLOWED: Speech recognition service blocked');
                showError('Speech recognition is blocked. Try using HTTPS or localhost.');
                break;
            default:
                console.error('❌ Unknown speech recognition error:', event.error);
        }
    };

    recognition.onend = () => {
        console.log('Speech recognition ended');
        // Auto-restart if still recording
        if (isRecording && !isMuted) {
            setTimeout(() => {
                try { recognition.start(); } catch (e) { }
            }, 100);
        }
    };

    return true;
}

// Switch to backend Whisper STT when Web Speech API fails
function switchToBackendSTT() {
    if (useBackendSTT) {
        console.log('Already using backend STT');
        return;
    }

    useBackendSTT = true;
    console.log('✅ Switched to BACKEND WHISPER mode');
    console.log('📢 Audio will be sent to backend for transcription');

    // Stop Web Speech API
    if (recognition) {
        try { recognition.stop(); } catch (e) { }
        recognition = null;
    }

    // Show user a notification
    displayTranscript('🔄 Switched to backend transcription mode (Whisper)', true);
    setTimeout(() => {
        displayTranscript('✅ Ready! Start speaking...', false);
    }, 1500);

    // Start MediaRecorder to capture audio
    startMediaRecorder();
}

// Start MediaRecorder to capture and send audio to backend
function startMediaRecorder() {
    if (!mediaStream) {
        console.error('No media stream available for MediaRecorder');
        return;
    }

    try {
        // Use webm format for better compatibility
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm';

        mediaRecorder = new MediaRecorder(mediaStream, { mimeType });
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            if (audioChunks.length > 0 && !isMuted && !isAISpeaking) {
                const audioBlob = new Blob(audioChunks, { type: mimeType });
                sendAudioToBackend(audioBlob, mimeType);
            }
            audioChunks = [];

            // Restart recording if still active
            if (isRecording && !isMuted && useBackendSTT) {
                setTimeout(() => {
                    try {
                        mediaRecorder.start();
                        // Stop recording after 3 seconds to send chunks
                        setTimeout(() => {
                            if (mediaRecorder && mediaRecorder.state === 'recording') {
                                mediaRecorder.stop();
                            }
                        }, 3000);
                    } catch (e) {
                        console.error('Failed to restart MediaRecorder:', e);
                    }
                }, 100);
            }
        };

        // Start recording
        mediaRecorder.start();
        console.log('🎙️ MediaRecorder started');

        // Stop after 3 seconds to send first chunk
        setTimeout(() => {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
            }
        }, 3000);

    } catch (error) {
        console.error('Failed to start MediaRecorder:', error);
        showError('Failed to start audio recording: ' + error.message);
    }
}

// Send audio blob to backend for Whisper transcription
function sendAudioToBackend(audioBlob, mimeType) {
    if (!socket || !socket.connected) {
        console.warn('Socket not connected, cannot send audio');
        return;
    }

    console.log(`📤 Sending audio chunk: ${audioBlob.size} bytes, type: ${mimeType}`);

    const reader = new FileReader();
    reader.onloadend = () => {
        const base64data = reader.result.split(',')[1]; // Remove data URL prefix
        socket.emit('audio-chunk', {
            chunk: base64data,
            mimetype: mimeType
        });
    };
    reader.readAsDataURL(audioBlob);
}


// Send transcript to backend for AI analysis
function sendForAnalysis(text) {
    if (!socket || !socket.connected) {
        console.warn('Socket not connected');
        return;
    }

    if (!text || text.trim().length < 2) {
        return;
    }

    console.log('📤 Sending for AI analysis:', text);

    // Only show loading in Web Speech API mode (not backend STT mode)
    // Backend mode processes continuously, so loading overlay is disruptive
    if (!useBackendSTT) {
        showLoading();
    }

    // Send just the text - no audio processing needed!
    socket.emit('text-input', {
        text: text.trim(),
        session_id: sessionId
    });
}

// Start session
async function startSession() {
    if (isRecording) {
        console.warn('Session already started');
        return;
    }

    try {
        showLoading();

        // Request media access
        console.log('Requesting media access...');
        mediaStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            },
            audio: true
        });

        console.log('Media stream obtained');

        // Display video
        localVideo.srcObject = mediaStream;
        await localVideo.play();

        // Initialize speech recognition
        if (!initSpeechRecognition()) {
            throw new Error('Speech recognition not available');
        }

        // Start speech recognition
        recognition.start();

        // Update UI
        startBtn.disabled = true;
        stopBtn.disabled = false;
        muteBtn.disabled = false;
        isRecording = true;

        hideLoading();
        showSuccess('Session started! Start speaking...');

    } catch (err) {
        console.error('Error starting session:', err);
        hideLoading();
        isRecording = false;
        startBtn.disabled = false;
        stopBtn.disabled = true;
        muteBtn.disabled = true;
        showError('Failed to start session: ' + err.message);
    }
}

// Stop session
function stopSession() {
    console.log('Stopping session...');

    if (recognition) {
        try { recognition.stop(); } catch (e) { }
    }

    // Stop MediaRecorder if running
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try { mediaRecorder.stop(); } catch (e) { }
    }
    mediaRecorder = null;
    useBackendSTT = false;

    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }

    localVideo.srcObject = null;

    isRecording = false;
    isMuted = false;

    startBtn.disabled = false;
    stopBtn.disabled = true;
    muteBtn.disabled = true;
    muteText.textContent = 'Mute';
    userMuted.style.display = 'none';

    console.log('Session stopped');
}

// Toggle mute
function toggleMute() {
    isMuted = !isMuted;

    if (isMuted) {
        if (recognition) recognition.stop();
        muteText.textContent = 'Unmute';
        userMuted.style.display = 'block';
    } else {
        if (recognition && isRecording) recognition.start();
        muteText.textContent = 'Mute';
        userMuted.style.display = 'none';
    }

    // Mute audio track
    if (mediaStream) {
        mediaStream.getAudioTracks().forEach(track => {
            track.enabled = !isMuted;
        });
    }
}

// Display transcript
function displayTranscript(text, isInterim) {
    if (!text) return;

    // Clear placeholder
    const placeholder = transcriptDiv.querySelector('.placeholder');
    if (placeholder) placeholder.remove();

    // Find or create the current transcript item
    let currentItem = transcriptDiv.querySelector('.transcript-current');

    if (isInterim) {
        // Update interim transcript
        if (!currentItem) {
            currentItem = document.createElement('div');
            currentItem.className = 'transcript-item transcript-current interim';
            transcriptDiv.appendChild(currentItem);
        }
        currentItem.textContent = text;
        currentItem.className = 'transcript-item transcript-current interim';
    } else {
        // Finalize transcript
        if (currentItem) {
            currentItem.textContent = text;
            currentItem.className = 'transcript-item';
            currentItem.classList.remove('transcript-current');
        } else {
            const item = document.createElement('div');
            item.className = 'transcript-item';
            item.textContent = text;
            transcriptDiv.appendChild(item);
        }
    }

    // Scroll to bottom
    transcriptDiv.scrollTop = transcriptDiv.scrollHeight;
}

// Display AI feedback
function displayFeedback(data) {
    feedbackDiv.innerHTML = '';

    if (data.corrected_text) {
        const correctedDiv = document.createElement('div');
        correctedDiv.className = 'feedback-item';
        correctedDiv.innerHTML = `<h4>✏️ Corrected</h4><p>${data.corrected_text}</p>`;
        feedbackDiv.appendChild(correctedDiv);
    }

    if (data.tips && data.tips.length > 0) {
        const tipsDiv = document.createElement('div');
        tipsDiv.className = 'feedback-item';
        tipsDiv.innerHTML = `<h4>💡 Tips</h4><ul>${data.tips.map(t => `<li>${t}</li>`).join('')}</ul>`;
        feedbackDiv.appendChild(tipsDiv);
    }

    if (data.teacher_response) {
        const responseDiv = document.createElement('div');
        responseDiv.className = 'feedback-item';
        responseDiv.innerHTML = `<h4>🎓 Tutor Says</h4><p>${data.teacher_response}</p>`;
        feedbackDiv.appendChild(responseDiv);
    }

    // Show details panel
    if (detailsPanel) {
        detailsPanel.style.display = 'block';
        document.getElementById('correctedText').textContent = data.corrected_text || '';
        const tipsList = document.getElementById('tipsList');
        tipsList.innerHTML = (data.tips || []).map(t => `<li>${t}</li>`).join('');
        document.getElementById('teacherResponse').textContent = data.teacher_response || '';
    }
}

// Play AI audio response
function playAIAudio(base64, mimeType) {
    if (!base64) return;

    // ECHO PREVENTION: Pause all audio capture while AI speaks
    isAISpeaking = true;
    console.log('🔇 AI speaking - pausing all audio capture');

    // Stop Web Speech API
    if (recognition && isRecording) {
        try { recognition.stop(); } catch (e) { }
    }

    // Stop MediaRecorder to prevent echo
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        try { mediaRecorder.stop(); } catch (e) { }
        console.log('🔇 MediaRecorder paused - AI speaking');
    }

    const audioBlob = base64ToBlob(base64, mimeType);
    const audioUrl = URL.createObjectURL(audioBlob);

    aiAudioEl.src = audioUrl;

    if (avatarCircle) avatarCircle.classList.add('speaking');
    if (aiSpeaking) aiSpeaking.style.display = 'flex';

    aiAudioEl.play().catch(err => {
        console.error('Failed to play audio:', err);
        isAISpeaking = false;
        resumeAudioCapture();
    });

    aiAudioEl.onended = () => {
        if (avatarCircle) avatarCircle.classList.remove('speaking');
        if (aiSpeaking) aiSpeaking.style.display = 'none';
        URL.revokeObjectURL(audioUrl);

        // ECHO PREVENTION: Resume audio capture after AI finishes
        isAISpeaking = false;
        console.log('🎤 AI finished - resuming audio capture');

        // Add delay to let speakers fully stop before resuming
        setTimeout(() => {
            resumeAudioCapture();
        }, 500);
    };
}

// Resume audio capture after AI finishes speaking
function resumeAudioCapture() {
    if (!isRecording || isMuted || isAISpeaking) return;

    if (useBackendSTT) {
        // Resume MediaRecorder for backend mode
        if (mediaRecorder && mediaRecorder.state === 'inactive') {
            try {
                mediaRecorder.start();
                console.log('🎙️ MediaRecorder resumed');
                setTimeout(() => {
                    if (mediaRecorder && mediaRecorder.state === 'recording') {
                        mediaRecorder.stop();
                    }
                }, 3000);
            } catch (e) {
                console.error('Failed to resume MediaRecorder:', e);
            }
        }
    } else if (recognition) {
        // Resume Web Speech API
        try { recognition.start(); } catch (e) { }
    }
}

// Utility: base64 to Blob
function base64ToBlob(base64, mimeType) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
}

// UI Helpers
function showLoading() {
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
}

function hideLoading() {
    if (loadingOverlay) loadingOverlay.style.display = 'none';
}

function showError(message) {
    console.error('Error:', message);
    alert('Error: ' + message);
}

function showSuccess(message) {
    console.log('Success:', message);
}

// Clear transcript
function clearTranscript() {
    transcriptDiv.innerHTML = '<p class="placeholder">Your speech will appear here...</p>';
}

// Challenge mode configuration

const CHALLENGES = [
    {
        id: 'describe-scene',
        icon: '🖼️',
        title: 'Describe the Scene',
        description: 'Describe an imaginary scene in detail',
        prompt: 'Please describe a busy coffee shop on a rainy morning. Include details about the people, sounds, and atmosphere.',
        duration: 120
    },
    {
        id: 'tell-story',
        icon: '📖',
        title: 'Tell a Story',
        description: 'Create a short story from a prompt',
        prompt: 'Tell me a short story about someone who finds a mysterious letter in an old book. What happens next?',
        duration: 180
    },
    {
        id: 'daily-conversation',
        icon: '💬',
        title: 'Everyday Chat',
        description: 'Practice common daily scenarios',
        prompt: "Let's practice ordering food at a restaurant. I'll be the waiter. Start by greeting me and asking for a table.",
        duration: 120
    },
    {
        id: 'opinion',
        icon: '🗣️',
        title: 'Share Your Opinion',
        description: 'Express and defend your viewpoint',
        prompt: 'What do you think about social media? Share your opinion and explain your reasons.',
        duration: 120
    },
    {
        id: 'roleplay',
        icon: '🎭',
        title: 'Role Play',
        description: 'Act out a scenario',
        prompt: "You're calling to reschedule a doctor's appointment. I'll be the receptionist. Let's begin!",
        duration: 150
    }
];

function startChallenge(challengeId) {
    const challenge = CHALLENGES.find(c => c.id === challengeId);
    if (!challenge) return;

    currentChallenge = challenge;
    challengeTimeRemaining = challenge.duration;

    // Update UI
    const challengePanel = document.getElementById('challengePanel');
    const activeChallenge = document.getElementById('activeChallenge');
    const challengeCards = document.getElementById('challengeCards');

    if (challengeCards) challengeCards.style.display = 'none';
    if (activeChallenge) {
        activeChallenge.style.display = 'block';
        document.getElementById('activeChallengeTitle').textContent = `${challenge.icon} ${challenge.title}`;
        document.getElementById('activeChallengePrompt').textContent = challenge.prompt;
    }

    // Start timer
    updateChallengeTimer();
    challengeTimer = setInterval(() => {
        challengeTimeRemaining--;
        updateChallengeTimer();
        if (challengeTimeRemaining <= 0) {
            endChallenge();
        }
    }, 1000);

    // Send challenge context to backend
    if (socket && socket.connected) {
        socket.emit('text-input', {
            text: `[CHALLENGE START: ${challenge.title}] ${challenge.prompt}`,
            session_id: sessionId,
            is_challenge: true,
            challenge_type: challenge.id
        });
    }

    console.log(`🎯 Challenge started: ${challenge.title}`);
}

function updateChallengeTimer() {
    const timerEl = document.getElementById('challengeTimer');
    if (timerEl) {
        const mins = Math.floor(challengeTimeRemaining / 60);
        const secs = challengeTimeRemaining % 60;
        timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

        // Change color when low on time
        if (challengeTimeRemaining <= 30) {
            timerEl.classList.add('timer-warning');
        } else {
            timerEl.classList.remove('timer-warning');
        }
    }
}

function endChallenge() {
    if (challengeTimer) {
        clearInterval(challengeTimer);
        challengeTimer = null;
    }

    const challengeCards = document.getElementById('challengeCards');
    const activeChallenge = document.getElementById('activeChallenge');

    if (activeChallenge) activeChallenge.style.display = 'none';
    if (challengeCards) challengeCards.style.display = 'grid';

    if (currentChallenge) {
        console.log(`✅ Challenge completed: ${currentChallenge.title}`);
    }

    currentChallenge = null;
    challengeTimeRemaining = 0;
}

function updateSessionStats() {
    const statsEl = document.getElementById('sessionStats');
    if (!statsEl || !sessionStats.startTime) return;

    const elapsed = Math.floor((Date.now() - sessionStats.startTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;

    document.getElementById('statTime').textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    document.getElementById('statWords').textContent = sessionStats.wordsSpoken;
    document.getElementById('statCorrections').textContent = sessionStats.corrections;
}

// Track words spoken
function trackWordsSpoken(text) {
    if (!text) return;
    const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;
    sessionStats.wordsSpoken += wordCount;
    updateSessionStats();
}

// DOM event listeners

document.addEventListener('DOMContentLoaded', () => {
    initSocket();

    startBtn.addEventListener('click', () => {
        sessionStats.startTime = Date.now();
        sessionStats.wordsSpoken = 0;
        sessionStats.corrections = 0;
        startSession();

        // Show stats
        const statsEl = document.getElementById('sessionStats');
        if (statsEl) statsEl.style.display = 'flex';

        // Start stats update interval
        setInterval(updateSessionStats, 1000);
    });

    stopBtn.addEventListener('click', () => {
        stopSession();
        endChallenge();
    });

    muteBtn.addEventListener('click', toggleMute);

    if (clearTranscriptBtn) {
        clearTranscriptBtn.addEventListener('click', clearTranscript);
    }

    // Challenge card click handlers
    document.querySelectorAll('.challenge-card').forEach(card => {
        card.addEventListener('click', () => {
            const challengeId = card.dataset.challenge;
            if (challengeId && isRecording) {
                startChallenge(challengeId);
            } else if (!isRecording) {
                showError('Start a session first to begin a challenge!');
            }
        });
    });

    // End challenge button
    const endChallengeBtn = document.getElementById('endChallengeBtn');
    if (endChallengeBtn) {
        endChallengeBtn.addEventListener('click', endChallenge);
    }
});
