require('dotenv').config();
const express   = require('express');
const mongoose  = require('mongoose');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.FRONTEND_URL || '')
    .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
    origin: (origin, cb) => {
        if (!origin && process.env.NODE_ENV !== 'production') return cb(null, true);
        if (allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error('CORS: origen no permitido'));
    }
}));

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
    autor: { type: String, required: true, maxlength: 30 },
    texto: { type: String, required: true, maxlength: 500 },
    fecha: { type: Date, default: Date.now }
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

app.get('/api/messages', auth, async (_req, res) => {
    try {
        const messages = await Message.find().sort({ fecha: 1 }).limit(500);
        res.json(messages);
    } catch {
        res.status(500).json({ error: 'Error al obtener mensajes' });
    }
});

app.post('/api/messages', auth, async (req, res) => {
    try {
        const texto = req.body.texto?.trim();
        if (!texto || texto.length > 500) return res.status(400).json({ error: 'Mensaje inválido' });
        const msg = await new Message({ autor: req.user.username, texto }).save();
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


const app = express();

// ── CORS ─────────────────────────────────────────────────────────────────────
// Configura FRONTEND_URL en tus variables de entorno en Render/Railway
// Ejemplo: FRONTEND_URL=https://ianba.github.io,https://ianba.github.io/adios
const allowedOrigins = (process.env.FRONTEND_URL || '')
    .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
    origin: (origin, cb) => {
        // Permitir peticiones sin origin (apps de escritorio, Postman) solo en dev
        if (!origin && process.env.NODE_ENV !== 'production') return cb(null, true);
        if (allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error('CORS: origen no permitido'));
    }
}));

app.use(express.json({ limit: '10kb' }));

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
    autor:  { type: String, required: true, maxlength: 30 },
    texto:  { type: String, required: true, maxlength: 500 },
    fecha:  { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

// ── Middleware de autenticación ───────────────────────────────────────────────
function auth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No autorizado' });
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Token inválido o expirado' });
    }
}

// ── Rutas ─────────────────────────────────────────────────────────────────────

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password)
            return res.status(400).json({ error: 'Faltan campos' });

        const user = await User.findOne({ username: username.trim().toLowerCase() });
        if (!user || !(await bcrypt.compare(password, user.password)))
            return res.status(401).json({ error: 'Credenciales incorrectas' });

        const token = jwt.sign(
            { username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        res.json({ token, username: user.username });
    } catch {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Obtener mensajes
app.get('/api/messages', auth, async (_req, res) => {
    try {
        const messages = await Message.find().sort({ fecha: 1 }).limit(500);
        res.json(messages);
    } catch {
        res.status(500).json({ error: 'Error al obtener mensajes' });
    }
});

// Crear mensaje
app.post('/api/messages', auth, async (req, res) => {
    try {
        const texto = req.body.texto?.trim();
        if (!texto || texto.length > 500)
            return res.status(400).json({ error: 'Mensaje inválido' });
        const msg = await new Message({ autor: req.user.username, texto }).save();
        res.status(201).json(msg);
    } catch {
        res.status(500).json({ error: 'Error al guardar mensaje' });
    }
});

// Borrar mensaje (solo el autor puede borrar el suyo)
app.delete('/api/messages/:id', auth, async (req, res) => {
    try {
        const msg = await Message.findById(req.params.id);
        if (!msg) return res.status(404).json({ error: 'Mensaje no encontrado' });
        if (msg.autor !== req.user.username)
            return res.status(403).json({ error: 'No puedes borrar este mensaje' });
        await msg.deleteOne();
        res.json({ ok: true });
    } catch {
        res.status(500).json({ error: 'Error al borrar' });
    }
});

// Setup: crear/actualizar usuarios (protegido con SETUP_KEY)
// Llama esto UNA VEZ después de desplegar con:
// POST /api/setup  { "setupKey": "TU_SETUP_KEY", "users": [{"username":"ianba","password":"xxx"}, {"username":"amiga","password":"yyy"}] }
app.post('/api/setup', async (req, res) => {
    try {
        const { setupKey, users } = req.body;
        if (!setupKey || setupKey !== process.env.SETUP_KEY)
            return res.status(403).json({ error: 'Clave incorrecta' });
        if (!Array.isArray(users) || users.length === 0)
            return res.status(400).json({ error: 'Lista de usuarios vacía' });

        const created = [];
        for (const u of users) {
            if (!u.username || !u.password) continue;
            const hash = await bcrypt.hash(u.password, 12);
            await User.updateOne(
                { username: u.username.trim().toLowerCase() },
                { $set: { password: hash } },
                { upsert: true }
            );
            created.push(u.username.trim().toLowerCase());
        }
        res.json({ ok: true, created });
    } catch {
        res.status(500).json({ error: 'Error en setup' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
