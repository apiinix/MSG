'use strict';

// Aplica data-theme inmediatamente para evitar parpadeo
(function () {
    document.documentElement.setAttribute(
        'data-theme', localStorage.getItem('theme') || 'ocean'
    );
})();

// ── Emojis flotantes por tema ─────────────────────────────────────────────────
const FLOATERS = {
    ocean: ['🌊', '🐚', '🐠', '💙', '⭐', '🌙', '🦋', '🐋'],
    pink:  ['💖', '🌸', '✨', '💕', '🌺', '💗', '⭐', '🌷']
};

// ── Estilos del botón (inyectados para no necesitar otro CSS) ─────────────────
(function injectStyles() {
    const s = document.createElement('style');
    s.textContent = `
        .theme-toggle {
            position: fixed;
            bottom: 22px; right: 22px;
            z-index: 9999;
            width: 46px; height: 46px;
            border-radius: 50%;
            border: 2px solid rgba(255,255,255,0.75);
            background: rgba(255,255,255,0.88);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            font-size: 1.35rem;
            cursor: pointer;
            box-shadow: 0 4px 18px rgba(0,0,0,0.13);
            transition: transform 0.2s, box-shadow 0.2s;
            display: flex; align-items: center; justify-content: center;
            line-height: 1;
        }
        .theme-toggle:hover  { transform: scale(1.12); box-shadow: 0 6px 22px rgba(0,0,0,0.18); }
        .theme-toggle:active { transform: scale(0.92); }
    `;
    document.head.appendChild(s);
})();

// ── Aplicar tema ──────────────────────────────────────────────────────────────
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);

    // Emojis flotantes
    const spans = document.querySelectorAll('.hearts span, .bg-hearts span');
    const list  = FLOATERS[theme] || FLOATERS.pink;
    spans.forEach((el, i) => { if (list[i] !== undefined) el.textContent = list[i]; });

    // Icono de login si existe
    const loginIcon = document.querySelector('.login-icon');
    if (loginIcon) loginIcon.textContent = theme === 'ocean' ? '🌊' : '🌸';

    // Actualizar botón
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) {
        btn.textContent = theme === 'ocean' ? '🌸' : '🌊';
        btn.title = theme === 'ocean'
            ? 'Cambiar a tema rosa 🌸'
            : 'Cambiar a tema océano 🌊';
    }
}

// ── Toggle ────────────────────────────────────────────────────────────────────
function toggleTheme() {
    const next = (localStorage.getItem('theme') || 'pink') === 'ocean' ? 'pink' : 'ocean';
    localStorage.setItem('theme', next);
    applyTheme(next);
}

// ── Inicializar (crear botón + aplicar tema) ──────────────────────────────────
function initTheme() {
    const btn = document.createElement('button');
    btn.id        = 'theme-toggle-btn';
    btn.className = 'theme-toggle';
    btn.onclick   = toggleTheme;
    document.body.appendChild(btn);
    applyTheme(localStorage.getItem('theme') || 'pink');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTheme);
} else {
    initTheme();
}
