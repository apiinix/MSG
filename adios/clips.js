'use strict';

// ── Tipo de clip (URL / video) ─────────────────────────────────────────────────
document.querySelectorAll('input[name="clipTipo"]').forEach(radio => {
    radio.addEventListener('change', () => {
        const isUrl = radio.value === 'url';
        document.getElementById('clipUrlGroup').style.display  = isUrl ? '' : 'none';
        document.getElementById('clipFileGroup').style.display = isUrl ? 'none' : '';
    });
});

document.getElementById('clipFile').addEventListener('change', e => {
    const f = e.target.files[0];
    document.getElementById('clipFileName').textContent = f ? f.name : '';
});

// ── Cargar clips ───────────────────────────────────────────────────────────────
async function cargarClips() {
    const container = document.getElementById('clipsContainer');
    const data = await apiFetch('/api/clips');
    if (!data) {
        container.innerHTML = '<p class="clips-loading">Error al cargar clips.</p>';
        return;
    }
    if (data.length === 0) {
        container.innerHTML = '<p class="clips-loading">No hay clips aún. ¡Agrega el primero! 🎮</p>';
        return;
    }
    container.innerHTML = data.map((c, i) => renderClip(c, i + 1)).join('');
}

function renderClip(c, num) {
    const videoHtml = c.tipo === 'url' && c.url
        ? `<iframe src="${youtubeEmbed(c.url)}" allowfullscreen loading="lazy"></iframe>`
        : c.tipo === 'video' && c.data
            ? `<video src="${c.data}" controls preload="none" style="max-width:100%;border-radius:10px;"></video>`
            : `<div class="video-placeholder"><span>▶</span><p>Sin video</p></div>`;

    return `
    <div class="clip-card" id="clip-${c._id}">
        <div class="clip-tape"></div>
        <button class="clip-del-btn" onclick="eliminarClip('${c._id}')" title="Eliminar clip">✕</button>
        <div class="clip-label">Clip #${num}</div>
        ${c.fecha  ? `<div class="clip-date">📅 ${escHtml(c.fecha)}</div>` : ''}
        ${c.titulo ? `<div class="clip-title">🎮 ${escHtml(c.titulo)}</div>` : ''}
        <div class="video-slot">${videoHtml}</div>
        ${c.desc   ? `<p class="clip-desc">${escHtml(c.desc)}</p>` : ''}
    </div>`;
}

function youtubeEmbed(url) {
    try {
        const u = new URL(url);
        const id = u.searchParams.get('v') || u.pathname.split('/').pop();
        return `https://www.youtube.com/embed/${id}`;
    } catch {
        return url;
    }
}

function escHtml(t) {
    return String(t)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Agregar clip ───────────────────────────────────────────────────────────────
async function agregarClip() {
    const titulo = document.getElementById('clipTitulo').value.trim();
    const fecha  = document.getElementById('clipFecha').value.trim();
    const desc   = document.getElementById('clipDesc').value.trim();
    const tipo   = document.querySelector('input[name="clipTipo"]:checked').value;
    const url    = document.getElementById('clipUrl').value.trim();
    const file   = document.getElementById('clipFile').files[0];
    const errEl  = document.getElementById('clipError');
    const btn    = document.getElementById('btnAddClip');

    errEl.classList.add('hidden');

    if (tipo === 'url' && !url) { showClipErr('Ingresa una URL de YouTube.'); return; }
    if (tipo === 'video' && !file) { showClipErr('Selecciona un archivo de video.'); return; }

    btn.disabled = true;
    btn.textContent = 'Subiendo...';

    try {
        let body = { titulo, fecha, desc, tipo };
        if (tipo === 'url') {
            body.url = url;
        } else {
            body.data = await fileToBase64(file);
        }
        const res = await apiFetch('/api/clips', { method: 'POST', body: JSON.stringify(body) });
        if (!res) { showClipErr('Error al subir el clip.'); return; }

        // Limpiar form
        document.getElementById('clipTitulo').value = '';
        document.getElementById('clipFecha').value  = '';
        document.getElementById('clipDesc').value   = '';
        document.getElementById('clipUrl').value    = '';
        document.getElementById('clipFile').value   = '';
        document.getElementById('clipFileName').textContent = '';

        await cargarClips();
    } catch (e) {
        showClipErr(e.message || 'Error al subir el clip.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Agregar 🎮';
    }
}

async function eliminarClip(id) {
    if (!confirm('¿Eliminar este clip?')) return;
    await apiFetch(`/api/clips/${id}`, { method: 'DELETE' });
    await cargarClips();
}

function showClipErr(msg) {
    const el = document.getElementById('clipError');
    el.textContent = msg;
    el.classList.remove('hidden');
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Error al leer el archivo'));
        reader.readAsDataURL(file);
    });
}

document.addEventListener('DOMContentLoaded', cargarClips);
