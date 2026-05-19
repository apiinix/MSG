require('dotenv').config();
const express   = require('express');
const mongoose  = require('mongoose');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors());

app.use(express.json({ limit: '10kb' }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados intentos. Espera 15 minutos.' }
});

// ── MongoDB ───────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB conectado'))
    .catch(err => { console.error('❌ MongoDB error:', err); process.exit(1); });

// ── Schemas ───────────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, maxlength: 30 },
    password: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

const messageSchema = new mongoose.Schema({
    autor:     { type: String, required: true, maxlength: 30 },
    tipo:      { type: String, enum: ['texto', 'imagen', 'video', 'audio', 'sticker'], default: 'texto' },
    texto:     { type: String, maxlength: 2000 },
    contenido: { type: String },   // base64 data-URL para media
    fecha:     { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

// ── Middlewares de auth ───────────────────────────────────────────────────────
function auth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No autorizado' });
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        // Evitar que tokens de admin accedan a rutas de usuario
        if (payload.role === 'admin') return res.status(403).json({ error: 'Ruta solo para usuarios' });
        req.user = payload;
        next();
    } catch {
        res.status(401).json({ error: 'Token inválido o expirado' });
    }
}

function adminAuth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No autorizado' });
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        if (payload.role !== 'admin') return res.status(403).json({ error: 'Acceso denegado' });
        req.user = payload;
        next();
    } catch {
        res.status(401).json({ error: 'Token inválido o expirado' });
    }
}

// ── Rutas de usuario ──────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Faltan campos' });
        const user = await User.findOne({ username: username.trim().toLowerCase() });
        if (!user || !(await bcrypt.compare(password, user.password)))
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        const token = jwt.sign({ username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, username: user.username });
    } catch {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

app.get('/api/messages', auth, async (req, res) => {
    try {
        const filter = {};
        if (req.query.after && mongoose.isValidObjectId(req.query.after)) {
            filter._id = { $gt: new mongoose.Types.ObjectId(req.query.after) };
        }
        const messages = await Message.find(filter).sort({ fecha: 1 }).limit(500);
        res.json(messages);
    } catch {
        res.status(500).json({ error: 'Error al obtener mensajes' });
    }
});

app.post('/api/messages', auth, async (req, res) => {
    try {
        const { tipo = 'texto', texto, contenido } = req.body;
        const validTipos = ['texto', 'imagen', 'video', 'audio', 'sticker'];
        if (!validTipos.includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });

        if (tipo === 'texto' || tipo === 'sticker') {
            const t = typeof texto === 'string' ? texto.trim() : '';
            if (!t || t.length > 2000) return res.status(400).json({ error: 'Mensaje inválido' });
            const msg = await new Message({ autor: req.user.username, tipo, texto: t }).save();
            return res.status(201).json(msg);
        }

        // Media: imagen, video, audio
        if (typeof contenido !== 'string' || !contenido.startsWith('data:')) {
            return res.status(400).json({ error: 'Contenido inválido' });
        }
        const sizeLimits = { imagen: 4_200_000, video: 9_500_000, audio: 2_800_000 };
        if (contenido.length > sizeLimits[tipo]) {
            return res.status(413).json({ error: 'Archivo demasiado grande' });
        }
        const msg = await new Message({ autor: req.user.username, tipo, contenido }).save();
        res.status(201).json(msg);
    } catch {
        res.status(500).json({ error: 'Error al guardar mensaje' });
    }
});

app.delete('/api/messages/:id', auth, async (req, res) => {
    try {
        const msg = await Message.findById(req.params.id);
        if (!msg) return res.status(404).json({ error: 'Mensaje no encontrado' });
        if (msg.autor !== req.user.username) return res.status(403).json({ error: 'No puedes borrar este mensaje' });
        await msg.deleteOne();
        res.json({ ok: true });
    } catch {
        res.status(500).json({ error: 'Error al borrar' });
    }
});

// ── Rutas de admin ────────────────────────────────────────────────────────────
// ADMIN_PASSWORD se define SOLO en variables de entorno del servidor (nunca en el código)

app.post('/api/admin/login', loginLimiter, (req, res) => {
    const { password } = req.body;
    if (!password || password !== process.env.ADMIN_PASSWORD)
        return res.status(401).json({ error: 'Contraseña incorrecta' });
    // Token de admin dura 2 horas (más corto por seguridad)
    const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '2h' });
    res.json({ token });
});

app.get('/api/admin/users', adminAuth, async (_req, res) => {
    try {
        const users = await User.find({}, { username: 1, _id: 1 }).sort({ username: 1 });
        res.json(users);
    } catch {
        res.status(500).json({ error: 'Error al obtener usuarios' });
    }
});

app.post('/api/admin/users', adminAuth, async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password || username.length > 30 || password.length < 6)
            return res.status(400).json({ error: 'Datos inválidos (contraseña mínimo 6 caracteres)' });
        const exists = await User.findOne({ username: username.trim().toLowerCase() });
        if (exists) return res.status(409).json({ error: 'El usuario ya existe' });
        const hash = await bcrypt.hash(password, 12);
        const user = await new User({ username: username.trim().toLowerCase(), password: hash }).save();
        res.status(201).json({ _id: user._id, username: user.username });
    } catch {
        res.status(500).json({ error: 'Error al crear usuario' });
    }
});

app.put('/api/admin/users/:id/password', adminAuth, async (req, res) => {
    try {
        const { password } = req.body;
        if (!password || password.length < 6)
            return res.status(400).json({ error: 'Contraseña mínimo 6 caracteres' });
        const hash = await bcrypt.hash(password, 12);
        const user = await User.findByIdAndUpdate(req.params.id, { password: hash }, { new: true });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json({ ok: true });
    } catch {
        res.status(500).json({ error: 'Error al cambiar contraseña' });
    }
});

app.delete('/api/admin/users/:id', adminAuth, async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json({ ok: true });
    } catch {
        res.status(500).json({ error: 'Error al borrar' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
