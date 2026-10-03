const db = require('../config/db');

class User {
    static async findCustomerByEmailOrPhone(identifier) {
        const [rows] = await db.query('SELECT * FROM customers WHERE (email = ? OR phone = ?) AND is_active = 1 LIMIT 1', [identifier, identifier]);
        return rows[0];
    }
    static async findCustomerById(id) {
        const [rows] = await db.query('SELECT id, name, email, phone, address, city, postal_code FROM customers WHERE id = ? AND is_active = 1', [id]);
        return rows[0];
    }
    static async customerContactTaken(phone, email, exceptId) {
        const [rows] = await db.query(
            'SELECT id FROM customers WHERE id <> ? AND (phone = ? OR (? IS NOT NULL AND email = ?)) LIMIT 1',
            [exceptId, phone, email, email]);
        return Boolean(rows[0]);
    }
    static async updateCustomer(id, { name, email, phone, address, city }) {
        const [result] = await db.query(
            'UPDATE customers SET name = ?, email = ?, phone = ?, address = ?, city = ? WHERE id = ? AND is_active = 1',
            [name, email || null, phone, address || null, city || null, id]);
        return result.affectedRows ? this.findCustomerById(id) : null;
    }
    static async phoneOrEmailTaken(phone, email) {
        const [rows] = await db.query('SELECT phone, email FROM customers WHERE phone = ? OR (? IS NOT NULL AND email = ?) LIMIT 1', [phone, email, email]);
        return rows[0];
    }
    static async createCustomer({ name, email, phone, password_hash }) {
        const [r] = await db.query('INSERT INTO customers (name, email, phone, password_hash) VALUES (?)', [[name, email, phone, password_hash]]);
        return r.insertId;
    }
    static async findAdminByEmail(email) {
        const [rows] = await db.query('SELECT * FROM admins WHERE email = ? AND is_active = 1', [email]);
        return rows[0];
    }
    static async customerList({ search, paging }) {
        const where = [], args = [];
        if (search) { const s = `%${search}%`; where.push('(c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)'); args.push(s, s, s); }
        const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM customers c ${w}`, args);
        const [items] = await db.query(
            `SELECT c.id, c.name, c.email, c.phone, c.city, c.is_active, c.created_at, COUNT(o.id) AS orders,
                    COALESCE(SUM(CASE WHEN o.status NOT IN ('cancelled','returned') THEN o.total_amount END), 0) AS spent
             FROM customers c LEFT JOIN orders o ON o.customer_id = c.id ${w}
             GROUP BY c.id ORDER BY c.id DESC LIMIT ? OFFSET ?`, [...args, paging.limit, paging.offset]);
        return { items, total, page: paging.page, pages: Math.max(Math.ceil(total / paging.limit), 1) };
    }
    static async wishlistIds(customerId) {
        const [rows] = await db.query('SELECT product_id FROM wishlists WHERE customer_id = ?', [customerId]);
        return rows.map((r) => r.product_id);
    }
    static async toggleWishlist(customerId, productId) {
        const [r] = await db.query('DELETE FROM wishlists WHERE customer_id = ? AND product_id = ?', [customerId, productId]);
        if (r.affectedRows) return false;
        await db.query('INSERT IGNORE INTO wishlists (customer_id, product_id) SELECT ?, id FROM products WHERE id = ?', [customerId, productId]);
        return true;
    }
}

module.exports = User;
