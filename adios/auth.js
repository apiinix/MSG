// API_URL viene de config.js — cámbiala allí una sola vez

async function login(username, password) {
    try {
        const res = await fetch(`${API_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        if (!res.ok) return false;
        const data = await res.json();
        localStorage.setItem('token', data.token);
        localStorage.setItem('username', data.username);
        window.location.href = 'niga.html';
        return true;
    } catch {
        return false;
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = 'login.html';
}

function requireAuth() {
    if (!localStorage.getItem('token')) {
        window.location.href = 'login.html';
    }
}

async function apiFetch(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                ...(options.headers || {})
            }
        });
        if (res.status === 401) { logout(); return null; }
        return res.ok ? res.json() : null;
    } catch {
        return null;
    }
}

async function getMessages() {
    return apiFetch('/api/messages');
}

async function sendMessage(texto) {
    return apiFetch('/api/messages', {
        method: 'POST',
        body: JSON.stringify({ texto })
    });
}

async function deleteMessage(id) {
    return apiFetch(`/api/messages/${id}`, { method: 'DELETE' });
}
