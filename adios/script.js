function mostrarSecreto() {
    var secretoDiv = document.getElementById("secreto");
    if (secretoDiv.style.display === "none" || secretoDiv.style.display === "") {
        secretoDiv.style.display = "block";
    } else {
        secretoDiv.style.display = "none";
    }
}

// ===== MENSAJES =====

function escapeHtml(text) {
    return text
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
    cargarMensajes();
    // Refrescar mensajes cada 30 segundos
    setInterval(cargarMensajes, 30000);
});
