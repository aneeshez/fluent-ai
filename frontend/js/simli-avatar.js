// Fallback stub when WebRTC avatar service is not configured

// Simli is disabled — animated avatar is used instead
let simliReady = false;

function initSimliAvatar() {
    console.log('[Simli] Disabled — using animated avatar');
    showFallbackAvatar();
}

function sendAudioToSimli(pcm16Uint8Array) {
    return false; // Not handled — practice.js will use AudioContext playback
}

function showFallbackAvatar() {
    const fb = document.getElementById('avatarFallback');
    const video = document.getElementById('simliVideo');
    if (fb) fb.style.display = 'flex';
    if (video) video.style.display = 'none';
}

function stopSimli() {
    // No-op
}

console.log('[Simli] Module loaded (disabled — animated avatar active)');
