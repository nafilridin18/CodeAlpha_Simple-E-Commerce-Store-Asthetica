const db = require('../config/db');
const { AppError } = require('../utils/helpers');

const STATUSES = ['pending', 'answered', 'hidden'];

class ProductQuestion {
    static async publishedProductId(key) {
        const column = /^\d+$/.test(String(key)) ? 'id' : 'slug';
        const [rows] = await db.query(`SELECT id FROM products WHERE ${column} = ? AND status = 'published'`, [key]);
        return rows[0]?.id || null;
    }

    static async forProduct(productId) {
        const [rows] = await db.query(
            `SELECT q.id, q.kind, q.body, q.answer, q.created_at, q.answered_at, SUBSTRING_INDEX(c.name, ' ', 1) AS customer_name
             FROM product_questions q LEFT JOIN customers c ON c.id = q.customer_id
             WHERE q.product_id = ? AND q.status = 'answered' ORDER BY q.answered_at DESC, q.id DESC LIMIT 50`, [productId]);
        return rows;
    }

    static async create({ productId, customerId, kind, body }) {
        const [result] = await db.query(
            'INSERT INTO product_questions (product_id, customer_id, kind, body) VALUES (?,?,?,?)',
            [productId, customerId, kind, body]);
        return result.insertId;
    }

    static async adminList(status = 'all') {
        const where = status !== 'all' && STATUSES.includes(status) ? 'WHERE q.status = ?' : '';
        const args = where ? [status] : [];
        const [rows] = await db.query(
            `SELECT q.id, q.product_id, q.customer_id, q.kind, q.body, q.answer, q.status, q.created_at, q.answered_at,
                    p.name AS product_name, p.slug AS product_slug, c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone
             FROM product_questions q JOIN products p ON p.id = q.product_id
             LEFT JOIN customers c ON c.id = q.customer_id ${where} ORDER BY FIELD(q.status,'pending','answered','hidden'), q.created_at DESC LIMIT 300`, args);
        return rows;
    }

    static async answer(id, adminId, { answer, status }) {
        if (!STATUSES.includes(status)) throw new AppError('Choose a valid question status.');
        if (status === 'answered' && answer.length < 2) throw new AppError('Write an answer before publishing it.');
        const [[existing]] = await db.query('SELECT id FROM product_questions WHERE id = ?', [id]);
        if (!existing) throw new AppError('Question not found.', 404);
        await db.query(
            `UPDATE product_questions SET answer = ?, status = ?, answered_by = ?, answered_at = ? WHERE id = ?`,
            [answer || null, status, status === 'answered' ? adminId : null, status === 'answered' ? new Date() : null, id]);
    }
}

module.exports = ProductQuestion;
