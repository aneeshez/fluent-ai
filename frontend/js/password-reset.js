(() => {
    const requestForm = document.getElementById('requestResetForm');
    const confirmForm = document.getElementById('confirmResetForm');
    const params = new URLSearchParams(window.location.search);
    const uid = params.get('uid');
    const token = params.get('token');

    if (uid && token) {
        requestForm.hidden = true;
        confirmForm.hidden = false;
        document.getElementById('resetSubtitle').textContent = 'Choose a new password for your account.';
    }

    function showError(message) {
        document.getElementById('resetErrorText').textContent = message;
        document.getElementById('resetError').classList.add('show');
        document.getElementById('resetSuccess').classList.remove('show');
    }

    function showSuccess(message) {
        document.getElementById('resetSuccessText').textContent = message;
        document.getElementById('resetSuccess').classList.add('show');
        document.getElementById('resetError').classList.remove('show');
    }

    requestForm.addEventListener('submit', async event => {
        event.preventDefault();
        const button = document.getElementById('requestResetButton');
        button.disabled = true;
        try {
            const response = await FluentAPI.request('/api/auth/password-reset/', {
                method: 'POST',
                body: JSON.stringify({ email: document.getElementById('resetEmail').value.trim() })
            });
            showSuccess(response.message);
        } catch (error) {
            showError(error.message);
            button.disabled = false;
        }
    });

    confirmForm.addEventListener('submit', async event => {
        event.preventDefault();
        const password = document.getElementById('newPassword').value;
        if (password !== document.getElementById('confirmPassword').value) {
            showError('The passwords do not match.');
            return;
        }
        const button = document.getElementById('confirmResetButton');
        button.disabled = true;
        try {
            await FluentAPI.request('/api/auth/password-reset/confirm/', {
                method: 'POST',
                body: JSON.stringify({ uid, token, password })
            });
            showSuccess('Your password has been updated. You can now log in.');
            confirmForm.hidden = true;
        } catch (error) {
            showError(error.message);
            button.disabled = false;
        }
    });
})();
