/**
 * One-command setup:  npm run setup
 *  1. creates the database (if missing) and imports ../database/schema.sql (if tables are missing)
 *  2. adds the first admin, categories, delivery areas, a welcome coupon and sample products (only when empty)
 *  Reset the admin password:  node seed.js --reset-admin
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const DB = process.env.DB_NAME || 'ecommerce';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@aesthetica.com').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@12345';

(async () => {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', multipleStatements: true
    });
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.changeUser({ database: DB });

    const [[{ n }]] = await conn.query("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ? AND table_name = 'roles'", [DB]);
    if (!n) {
        await conn.query(fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8'));
        console.log('✅ Tables created from database/schema.sql');
    } else console.log('ℹ️  Tables already exist — keeping them.');

    await conn.query(`CREATE TABLE IF NOT EXISTS product_questions (
        id int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
        product_id int(10) UNSIGNED NOT NULL,
        customer_id int(10) UNSIGNED DEFAULT NULL,
        kind enum('question','comment') NOT NULL DEFAULT 'question',
        body varchar(1000) NOT NULL,
        answer varchar(2000) DEFAULT NULL,
        status enum('pending','answered','hidden') NOT NULL DEFAULT 'pending',
        answered_by int(10) UNSIGNED DEFAULT NULL,
        answered_at datetime DEFAULT NULL,
        created_at timestamp NOT NULL DEFAULT current_timestamp(),
        updated_at timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
        PRIMARY KEY (id),
        KEY idx_product_questions_product (product_id,status,created_at),
        KEY idx_product_questions_customer (customer_id),
        CONSTRAINT product_questions_ibfk_1 FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
        CONSTRAINT product_questions_ibfk_2 FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE SET NULL,
        CONSTRAINT product_questions_ibfk_3 FOREIGN KEY (answered_by) REFERENCES admins (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    const count = async (t) => (await conn.query(`SELECT COUNT(*) AS n FROM ${t}`))[0][0].n;

    // role + admin
    if (!(await count('roles'))) await conn.query("INSERT INTO roles (name, description) VALUES ('Super Admin', 'Full access')");
    const [[role]] = await conn.query('SELECT id FROM roles ORDER BY id LIMIT 1');
    const [admins] = await conn.query('SELECT id FROM admins WHERE email = ?', [ADMIN_EMAIL]);
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    if (!admins.length) {
        await conn.query('INSERT INTO admins (role_id, name, email, password_hash) VALUES (?,?,?,?)', [role.id, 'Store Admin', ADMIN_EMAIL, hash]);
        console.log(`✅ Admin created → ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}   (change this password!)`);
    } else if (process.argv.includes('--reset-admin')) {
        await conn.query('UPDATE admins SET password_hash = ?, is_active = 1 WHERE email = ?', [hash, ADMIN_EMAIL]);
        console.log(`✅ Admin password reset → ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
    } else console.log(`ℹ️  Admin ${ADMIN_EMAIL} already exists.`);

    if (!(await count('categories'))) {
        await conn.query("INSERT INTO categories (name, name_bn, slug, sort_order) VALUES ('Home Decor','হোম ডেকর','home-decor',1),('Clothing','পোশাক','clothing',2),('Lifestyle','লাইফস্টাইল','lifestyle',3)");
        console.log('✅ Categories added');
    }
    if (!(await count('delivery_areas'))) {
        await conn.query("INSERT INTO delivery_areas (area_name, delivery_charge, estimated_days) VALUES ('Inside Dhaka',60,'1-2 days'),('Outside Dhaka',120,'3-5 days')");
        console.log('✅ Delivery areas added');
    }
    if (!(await count('coupons'))) {
        await conn.query("INSERT INTO coupons (code, type, value, min_order_amount, max_discount_amount, usage_limit_per_customer) VALUES ('WELCOME10','percentage',10,500,300,1)");
        console.log('✅ Coupon WELCOME10 added (10% off, min 500)');
    }
    if (!(await count('products'))) {
        const Product = require('./models/Product');
        const cat = Object.fromEntries((await conn.query('SELECT slug, id FROM categories'))[0].map((c) => [c.slug, c.id]));
        const base = { name_bn: null, sku: '', short_description: null, cost_price: null, stock_quantity: 20, is_featured: 0, is_best_selling: 0, is_new_arrival: 0,
            status: 'published', meta_title: null, meta_description: null, images: [], variants: [], discount_price: null };
        const sand = (sz) => ({ size: sz, color: 'Sand', color_hex: '#D9C3A5', price_override: null, stock_quantity: 10, is_active: 1 });
        const olive = (sz) => ({ size: sz, color: 'Olive', color_hex: '#6B705C', price_override: null, stock_quantity: 10, is_active: 1 });
        const samples = [
            { category_id: cat['home-decor'], name: 'Minimalist Ceramic Vase', price: 1450, discount_price: 1250, stock_quantity: 25, is_featured: 1, short_description: 'Hand-finished earthy clay vase.', description: 'Crafted with premium earthy clay, this minimalist vase adds organic warmth to any corner of your home.\nHeight: 24 cm.' },
            { category_id: cat['home-decor'], name: 'Woven Jute Storage Basket', price: 950, stock_quantity: 40, is_best_selling: 1, description: 'A sturdy hand-woven jute basket for blankets, toys or laundry.' },
            { category_id: cat['home-decor'], name: 'Matte Black Ceramic Mug', price: 450, stock_quantity: 60, is_best_selling: 1, is_new_arrival: 1, description: 'A 320 ml matte-glazed mug that keeps your coffee warm.' },
            { category_id: cat['clothing'], name: 'Earthy Tone Linen Shirt', price: 2200, discount_price: 1890, is_featured: 1, is_new_arrival: 1, description: 'Breathable pure linen shirt with a relaxed fit.',
                variants: ['M', 'L', 'XL'].flatMap((s) => [sand(s), olive(s)]) },
            { category_id: cat['lifestyle'], name: 'Hand-poured Soy Candle', price: 650, stock_quantity: 50, is_new_arrival: 1, is_featured: 1, description: 'Clean-burning soy wax candle, about 40 hours of burn time.' },
            { category_id: cat['lifestyle'], name: 'Organic Cotton Tote Bag', price: 550, stock_quantity: 35, is_best_selling: 1, description: 'Everyday tote in thick organic cotton canvas.' }
        ];
        for (const s of samples) await Product.save({ ...base, ...s }, null);
        console.log(`✅ ${samples.length} sample products added (upload photos from the admin panel)`);
    }
    await conn.end();
    console.log('\nAll set. Start the site with:  npm start');
    process.exit(0);
})().catch((e) => { console.error('\n❌ Setup failed:', e.message, '\n   Is MySQL running? Check DB_HOST / DB_PORT / DB_USER / DB_PASSWORD in Backend/.env'); process.exit(1); });
