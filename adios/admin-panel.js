// API_URL viene de config.js cargado antes en admin.html

let adminToken = null;

// ── Login ────────────────────────────────────────────────────────────────────
document.getElementById('adminLoginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const password = document.getElementById('adminPassword').value;
    const btn = e.target.querySelector('button');
    const err = document.getElementById('adminLoginError');
    err.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'Verificando...';

    try {
        const res = await fetch(`${API_URL}/api/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        adminToken = data.token;
        sessionStorage.setItem('adminToken', adminToken); // sessionStorage: se borra al cerrar el navegador
        showPanel();
    } catch {
        err.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Acceder';
    }
});

function showPanel() {
    document.getElementById('adminLogin').classList.add('hidden');
    document.getElementById('adminPanel').classList.remove('hidden');
    loadUsers();
    loadCarta();
    loadFrases();
}

function adminLogout() {
    adminToken = null;
    sessionStorage.removeItem('adminToken');
    document.getElementById('adminPanel').classList.add('hidden');
    document.getElementById('adminLogin').classList.remove('hidden');
    document.getElementById('adminPassword').value = '';
}

// ── Fetch helper ─────────────────────────────────────────────────────────────
async function adminFetch(endpoint, options = {}) {
    try {
        const res = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`,
                ...(options.headers || {})
            }
        });
        if (res.status === 401) { adminLogout(); return null; }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error desconocido');
        return data;
    } catch (err) {
        throw err;
    }
}

// ── Cargar usuarios ───────────────────────────────────────────────────────────
async function loadUsers() {
    const list = document.getElementById('usersList');
    list.innerHTML = '<div class="loading-msg">Cargando...</div>';
    try {
        const users = await adminFetch('/api/admin/users');
        if (!users || users.length === 0) {
            list.innerHTML = '<div class="empty-msg">No hay usuarios registrados.</div>';
            return;
        }
        list.innerHTML = users.map(u => `
            <div class="user-row" id="row-${u._id}">
                <span class="user-name">👤 ${escapeHtml(u.username)}</span>
                <div class="user-actions">
                    <input type="password" class="pwd-input" id="pwd-${u._id}" placeholder="Nueva contraseña">
                    <button class="btn-sm btn-change-pwd" onclick="changePassword('${u._id}')">Cambiar contraseña</button>
                    <button class="btn-sm btn-delete" onclick="deleteUser('${u._id}', '${escapeHtml(u.username)}')">Eliminar</button>
                </div>
            </div>
        `).join('');
    } catch {
        list.innerHTML = '<div class="loading-msg">Error al cargar usuarios.</div>';
    }
}

// ── Crear usuario ─────────────────────────────────────────────────────────────
document.getElementById('createUserForm').addEventListener('submit', async e => {
    e.preventDefault();
    const username = document.getElementById('newUsername').value.trim();
    const password = document.getElementById('newPassword').value;
    const errEl    = document.getElementById('createError');
    const okEl     = document.getElementById('createSuccess');
    const btn      = e.target.querySelector('button[type="submit"]');

    errEl.classList.add('hidden');
    okEl.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'Creando...';

    try {
        await adminFetch('/api/admin/users', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        okEl.textContent = `✅ Usuario "${escapeHtml(username)}" creado correctamente.`;
        okEl.classList.remove('hidden');
        document.getElementById('newUsername').value = '';
        document.getElementById('newPassword').value = '';
        loadUsers();
    } catch (err) {
        errEl.textContent = `❌ ${err.message}`;
        errEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Crear usuario';
    }
});

// ── Cambiar contraseña ────────────────────────────────────────────────────────
async function changePassword(userId) {
    const input    = document.getElementById(`pwd-${userId}`);
    const password = input.value.trim();
    if (!password) { input.focus(); return; }
    if (password.length < 6) {
        alert('La contraseña debe tener al menos 6 caracteres.');
        return;
    }
    try {
        await adminFetch(`/api/admin/users/${userId}/password`, {
            method: 'PUT',
            body: JSON.stringify({ password })
        });
        input.value = '';
        input.placeholder = '✅ Cambiada';
        setTimeout(() => { input.placeholder = 'Nueva contraseña'; }, 2500);
    } catch (err) {
        alert(`Error: ${err.message}`);
    }
}

// ── Eliminar usuario ──────────────────────────────────────────────────────────
async function deleteUser(userId, username) {
    if (!confirm(`¿Eliminar al usuario "${username}"?\nEsta acción no se puede deshacer.`)) return;
    try {
        await adminFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
        document.getElementById(`row-${userId}`)?.remove();
        const list = document.getElementById('usersList');
        if (!list.querySelector('.user-row')) {
            list.innerHTML = '<div class="empty-msg">No hay usuarios registrados.</div>';
        }
    } catch (err) {
        alert(`Error: ${err.message}`);
    }
}

// ── Seguridad: escape HTML ────────────────────────────────────────────────────
function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ── Restaurar sesión si existe (sessionStorage, no persiste al cerrar) ────────
window.addEventListener('DOMContentLoaded', () => {
    const saved = sessionStorage.getItem('adminToken');
    if (saved) { adminToken = saved; showPanel(); }
});

// ── Carta ─────────────────────────────────────────────────────────────────────
async function loadCarta() {
    try {
        const res  = await fetch(`${API_URL}/api/settings`);
        const data = await res.json();
        document.getElementById('cartaEditor').value = data.carta || '';
    } catch { /* silent */ }
}

async function guardarCarta() {
    const carta  = document.getElementById('cartaEditor').value;
    const status = document.getElementById('cartaStatus');
    try {
        await adminFetch('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ carta }) });
        status.textContent = '✅ Guardada';
        setTimeout(() => { status.textContent = ''; }, 2500);
    } catch { status.textContent = '❌ Error al guardar'; }
}

// ── Frases ────────────────────────────────────────────────────────────────────
let _adminFrases = [];

async function loadFrases() {
    try {
        const res  = await fetch(`${API_URL}/api/settings`);
        const data = await res.json();
        _adminFrases = Array.isArray(data.frases) ? data.frases : [];
        renderFrasesAdmin();
    } catch { /* silent */ }
}

function renderFrasesAdmin() {
    const list = document.getElementById('frasesList');
    if (!_adminFrases.length) { list.innerHTML = '<p style="color:#666;font-size:0.85rem;">Sin frases.</p>'; return; }
    list.innerHTML = _adminFrases.map((f, i) => `
        <div class="frase-admin-row" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="flex:1;font-size:0.85rem;color:#bbb;">${escapeHtml(f)}</span>
            <button class="btn-sm btn-delete" onclick="eliminarFrase(${i})">✕</button>
        </div>`).join('');
}

function agregarFrase() {
    const input = document.getElementById('nuevaFrase');
    const frase = input.value.trim();
    if (!frase) return;
    _adminFrases.push(frase);
    input.value = '';
    renderFrasesAdmin();
}

function eliminarFrase(idx) {
    _adminFrases.splice(idx, 1);
    renderFrasesAdmin();
}

async function guardarFrases() {
    const status = document.getElementById('frasesStatus');
    try {
        await adminFetch('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ frases: _adminFrases }) });
        status.textContent = '✅ Guardadas';
        setTimeout(() => { status.textContent = ''; }, 2500);
    } catch { status.textContent = '❌ Error al guardar'; }
}

// ── Historial de sesiones ─────────────────────────────────────────────────────
async function loadSessions() {
    const list = document.getElementById('sessionsList');
    list.innerHTML = '<div class="loading-msg">Cargando...</div>';
    try {
        const logs = await adminFetch('/api/admin/sessions');
        if (!logs || logs.length === 0) {
            list.innerHTML = '<div class="empty-msg">Sin sesiones registradas.</div>';
            return;
        }
        list.innerHTML = `
            <table class="sessions-table">
                <thead><tr><th>Usuario</th><th>IP</th><th>Fecha</th></tr></thead>
                <tbody>${logs.map(l => `
                    <tr>
                        <td>👤 ${escapeHtml(l.username)}</td>
                        <td>${escapeHtml(l.ip || '—')}</td>
                        <td>${new Date(l.date).toLocaleString('es', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</td>
                    </tr>`).join('')}
                </tbody>
            </table>`;
    } catch {
        list.innerHTML = '<div class="loading-msg">Error al cargar.</div>';
    }
}

