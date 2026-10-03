const db = require('../config/db');
const Product = require('./Product');
const { Coupon } = require('./Catalog');
const { AppError, round2, last10, pageMeta } = require('../utils/helpers');

const STATUSES = ['new', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'];
const PAY = ['pending', 'paid', 'failed'];
const ITEM_COLS = 'order_id, product_id, product_name, size, color, unit_price, quantity, line_total';

const newOrderNumber = () => 'SHV-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase();

async function attachItems(orders) {
    if (!orders.length) return orders;
    const [items] = await db.query(`SELECT ${ITEM_COLS} FROM order_items WHERE order_id IN (?)`, [orders.map((o) => o.id)]);
    const map = new Map();
    items.forEach((i) => { if (!map.has(i.order_id)) map.set(i.order_id, []); map.get(i.order_id).push(i); });
    return orders.map((o) => ({ ...o, items: map.get(o.id) || [] }));
}

class Order {
    /** Prices a cart on the server (used by cart page + coupon preview). */
    static async quote(items, { code, customerId, phone } = {}) {
        const lines = await Product.resolveLines(db, items);
        const subtotal = round2(lines.reduce((s, l) => s + (l.error ? 0 : l.unit_price * l.quantity), 0));
        let discount = 0, coupon_code = null;
        if (code) {
            const r = await Coupon.check(db, { code, subtotal, customerId, phone });
            discount = r.discount; coupon_code = r.coupon.code;
        }
        return { lines, subtotal, discount, coupon_code };
    }

    static async create({ customer, body, items, ip }) {
        const phone = body.shipping_phone;
        const [[{ recent }]] = await db.query(
            "SELECT COUNT(*) AS recent FROM orders WHERE shipping_phone = ? AND placed_at >= NOW() - INTERVAL 1 HOUR", [phone]);

        return db.tx(async (c) => {
            const lines = await Product.resolveLines(c, items, { lock: true });
            const bad = lines.find((l) => l.error);
            if (bad) throw new AppError(bad.error, 409);

            const [areas] = await c.query('SELECT * FROM delivery_areas WHERE id = ? AND is_active = 1', [body.shipping_area_id]);
            if (!areas.length) throw new AppError('Please choose a delivery area.');
            const area = areas[0];

            const subtotal = round2(lines.reduce((s, l) => s + l.unit_price * l.quantity, 0));
            let discount = 0, couponId = null;
            if (body.coupon_code) {
                const r = await Coupon.check(c, { code: body.coupon_code, subtotal, customerId: customer?.id, phone, lock: true });
                discount = r.discount; couponId = r.coupon.id;
            }
            const delivery = Number(area.delivery_charge);
            const total = round2(subtotal - discount + delivery);
            const orderNumber = newOrderNumber();

            const [o] = await c.query(
                `INSERT INTO orders (order_number, customer_id, guest_name, guest_phone, guest_email, shipping_name, shipping_phone, shipping_address,
                   shipping_area_id, shipping_district, subtotal, discount_amount, delivery_charge, total_amount, coupon_id, payment_method,
                   payment_status, status, customer_note, is_flagged_spam, ip_address) VALUES (?)`,
                [[orderNumber, customer?.id || null, customer ? null : body.shipping_name, customer ? null : phone, customer ? null : body.email || null,
                    body.shipping_name, phone, body.shipping_address, area.id, area.area_name, subtotal, discount, delivery, total, couponId,
                    'cod', 'pending', 'new', body.customer_note || null, recent >= 3 ? 1 : 0, ip]]);

            await c.query(`INSERT INTO order_items (${ITEM_COLS.replace('order_id, ', 'order_id, variant_id, ')}) VALUES ?`,
                [lines.map((l) => [o.insertId, l.variant_id, l.product_id, l.name, l.size || null, l.color || null, l.unit_price, l.quantity, round2(l.unit_price * l.quantity)])]);

            for (const l of lines) {
                await c.query('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?', [l.quantity, l.product_id]);
                if (l.variant_id) await c.query('UPDATE product_variants SET stock_quantity = stock_quantity - ? WHERE id = ?', [l.quantity, l.variant_id]);
            }
            if (couponId) await c.query('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?', [couponId]);

            // Remember the address for next time
            if (customer) {
                await c.query('UPDATE customers SET address = COALESCE(address, ?), city = COALESCE(city, ?) WHERE id = ?', [body.shipping_address, area.area_name, customer.id]);
            }
            return { id: o.insertId, order_number: orderNumber, total_amount: total };
        });
    }

    static async forCustomer(customerId) {
        const [rows] = await db.query(
                `SELECT o.id, o.order_number, o.status, o.payment_status, o.payment_method, o.shipping_name, o.shipping_phone, o.shipping_address,
                    o.shipping_district, COALESCE(o.guest_email, u.email) AS guest_email, o.subtotal, o.discount_amount, o.delivery_charge, o.total_amount, o.courier_name,
                    o.courier_tracking_id, o.placed_at, c.code AS coupon_code
             FROM orders o LEFT JOIN coupons c ON c.id = o.coupon_id
                 LEFT JOIN customers u ON u.id = o.customer_id
             WHERE o.customer_id = ? ORDER BY o.id DESC LIMIT 30`, [customerId]);
        return attachItems(rows);
    }

    static async track(orderNumber, phone) {
        const [rows] = await db.query(
                    `SELECT o.id, o.order_number, o.status, o.payment_status, o.payment_method, o.shipping_name, o.shipping_phone, COALESCE(o.guest_email, u.email) AS guest_email,
                    o.shipping_address, o.shipping_district, o.subtotal, o.discount_amount, o.delivery_charge, o.total_amount,
                    o.courier_name, o.courier_tracking_id, o.placed_at, c.code AS coupon_code
                 FROM orders o LEFT JOIN coupons c ON c.id = o.coupon_id
                     LEFT JOIN customers u ON u.id = o.customer_id
                 WHERE o.order_number = ? AND RIGHT(REPLACE(REPLACE(o.shipping_phone, '-', ''), ' ', ''), 10) = ?`, [orderNumber, last10(phone)]);
        return (await attachItems(rows))[0] || null;
    }

    // ---------- admin ----------
    static async adminList({ status, search, paging }) {
        const where = [], args = [];
        if (status && status !== 'all') {
            const list = status.split(',').filter((s) => STATUSES.includes(s));
            if (list.length) { where.push('o.status IN (?)'); args.push(list); }
        }
        if (search) { const s = `%${search}%`; where.push('(o.order_number LIKE ? OR o.shipping_name LIKE ? OR o.shipping_phone LIKE ?)'); args.push(s, s, s); }
        const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM orders o ${w}`, args);
        const [rows] = await db.query(
            `SELECT o.id, o.order_number, o.shipping_name, o.shipping_phone, o.shipping_address, o.shipping_district, o.total_amount, o.status, o.payment_status,
                    o.courier_name, o.courier_tracking_id, o.is_flagged_spam, o.placed_at,
                    (SELECT COALESCE(SUM(quantity), 0) FROM order_items WHERE order_id = o.id) AS item_count
             FROM orders o ${w} ORDER BY o.id DESC LIMIT ? OFFSET ?`, [...args, paging.limit, paging.offset]);
        const [cnt] = await db.query('SELECT status, COUNT(*) AS n FROM orders GROUP BY status');
        const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
        cnt.forEach((r) => { counts[r.status] = r.n; });
        return { items: rows, counts, ...pageMeta(total, paging) };
    }

    static async adminGet(id) {
        const [rows] = await db.query(
            `SELECT o.*, COALESCE(o.guest_email, u.email) AS invoice_email, c.code AS coupon_code
             FROM orders o LEFT JOIN coupons c ON c.id = o.coupon_id LEFT JOIN customers u ON u.id = o.customer_id WHERE o.id = ?`, [id]);
        if (!rows[0]) return null;
        return (await attachItems(rows))[0];
    }

    static async updateStatus(id, d) {
        return db.tx(async (c) => {
            const [rows] = await c.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [id]);
            const o = rows[0];
            if (!o) throw new AppError('Order not found.', 404);
            const sets = {}, closed = ['cancelled', 'returned'];

            if (d.status && d.status !== o.status) {
                if (!STATUSES.includes(d.status)) throw new AppError('Unknown order status.');
                if (closed.includes(o.status)) throw new AppError(`A ${o.status} order cannot be changed again.`);
                sets.status = d.status;
                if (closed.includes(d.status)) {        // put the stock back
                    const [items] = await c.query('SELECT product_id, variant_id, quantity FROM order_items WHERE order_id = ?', [id]);
                    for (const i of items) {
                        if (i.product_id) await c.query('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?', [i.quantity, i.product_id]);
                        if (i.variant_id) await c.query('UPDATE product_variants SET stock_quantity = stock_quantity + ? WHERE id = ?', [i.quantity, i.variant_id]);
                    }
                    if (d.status === 'cancelled' && o.coupon_id) await c.query('UPDATE coupons SET used_count = GREATEST(used_count - 1, 0) WHERE id = ?', [o.coupon_id]);
                }
                if (d.status === 'delivered' && o.payment_status === 'pending' && !d.payment_status) sets.payment_status = 'paid'; // cash collected
            }
            if (d.payment_status) {
                if (!PAY.includes(d.payment_status)) throw new AppError('Unknown payment status.');
                sets.payment_status = d.payment_status;
            }
            for (const k of ['courier_name', 'courier_tracking_id', 'admin_note']) if (d[k] !== undefined) sets[k] = d[k] || null;
            if (d.is_flagged_spam !== undefined) sets.is_flagged_spam = d.is_flagged_spam ? 1 : 0;

            const keys = Object.keys(sets);
            if (keys.length) await c.query(`UPDATE orders SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => sets[k]), id]);
            return { from: o.status, to: sets.status || o.status };
        });
    }
}

Order.STATUSES = STATUSES;
module.exports = Order;
