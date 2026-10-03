const Order = require('../../models/Order');
const normalizeItems = require('../../utils/cart');
const { wrap, ok } = require('../../utils/helpers');

// Re-prices the browser's cart using live database prices and stock
exports.validate = wrap(async (req, res) => {
    const items = normalizeItems(req.body.items);
    const { lines, subtotal } = await Order.quote(items);
    ok(res, { lines, subtotal });
});
