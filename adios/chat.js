'use strict';

// ── Stickers disponibles ───────────────────────────────────────────────────────
const STICKERS = {
    amor:   ['💖','💕','💝','💘','💗','💓','💞','🥰','😍','😘','💋','🌹','🌸','🌺','💐','🫶','🫦','💌'],
    feliz:  ['😊','😄','🤩','😂','🥳','🎉','✨','🌟','⭐','🎊','😁','😆','🤗','😃','🙌','🎀','🥰','😋'],
    triste: ['🥺','😢','😭','😔','💔','🫂','😿','🙁','😥','😞','🫠','😓','😟','🤧','😪','😩'],
    varios: ['🐱','🦋','🌈','🍓','🍰','👑','💫','🌙','🌻','🦄','🐰','🍒','🌊','🎵','🎮','🍦','🌮','🐶']
};

// ── Estado ────────────────────────────────────────────────────────────────────
let ME          = '';
let lastMsgId   = null;
let pollTimer   = null;
let recorder    = null;
let recChunks   = [];
let recActive   = false;
let recTimer    = null;
let recSecs     = 0;

// ── Inicio ────────────────────────────────────────────────────────────────────
function init() {
    ME = localStorage.getItem('username') || '';
    document.getElementById('chatStatus').textContent = `Conectada como ${ME} 🌸`;

    showStickerCat('amor');

    // Cerrar sticker picker al hacer clic fuera
    document.addEventListener('click', (e) => {
        const picker = document.getElementById('stickerPicker');
        if (picker.classList.contains('open') &&
            !picker.contains(e.target) &&
            !e.target.closest('.sticker-btn')) {
            picker.classList.remove('open');
        }
    });

    firstLoad();
}

// ── Carga inicial ─────────────────────────────────────────────────────────────
async function firstLoad() {
    const msgs = await fetchMessages(null);
    if (!msgs) return;

    document.getElementById('loadingMsgs').style.display = 'none';
    renderAll(msgs);

    const area = document.getElementById('messagesArea');
    area.scrollTop = area.scrollHeight;

    if (msgs.length) lastMsgId = msgs[msgs.length - 1]._id;

    pollTimer = setInterval(poll, 2500);
}

// ── Polling ────────────────────────────────────────────────────────────────────
async function poll() {
    const msgs = await fetchMessages(lastMsgId);
    if (!msgs || msgs.length === 0) return;

    const area    = document.getElementById('messagesArea');
    const atBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 80;

    appendMessages(msgs);

    if (atBottom) area.scrollTop = area.scrollHeight;

    lastMsgId = msgs[msgs.length - 1]._id;
}

// ── Fetch ─────────────────────────────────────────────────────────────────────
async function fetchMessages(afterId) {
    const token = localStorage.getItem('token');
    try {
        const url = afterId
            ? `${API_URL}/api/messages?after=${encodeURIComponent(afterId)}`
            : `${API_URL}/api/messages`;
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.status === 401) { logout(); return null; }
        if (!res.ok) return null;
        return res.json();
    } catch {
        return null;
    }
}

// ── Render completo ───────────────────────────────────────────────────────────
function renderAll(msgs) {
    const area    = document.getElementById('messagesArea');
    const loading = document.getElementById('loadingMsgs');
    while (area.firstChild) area.removeChild(area.firstChild);
    area.appendChild(loading);

    let lastDate = null;
    for (const msg of msgs) {
        const d = fmtDate(msg.fecha);
        if (d !== lastDate) { area.appendChild(dateSep(d)); lastDate = d; }
        area.appendChild(makeBubble(msg));
    }
}

// ── Añadir mensajes nuevos ────────────────────────────────────────────────────
function appendMessages(msgs) {
    const area = document.getElementById('messagesArea');
    let lastDate = getLastDate(area);
    for (const msg of msgs) {
        const d = fmtDate(msg.fecha);
        if (d !== lastDate) { area.appendChild(dateSep(d)); lastDate = d; }
        area.appendChild(makeBubble(msg));
    }
}

function getLastDate(area) {
    const seps = area.querySelectorAll('.date-separator');
    return seps.length ? seps[seps.length - 1].textContent : null;
}

// ── Helpers de formato ────────────────────────────────────────────────────────
function dateSep(text) {
    const el = document.createElement('div');
    el.className = 'date-separator';
    el.textContent = text;
    return el;
}
function fmtDate(iso) {
    return new Date(iso).toLocaleDateString('es', {
        weekday: 'long', day: 'numeric', month: 'long'
    });
}
function fmtTime(iso) {
    return new Date(iso).toLocaleTimeString('es', {
        hour: '2-digit', minute: '2-digit'
    });
}
function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Crear burbuja ─────────────────────────────────────────────────────────────
function makeBubble(msg) {
    const tipo  = msg.tipo || 'texto';
    const isMine = msg.autor === ME;

    const wrap = document.createElement('div');
    wrap.className = `msg-wrapper ${isMine ? 'mine' : 'theirs'}`;
    wrap.dataset.id = msg._id;

    if (tipo === 'sticker') {
        const bubble = document.createElement('div');
        bubble.className = 'bubble sticker-bubble';

        const span = document.createElement('span');
        span.className = 'sticker-emoji';
        span.textContent = msg.texto;
        bubble.appendChild(span);

        const t = document.createElement('span');
        t.className = 'sticker-time';
        t.textContent = fmtTime(msg.fecha);

        wrap.appendChild(bubble);
        wrap.appendChild(t);
    } else {
        const bubble = document.createElement('div');
        bubble.className = 'bubble';

        if (tipo === 'texto') {
            const p = document.createElement('p');
            p.innerHTML = escapeHtml(msg.texto || '').replace(/\n/g, '<br>');
            bubble.appendChild(p);

        } else if (tipo === 'imagen') {
            const img = document.createElement('img');
            img.src       = msg.contenido;
            img.alt       = 'imagen';
            img.className = 'msg-img';
            img.loading   = 'lazy';
            img.onclick   = () => openLightbox(msg.contenido);
            bubble.appendChild(img);

        } else if (tipo === 'video') {
            const vid = document.createElement('video');
            vid.src         = msg.contenido;
            vid.className   = 'msg-video';
            vid.controls    = true;
            vid.playsInline = true;
            bubble.appendChild(vid);

        } else if (tipo === 'audio') {
            const row = document.createElement('div');
            row.className = 'audio-msg';
            row.innerHTML = '<span class="audio-icon">🎤</span>';
            const audio = document.createElement('audio');
            audio.src      = msg.contenido;
            audio.controls = true;
            row.appendChild(audio);
            bubble.appendChild(row);
        }

        const t = document.createElement('span');
        t.className   = 'msg-time';
        t.textContent = fmtTime(msg.fecha);
        bubble.appendChild(t);

        wrap.appendChild(bubble);
    }

    // Botón borrar (solo mensajes propios)
    if (isMine) {
        const del = document.createElement('button');
        del.className = 'del-btn';
        del.textContent = '×';
        del.title = 'Borrar';
        del.onclick = (e) => { e.stopPropagation(); deleteMsg(msg._id, wrap); };
        wrap.insertBefore(del, wrap.firstChild);
    }

    return wrap;
}

// ── Enviar texto ──────────────────────────────────────────────────────────────
async function sendText() {
    const inp   = document.getElementById('msgInput');
    const texto = inp.value.trim();
    if (!texto) return;
    inp.value = '';
    autoResize(inp);
    await apiSend({ tipo: 'texto', texto });
}

// ── Enviar sticker ────────────────────────────────────────────────────────────
async function sendSticker(emoji) {
    document.getElementById('stickerPicker').classList.remove('open');
    await apiSend({ tipo: 'sticker', texto: emoji });
}

// ── Enviar media (imagen / video / audio) ─────────────────────────────────────
async function sendMedia(tipo, dataUrl) {
    setSending(true);
    await apiSend({ tipo, contenido: dataUrl });
    setSending(false);
}

function setSending(on) {
    document.getElementById('sendingBar').style.display = on ? 'flex' : 'none';
}

// ── Llamada API genérica ──────────────────────────────────────────────────────
async function apiSend(body) {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_URL}/api/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(body)
        });

        if (res.status === 401) { logout(); return; }
        if (res.status === 413) {
            alert('El archivo es demasiado grande.\nMáximo: imágenes 3 MB · videos 7 MB · audio 2 MB.');
            return;
        }
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert(err.error || 'Error al enviar el mensaje.');
            return;
        }

        const msg  = await res.json();
        const area = document.getElementById('messagesArea');
        const atBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 80;

        const lastDate = getLastDate(area);
        const d = fmtDate(msg.fecha);
        if (d !== lastDate) area.appendChild(dateSep(d));

        area.appendChild(makeBubble(msg));
        area.scrollTop = area.scrollHeight;
        lastMsgId = msg._id;

    } catch {
        alert('Error de conexión. Comprueba tu internet e inténtalo de nuevo.');
    }
}

// ── Selección de archivo ──────────────────────────────────────────────────────
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    const tipo     = file.type.startsWith('image/') ? 'imagen' : 'video';
    const maxBytes = tipo === 'imagen' ? 3 * 1024 * 1024 : 7 * 1024 * 1024;

    if (file.size > maxBytes) {
        alert(`Archivo demasiado grande.\nMáximo ${tipo === 'imagen' ? '3 MB para imágenes' : '7 MB para videos'}.`);
        return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => sendMedia(tipo, ev.target.result);
    reader.readAsDataURL(file);
}

// ── Grabación de audio ────────────────────────────────────────────────────────
async function startRecording(e) {
    if (e) e.preventDefault();
    if (recActive) return;

    try {
        const stream   = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm';

        recChunks = [];
        recorder  = new MediaRecorder(stream, { mimeType });

        recorder.ondataavailable = (ev) => {
            if (ev.data.size > 0) recChunks.push(ev.data);
        };

        recorder.onstop = () => {
            stream.getTracks().forEach(t => t.stop());
            const blob = new Blob(recChunks, { type: mimeType });
            if (blob.size > 2 * 1024 * 1024) {
                alert('Audio muy largo (máx ~2 min). Graba uno más corto.');
                return;
            }
            const reader = new FileReader();
            reader.onload = (ev) => sendMedia('audio', ev.target.result);
            reader.readAsDataURL(blob);
        };

        recorder.start();
        recActive = true;
        recSecs   = 0;

        const btn = document.getElementById('micBtn');
        btn.classList.add('recording');
        btn.textContent = '⏹';

        recTimer = setInterval(() => {
            recSecs++;
            document.getElementById('micBtn').title = `Grabando ${recSecs}s — suelta para enviar`;
            if (recSecs >= 120) stopRecording();
        }, 1000);

    } catch {
        alert('No se pudo acceder al micrófono.\nRevisa los permisos del navegador.');
    }
}

function stopRecording(e) {
    if (e) e.preventDefault();
    if (!recActive || !recorder) return;

    clearInterval(recTimer);
    recActive = false;
    recorder.stop();

    const btn = document.getElementById('micBtn');
    btn.classList.remove('recording');
    btn.textContent = '🎤';
    btn.title = 'Mantén presionado para grabar audio';
}

// ── Borrar mensaje ────────────────────────────────────────────────────────────
async function deleteMsg(id, el) {
    if (!confirm('¿Borrar este mensaje?')) return;
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_URL}/api/messages/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) el.remove();
    } catch { /* silencioso */ }
}

// ── Panel de stickers ─────────────────────────────────────────────────────────
function toggleStickerPicker() {
    document.getElementById('stickerPicker').classList.toggle('open');
}

function showStickerCat(cat) {
    document.querySelectorAll('.sticker-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.cat === cat);
    });

    const grid = document.getElementById('stickerGrid');
    grid.innerHTML = '';

    (STICKERS[cat] || []).forEach(emoji => {
        const btn = document.createElement('button');
        btn.className   = 'sticker-item';
        btn.textContent = emoji;
        btn.onclick     = () => sendSticker(emoji);
        grid.appendChild(btn);
    });
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
function openLightbox(src) {
    const content = document.getElementById('lightboxContent');
    content.innerHTML = '';
    const img = document.createElement('img');
    img.src = src;
    img.alt = 'imagen ampliada';
    content.appendChild(img);
    document.getElementById('lightbox').classList.add('open');
}

function closeLightbox() {
    document.getElementById('lightbox').classList.remove('open');
    document.getElementById('lightboxContent').innerHTML = '';
}

// ── Helpers de input ──────────────────────────────────────────────────────────
function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendText();
    }
}

// ── Arranque ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
