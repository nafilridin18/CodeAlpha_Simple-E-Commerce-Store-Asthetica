require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const db = require('./config/db');

const app = express();
const PROD = process.env.NODE_ENV === 'production';
const FRONT = path.join(__dirname, '..', 'Frontend');
const UPLOADS = path.join(__dirname, 'uploads');

// প্রয়োজনীয় আপলোড ফোল্ডারগুলো তৈরি করে নেওয়া (logo ও banners সহ)
fs.mkdirSync(UPLOADS, { recursive: true });
fs.mkdirSync(path.join(UPLOADS, 'logo'), { recursive: true });
fs.mkdirSync(path.join(UPLOADS, 'banners'), { recursive: true });

app.disable('x-powered-by');
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});
try { app.use(require('compression')()); } catch { /* optional: npm i compression for gzip */ }
app.use(cors());

// Image uploads (base64) need a bigger body — only for logged-in admins, and registered BEFORE the small global limit
app.use('/api/admin/upload', require('./middlewares/auth').verifyAdmin, express.json({ limit: '9mb' }));
app.use(express.json({ limit: '200kb' }));

// API Routes
app.use('/api/user', require('./routes/userRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

// নতুন যুক্ত করা ব্যানার ও সেটিংস রাউট
const bannerRoutes = require('./routes/bannerRoutes');
app.use('/api/banners', bannerRoutes);

app.get('/api/health', async (req, res) => {
    try { await db.query('SELECT 1'); res.json({ success: true, message: 'Server and database are running.' }); }
    catch (e) { res.status(503).json({ success: false, message: 'Database is not reachable: ' + e.message }); }
});
app.use('/api', (req, res) => res.status(404).json({ success: false, message: 'API route not found.' }));

// Website: shop at "/", admin panel at "/admin"
const maxAge = PROD ? '7d' : 0;
app.use('/assets', express.static(path.join(FRONT, 'assets'), { maxAge: '30d', immutable: true }));
app.use('/uploads', express.static(UPLOADS, { maxAge: '30d', immutable: true }));
app.use('/admin', express.static(path.join(FRONT, 'admin'), { maxAge }));
app.use(express.static(path.join(FRONT, 'user'), { maxAge }));

// Errors
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    if (err.type === 'entity.parse.failed') return res.status(400).json({ success: false, message: 'Invalid request data.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ success: false, message: 'The request is too large.' });
    if (err.code === 'ER_DUP_ENTRY') {
        const key = (/for key '(?:[^.']+\.)?([^']+)'/.exec(err.sqlMessage || '') || [])[1] || 'value';
        return res.status(409).json({ success: false, message: `That ${key.replace(/_/g, ' ')} is already in use.` });
    }
    if (err.code === 'ER_ROW_IS_REFERENCED_2') return res.status(409).json({ success: false, message: 'This item is in use elsewhere and cannot be deleted.' });
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ success: false, message: status >= 500 && PROD ? 'Something went wrong on our side.' : err.message });
});

const PORT = Number(process.env.PORT) || 5000;
const MAX_PORT = PORT === 5000 ? 5009 : PORT;

function listen(port) {
    const server = app.listen(port, () => {
        console.log(`🚀 Shop:   http://localhost:${port}`);
        console.log(`🛠  Admin:  http://localhost:${port}/admin/login.html`);
        db.query('SELECT 1')
            .then(() => console.log('✅ MySQL connected'))
            .catch((e) => console.error(`❌ MySQL connection failed: ${e.message}\n   Check XAMPP MySQL is running and DB_PORT / DB_PASSWORD in Backend/.env, then run: npm run setup`));
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && port < MAX_PORT) {
            console.warn(`Port ${port} is already in use; trying ${port + 1}.`);
            listen(port + 1);
            return;
        }
        console.error(`Could not start the server on port ${port}: ${err.message}`);
        process.exitCode = 1;
    });
}

listen(PORT);