const { AppError, int } = require('./helpers');

// Cleans the cart sent by the browser: integers only, sane quantities, duplicate lines merged.
module.exports = function normalizeItems(raw) {
    if (!Array.isArray(raw) || !raw.length) throw new AppError('Your cart is empty.');
    if (raw.length > 50) throw new AppError('Too many items in one order.');
    const map = new Map();
    for (const r of raw) {
        const product_id = int(r?.product_id), variant_id = int(r?.variant_id) || null;
        const quantity = Math.min(Math.max(int(r?.quantity, 1), 1), 99);
        if (!product_id) continue;
        const key = `${product_id}:${variant_id || 0}`;
        if (map.has(key)) map.get(key).quantity = Math.min(map.get(key).quantity + quantity, 99);
        else map.set(key, { product_id, variant_id, quantity });
    }
    if (!map.size) throw new AppError('Your cart is empty.');
    return [...map.values()];
};
