const authForm = document.getElementById('loginForm') || document.getElementById('signupForm');
const authIsSignup = Boolean(document.getElementById('signupForm'));
const authButton = document.getElementById(authIsSignup ? 'signupBtn' : 'loginBtn');
const authErrorBox = document.getElementById('authError');
const authErrorText = document.getElementById('errorText');
const authSuccessBox = document.getElementById('authSuccess');
const authSuccessText = document.getElementById('successText');

function showAuthError(message) {
    authErrorText.textContent = message;
    authErrorBox.classList.add('show');
    authSuccessBox.classList.remove('show');
}

function showAuthSuccess(message) {
    authSuccessText.textContent = message;
    authSuccessBox.classList.add('show');
    authErrorBox.classList.remove('show');
}

const passwordField = document.getElementById('password');
document.getElementById('passToggle')?.addEventListener('click', event => {
    const button = event.currentTarget;
    const visible = passwordField.type === 'password';
    passwordField.type = visible ? 'text' : 'password';
    button.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
    button.innerHTML = visible
        ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8"/><path d="M9.9 5.2A10.7 10.7 0 0112 5c5 0 9 5 9 7a9.7 9.7 0 01-3.2 4.7M6.2 6.2C4.2 7.6 3 10 3 12c0 2 4 7 9 7 1 0 2-.2 2.9-.6"/></svg>'
        : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
});

document.getElementById('resendVerification')?.addEventListener('click', async () => {
    const button = document.getElementById('resendVerification');
    button.disabled = true;
    try {
        const result = await FluentAPI.request('/api/auth/email-verification/resend/', {
            method: 'POST',
            body: JSON.stringify({ email: document.getElementById('email').value.trim() })
        });
        showAuthSuccess(result.message);
    } catch (error) {
        showAuthError(error.message);
        button.disabled = false;
    }
});

document.getElementById('guestBtn')?.addEventListener('click', () => {
    localStorage.setItem('fluentai_user', JSON.stringify({ name: 'Guest', email: '', provider: 'guest' }));
    window.location.href = 'practice.html';
});

passwordField?.addEventListener('input', () => {
    if (!authIsSignup) return;
    const value = passwordField.value;
    const strength = Number(value.length >= 8) + Number(value.length >= 12) + Number(/[A-Z]/.test(value)) + Number(/[0-9]/.test(value)) + Number(/[^A-Za-z0-9]/.test(value));
    document.getElementById('passwordStrength').style.width = `${strength * 20}%`;
    document.getElementById('passwordHint').textContent = value
        ? ['Weak password', 'Weak password', 'Fair password', 'Good password', 'Strong password', 'Strong password'][strength]
        : 'At least 8 characters';
});

authForm.addEventListener('submit', async event => {
    event.preventDefault();
    authErrorBox.classList.remove('show');
    if (authIsSignup && !document.getElementById('terms').checked) {
        showAuthError('Please agree to the Terms of Service.');
        return;
    }
    authButton.disabled = true;
    authButton.classList.add('btn-loading');
    const payload = {
        email: document.getElementById('email').value.trim(),
        password: passwordField.value
    };
    if (authIsSignup) payload.name = document.getElementById('name').value.trim();
    try {
        const response = await FluentAPI.request(authIsSignup ? '/api/auth/register/' : '/api/auth/login/', {
            method: 'POST', body: JSON.stringify(payload)
        });
        if (authIsSignup) {
            showAuthSuccess(response.message);
            document.getElementById('resendVerificationWrap')?.removeAttribute('hidden');
            authButton.disabled = true;
            authButton.classList.remove('btn-loading');
            return;
        }
        localStorage.setItem('fluentai_user', JSON.stringify(response.user));
        showAuthSuccess(`Welcome back, ${response.user.name}!`);
        window.location.href = 'dashboard.html';
    } catch (error) {
        showAuthError(error.message);
        if (!authIsSignup && error.status === 403) {
            document.getElementById('resendVerificationWrap')?.removeAttribute('hidden');
        }
        authButton.disabled = false;
        authButton.classList.remove('btn-loading');
    }
});

FluentAPI.request('/api/auth/me/').then(({ user }) => {
    localStorage.setItem('fluentai_user', JSON.stringify(user));
    window.location.href = 'dashboard.html';
}).catch(() => {});
