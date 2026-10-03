const Order = require('../../models/Order');
const User = require('../../models/User');
const normalizeItems = require('../../utils/cart');
const { AppError, wrap, ok, str, int, isEmail, isPhone, cleanPhone } = require('../../utils/helpers');

exports.placeOrder = wrap(async (req, res) => {
    const b = req.body || {};
    const items = normalizeItems(b.items);
    const body = {
        shipping_name: str(b.shipping_name, 100), shipping_phone: cleanPhone(str(b.shipping_phone, 20)),
        shipping_address: str(b.shipping_address, 255), shipping_area_id: int(b.shipping_area_id),
        email: str(b.email, 150).toLowerCase(), customer_note: str(b.customer_note, 500), coupon_code: str(b.coupon_code, 50)
    };
    if (body.shipping_name.length < 2) throw new AppError('Please enter your full name.');
    if (!isPhone(body.shipping_phone)) throw new AppError('Please enter a valid phone number.');
    if (body.shipping_address.length < 8) throw new AppError('Please enter your full delivery address.');
    if (!body.shipping_area_id) throw new AppError('Please choose a delivery area.');
    if (body.email && !isEmail(body.email)) throw new AppError('Please enter a valid email address.');

    // The customer comes from the login token — never from the request body
    const customer = req.customer ? await User.findCustomerById(req.customer.id) : null;
    const order = await Order.create({ customer, body, items, ip: req.ip });
    const invoice = await Order.track(order.order_number, body.shipping_phone);
    ok(res, invoice, 'Order placed successfully!', 201);
});

exports.couponPreview = wrap(async (req, res) => {
    const code = str(req.body.code, 50);
    if (!code) throw new AppError('Enter a coupon code.');
    const items = normalizeItems(req.body.items);
    const q = await Order.quote(items, { code, customerId: req.customer?.id, phone: cleanPhone(str(req.body.phone, 20)) || null });
    ok(res, { subtotal: q.subtotal, discount: q.discount, code: q.coupon_code }, `Coupon applied — you save ${q.discount}.`);
});

exports.myOrders = wrap(async (req, res) => ok(res, await Order.forCustomer(req.customer.id)));

exports.track = wrap(async (req, res) => {
    const number = str(req.query.order_number, 40), phone = str(req.query.phone, 20);
    if (!number || !phone) throw new AppError('Enter your order number and phone number.');
    const order = await Order.track(number, phone);
    if (!order) throw new AppError('No order matches those details. Check the number and phone, then try again.', 404);
    ok(res, order);
});
