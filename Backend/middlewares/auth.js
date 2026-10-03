const jwt = require('jsonwebtoken');
const crypto = require('crypto');
require('dotenv').config();

let SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 16) {
    SECRET = crypto.randomBytes(32).toString('hex');
    console.warn('⚠️  JWT_SECRET missing/too short in .env — using a temporary one (everyone is logged out on restart).');
}

const tokenOf = (req) => {
    const h = req.headers.authorization || '';
    return h.startsWith('Bearer ') ? h.slice(7) : null;
};

// `type` is stored inside the token so a customer token can NEVER open admin routes.
exports.signCustomer = (c) => jwt.sign({ id: c.id, type: 'customer' }, SECRET, { expiresIn: '7d' });
exports.signAdmin = (a) => jwt.sign({ id: a.id, role_id: a.role_id, type: 'admin' }, SECRET, { expiresIn: '12h' });

const guard = (type, key) => (req, res, next) => {
    const token = tokenOf(req);
    if (!token) return res.status(401).json({ success: false, message: 'Please log in to continue.' });
    try {
        const d = jwt.verify(token, SECRET);
        if (d.type !== type) return res.status(403).json({ success: false, message: 'You do not have access to this area.' });
        req[key] = d;
        next();
    } catch {
        res.status(401).json({ success: false, message: 'Your session has expired. Please log in again.' });
    }
};

exports.verifyCustomer = guard('customer', 'customer');
exports.verifyAdmin = guard('admin', 'admin');

// Guests may continue; logged-in customers get req.customer
exports.optionalCustomer = (req, res, next) => {
    const token = tokenOf(req);
    if (token) {
        try { const d = jwt.verify(token, SECRET); if (d.type === 'customer') req.customer = d; } catch { /* treat as guest */ }
    }
    next();
};
