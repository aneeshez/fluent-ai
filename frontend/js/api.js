(() => {
    let csrfToken = null;

    async function refreshCsrfToken() {
        const response = await fetch('/api/auth/csrf/', { credentials: 'same-origin' });
        if (!response.ok) throw new Error('Could not initialize a secure connection. Refresh and try again.');
        const data = await response.json();
        csrfToken = data.csrfToken;
    }

    async function request(path, options = {}) {
        const method = (options.method || 'GET').toUpperCase();
        const headers = new Headers(options.headers || {});
        if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
        if (!['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method)) {
            if (!csrfToken) await refreshCsrfToken();
            headers.set('X-CSRFToken', csrfToken);
        }
        const response = await fetch(path, {
            ...options,
            method,
            headers,
            credentials: 'same-origin'
        });
        let data = {};
        try { data = await response.json(); } catch (_) { /* Keep a useful fallback for non-JSON server errors. */ }
        if (response.status === 403 && !['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method)) {
            csrfToken = null;
        }
        if (!response.ok) {
            const error = new Error(data.error || `Request failed (${response.status}).`);
            error.status = response.status;
            throw error;
        }
        return data;
    }

    window.FluentAPI = { request, refreshCsrfToken };
})();
