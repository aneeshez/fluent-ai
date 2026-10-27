(() => {
    const params = new URLSearchParams(window.location.search);
    const uid = params.get('uid');
    const token = params.get('token');
    const message = document.getElementById('verifyMessage');
    const subtitle = document.getElementById('verifySubtitle');
    const loginLink = document.getElementById('verifyLogin');

    function showResult(text, success) {
        message.textContent = text;
        message.className = `verify-message show ${success ? 'success' : 'error'}`;
        subtitle.textContent = success ? 'Your FluentAI account is ready.' : 'Please request a new verification link and try again.';
        loginLink.hidden = !success;
    }

    if (!uid || !token) {
        showResult('This verification link is incomplete.', false);
        return;
    }

    FluentAPI.request('/api/auth/email-verification/confirm/', {
        method: 'POST',
        body: JSON.stringify({ uid, token })
    }).then(() => {
        showResult('Your email has been verified. You can now log in.', true);
    }).catch(error => {
        showResult(error.message, false);
    });
})();
