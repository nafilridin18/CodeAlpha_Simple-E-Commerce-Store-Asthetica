// Tiny in-memory limiter (per IP). Good enough for one server; use Redis if you scale out.
module.exports = ({ windowMs = 60000, max = 10, message = 'Too many attempts. Please wait a minute and try again.' } = {}) => {
    const hits = new Map();
    setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, windowMs).unref();
    return (req, res, next) => {
        const now = Date.now();
        let h = hits.get(req.ip);
        if (!h || h.reset < now) { h = { count: 0, reset: now + windowMs }; hits.set(req.ip, h); }
        if (++h.count > max) return res.status(429).json({ success: false, message });
        next();
    };
};
