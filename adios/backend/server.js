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

app.use(express.json({ limit: '20mb' }));

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

const settingsSchema = new mongoose.Schema({
    key:   { type: String, required: true, unique: true },
    value: mongoose.Schema.Types.Mixed
});
const Settings = mongoose.model('Settings', settingsSchema);

const sessionLogSchema = new mongoose.Schema({
    username: { type: String, required: true },
    ip:       { type: String },
    date:     { type: Date, default: Date.now }
});
const SessionLog = mongoose.model('SessionLog', sessionLogSchema);

const clipSchema = new mongoose.Schema({
    titulo:    { type: String, maxlength: 100 },
    fecha:     { type: String, maxlength: 30 },
    desc:      { type: String, maxlength: 500 },
    tipo:      { type: String, enum: ['url', 'video'], default: 'url' },
    url:       { type: String },
    data:      { type: String },
    orden:     { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});
const Clip = mongoose.model('Clip', clipSchema);

const photoSchema = new mongoose.Schema({
    data:    { type: String, required: true },
    caption: { type: String, maxlength: 200 },
    orden:   { type: Number, default: 0 },
    fecha:   { type: Date, default: Date.now }
});
const Photo = mongoose.model('Photo', photoSchema);

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
        const ip = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
        SessionLog.create({ username: user.username, ip }).catch(() => {});
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
        const sizeLimits = { imagen: 8_000_000, video: 14_000_000, audio: 6_000_000 };
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

// ── Rutas públicas de settings ────────────────────────────────────────────────
app.get('/api/settings', async (_req, res) => {
    try {
        const [carta, frases] = await Promise.all([
            Settings.findOne({ key: 'carta' }),
            Settings.findOne({ key: 'frases' })
        ]);
        res.json({
            carta:  carta?.value  || '¡Hola! Hice esta pequeña página para recordarte lo importante que eres en mi vida. Gracias por estar siempre ahí, por cada risa, cada consejo y por los momentos tan bonitos que pasamos juntas. ¡Te quiero muchísimo!',
            frases: frases?.value || [
                'Eres una persona increíble, valiente y divertida. El mundo es mucho más bonito contigo en él. ¡Nunca cambies tu forma de ser!',
                'Cada día que pasa me alegra más tenerte en mi vida. Eres luz pura. 💛',
                'Tu sonrisa tiene el poder de arreglar cualquier día difícil. No la pierdas nunca.',
                'Eres más fuerte de lo que crees, más inteligente de lo que imaginas y más amada de lo que sabes.',
                'Gracias por existir y por ser exactamente como eres. El universo tuvo muy buen gusto contigo. ✨'
            ]
        });
    } catch { res.status(500).json({ error: 'Error' }); }
});

app.put('/api/admin/settings', adminAuth, async (req, res) => {
    try {
        const { carta, frases } = req.body;
        if (carta !== undefined) {
            await Settings.findOneAndUpdate({ key: 'carta' }, { value: carta }, { upsert: true, new: true });
        }
        if (frases !== undefined) {
            if (!Array.isArray(frases)) return res.status(400).json({ error: 'frases debe ser array' });
            await Settings.findOneAndUpdate({ key: 'frases' }, { value: frases }, { upsert: true, new: true });
        }
        res.json({ ok: true });
    } catch { res.status(500).json({ error: 'Error al guardar' }); }
});

// ── Historial de sesiones ─────────────────────────────────────────────────────
app.get('/api/admin/sessions', adminAuth, async (_req, res) => {
    try {
        const logs = await SessionLog.find().sort({ date: -1 }).limit(200);
        res.json(logs);
    } catch { res.status(500).json({ error: 'Error' }); }
});

// ── Clips ─────────────────────────────────────────────────────────────────────
app.get('/api/clips', auth, async (_req, res) => {
    try {
        const clips = await Clip.find().sort({ orden: 1, createdAt: 1 });
        res.json(clips);
    } catch { res.status(500).json({ error: 'Error' }); }
});

app.post('/api/clips', auth, async (req, res) => {
    try {
        const { titulo, fecha, desc, tipo, url, data } = req.body;
        if (tipo === 'video' && data && data.length > 14_000_000)
            return res.status(413).json({ error: 'Video demasiado grande (máx ~10MB)' });
        const count = await Clip.countDocuments();
        const clip = await new Clip({ titulo, fecha, desc, tipo: tipo || 'url', url, data, orden: count }).save();
        res.status(201).json(clip);
    } catch { res.status(500).json({ error: 'Error al guardar clip' }); }
});

app.delete('/api/clips/:id', auth, async (req, res) => {
    try {
        await Clip.findByIdAndDelete(req.params.id);
        res.json({ ok: true });
    } catch { res.status(500).json({ error: 'Error' }); }
});

// ── Fotos de recuerdos ────────────────────────────────────────────────────────
app.get('/api/photos', auth, async (_req, res) => {
    try {
        const photos = await Photo.find().sort({ orden: 1, fecha: 1 });
        res.json(photos);
    } catch { res.status(500).json({ error: 'Error' }); }
});

app.post('/api/photos', auth, async (req, res) => {
    try {
        const { data, caption } = req.body;
        if (!data || !data.startsWith('data:image/'))
            return res.status(400).json({ error: 'Imagen inválida' });
        if (data.length > 8_000_000)
            return res.status(413).json({ error: 'Imagen demasiado grande (máx ~6MB)' });
        const count = await Photo.countDocuments();
        const photo = await new Photo({ data, caption, orden: count }).save();
        res.status(201).json(photo);
    } catch { res.status(500).json({ error: 'Error al guardar foto' }); }
});

app.delete('/api/photos/:id', auth, async (req, res) => {
    try {
        await Photo.findByIdAndDelete(req.params.id);
        res.json({ ok: true });
    } catch { res.status(500).json({ error: 'Error' }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
