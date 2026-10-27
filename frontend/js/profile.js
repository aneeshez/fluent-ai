window.openModal = id => document.getElementById(id)?.classList.add('show');
window.closeModal = id => document.getElementById(id)?.classList.remove('show');

(async () => {
    const text = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    const message = (id, value, kind) => {
        const el = document.getElementById(id);
        el.className = `msg ${kind}`;
        el.textContent = value;
    };
    let data;
    try { data = await FluentAPI.request('/api/dashboard/'); }
    catch (error) {
        if (error.status === 401) { window.location.href = 'login.html'; return; }
        alert(error.message);
        return;
    }
    const { user, stats } = data;
    localStorage.setItem('fluentai_user', JSON.stringify(user));
    text('profileName', user.name);
    text('profileEmail', user.email);
    text('profileAvatar', user.name.charAt(0).toUpperCase());
    text('profileJoined', `Joined ${new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`);
    text('statWords', stats.wordsSpoken.toLocaleString());
    text('statSessions', stats.sessionsCompleted);
    text('statMinutes', stats.totalMinutes);
    text('statXP', stats.xp);
    text('statWritings', stats.writingsCompleted);
    text('statChallenges', stats.challengesCompleted);
    text('levelBadge', stats.level);
    text('streakBadge', `${stats.streak} Day Streak`);
    const thresholds = [
        { name: 'Beginner', min: 0, max: 500 }, { name: 'Elementary', min: 500, max: 1500 },
        { name: 'Intermediate', min: 1500, max: 3000 }, { name: 'Advanced', min: 3000, max: 5000 },
        { name: 'Expert', min: 5000, max: 10000 }
    ];
    const current = thresholds.find(level => stats.xp >= level.min && stats.xp < level.max) || thresholds.at(-1);
    text('xpValue', `${stats.xp} / ${current.max} XP`);
    document.getElementById('xpFill').style.width = `${Math.min(100, (stats.xp - current.min) / (current.max - current.min) * 100)}%`;

    const achievements = [
        ['First Steps', 'Complete your first session', stats.sessionsCompleted >= 1],
        ['3-Day Streak', 'Practice 3 days in a row', stats.streak >= 3],
        ['100 Words', 'Speak 100 words total', stats.wordsSpoken >= 100],
        ['First Essay', 'Complete a writing assessment', stats.writingsCompleted >= 1],
        ['Challenger', 'Complete a challenge', stats.challengesCompleted >= 1],
        ['500 XP', 'Earn 500 XP total', stats.xp >= 500],
        ['7-Day Streak', 'Practice 7 days in a row', stats.streak >= 7],
        ['Champion', 'Reach 1000 XP', stats.xp >= 1000]
    ];
    const grid = document.getElementById('achievementsGrid');
    let unlocked = 0;
    grid.replaceChildren();
    achievements.forEach(([name, description, earned]) => {
        if (earned) unlocked++;
        const badge = document.createElement('div');
        badge.className = `achievement ${earned ? 'unlocked' : 'locked'}`;
        badge.title = description;
        badge.append(document.createTextNode(name));
        grid.append(badge);
    });
    text('achCount', `${unlocked}/${achievements.length} unlocked`);

    const settingsKey = `fluentai_settings:${user.id}`;
    let settings = JSON.parse(localStorage.getItem(settingsKey) || '{}');
    document.querySelectorAll('[data-setting]').forEach(toggle => {
        const key = toggle.dataset.setting;
        if (settings[key] === false) toggle.classList.remove('active');
        toggle.addEventListener('click', () => {
            toggle.classList.toggle('active');
            settings[key] = toggle.classList.contains('active');
            localStorage.setItem(settingsKey, JSON.stringify(settings));
        });
    });
    const voiceSelect = document.getElementById('voiceSelect');
    if ('speechSynthesis' in window && voiceSelect) {
        const fillVoices = () => {
            const englishVoices = speechSynthesis.getVoices().filter(voice => voice.lang.toLowerCase().startsWith('en'));
            voiceSelect.replaceChildren(...englishVoices.map(voice => {
                const option = document.createElement('option');
                option.value = voice.name;
                option.textContent = `${voice.name} (${voice.lang})`;
                option.selected = settings.voice === voice.name;
                return option;
            }));
        };
        fillVoices();
        speechSynthesis.addEventListener('voiceschanged', fillVoices);
        voiceSelect.addEventListener('change', () => {
            settings.voice = voiceSelect.value;
            localStorage.setItem(settingsKey, JSON.stringify(settings));
        });
    }

    const showEdit = () => {
        document.getElementById('editName').value = user.name;
        document.getElementById('editEmail').value = user.email;
        message('editMsg', '', '');
        openModal('editProfileModal');
    };
    document.getElementById('editProfileBtn')?.addEventListener('click', showEdit);
    document.getElementById('editAvatarBtn')?.addEventListener('click', showEdit);
    document.getElementById('saveProfileBtn')?.addEventListener('click', async () => {
        const button = document.getElementById('saveProfileBtn');
        button.disabled = true;
        try {
            const result = await FluentAPI.request('/api/auth/profile/', {
                method: 'POST', body: JSON.stringify({
                    name: document.getElementById('editName').value.trim(),
                    email: document.getElementById('editEmail').value.trim()
                })
            });
            if (result.emailVerificationRequired) {
                localStorage.removeItem('fluentai_user');
                message('editMsg', result.message, 'success');
                setTimeout(() => { window.location.href = 'login.html'; }, 1600);
                return;
            }
            Object.assign(user, result.user);
            localStorage.setItem('fluentai_user', JSON.stringify(user));
            text('profileName', user.name); text('profileEmail', user.email); text('profileAvatar', user.name.charAt(0).toUpperCase());
            message('editMsg', 'Your profile has been updated.', 'success');
            setTimeout(() => closeModal('editProfileModal'), 800);
        } catch (error) { message('editMsg', error.message, 'error'); }
        finally { button.disabled = false; }
    });

    document.getElementById('changePasswordBtn')?.addEventListener('click', () => {
        ['currentPassword', 'newPassword', 'confirmPassword'].forEach(id => { document.getElementById(id).value = ''; });
        message('passwordMsg', '', '');
        openModal('changePasswordModal');
    });
    document.getElementById('savePasswordBtn')?.addEventListener('click', async () => {
        const current = document.getElementById('currentPassword').value;
        const next = document.getElementById('newPassword').value;
        if (next !== document.getElementById('confirmPassword').value) { message('passwordMsg', 'The new passwords do not match.', 'error'); return; }
        const button = document.getElementById('savePasswordBtn');
        button.disabled = true;
        try {
            await FluentAPI.request('/api/auth/password/', { method: 'POST', body: JSON.stringify({ current_password: current, new_password: next }) });
            message('passwordMsg', 'Your password has been changed.', 'success');
            setTimeout(() => closeModal('changePasswordModal'), 800);
        } catch (error) { message('passwordMsg', error.message, 'error'); }
        finally { button.disabled = false; }
    });

    document.getElementById('exportDataBtn')?.addEventListener('click', async () => {
        try {
            const exported = await FluentAPI.request('/api/export/');
            exported.settings = JSON.parse(localStorage.getItem(settingsKey) || '{}');
            const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url; link.download = `fluentai-data-${new Date().toISOString().slice(0, 10)}.json`; link.click();
            URL.revokeObjectURL(url);
        } catch (error) { alert(error.message); }
    });
    document.getElementById('resetProgressBtn')?.addEventListener('click', async () => {
        if (!confirm('Delete your saved sessions and writing results? This cannot be undone.')) return;
        try {
            await FluentAPI.request('/api/progress/reset/', { method: 'POST', body: '{}' });
            location.reload();
        } catch (error) { alert(error.message); }
    });
    document.getElementById('deleteAccountBtn')?.addEventListener('click', async () => {
        if (!confirm('Permanently delete your account and all learning data? This cannot be undone.')) return;
        const password = prompt('Enter your password to confirm account deletion:');
        if (password === null) return;
        try {
            await FluentAPI.request('/api/auth/delete/', { method: 'POST', body: JSON.stringify({ password }) });
            localStorage.removeItem('fluentai_user');
            location.href = 'index.html';
        } catch (error) { alert(error.message); }
    });
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
        try { await FluentAPI.request('/api/auth/logout/', { method: 'POST' }); } catch (_) {}
        localStorage.removeItem('fluentai_user');
        location.href = 'login.html';
    });
})();
