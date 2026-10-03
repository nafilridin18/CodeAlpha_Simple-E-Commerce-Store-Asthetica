const bcrypt = require('bcryptjs');
const db = require('../../config/db');
const User = require('../../models/User');
const { signAdmin } = require('../../middlewares/auth');
const { AppError, wrap, ok, str, paging, logActivity } = require('../../utils/helpers');

const LOW_STOCK = 5;

exports.adminLogin = wrap(async (req, res) => {
    const email = str(req.body.email, 150).toLowerCase(), password = String(req.body.password || '');
    const admin = email && (await User.findAdminByEmail(email));
    const good = admin && (await bcrypt.compare(password, admin.password_hash));
    if (!good) throw new AppError('Incorrect email or password.', 401);
    await db.query('UPDATE admins SET last_login_at = NOW(), last_login_ip = ? WHERE id = ?', [req.ip, admin.id]);
    req.admin = admin;
    logActivity(req, 'admin.login', 'admin', admin.id);
    ok(res, { token: signAdmin(admin), admin: { id: admin.id, name: admin.name, email: admin.email } }, 'Welcome back!');
});

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

exports.dashboard = wrap(async (req, res) => {
    const [[t]] = await db.query(
        `SELECT COUNT(*) AS orders,
                COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','returned') THEN total_amount END), 0) AS sales,
                COALESCE(SUM(CASE WHEN status = 'delivered' THEN total_amount END), 0) AS delivered_revenue,
                COALESCE(SUM(status = 'new'), 0) AS new_orders FROM orders`);
    const [byStatus] = await db.query('SELECT status, COUNT(*) AS n FROM orders GROUP BY status');
    const [days] = await db.query(
        `SELECT DATE(placed_at) AS d, COUNT(*) AS orders, SUM(total_amount) AS sales FROM orders
         WHERE placed_at >= CURDATE() - INTERVAL 6 DAY AND status NOT IN ('cancelled','returned') GROUP BY DATE(placed_at)`);
    const [[p]] = await db.query("SELECT COUNT(*) AS total, COALESCE(SUM(status = 'published'), 0) AS published FROM products");
    const [[cu]] = await db.query('SELECT COUNT(*) AS n FROM customers');
    const [lowStock] = await db.query(
        "SELECT id, name, sku, stock_quantity FROM products WHERE status = 'published' AND stock_quantity <= ? ORDER BY stock_quantity, id LIMIT 8", [LOW_STOCK]);
    const [recent] = await db.query('SELECT id, order_number, shipping_name, total_amount, status, placed_at FROM orders ORDER BY id DESC LIMIT 6');
    const [top] = await db.query(
        `SELECT oi.product_name AS name, SUM(oi.quantity) AS qty FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE o.status NOT IN ('cancelled','returned') AND o.placed_at >= NOW() - INTERVAL 30 DAY GROUP BY oi.product_name ORDER BY qty DESC LIMIT 5`);

    const map = new Map(days.map((r) => [r.d, r]));
    const chart = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const key = ymd(d), r = map.get(key);
        chart.push({ date: key, orders: r ? Number(r.orders) : 0, sales: r ? Number(r.sales) : 0 });
    }
    ok(res, {
        totals: { sales: Number(t.sales), delivered_revenue: Number(t.delivered_revenue), orders: t.orders, new_orders: Number(t.new_orders),
            products: p.total, published: Number(p.published), customers: cu.n },
        byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.n])), chart, lowStock, recent, top, lowStockLimit: LOW_STOCK
    });
});

exports.customers = wrap(async (req, res) => ok(res, await User.customerList({ search: str(req.query.q, 80), paging: paging(req.query, 20, 100) })));
