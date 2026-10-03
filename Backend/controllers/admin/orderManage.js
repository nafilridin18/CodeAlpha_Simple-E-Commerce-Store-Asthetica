const Order = require('../../models/Order');
const { AppError, wrap, ok, str, int, paging, logActivity } = require('../../utils/helpers');

exports.getAllOrders = wrap(async (req, res) => {
    ok(res, await Order.adminList({ status: str(req.query.status, 80), search: str(req.query.q, 60), paging: paging(req.query, 15, 100) }));
});

exports.getOrder = wrap(async (req, res) => {
    const o = await Order.adminGet(int(req.params.id));
    if (!o) throw new AppError('Order not found.', 404);
    ok(res, o);
});

exports.updateStatus = wrap(async (req, res) => {
    const b = req.body || {}, id = int(req.params.id);
    const r = await Order.updateStatus(id, {
        status: str(b.status, 20) || undefined, payment_status: str(b.payment_status, 20) || undefined,
        courier_name: b.courier_name === undefined ? undefined : str(b.courier_name, 50),
        courier_tracking_id: b.courier_tracking_id === undefined ? undefined : str(b.courier_tracking_id, 100),
        admin_note: b.admin_note === undefined ? undefined : str(b.admin_note, 500),
        is_flagged_spam: b.is_flagged_spam
    });
    logActivity(req, 'order.update', 'order', id, r);
    ok(res, r, 'Order updated.');
});
