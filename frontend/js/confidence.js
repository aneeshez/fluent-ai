// Speech confidence analyzer based on pace, hesitations, and vocabulary

class ConfidenceAnalyzer {
    constructor() {
        this.reset();
    }

    reset() {
        // Raw data per utterance
        this.utterances = [];         // { text, wordCount, timestamp, responseTimeMs }
        this.fillerCount = 0;
        this.totalWords = 0;
        this.uniqueWords = new Set();
        this.sessionStartTime = null;
        this.lastAIFinishTime = null; // Track when AI stops speaking for response-time calc
        this.lastUserSpeakTime = null;

        // Rolling confidence score
        this.score = 50;              // Start neutral
        this.level = 'steady';        // low | growing | steady | high
        this.history = [];            // score snapshots for trend

        // Signal weights
        this.weights = {
            fillerRatio: 0.25,        // 25% weight
            pace: 0.20,               // 20% weight
            responseLength: 0.20,     // 20% weight
            hesitation: 0.15,         // 15% weight
            vocabulary: 0.20          // 20% weight
        };
    }

    // Common speech filler phrases
    static FILLERS = [
        'um', 'uh', 'uhh', 'umm', 'hmm', 'hm',
        'er', 'err', 'ah', 'ahh',
        'like', 'you know', 'i mean', 'sort of', 'kind of',
        'basically', 'actually', 'literally', 'honestly',
        'so yeah', 'yeah so', 'well like', 'i guess',
        'right', 'okay so'
    ];

    _countFillers(text) {
        const lower = text.toLowerCase();
        let count = 0;
        for (const filler of ConfidenceAnalyzer.FILLERS) {
            // Use regex to match whole words/phrases
            const regex = new RegExp('\\b' + filler.replace(/\s+/g, '\\s+') + '\\b', 'gi');
            const matches = lower.match(regex);
            if (matches) count += matches.length;
        }
        return count;
    }

    // Utterance analysis
    analyzeSpeech(transcript, metadata = {}) {
        if (!transcript || transcript.trim().length < 2) return this.getConfidenceData();

        const text = transcript.trim();
        const words = text.split(/\s+/).filter(w => w.length > 0);
        const wordCount = words.length;
        const now = Date.now();

        if (!this.sessionStartTime) this.sessionStartTime = now;

        // Count fillers in this utterance
        const fillers = this._countFillers(text);
        this.fillerCount += fillers;
        this.totalWords += wordCount;

        // Track unique words (for vocabulary variety)
        words.forEach(w => this.uniqueWords.add(w.toLowerCase().replace(/[^a-z']/g, '')));

        // Calculate response time (ms since AI finished speaking)
        let responseTimeMs = null;
        if (this.lastAIFinishTime) {
            responseTimeMs = now - this.lastAIFinishTime;
        }

        // Store utterance
        this.utterances.push({
            text,
            wordCount,
            fillers,
            timestamp: now,
            responseTimeMs
        });

        this.lastUserSpeakTime = now;

        // Recalculate confidence
        this._recalculate();

        return this.getConfidenceData();
    }

    // Mark when AI finishes speaking (for hesitation tracking)
    markAIFinished() {
        this.lastAIFinishTime = Date.now();
    }

    // Weighted score aggregation
    _recalculate() {
        if (this.utterances.length === 0) return;

        const signals = {};

        // --- 1. Filler Ratio (0-100) ---
        // 0 fillers = 100, >15% fillers = 0
        const fillerRatio = this.totalWords > 0 ? this.fillerCount / this.totalWords : 0;
        signals.fillerRatio = Math.max(0, Math.min(100, (1 - fillerRatio / 0.15) * 100));

        // --- 2. Speech Pace (0-100) ---
        // Ideal: 100-160 WPM. <60 or >220 = low confidence
        const sessionDurationMin = (Date.now() - this.sessionStartTime) / 60000;
        const wpm = sessionDurationMin > 0.05 ? this.totalWords / sessionDurationMin : 100;
        if (wpm >= 100 && wpm <= 160) {
            signals.pace = 100;
        } else if (wpm < 100) {
            signals.pace = Math.max(0, (wpm / 100) * 100);
        } else {
            signals.pace = Math.max(0, 100 - ((wpm - 160) / 60) * 100);
        }

        // --- 3. Response Length (0-100) ---
        // Average words per utterance. <3 = low, 8+ = high
        const recentUtterances = this.utterances.slice(-5); // Last 5
        const avgWords = recentUtterances.reduce((s, u) => s + u.wordCount, 0) / recentUtterances.length;
        if (avgWords >= 8) {
            signals.responseLength = 100;
        } else if (avgWords >= 5) {
            signals.responseLength = 60 + ((avgWords - 5) / 3) * 40;
        } else {
            signals.responseLength = Math.max(10, (avgWords / 5) * 60);
        }

        // --- 4. Hesitation / Response Time (0-100) ---
        // <2s = confident, 2-5s = growing, >5s = hesitant
        const responseTimes = this.utterances
            .filter(u => u.responseTimeMs !== null)
            .map(u => u.responseTimeMs);

        if (responseTimes.length > 0) {
            const avgResponseMs = responseTimes.slice(-3).reduce((s, t) => s + t, 0) / Math.min(3, responseTimes.length);
            if (avgResponseMs < 2000) {
                signals.hesitation = 100;
            } else if (avgResponseMs < 5000) {
                signals.hesitation = 100 - ((avgResponseMs - 2000) / 3000) * 60;
            } else {
                signals.hesitation = Math.max(10, 40 - ((avgResponseMs - 5000) / 5000) * 30);
            }
        } else {
            signals.hesitation = 50; // Neutral if no data
        }

        // --- 5. Vocabulary Variety (0-100) ---
        // unique words / total words ratio. >0.7 = great, <0.3 = repetitive
        const vocabRatio = this.totalWords > 0 ? this.uniqueWords.size / this.totalWords : 0.5;
        if (vocabRatio >= 0.6) {
            signals.vocabulary = 100;
        } else if (vocabRatio >= 0.35) {
            signals.vocabulary = 40 + ((vocabRatio - 0.35) / 0.25) * 60;
        } else {
            signals.vocabulary = Math.max(10, (vocabRatio / 0.35) * 40);
        }

        // --- Weighted Score ---
        this.score = Math.round(
            signals.fillerRatio * this.weights.fillerRatio +
            signals.pace * this.weights.pace +
            signals.responseLength * this.weights.responseLength +
            signals.hesitation * this.weights.hesitation +
            signals.vocabulary * this.weights.vocabulary
        );

        // Clamp
        this.score = Math.max(0, Math.min(100, this.score));

        // Smooth: blend 70% new, 30% previous to avoid jitter
        if (this.history.length > 0) {
            const prevScore = this.history[this.history.length - 1];
            this.score = Math.round(this.score * 0.7 + prevScore * 0.3);
        }

        this.history.push(this.score);

        // Determine level
        if (this.score <= 30) this.level = 'low';
        else if (this.score <= 55) this.level = 'growing';
        else if (this.score <= 80) this.level = 'steady';
        else this.level = 'high';

        this._signals = signals; // Store for debug/tooltip
    }

    // Public metrics payload
    getConfidenceData() {
        return {
            score: this.score,
            level: this.level,
            label: this._getLevelLabel(),
            color: this._getLevelColor(),
            emoji: this._getLevelEmoji(),
            signals: this._signals || {},
            totalUtterances: this.utterances.length,
            totalFillers: this.fillerCount,
            totalWords: this.totalWords,
            uniqueWordCount: this.uniqueWords.size,
            history: this.history
        };
    }

    _getLevelLabel() {
        switch (this.level) {
            case 'low': return 'Building Up';
            case 'growing': return 'Growing';
            case 'steady': return 'Steady';
            case 'high': return 'Confident!';
            default: return 'Steady';
        }
    }

    _getLevelColor() {
        switch (this.level) {
            case 'low': return '#f87171';      // red
            case 'growing': return '#fbbf24';   // amber
            case 'steady': return '#34d399';    // green
            case 'high': return '#60a5fa';      // blue
            default: return '#34d399';
        }
    }

    _getLevelEmoji() {
        return '●';
    }

    // Get text description for tooltip
    getBreakdown() {
        const s = this._signals || {};
        return [
            `Filler Words: ${Math.round(s.fillerRatio || 50)}%`,
            `Speech Pace: ${Math.round(s.pace || 50)}%`,
            `Response Length: ${Math.round(s.responseLength || 50)}%`,
            `Hesitation: ${Math.round(s.hesitation || 50)}%`,
            `Vocabulary: ${Math.round(s.vocabulary || 50)}%`,
        ].join('\n');
    }
}

// Export for use in practice.js
window.ConfidenceAnalyzer = ConfidenceAnalyzer;
