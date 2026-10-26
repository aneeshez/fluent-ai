(async () => {
    const sessionsList = document.getElementById('sessionsList');
    const sessionCount = document.getElementById('sessionCount');
    const activityList = document.getElementById('activityList');
    const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    const formatDate = value => {
        const date = new Date(value);
        const delta = Date.now() - date.getTime();
        if (delta < 60000) return 'Just now';
        if (delta < 3600000) return `${Math.floor(delta / 60000)}m ago`;
        if (delta < 86400000) return `${Math.floor(delta / 3600000)}h ago`;
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };
    const formatDuration = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    const empty = (container, text) => { const el = document.createElement('p'); el.className = 'text-muted'; el.textContent = text; container.replaceChildren(el); };

    let data;
    try {
        data = await FluentAPI.request('/api/dashboard/');
    } catch (error) {
        if (error.status === 401) {
            localStorage.removeItem('fluentai_user');
            window.location.href = 'login.html';
            return;
        }
        empty(sessionsList, 'Your progress could not load. Refresh the page to try again.');
        return;
    }

    const { user, stats, sessions, writings } = data;
    const weekly = data.weekly || stats;
    localStorage.setItem('fluentai_user', JSON.stringify(user));
    setText('welcomeName', user.name.split(' ')[0] || 'Learner');
    setText('userName', user.name);
    setText('userEmail', user.email);
    setText('userAvatar', user.name.charAt(0).toUpperCase());
    setText('statWords', stats.wordsSpoken.toLocaleString());
    setText('statSessions', stats.sessionsCompleted.toLocaleString());
    setText('statMinutes', stats.totalMinutes.toLocaleString());
    setText('statXP', stats.xp.toLocaleString());
    setText('streakCount', stats.streak);
    const level = document.getElementById('levelBadge');
    if (level) level.lastChild.textContent = ` ${stats.level}`;

    sessionCount.textContent = `${sessions.length} session${sessions.length === 1 ? '' : 's'}`;
    if (!sessions.length) empty(sessionsList, 'No session recordings yet. Complete a speaking session to see it here.');
    else {
        sessionsList.replaceChildren();
        sessions.forEach(session => {
            const card = document.createElement('details');
            card.className = 'recording-item';
            const summary = document.createElement('summary');
            summary.style.cssText = 'cursor:pointer;padding:12px;display:flex;justify-content:space-between;gap:12px;';
            const title = document.createElement('span');
            title.textContent = `${session.challenge} · ${formatDate(session.started_at)}`;
            const meta = document.createElement('span');
            meta.textContent = `${formatDuration(session.duration_seconds)} · ${session.xp_earned} XP`;
            summary.append(title, meta);
            card.append(summary);
            const transcript = document.createElement('div');
            transcript.style.cssText = 'padding:0 12px 12px;display:flex;flex-direction:column;gap:8px;';
            session.transcripts.forEach(message => {
                const line = document.createElement('p');
                line.style.cssText = 'margin:0;color:var(--text-secondary);font-size:13px;line-height:1.5;';
                line.textContent = `${message.speaker === 'user' ? 'You' : 'Luna'}: ${message.text}`;
                transcript.append(line);
            });
            card.append(transcript);
            sessionsList.append(card);
        });
    }

    const activities = [
        ...sessions.map(item => ({ title: item.challenge === 'Free Talk' ? 'Speaking Practice' : item.challenge, date: item.started_at })),
        ...writings.map(item => ({ title: 'Writing assessment', date: item.created_at }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
    if (!activities.length) empty(activityList, 'Your practice and writing activity will appear here.');
    else {
        activityList.replaceChildren();
        activities.forEach(activity => {
            const row = document.createElement('div');
            row.className = 'activity-item';
            const title = document.createElement('div');
            title.className = 'activity-title';
            title.textContent = activity.title;
            const time = document.createElement('div');
            time.className = 'activity-time';
            time.textContent = formatDate(activity.date);
            const content = document.createElement('div');
            content.className = 'activity-content';
            content.append(title, time);
            row.append(content);
            activityList.append(row);
        });
    }

    const goalValues = [weekly.sessionsCompleted, weekly.wordsSpoken, weekly.writingsCompleted, weekly.challengesCompleted];
    const goals = [5, 500, 1, 1];
    let completedGoals = 0;
    document.querySelectorAll('.goal-item').forEach((goal, index) => {
        const value = goal.querySelector('.goal-value');
        const fill = goal.querySelector('.progress-bar-fill');
        if (!value || !fill || goals[index] === undefined) return;
        value.textContent = `${Math.min(goalValues[index], goals[index])}/${goals[index]} ${index === 0 ? 'sessions' : index === 1 ? 'words' : index === 2 ? 'tests' : 'challenges'}`;
        fill.style.width = `${Math.min(100, goalValues[index] / goals[index] * 100)}%`;
        if (goalValues[index] >= goals[index]) completedGoals++;
    });
    setText('weeklyGoalBadge', `${completedGoals}/4 Complete`);

    document.getElementById('navUser')?.addEventListener('click', async () => {
        try { await FluentAPI.request('/api/auth/logout/', { method: 'POST' }); } catch (_) {}
        localStorage.removeItem('fluentai_user');
        window.location.href = 'login.html';
    });
    const navbar = document.getElementById('navbar');
    window.addEventListener('scroll', () => navbar?.classList.toggle('scrolled', window.scrollY > 50));
})();
