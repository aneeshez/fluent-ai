(async () => {
    const area = document.getElementById('writingArea');
    const counter = document.getElementById('wordCounter');
    const submit = document.getElementById('submitBtn');
    const output = document.getElementById('resultsContent');
    const promptText = document.getElementById('promptText');
    let user;
    try {
        ({ user } = await FluentAPI.request('/api/auth/me/'));
        localStorage.setItem('fluentai_user', JSON.stringify(user));
    } catch (_) {
        localStorage.removeItem('fluentai_user');
        window.location.href = 'login.html';
        return;
    }
    const avatar = document.getElementById('userAvatar');
    if (avatar) avatar.textContent = user.name.charAt(0).toUpperCase();
    const draftKey = `fluentai_writing_draft:${user.id}`;
    area.value = localStorage.getItem(draftKey) || '';

    const prompts = [
        'Describe a memorable trip you have taken. Where did you go? What did you do? What made it special?',
        'Write about a person who has influenced your life significantly. How have they impacted you?',
        'Do you think technology has made our lives better or worse? Explain your view with examples.',
        'Describe your ideal job. What would you do? Where would you work? Why does this appeal to you?',
        'Write about a challenge you overcame. What was difficult? How did you succeed?',
        'If you could change one thing about your city or town, what would it be and why?',
        'Describe a book, movie, or show that changed your perspective on something.',
        'Write about the importance of learning English in today’s world.'
    ];

    function updateCount() {
        const count = area.value.trim() ? area.value.trim().split(/\s+/).length : 0;
        counter.textContent = `${count} words`;
        counter.className = `word-counter${count >= 150 && count <= 250 ? ' success' : count > 250 ? ' warning' : ''}`;
    }
    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }
    function renderResults(result) {
        output.replaceChildren();
        const scores = [
            ['Grammar', result.grammar_score], ['Vocabulary', result.vocabulary_score],
            ['Coherence', result.coherence_score], ['Task', result.task_score]
        ];
        const overall = Math.round(scores.reduce((total, item) => total + item[1], 0) / scores.length);
        const scoreCard = element('section', 'glass-card feedback-card');
        scoreCard.append(element('h3', 'feedback-title', `Overall score: ${overall}/100`));
        scores.forEach(([label, score]) => scoreCard.append(element('p', 'feedback-text', `${label}: ${score}/100`)));
        output.append(scoreCard);

        const listCard = (title, items) => {
            const card = element('section', 'glass-card feedback-card');
            card.append(element('h3', 'feedback-title', title));
            const list = element('ul', 'feedback-text');
            (Array.isArray(items) ? items : []).forEach(item => {
                if (typeof item === 'string') list.append(element('li', '', item));
                else if (item && typeof item === 'object') list.append(element('li', '', `${item.original || ''} → ${item.corrected || ''}${item.rule ? ` (${item.rule})` : ''}`));
            });
            if (!list.childElementCount) list.append(element('li', '', 'Keep practicing and building on this work.'));
            card.append(list);
            output.append(card);
        };
        listCard('Strengths', result.strengths);
        listCard('Areas to improve', result.improvements);
        if (result.errors?.length) listCard('Corrections', result.errors);
        if (result.corrected_text && result.corrected_text !== area.value.trim()) {
            const corrected = element('section', 'glass-card feedback-card');
            corrected.append(element('h3', 'feedback-title', 'Corrected version'));
            corrected.append(element('p', 'feedback-text', result.corrected_text));
            output.append(corrected);
        }
        const reward = element('section', 'glass-card feedback-card');
        reward.append(element('h3', 'feedback-title', `+${result.xp_earned || 40} XP earned`));
        output.append(reward);
    }

    area.addEventListener('input', updateCount);
    updateCount();
    document.getElementById('saveBtn').addEventListener('click', () => {
        localStorage.setItem(draftKey, area.value);
        const save = document.getElementById('saveBtn');
        save.setAttribute('aria-label', 'Draft saved');
        window.setTimeout(() => save.removeAttribute('aria-label'), 1600);
    });
    document.getElementById('newPromptBtn').addEventListener('click', () => {
        const choices = prompts.filter(item => item !== promptText.textContent.trim());
        promptText.textContent = choices[Math.floor(Math.random() * choices.length)];
    });
    submit.addEventListener('click', async () => {
        const text = area.value.trim();
        if (text.split(/\s+/).filter(Boolean).length < 20) {
            output.replaceChildren(element('p', 'text-muted', 'Please write at least 20 words before submitting.'));
            return;
        }
        submit.disabled = true;
        submit.textContent = 'Analyzing…';
        try {
            const result = await FluentAPI.request('/api/analyze-writing/', {
                method: 'POST',
                body: JSON.stringify({ text, prompt: promptText.textContent.trim() })
            });
            renderResults(result);
            localStorage.removeItem(draftKey);
            area.value = '';
            updateCount();
        } catch (error) {
            output.replaceChildren(element('p', 'text-muted', error.message));
        } finally {
            submit.disabled = false;
            submit.textContent = 'Submit for Review';
        }
    });
    document.getElementById('navUser')?.addEventListener('click', () => { window.location.href = 'profile.html'; });
})();
