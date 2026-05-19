'use strict';

// ── Frases carousel ───────────────────────────────────────────────────────────
let _frases = [];
let _fraseIdx = 0;

function mostrarFrase(idx) {
    if (!_frases.length) return;
    _fraseIdx = ((idx % _frases.length) + _frases.length) % _frases.length;
    document.getElementById('fraseContenido').textContent = _frases[_fraseIdx];
    document.getElementById('fraseIndicador').textContent = `${_fraseIdx + 1} / ${_frases.length}`;
}
function fraseSiguiente()  { mostrarFrase(_fraseIdx + 1); }
function fraseAnterior()   { mostrarFrase(_fraseIdx - 1); }

// ── Settings (carta + frases) ─────────────────────────────────────────────────
const _defaultCarta  = '¡Hola! Hice esta pequeña página para recordarte lo importante que eres en mi vida. Gracias por estar siempre ahí, por cada risa, cada consejo y por los momentos tan bonitos que pasamos juntas. ¡Te quiero muchísimo!';
const _defaultFrases = [
    'Eres una persona increíble, valiente y divertida. El mundo es mucho más bonito contigo en él. ¡Nunca cambies!',
    'Cada día que pasa me alegra más tenerte en mi vida. Eres luz pura. 💛',
    'Tu sonrisa tiene el poder de arreglar cualquier día difícil. No la pierdas nunca.',
    'Eres más fuerte de lo que crees, más inteligente de lo que imaginas y más amada de lo que sabes.',
    'Gracias por existir y por ser exactamente como eres. ✨'
];

async function cargarSettings() {
    // Muestra contenido por defecto de inmediato — nunca se queda en "Cargando..."
    const cartaEl = document.getElementById('cartaTexto');
    if (cartaEl) cartaEl.textContent = _defaultCarta;
    _frases = _defaultFrases.slice();
    mostrarFrase(0);

    // Intenta cargar desde la API (con timeout de 10 s para no colgar)
    try {
        const ctrl    = new AbortController();
        const timer   = setTimeout(() => ctrl.abort(), 10000);
        const res     = await fetch(`${API_URL}/api/settings`, { signal: ctrl.signal });
        clearTimeout(timer);
        const data = await res.json();
        if (cartaEl && data.carta)  cartaEl.textContent = data.carta;
        if (Array.isArray(data.frases) && data.frases.length) {
            _frases = data.frases;
            mostrarFrase(0);
        }
    } catch { /* se mantiene el contenido por defecto */ }
}

// ── Fotos de recuerdos ────────────────────────────────────────────────────────
async function cargarFotos() {
    const scroll = document.getElementById('photosScroll');
    if (!scroll) return;
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_URL}/api/photos`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const fotos = await res.json();
        if (!Array.isArray(fotos) || fotos.length === 0) {
            scroll.innerHTML = '<p class="photo-loading">¡Agrega la primera foto! 📸</p>';
            return;
        }
        scroll.innerHTML = fotos.map(f => `
            <div class="photo-item" id="photo-${f._id}">
                <img src="${f.data}" alt="${f.caption || 'Recuerdo'}" loading="lazy">
                ${f.caption ? `<p class="photo-caption">${escapeHtml(f.caption)}</p>` : ''}
                <button class="photo-del-btn" onclick="eliminarFoto('${f._id}')">✕</button>
            </div>`).join('');
    } catch {
        scroll.innerHTML = '<p class="photo-loading">Error al cargar fotos.</p>';
    }
}

async function subirFoto(event) {
    const file = event.target.files[0];
    if (!file) return;
    const token = localStorage.getItem('token');
    const data  = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result);
        reader.onerror = () => reject();
        reader.readAsDataURL(file);
    });
    try {
        const res = await fetch(`${API_URL}/api/photos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ data })
        });
        if (!res.ok) { alert('Foto demasiado grande o error al subir.'); return; }
        event.target.value = '';
        await cargarFotos();
    } catch { alert('Error al subir la foto.'); }
}

async function eliminarFoto(id) {
    if (!confirm('¿Eliminar esta foto?')) return;
    const token = localStorage.getItem('token');
    await fetch(`${API_URL}/api/photos/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    await cargarFotos();
}

// ===== MENSAJES =====

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatFecha(fecha) {
    return new Date(fecha).toLocaleString('es', {
        day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit'
    });
}

async function cargarMensajes() {
    const lista = document.getElementById('messagesList');
    if (!lista) return;
    const mensajes = await getMessages();
    if (!mensajes) return;
    const currentUser = localStorage.getItem('username');
    if (mensajes.length === 0) {
        lista.innerHTML = '<p class="no-messages">¡Sin mensajes aún! Sé la primera 🌸</p>';
        return;
    }
    lista.innerHTML = mensajes.map(m => {
        const esMio = m.autor === currentUser;
        return `
            <div class="msg-bubble ${esMio ? 'mine' : 'hers'}">
                <div class="msg-author">${escapeHtml(esMio ? 'Tú' : m.autor)}</div>
                <div class="msg-text">${escapeHtml(m.texto)}</div>
                <div class="msg-meta">
                    <span>${formatFecha(m.fecha)}</span>
                    ${esMio ? `<button class="del-btn" onclick="eliminarMensaje('${m._id}')">🗑</button>` : ''}
                </div>
            </div>`;
    }).join('');
    lista.scrollTop = lista.scrollHeight;
}

async function enviarMensaje() {
    const input = document.getElementById('newMessage');
    const texto = input.value.trim();
    if (!texto) return;
    const btn = document.querySelector('.send-btn');
    btn.disabled = true;
    input.value = '';
    await sendMessage(texto);
    await cargarMensajes();
    btn.disabled = false;
}

async function eliminarMensaje(id) {
    await deleteMessage(id);
    await cargarMensajes();
}

function handleMsgKey(e) {
    if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        enviarMensaje();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const username = localStorage.getItem('username');
    const welcomeEl = document.getElementById('welcomeUser');
    if (welcomeEl && username) welcomeEl.textContent = `Hola, ${username} 🌸`;

    cargarSettings();
    cargarFotos();
    cargarMensajes();
    setInterval(cargarMensajes, 30000);
});

