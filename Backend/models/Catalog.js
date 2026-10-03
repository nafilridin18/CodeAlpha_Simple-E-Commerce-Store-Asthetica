const db = require('../config/db');
const { AppError, unique, slugify, round2, pageMeta } = require('../utils/helpers');

const Category = {
    async publicList() {
        const [rows] = await db.query(
            `SELECT c.id, c.name, c.name_bn, c.slug, c.image, c.parent_id,
                    (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.status = 'published') AS product_count
             FROM categories c WHERE c.is_active = 1 ORDER BY c.sort_order, c.name`);
        return rows;
    },
    async adminList() {
        const [rows] = await db.query(
            `SELECT c.*, pc.name AS parent_name, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
             FROM categories c LEFT JOIN categories pc ON pc.id = c.parent_id ORDER BY c.sort_order, c.name`);
        return rows;
    },
    async save(d, id = null) {
        if (d.parent_id && d.parent_id === id) throw new AppError('A category cannot be its own parent.');
        if (id) {
            const [r] = await db.query('UPDATE categories SET name=?, name_bn=?, parent_id=?, sort_order=?, is_active=? WHERE id=?',
                [d.name, d.name_bn, d.parent_id, d.sort_order, d.is_active, id]);
            if (!r.affectedRows) throw new AppError('Category not found.', 404);
            return id;
        }
        const slug = await unique(db, 'categories', 'slug', slugify(d.name) || 'category');
        const [r] = await db.query('INSERT INTO categories (name, name_bn, parent_id, sort_order, is_active, slug) VALUES (?)',
            [[d.name, d.name_bn, d.parent_id, d.sort_order, d.is_active, slug]]);
        return r.insertId;
    },
    async remove(id) {
        const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM products WHERE category_id = ?', [id]);
        if (n) throw new AppError(`This category has ${n} product(s). Move or delete them first, or hide the category instead.`, 409);
        const [r] = await db.query('DELETE FROM categories WHERE id = ?', [id]);
        if (!r.affectedRows) throw new AppError('Category not found.', 404);
    }
};

const DeliveryArea = {
    async list(activeOnly = true) {
        const [rows] = await db.query(`SELECT * FROM delivery_areas ${activeOnly ? 'WHERE is_active = 1' : ''} ORDER BY delivery_charge, area_name`);
        return rows;
    },
    async save(d, id = null) {
        if (id) {
            const [r] = await db.query('UPDATE delivery_areas SET area_name=?, delivery_charge=?, estimated_days=?, is_active=? WHERE id=?',
                [d.area_name, d.delivery_charge, d.estimated_days, d.is_active, id]);
            if (!r.affectedRows) throw new AppError('Delivery area not found.', 404);
            return id;
        }
        const [r] = await db.query('INSERT INTO delivery_areas (area_name, delivery_charge, estimated_days, is_active) VALUES (?)',
            [[d.area_name, d.delivery_charge, d.estimated_days, d.is_active]]);
        return r.insertId;
    },
    async remove(id) {
        const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM orders WHERE shipping_area_id = ?', [id]);
        if (n) throw new AppError('Orders already use this area. Switch it off instead of deleting.', 409);
        await db.query('DELETE FROM delivery_areas WHERE id = ?', [id]);
    }
};

const Coupon = {
    async list(paging) {
        const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM coupons');
        const [items] = await db.query('SELECT * FROM coupons ORDER BY id DESC LIMIT ? OFFSET ?', [paging.limit, paging.offset]);
        return { items, ...pageMeta(total, paging) };
    },
    async publicOffers(customerId, phone) {
        const [rows] = await db.query(
            `SELECT c.code, c.type, c.value, c.min_order_amount, c.max_discount_amount, c.expires_at
             FROM coupons c
             WHERE c.is_active = 1 AND (c.starts_at IS NULL OR c.starts_at <= NOW())
               AND (c.expires_at IS NULL OR c.expires_at >= NOW())
               AND (c.usage_limit IS NULL OR c.used_count < c.usage_limit)
               AND (c.usage_limit_per_customer IS NULL OR c.usage_limit_per_customer = 0 OR
                          (SELECT COUNT(*) FROM orders o WHERE o.coupon_id = c.id AND (o.customer_id = ? OR o.shipping_phone = ?) AND o.status <> 'cancelled') < c.usage_limit_per_customer)
                      ORDER BY c.expires_at IS NULL, c.expires_at, c.code LIMIT 30`, [customerId, phone]);
        return rows;
    },
    async save(d, adminId, id = null) {
        const vals = [d.type, d.value, d.min_order_amount, d.max_discount_amount, d.usage_limit, d.usage_limit_per_customer, d.starts_at, d.expires_at, d.is_active];
        if (id) {
            const [r] = await db.query(
                'UPDATE coupons SET code=?, type=?, value=?, min_order_amount=?, max_discount_amount=?, usage_limit=?, usage_limit_per_customer=?, starts_at=?, expires_at=?, is_active=? WHERE id=?',
                [d.code, ...vals, id]);
            if (!r.affectedRows) throw new AppError('Coupon not found.', 404);
            return id;
        }
        const [r] = await db.query(
            'INSERT INTO coupons (code, type, value, min_order_amount, max_discount_amount, usage_limit, usage_limit_per_customer, starts_at, expires_at, is_active, created_by) VALUES (?)',
            [[d.code, ...vals, adminId]]);
        return r.insertId;
    },
    async remove(id) { await db.query('DELETE FROM coupons WHERE id = ?', [id]); },

    /** Checks a code against a subtotal. Throws AppError with a customer-friendly reason. */
    async check(conn, { code, subtotal, customerId, phone, lock = false }) {
        const [rows] = await conn.query(`SELECT * FROM coupons WHERE code = ? AND is_active = 1${lock ? ' FOR UPDATE' : ''}`, [String(code).trim()]);
        const c = rows[0];
        if (!c) throw new AppError('This coupon code is not valid.');
        const now = new Date();
        const at = (s) => new Date(String(s).replace(' ', 'T'));
        if (c.starts_at && at(c.starts_at) > now) throw new AppError('This coupon is not active yet.');
        if (c.expires_at && at(c.expires_at) < now) throw new AppError('This coupon has expired.');
        if (c.usage_limit != null && c.used_count >= c.usage_limit) throw new AppError('This coupon has been fully redeemed.');
        if (subtotal < Number(c.min_order_amount || 0)) throw new AppError(`Spend at least ${Number(c.min_order_amount)} to use this coupon.`);
        if (c.usage_limit_per_customer) {
            const conds = [], args = [c.id];
            if (customerId) { conds.push('customer_id = ?'); args.push(customerId); }
            if (phone) { conds.push('shipping_phone = ?'); args.push(phone); }
            if (conds.length) {
                const [[{ n }]] = await conn.query(
                    `SELECT COUNT(*) AS n FROM orders WHERE coupon_id = ? AND status NOT IN ('cancelled') AND (${conds.join(' OR ')})`, args);
                if (n >= c.usage_limit_per_customer) throw new AppError('You have already used this coupon.');
            }
        }
        let discount = c.type === 'percentage' ? subtotal * Number(c.value) / 100 : Number(c.value);
        if (c.type === 'percentage' && c.max_discount_amount != null) discount = Math.min(discount, Number(c.max_discount_amount));
        discount = round2(Math.min(discount, subtotal));
        return { coupon: c, discount };
    }
};

module.exports = { Category, DeliveryArea, Coupon };
