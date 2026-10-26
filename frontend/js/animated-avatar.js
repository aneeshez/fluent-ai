// Canvas-based animated avatar controller with emotional expressions
// Pure animated character — no photo dependency

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
        this.blinkTimer = 0;
        this.isBlinking = false;
        this.blinkProgress = 0;
        this.mouthOpenAmount = 0;
        this.headTilt = 0;
        this.eyePupilX = 0;
        this.eyePupilY = 0;
        this.pupilTargetX = 0;
        this.pupilTargetY = 0;

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

        // Blinking
        this.blinkTimer += dt;
        if (!this.isBlinking && this.blinkTimer > 2500 + Math.random() * 2000) {
            this.isBlinking = true;
            this.blinkTimer = 0;
            this.blinkProgress = 0;
        }
        if (this.isBlinking) {
            this.blinkProgress += dt * 0.008;
            if (this.blinkProgress >= 1) {
                this.isBlinking = false;
                this.blinkProgress = 0;
            }
        }

        // Mouth animation for speaking
        if (this.state === AvatarState.SPEAKING) {
            this.mouthOpenAmount = 0.3 + Math.abs(Math.sin(performance.now() * 0.012)) * 0.7;
        } else if (this.state === AvatarState.HAPPY || this.state === AvatarState.GREETING) {
            this.mouthOpenAmount = lerp(this.mouthOpenAmount, 0.15, speed);
        } else {
            this.mouthOpenAmount = lerp(this.mouthOpenAmount, 0, speed * 2);
        }

        // Head tilt
        if (this.state === AvatarState.LISTENING) {
            this.headTilt = lerp(this.headTilt, Math.sin(performance.now() * 0.001) * 0.04, speed);
        } else if (this.state === AvatarState.THINKING) {
            this.headTilt = lerp(this.headTilt, 0.06, speed);
        } else {
            this.headTilt = lerp(this.headTilt, 0, speed);
        }

        // Eye pupil movement
        if (this.state === AvatarState.THINKING) {
            this.pupilTargetX = Math.sin(performance.now() * 0.002) * 3;
            this.pupilTargetY = -2;
        } else if (this.state === AvatarState.LISTENING) {
            this.pupilTargetX = 0;
            this.pupilTargetY = 1;
        } else {
            this.pupilTargetX = Math.sin(performance.now() * 0.0005) * 1;
            this.pupilTargetY = 0;
        }
        this.eyePupilX = lerp(this.eyePupilX, this.pupilTargetX, speed * 2);
        this.eyePupilY = lerp(this.eyePupilY, this.pupilTargetY, speed * 2);

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
        bgGrad.addColorStop(0, '#292d35');
        bgGrad.addColorStop(0.6, '#1d2027');
        bgGrad.addColorStop(1, '#15171c');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, this.w, this.h);

        // --- AMBIENT PARTICLES ---
        for (const p of this.particles) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            const pAlpha = p.alpha * (1 + this.speakAnim * 0.5);
            ctx.fillStyle = `rgba(166, 187, 156, ${pAlpha * 0.6})`;
            ctx.fill();
        }

        // --- BACKGROUND GLOW (state-reactive) ---
        const glowAlpha = 0.08 + this.speakAnim * 0.12 + this.listenAnim * 0.05 + this.happyAnim * 0.08;
        const bgGlow = ctx.createRadialGradient(cx, cy, 20, cx, cy, this.w * 0.5);
        bgGlow.addColorStop(0, `rgba(166, 187, 156, ${glowAlpha * 0.8})`);
        bgGlow.addColorStop(0.5, `rgba(117, 129, 150, ${glowAlpha * 0.45})`);
        bgGlow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bgGlow;
        ctx.fillRect(0, 0, this.w, this.h);

        // --- OUTER RING GLOW ---
        const ringR = Math.min(cx, cy) * 0.48;
        const ringGlow = ctx.createRadialGradient(cx, cy, ringR - 5, cx, cy, ringR + 30);
        const rgAlpha = 0.1 + this.ringPulse * 0.3;
        ringGlow.addColorStop(0, `rgba(166, 187, 156, ${rgAlpha * 0.8})`);
        ringGlow.addColorStop(0.6, `rgba(137, 151, 174, ${rgAlpha * 0.3})`);
        ringGlow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = ringGlow;
        ctx.fillRect(0, 0, this.w, this.h);

        // --- ANIMATED RING (conic gradient, rotates) ---
        ctx.save();
        ctx.translate(cx, cy);

        const ringWidth = 2.5 + this.ringPulse * 2;
        const segments = 60;
        for (let i = 0; i < segments; i++) {
            const angle = (i / segments) * Math.PI * 2 + this.ringRotation;
            const nextAngle = ((i + 1) / segments) * Math.PI * 2 + this.ringRotation;
            const t = i / segments;

            const r = Math.floor(150 + Math.sin(t * Math.PI * 2) * 14);
            const g = Math.floor(174 + Math.sin(t * Math.PI * 2 + 2) * 12);
            const b = Math.floor(148 + Math.sin(t * Math.PI * 2 + 1) * 14);
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
        ctx.strokeStyle = `rgba(166, 187, 156, ${0.12 + this.ringPulse * 0.12})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // --- CLIP to circle for avatar ---
        ctx.beginPath();
        ctx.arc(0, 0, ringR - 4, 0, Math.PI * 2);
        ctx.clip();

        // Background inside circle
        const innerBg = ctx.createRadialGradient(0, -10, 10, 0, 0, ringR);
        innerBg.addColorStop(0, '#3a3f49');
        innerBg.addColorStop(0.5, '#2d323b');
        innerBg.addColorStop(1, '#242831');
        ctx.fillStyle = innerBg;
        ctx.fillRect(-ringR, -ringR, ringR * 2, ringR * 2);

        // --- DRAW CHARACTER ---
        ctx.save();
        ctx.rotate(this.headTilt);

        // Breathing offset
        const breathOffset = this.breathe * 2;

        // Scale for the character
        const scale = ringR / 85;

        // === BODY / SHOULDERS ===
        ctx.save();
        ctx.translate(0, 28 * scale + breathOffset * 0.3);

        // Shoulders
        ctx.beginPath();
        ctx.ellipse(0, 30 * scale, 65 * scale, 45 * scale, 0, Math.PI, 0, true);
        const bodyGrad = ctx.createLinearGradient(0, -10 * scale, 0, 60 * scale);
        bodyGrad.addColorStop(0, '#b4c5a7');
        bodyGrad.addColorStop(1, '#84977a');
        ctx.fillStyle = bodyGrad;
        ctx.fill();

        // Collar / neckline detail
        ctx.beginPath();
        ctx.moveTo(-15 * scale, -5 * scale);
        ctx.quadraticCurveTo(0, 10 * scale, 15 * scale, -5 * scale);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1.5 * scale;
        ctx.stroke();

        ctx.restore();

        // === NECK ===
        ctx.fillStyle = '#f0c5a8';
        ctx.fillRect(-10 * scale, 15 * scale + breathOffset * 0.3, 20 * scale, 20 * scale);

        // === HEAD ===
        const headY = -15 * scale + breathOffset;

        // Head shape (oval)
        ctx.beginPath();
        ctx.ellipse(0, headY, 38 * scale, 45 * scale, 0, 0, Math.PI * 2);
        const skinGrad = ctx.createLinearGradient(0, headY - 45 * scale, 0, headY + 45 * scale);
        skinGrad.addColorStop(0, '#fce7d6');
        skinGrad.addColorStop(1, '#f0c5a8');
        ctx.fillStyle = skinGrad;
        ctx.fill();

        // Cheek blush (rosy when happy/speaking)
        const blushAlpha = 0.12 + this.happyAnim * 0.15 + this.speakAnim * 0.08;
        ctx.beginPath();
        ctx.ellipse(-24 * scale, headY + 12 * scale, 10 * scale, 7 * scale, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 130, 130, ${blushAlpha})`;
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(24 * scale, headY + 12 * scale, 10 * scale, 7 * scale, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 130, 130, ${blushAlpha})`;
        ctx.fill();

        // === HAIR ===
        // Main hair top
        ctx.beginPath();
        ctx.ellipse(0, headY - 28 * scale, 42 * scale, 30 * scale, 0, 0, Math.PI * 2);
        const hairGrad = ctx.createLinearGradient(0, headY - 60 * scale, 0, headY - 10 * scale);
        hairGrad.addColorStop(0, '#1a0a2e');
        hairGrad.addColorStop(1, '#2d1b4e');
        ctx.fillStyle = hairGrad;
        ctx.fill();

        // Hair sides
        ctx.beginPath();
        ctx.ellipse(-34 * scale, headY - 5 * scale, 14 * scale, 40 * scale, -0.15, 0, Math.PI * 2);
        ctx.fillStyle = '#2d1b4e';
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(34 * scale, headY - 5 * scale, 14 * scale, 40 * scale, 0.15, 0, Math.PI * 2);
        ctx.fillStyle = '#2d1b4e';
        ctx.fill();

        // Hair bangs
        ctx.beginPath();
        ctx.moveTo(-30 * scale, headY - 30 * scale);
        ctx.quadraticCurveTo(-20 * scale, headY - 15 * scale, -8 * scale, headY - 22 * scale);
        ctx.quadraticCurveTo(5 * scale, headY - 12 * scale, 15 * scale, headY - 25 * scale);
        ctx.quadraticCurveTo(25 * scale, headY - 15 * scale, 30 * scale, headY - 28 * scale);
        ctx.lineTo(40 * scale, headY - 42 * scale);
        ctx.quadraticCurveTo(0, headY - 58 * scale, -38 * scale, headY - 42 * scale);
        ctx.closePath();
        ctx.fillStyle = '#2d1b4e';
        ctx.fill();

        // === EYEBROWS ===
        const browLift = this.happyAnim * 3 * scale + this.listenAnim * 2 * scale;

        // Left eyebrow
        ctx.beginPath();
        ctx.moveTo(-22 * scale, headY - 12 * scale - browLift);
        ctx.quadraticCurveTo(-14 * scale, headY - 16 * scale - browLift, -6 * scale, headY - 12 * scale - browLift);
        ctx.strokeStyle = '#2d1b4e';
        ctx.lineWidth = 2.5 * scale;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Right eyebrow
        ctx.beginPath();
        ctx.moveTo(6 * scale, headY - 12 * scale - browLift);
        ctx.quadraticCurveTo(14 * scale, headY - 16 * scale - browLift, 22 * scale, headY - 12 * scale - browLift);
        ctx.stroke();

        // === EYES ===
        const eyeY = headY - 2 * scale;
        const blinkSquash = this.isBlinking ? Math.sin(this.blinkProgress * Math.PI) : 0;
        const eyeScaleY = 1 - blinkSquash * 0.9;

        // Left eye white
        ctx.save();
        ctx.translate(-14 * scale, eyeY);
        ctx.scale(1, eyeScaleY);
        ctx.beginPath();
        ctx.ellipse(0, 0, 9 * scale, 7 * scale, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Left iris
        ctx.beginPath();
        ctx.ellipse(this.eyePupilX * scale * 0.4, this.eyePupilY * scale * 0.4, 5 * scale, 5 * scale, 0, 0, Math.PI * 2);
        const irisGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 5 * scale);
        irisGrad.addColorStop(0, '#9bb69c');
        irisGrad.addColorStop(0.7, '#567b5b');
        irisGrad.addColorStop(1, '#354f3a');
        ctx.fillStyle = irisGrad;
        ctx.fill();

        // Left pupil
        ctx.beginPath();
        ctx.ellipse(this.eyePupilX * scale * 0.4, this.eyePupilY * scale * 0.4, 2.5 * scale, 2.5 * scale, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#0f0a1e';
        ctx.fill();

        // Left eye shine
        ctx.beginPath();
        ctx.ellipse(-1.5 * scale + this.eyePupilX * scale * 0.2, -2 * scale, 1.8 * scale, 1.5 * scale, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fill();
        ctx.restore();

        // Right eye white
        ctx.save();
        ctx.translate(14 * scale, eyeY);
        ctx.scale(1, eyeScaleY);
        ctx.beginPath();
        ctx.ellipse(0, 0, 9 * scale, 7 * scale, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Right iris
        ctx.beginPath();
        ctx.ellipse(this.eyePupilX * scale * 0.4, this.eyePupilY * scale * 0.4, 5 * scale, 5 * scale, 0, 0, Math.PI * 2);
        ctx.fillStyle = irisGrad;
        ctx.fill();

        // Right pupil
        ctx.beginPath();
        ctx.ellipse(this.eyePupilX * scale * 0.4, this.eyePupilY * scale * 0.4, 2.5 * scale, 2.5 * scale, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#0f0a1e';
        ctx.fill();

        // Right eye shine
        ctx.beginPath();
        ctx.ellipse(-1.5 * scale + this.eyePupilX * scale * 0.2, -2 * scale, 1.8 * scale, 1.5 * scale, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fill();
        ctx.restore();

        // === NOSE ===
        ctx.beginPath();
        ctx.moveTo(0, headY + 4 * scale);
        ctx.lineTo(-3 * scale, headY + 12 * scale);
        ctx.quadraticCurveTo(0, headY + 14 * scale, 3 * scale, headY + 12 * scale);
        ctx.strokeStyle = 'rgba(180, 130, 100, 0.4)';
        ctx.lineWidth = 1.5 * scale;
        ctx.lineCap = 'round';
        ctx.stroke();

        // === MOUTH ===
        const mouthY = headY + 22 * scale;
        const mouthOpen = this.mouthOpenAmount;
        const smileAmount = this.happyAnim * 0.6 + this.listenAnim * 0.3;

        if (mouthOpen > 0.1) {
            // Open mouth (speaking)
            const mouthW = (10 + mouthOpen * 6) * scale;
            const mouthH = (3 + mouthOpen * 8) * scale;

            ctx.beginPath();
            ctx.ellipse(0, mouthY, mouthW, mouthH, 0, 0, Math.PI * 2);
            ctx.fillStyle = '#8b3a3a';
            ctx.fill();

            // Tongue hint
            if (mouthOpen > 0.4) {
                ctx.beginPath();
                ctx.ellipse(0, mouthY + mouthH * 0.3, mouthW * 0.5, mouthH * 0.4, 0, 0, Math.PI);
                ctx.fillStyle = '#c96b6b';
                ctx.fill();
            }

            // Teeth hint
            ctx.beginPath();
            ctx.rect(-mouthW * 0.6, mouthY - mouthH * 0.9, mouthW * 1.2, mouthH * 0.35);
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.fill();
        } else {
            // Closed mouth — smile
            ctx.beginPath();
            ctx.moveTo(-10 * scale, mouthY - smileAmount * 3 * scale);
            ctx.quadraticCurveTo(0, mouthY + (3 + smileAmount * 6) * scale, 10 * scale, mouthY - smileAmount * 3 * scale);
            ctx.strokeStyle = '#c97b6b';
            ctx.lineWidth = 2.2 * scale;
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        ctx.restore(); // end head tilt

        // --- STATE OVERLAY ---
        // Speaking glow
        if (this.speakAnim > 0.05) {
            const speakGlow = ctx.createRadialGradient(0, 0, ringR * 0.5, 0, 0, ringR);
            speakGlow.addColorStop(0, 'rgba(0,0,0,0)');
            speakGlow.addColorStop(0.85, 'rgba(0,0,0,0)');
            speakGlow.addColorStop(1, `rgba(166, 187, 156, ${this.speakAnim * 0.18})`);
            ctx.fillStyle = speakGlow;
            ctx.fillRect(-ringR, -ringR, ringR * 2, ringR * 2);
        }

        // Listening glow
        if (this.listenAnim > 0.05) {
            const listenGlow = ctx.createRadialGradient(0, 0, ringR * 0.6, 0, 0, ringR);
            listenGlow.addColorStop(0, 'rgba(0,0,0,0)');
            listenGlow.addColorStop(0.9, 'rgba(0,0,0,0)');
            listenGlow.addColorStop(1, `rgba(16, 185, 129, ${this.listenAnim * 0.12})`);
            ctx.fillStyle = listenGlow;
            ctx.fillRect(-ringR, -ringR, ringR * 2, ringR * 2);
        }

        // Happy glow
        if (this.happyAnim > 0.05) {
            const happyGlow = ctx.createRadialGradient(0, 0, ringR * 0.5, 0, 0, ringR);
            happyGlow.addColorStop(0, 'rgba(0,0,0,0)');
            happyGlow.addColorStop(0.85, 'rgba(0,0,0,0)');
            happyGlow.addColorStop(1, `rgba(216, 121, 89, ${this.happyAnim * 0.12})`);
            ctx.fillStyle = happyGlow;
            ctx.fillRect(-ringR, -ringR, ringR * 2, ringR * 2);
        }

        ctx.restore(); // end translate

        // --- NAME & STATUS (below the ring) ---
        const textY = cy + ringR + 18;

        ctx.font = '600 18px Inter, sans-serif';
        ctx.fillStyle = '#eee9da';
        ctx.textAlign = 'center';
        ctx.fillText('Luna', cx, textY);

        // Status text changes based on state
        ctx.font = '500 11px Inter, sans-serif';
        let statusText = 'AI COMMUNICATION TUTOR';
        let statusColor = 'rgba(223,219,199,0.72)';

        if (this.state === AvatarState.SPEAKING) {
            statusText = '● SPEAKING...';
            statusColor = 'rgba(212, 193, 141, 0.95)';
        } else if (this.state === AvatarState.LISTENING) {
            statusText = '● LISTENING';
            statusColor = 'rgba(157, 178, 154, 0.95)';
        } else if (this.state === AvatarState.THINKING) {
            statusText = '● THINKING...';
            statusColor = 'rgba(171, 194, 182, 0.95)';
        } else if (this.state === AvatarState.HAPPY || this.state === AvatarState.GREETING) {
            statusText = '● HELLO!';
            statusColor = 'rgba(224, 193, 138, 0.95)';
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
            barGrad.addColorStop(0, `rgba(166, 187, 156, ${0.9 * intensity})`);
            barGrad.addColorStop(1, `rgba(157, 178, 154, ${0.65 * intensity})`);
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
            ctx.fillStyle = `rgba(78, 135, 148, ${dotAlpha * intensity})`;
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

    console.log('[Avatar] Animated avatar initialized');
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

console.log('[Avatar] Animated avatar module loaded');

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        initAnimatedAvatar();
    }, 300);
});
