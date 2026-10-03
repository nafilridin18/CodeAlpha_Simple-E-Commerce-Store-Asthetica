const db = require('../config/db');

class AppError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const ok = (res, data = {}, message, status = 200) => res.status(status).json({ success: true, message, data });

const str = (v, max = 255) => (v == null ? '' : String(v).trim().slice(0, max));
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const round2 = (n) => Math.round(Number(n) * 100) / 100;
const bool = (v) => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0);
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
const isPhone = (s) => /^\+?[0-9][0-9\s-]{6,17}$/.test(s);
const cleanPhone = (s) => String(s).replace(/[\s-]/g, '');
const last10 = (s) => String(s).replace(/\D/g, '').slice(-10);
const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

const paging = (q, def = 12, max = 50) => {
    const limit = Math.min(Math.max(int(q.limit, def), 1), max);
    const page = Math.max(int(q.page, 1), 1);
    return { page, limit, offset: (page - 1) * limit };
};
const pageMeta = (total, p) => ({ total, page: p.page, pages: Math.max(Math.ceil(total / p.limit), 1) });

// Unique slug/sku helper: tries "base", then "base-123" ...
async function unique(conn, table, column, base, make) {
    let value = base;
    for (let i = 0; i < 8; i++) {
        const [r] = await conn.query(`SELECT 1 FROM ${table} WHERE ${column} = ? LIMIT 1`, [value]);
        if (!r.length) return value;
        value = make ? make() : `${base}-${Math.floor(100 + Math.random() * 900)}`;
    }
    return `${base}-${Date.now().toString(36)}`;
}

async function logActivity(req, action, entityType, entityId, details) {
    try {
        await db.query(
            'INSERT INTO activity_logs (admin_id, action, entity_type, entity_id, ip_address, details) VALUES (?,?,?,?,?,?)',
            [req.admin?.id || null, action, entityType || null, entityId || null, req.ip, details ? JSON.stringify(details) : null]
        );
    } catch (e) { console.error('activity log failed:', e.message); }
}

module.exports = { AppError, wrap, ok, str, num, int, round2, bool, isEmail, isPhone, cleanPhone, last10, slugify, paging, pageMeta, unique, logActivity };
