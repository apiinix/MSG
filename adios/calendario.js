'use strict';

// ── Estado ────────────────────────────────────────────────────────────────────
let _eventos       = [];   // todos los eventos del servidor
let _weekStart     = null; // Date: lunes de la semana visible
let _fechaModal    = null; // YYYY-MM-DD del día que se está editando

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

// ── Inicialización ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const username = localStorage.getItem('username');
    const welcomeEl = document.getElementById('welcomeUser');
    if (welcomeEl && username) welcomeEl.textContent = `Hola, ${username} 🌸`;

    _weekStart = lunesDe(new Date());
    cargarEventos();
});

// ── Navegación semanal ────────────────────────────────────────────────────────
function cambiarSemana(dir) {
    _weekStart = new Date(_weekStart);
    _weekStart.setDate(_weekStart.getDate() + dir * 7);
    renderSemana();
}

function lunesDe(fecha) {
    const d  = new Date(fecha);
    const day = d.getDay(); // 0=dom, 1=lun...
    const diff = (day === 0) ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function isoFecha(d) {
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const dd   = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// ── Carga y render ────────────────────────────────────────────────────────────
async function cargarEventos() {
    try {
        const ctrl  = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 10000);
        const res   = await fetch(`${API_URL}/api/calendar`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            signal: ctrl.signal
        });
        clearTimeout(timer);
        if (res.status === 401) { logout(); return; }
        _eventos = res.ok ? await res.json() : [];
    } catch {
        _eventos = [];
    }
    renderSemana();
}

function renderSemana() {
    const grid  = document.getElementById('calGrid');
    const label = document.getElementById('weekLabel');

    // Calcular los 7 días
    const dias = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(_weekStart);
        d.setDate(d.getDate() + i);
        dias.push(d);
    }

    // Label de semana
    const inicio = dias[0];
    const fin    = dias[6];
    if (inicio.getMonth() === fin.getMonth()) {
        label.textContent = `${inicio.getDate()} – ${fin.getDate()} de ${MESES[inicio.getMonth()]} ${inicio.getFullYear()}`;
    } else {
        label.textContent = `${inicio.getDate()} ${MESES[inicio.getMonth()]} – ${fin.getDate()} ${MESES[fin.getMonth()]} ${fin.getFullYear()}`;
    }

    // Hoy
    const hoyISO = isoFecha(new Date());

    // Render columnas
    grid.innerHTML = dias.map(d => {
        const iso   = isoFecha(d);
        const evs   = _eventos.filter(e => e.fecha === iso);
        const esHoy = iso === hoyISO;

        const evHTML = evs.length
            ? evs.map(e => `
                <div class="cal-event" style="border-left-color:${escHtml(e.color || '#e91e8c')}">
                    <span class="ev-titulo">${escHtml(e.titulo)}</span>
                    ${e.desc ? `<span class="ev-desc">${escHtml(e.desc)}</span>` : ''}
                    <span class="ev-autor">por ${escHtml(e.creadoPor || '?')}</span>
                    <button class="ev-del" onclick="eliminarEvento('${e._id}',event)" title="Eliminar">✕</button>
                </div>`).join('')
            : '<p class="cal-empty">Sin planes ✨</p>';

        return `
            <div class="cal-day${esHoy ? ' today' : ''}" onclick="abrirModal('${iso}', '${DIAS[d.getDay() === 0 ? 6 : d.getDay() - 1]}', ${d.getDate()})">
                <div class="cal-day-header">
                    <span class="day-name">${DIAS[d.getDay() === 0 ? 6 : d.getDay() - 1]}</span>
                    <span class="day-num${esHoy ? ' today-num' : ''}">${d.getDate()}</span>
                </div>
                <div class="cal-events" onclick="event.stopPropagation()">${evHTML}</div>
                <button class="add-ev-btn" onclick="event.stopPropagation(); abrirModal('${iso}', '${DIAS[d.getDay() === 0 ? 6 : d.getDay() - 1]}', ${d.getDate()})">+ agregar</button>
            </div>`;
    }).join('');
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function abrirModal(iso, nombreDia, numDia) {
    _fechaModal = iso;
    document.getElementById('modalTitle').textContent  = `Agregar plan`;
    document.getElementById('modalDate').textContent   = `${nombreDia} ${numDia}`;
    document.getElementById('evTitulo').value          = '';
    document.getElementById('evDesc').value            = '';
    document.getElementById('evError').textContent     = '';
    document.querySelector('input[name="evColor"][value="#e91e8c"]').checked = true;
    document.getElementById('modalOverlay').classList.add('open');
    setTimeout(() => document.getElementById('evTitulo').focus(), 50);
}

function cerrarModal(e) {
    if (e && e.target !== document.getElementById('modalOverlay')) return;
    document.getElementById('modalOverlay').classList.remove('open');
    _fechaModal = null;
}

async function guardarEvento() {
    const titulo = document.getElementById('evTitulo').value.trim();
    const desc   = document.getElementById('evDesc').value.trim();
    const color  = document.querySelector('input[name="evColor"]:checked')?.value || '#e91e8c';
    const errEl  = document.getElementById('evError');

    if (!titulo) { errEl.textContent = 'Escribe un título para el plan.'; return; }
    if (!_fechaModal) return;

    errEl.textContent = '';
    const btn = document.querySelector('.btn-save');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    try {
        const res = await fetch(`${API_URL}/api/calendar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ titulo, fecha: _fechaModal, desc, color })
        });
        if (res.status === 401) { logout(); return; }
        if (!res.ok) { errEl.textContent = 'Error al guardar. Intenta de nuevo.'; return; }
        const ev = await res.json();
        _eventos.push(ev);
        document.getElementById('modalOverlay').classList.remove('open');
        _fechaModal = null;
        renderSemana();
    } catch {
        errEl.textContent = 'Error de conexión.';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Agregar 💌';
    }
}

async function eliminarEvento(id, e) {
    if (e) e.stopPropagation();
    if (!confirm('¿Eliminar este plan? 🗑')) return;
    try {
        const res = await fetch(`${API_URL}/api/calendar/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (res.status === 401) { logout(); return; }
        _eventos = _eventos.filter(ev => ev._id !== id);
        renderSemana();
    } catch { /* silent */ }
}

// ── Util ──────────────────────────────────────────────────────────────────────
function escHtml(t) {
    return String(t)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
