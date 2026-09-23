// Canvas-based animated avatar controller with emotional expressions

const AvatarState = {
    IDLE: 'idle',
    LISTENING: 'listening',
    THINKING: 'thinking',
    SPEAKING: 'speaking',
    HAPPY: 'happy',
    GREETING: 'greeting'
};

class AnimatedAvatar {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        // High-DPI support
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);
        this.w = rect.width;
        this.h = rect.height;

        // State
        this.state = AvatarState.IDLE;
        this.prevState = AvatarState.IDLE;

        // Animation values (0 to 1 for transitions)
        this.speakAnim = 0;
        this.listenAnim = 0;
        this.thinkAnim = 0;
        this.happyAnim = 0;
        this.breathe = 0;
        this.ringPulse = 0;
        this.ringRotation = 0;
        this.wavePhase = 0;

        // Particles
        this.particles = [];
        for (let i = 0; i < 20; i++) {
            this.particles.push({
                x: Math.random() * this.w,
                y: Math.random() * this.h,
                r: 1 + Math.random() * 2.5,
                speed: 0.15 + Math.random() * 0.4,
                alpha: 0.05 + Math.random() * 0.15,
                phase: Math.random() * Math.PI * 2
            });
        }

        // Load the realistic human avatar image
        this.photo = new Image();
        this.photoLoaded = false;
        this.photo.onload = () => {
            this.photoLoaded = true;
            console.log('[Avatar] ✅ Human photo loaded');
        };
        this.photo.onerror = () => {
            console.warn('[Avatar] ⚠️ Photo failed to load, using fallback');
        };
        this.photo.src = 'images/luna-human.png';

        this.lastTime = performance.now();
        this.animate = this.animate.bind(this);
        this.animationId = requestAnimationFrame(this.animate);
    }

    // State transitions
    setState(newState) {
        if (this.state === newState) return;
        this.prevState = this.state;
        this.state = newState;
        console.log(`[Avatar] State: ${newState}`);
    }

    // Animation loop
    animate(timestamp) {
        const dt = Math.min(timestamp - this.lastTime, 50);
        this.lastTime = timestamp;
        this.update(dt);
        this.draw();
        this.animationId = requestAnimationFrame(this.animate);
    }

    update(dt) {
        const lerp = (a, b, t) => a + (b - a) * Math.min(1, t);
        const speed = dt * 0.005;

        // Smooth transitions
        this.speakAnim = lerp(this.speakAnim, this.state === AvatarState.SPEAKING ? 1 : 0, speed * 2);
        this.listenAnim = lerp(this.listenAnim, this.state === AvatarState.LISTENING ? 1 : 0, speed * 2);
        this.thinkAnim = lerp(this.thinkAnim, this.state === AvatarState.THINKING ? 1 : 0, speed * 2);
        this.happyAnim = lerp(this.happyAnim, (this.state === AvatarState.HAPPY || this.state === AvatarState.GREETING) ? 1 : 0, speed * 2);

        // Breathing (constant subtle animation)
        this.breathe = Math.sin(performance.now() * 0.002) * 0.5 + 0.5;

        // Ring rotation
        this.ringRotation += dt * 0.0008;
        if (this.state === AvatarState.SPEAKING) {
            this.ringRotation += dt * 0.002;
        }

        // Ring pulse
        if (this.state === AvatarState.SPEAKING) {
            this.ringPulse = 0.5 + Math.sin(performance.now() * 0.006) * 0.5;
        } else if (this.state === AvatarState.LISTENING) {
            this.ringPulse = 0.3 + Math.sin(performance.now() * 0.003) * 0.2;
        } else {
            this.ringPulse = lerp(this.ringPulse, 0.15, speed);
        }

        // Wave phase for speaking bars
        this.wavePhase += dt * 0.008;

        // Particles
        for (const p of this.particles) {
            p.y -= p.speed * (dt * 0.02);
            p.x += Math.sin(p.phase + performance.now() * 0.0008) * 0.2;
            if (p.y < -10) { p.y = this.h + 10; p.x = Math.random() * this.w; }
        }
    }

    // Render frame
    draw() {
        const ctx = this.ctx;
        const cx = this.w / 2;
        const cy = this.h / 2 - 15;

        ctx.clearRect(0, 0, this.w, this.h);

        // --- BACKGROUND ---
        const bgGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, this.w * 0.75);
        bgGrad.addColorStop(0, '#1a1035');
        bgGrad.addColorStop(0.6, '#12102e');
        bgGrad.addColorStop(1, '#080614');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, this.w, this.h);

        // --- AMBIENT PARTICLES ---
        for (const p of this.particles) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            const pAlpha = p.alpha * (1 + this.speakAnim * 0.5);
            ctx.fillStyle = `rgba(139, 92, 246, ${pAlpha})`;
            ctx.fill();
        }

        // --- BACKGROUND GLOW (state-reactive) ---
        const glowAlpha = 0.08 + this.speakAnim * 0.12 + this.listenAnim * 0.05 + this.happyAnim * 0.08;
        const bgGlow = ctx.createRadialGradient(cx, cy, 20, cx, cy, this.w * 0.5);
        bgGlow.addColorStop(0, `rgba(99, 102, 241, ${glowAlpha})`);
        bgGlow.addColorStop(0.5, `rgba(139, 92, 246, ${glowAlpha * 0.4})`);
        bgGlow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bgGlow;
        ctx.fillRect(0, 0, this.w, this.h);

        // --- OUTER RING GLOW ---
        const ringR = Math.min(cx, cy) * 0.52;
        const ringGlow = ctx.createRadialGradient(cx, cy, ringR - 5, cx, cy, ringR + 30);
        const rgAlpha = 0.1 + this.ringPulse * 0.3;
        ringGlow.addColorStop(0, `rgba(99, 102, 241, ${rgAlpha})`);
        ringGlow.addColorStop(0.6, `rgba(139, 92, 246, ${rgAlpha * 0.3})`);
        ringGlow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = ringGlow;
        ctx.fillRect(0, 0, this.w, this.h);

        // --- ANIMATED RING (conic gradient, rotates) ---
        ctx.save();
        ctx.translate(cx, cy);

        // Draw ring segments for conic gradient effect
        const ringWidth = 2.5 + this.ringPulse * 2;
        const segments = 60;
        for (let i = 0; i < segments; i++) {
            const angle = (i / segments) * Math.PI * 2 + this.ringRotation;
            const nextAngle = ((i + 1) / segments) * Math.PI * 2 + this.ringRotation;
            const t = i / segments;

            // Color transitions around the ring
            const r = Math.floor(99 + Math.sin(t * Math.PI * 2) * 40);
            const g = Math.floor(102 + Math.sin(t * Math.PI * 2 + 2) * 30);
            const b = Math.floor(241 - Math.sin(t * Math.PI * 2 + 1) * 40);
            const alpha = 0.5 + this.ringPulse * 0.5;

            ctx.beginPath();
            ctx.arc(0, 0, ringR, angle, nextAngle + 0.02);
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
            ctx.lineWidth = ringWidth;
            ctx.stroke();
        }

        // Subtle outer ring
        ctx.beginPath();
        ctx.arc(0, 0, ringR + 7, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(139, 92, 246, ${0.06 + this.ringPulse * 0.08})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // --- PHOTO CIRCLE (clipped) ---
        ctx.beginPath();
        ctx.arc(0, 0, ringR - 4, 0, Math.PI * 2);
        ctx.clip();

        if (this.photoLoaded) {
            // Draw the realistic human photo
            const imgSize = (ringR - 4) * 2;

            // Subtle breathing scale
            const bScale = 1 + this.breathe * 0.008;
            ctx.save();
            ctx.scale(bScale, bScale);

            // Brightness/warmth shift based on state
            if (this.happyAnim > 0.1) {
                ctx.filter = `brightness(${1 + this.happyAnim * 0.08}) saturate(${1 + this.happyAnim * 0.15})`;
            } else if (this.speakAnim > 0.1) {
                ctx.filter = `brightness(${1 + this.speakAnim * 0.05})`;
            }

            ctx.drawImage(this.photo, -imgSize / 2, -imgSize / 2, imgSize, imgSize);
            ctx.restore();

            // --- STATE OVERLAY EFFECTS ---

            // Speaking: subtle animated glow on face edges
            if (this.speakAnim > 0.05) {
                const speakGlow = ctx.createRadialGradient(0, 0, ringR * 0.5, 0, 0, ringR);
                speakGlow.addColorStop(0, 'rgba(0,0,0,0)');
                speakGlow.addColorStop(0.85, 'rgba(0,0,0,0)');
                speakGlow.addColorStop(1, `rgba(99, 102, 241, ${this.speakAnim * 0.25})`);
                ctx.fillStyle = speakGlow;
                ctx.fillRect(-ringR, -ringR, ringR * 2, ringR * 2);
            }

            // Listening: soft green tint on edges
            if (this.listenAnim > 0.05) {
                const listenGlow = ctx.createRadialGradient(0, 0, ringR * 0.6, 0, 0, ringR);
                listenGlow.addColorStop(0, 'rgba(0,0,0,0)');
                listenGlow.addColorStop(0.9, 'rgba(0,0,0,0)');
                listenGlow.addColorStop(1, `rgba(16, 185, 129, ${this.listenAnim * 0.15})`);
                ctx.fillStyle = listenGlow;
                ctx.fillRect(-ringR, -ringR, ringR * 2, ringR * 2);
            }

            // Thinking: subtle blue overlay
            if (this.thinkAnim > 0.05) {
                const thinkOverlay = ctx.createRadialGradient(0, 0, ringR * 0.3, 0, 0, ringR);
                thinkOverlay.addColorStop(0, `rgba(99, 102, 241, ${this.thinkAnim * 0.04})`);
                thinkOverlay.addColorStop(1, `rgba(99, 102, 241, ${this.thinkAnim * 0.1})`);
                ctx.fillStyle = thinkOverlay;
                ctx.fillRect(-ringR, -ringR, ringR * 2, ringR * 2);
            }

            // Happy: warm golden tint
            if (this.happyAnim > 0.05) {
                const happyGlow = ctx.createRadialGradient(0, 0, ringR * 0.5, 0, 0, ringR);
                happyGlow.addColorStop(0, 'rgba(0,0,0,0)');
                happyGlow.addColorStop(0.85, 'rgba(0,0,0,0)');
                happyGlow.addColorStop(1, `rgba(245, 158, 11, ${this.happyAnim * 0.15})`);
                ctx.fillStyle = happyGlow;
                ctx.fillRect(-ringR, -ringR, ringR * 2, ringR * 2);
            }

        } else {
            // Fallback while loading
            ctx.fillStyle = '#1a1035';
            ctx.fillRect(-ringR, -ringR, ringR * 2, ringR * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = '14px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Loading...', 0, 5);
        }

        ctx.restore();

        // --- NAME & STATUS (below the ring) ---
        const textY = cy + ringR + 18;

        ctx.font = '600 18px Inter, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText('Luna', cx, textY);

        // Status text changes based on state
        ctx.font = '500 11px Inter, sans-serif';
        ctx.letterSpacing = '1.5px';
        let statusText = 'AI COMMUNICATION TUTOR';
        let statusColor = 'rgba(255,255,255,0.4)';

        if (this.state === AvatarState.SPEAKING) {
            statusText = '● SPEAKING...';
            statusColor = 'rgba(139, 92, 246, 0.9)';
        } else if (this.state === AvatarState.LISTENING) {
            statusText = '● LISTENING';
            statusColor = 'rgba(16, 185, 129, 0.8)';
        } else if (this.state === AvatarState.THINKING) {
            statusText = '● THINKING...';
            statusColor = 'rgba(99, 102, 241, 0.8)';
        } else if (this.state === AvatarState.HAPPY || this.state === AvatarState.GREETING) {
            statusText = '😊 HELLO!';
            statusColor = 'rgba(245, 158, 11, 0.8)';
        }

        ctx.fillStyle = statusColor;
        ctx.fillText(statusText, cx, textY + 18);

        // --- AUDIO WAVE BARS (speaking) ---
        if (this.speakAnim > 0.05) {
            this.drawWaveBars(ctx, cx, cy + ringR + 48, this.speakAnim);
        }

        // --- LISTENING PULSE ---
        if (this.listenAnim > 0.05) {
            this.drawListenPulse(ctx, cx, cy + ringR + 48, this.listenAnim);
        }

        // --- THINKING DOTS ---
        if (this.thinkAnim > 0.05) {
            this.drawThinkingDots(ctx, cx, cy + ringR + 48, this.thinkAnim);
        }
    }

    drawWaveBars(ctx, cx, y, intensity) {
        const barCount = 9;
        const barW = 3;
        const gap = 3;
        const totalW = barCount * barW + (barCount - 1) * gap;
        const startX = cx - totalW / 2;

        for (let i = 0; i < barCount; i++) {
            const phase = this.wavePhase + i * 0.6;
            const h = 3 + Math.abs(Math.sin(phase)) * 16 * intensity;
            const x = startX + i * (barW + gap);

            const barGrad = ctx.createLinearGradient(x, y - h, x, y);
            barGrad.addColorStop(0, `rgba(139, 92, 246, ${0.9 * intensity})`);
            barGrad.addColorStop(1, `rgba(99, 102, 241, ${0.4 * intensity})`);
            ctx.fillStyle = barGrad;

            ctx.beginPath();
            ctx.roundRect(x, y - h, barW, h, 1.5);
            ctx.fill();
        }
    }

    drawListenPulse(ctx, cx, y, intensity) {
        const t = performance.now() * 0.004;
        const r = 4 + Math.sin(t) * 2;

        ctx.beginPath();
        ctx.arc(cx, y - 5, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(16, 185, 129, ${0.6 * intensity})`;
        ctx.fill();

        // Outer pulse ring
        const outerR = r + 5 + Math.sin(t * 0.8) * 3;
        ctx.beginPath();
        ctx.arc(cx, y - 5, outerR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(16, 185, 129, ${0.2 * intensity})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Second outer ring
        const outerR2 = outerR + 5 + Math.sin(t * 0.6) * 2;
        ctx.beginPath();
        ctx.arc(cx, y - 5, outerR2, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(16, 185, 129, ${0.08 * intensity})`;
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    drawThinkingDots(ctx, cx, y, intensity) {
        const t = performance.now() * 0.005;
        for (let i = 0; i < 3; i++) {
            const dotY = y - 5 + Math.sin(t + i * 1.3) * 4;
            const dotAlpha = 0.4 + Math.sin(t + i * 1.3) * 0.3;
            ctx.beginPath();
            ctx.arc(cx - 12 + i * 12, dotY, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(139, 92, 246, ${dotAlpha * intensity})`;
            ctx.fill();
        }
    }

    destroy() {
        if (this.animationId) cancelAnimationFrame(this.animationId);
    }
}

// Global avatar initialization
let lunaAvatar = null;

function initAnimatedAvatar() {
    const container = document.getElementById('avatarFallback');
    if (!container) return;

    container.innerHTML = `
        <canvas id="avatarCanvas" style="width:100%; height:100%; display:block;"></canvas>
    `;
    container.style.display = 'flex';
    container.style.background = 'transparent';

    lunaAvatar = new AnimatedAvatar('avatarCanvas');
    lunaAvatar.setState(AvatarState.GREETING);

    // Auto-reset greeting to idle after 2.5s
    setTimeout(() => {
        if (lunaAvatar && lunaAvatar.state === AvatarState.GREETING) {
            lunaAvatar.setState(AvatarState.IDLE);
        }
    }, 2500);

    console.log('[Avatar] ✅ Animated human avatar initialized');
}

// Convenience functions for practice.js
function avatarListening() { if (lunaAvatar) lunaAvatar.setState(AvatarState.LISTENING); }
function avatarThinking() { if (lunaAvatar) lunaAvatar.setState(AvatarState.THINKING); }
function avatarSpeaking() { if (lunaAvatar) lunaAvatar.setState(AvatarState.SPEAKING); }
function avatarHappy() { if (lunaAvatar) lunaAvatar.setState(AvatarState.HAPPY); }
function avatarIdle() { if (lunaAvatar) lunaAvatar.setState(AvatarState.IDLE); }

// Bridge functions called by practice.js speak()
function startAvatarSpeaking() { if (lunaAvatar) lunaAvatar.setState(AvatarState.SPEAKING); }
function stopAvatarSpeaking() { if (lunaAvatar) lunaAvatar.setState(AvatarState.LISTENING); }

console.log('[Avatar] Human avatar module loaded');

// Auto-initialize when DOM is ready — animated avatar is the primary avatar
document.addEventListener('DOMContentLoaded', () => {
    // Init immediately — animated avatar is the default
    setTimeout(() => {
        initAnimatedAvatar();
    }, 300);
});
