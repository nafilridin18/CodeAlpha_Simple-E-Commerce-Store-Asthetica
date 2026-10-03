const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const { AppError, unique, slugify, pageMeta } = require('../utils/helpers');

// Price the customer actually pays (discount only counts when it is lower than the regular price)
const SALE = 'IF(p.discount_price IS NOT NULL AND p.discount_price < p.price, p.discount_price, p.price)';
const IMG = `(SELECT pi.image_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.sort_order, pi.id LIMIT 1)`;
const VCOUNT = '(SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1)';
// Public card fields only — cost_price and other internals are never exposed
const CARD = `p.id, p.name, p.name_bn, p.slug, p.price, p.discount_price, ${SALE} AS sale_price, p.stock_quantity,
    p.is_featured, p.is_new_arrival, p.is_best_selling, p.category_id, c.name AS category_name, ${IMG} AS image, ${VCOUNT} AS variant_count`;

class Product {
    static async list(o = {}) {
        const { search, category, sort = 'newest', min, max, flag, status, admin = false } = o;
        const pg = o.paging || { page: 1, limit: 12, offset: 0 };
        const where = [], args = [];
        if (!admin) where.push("p.status = 'published'");
        else if (status && status !== 'all') { where.push('p.status = ?'); args.push(status); }
        if (search) { const s = `%${search}%`; where.push('(p.name LIKE ? OR p.name_bn LIKE ? OR p.sku LIKE ?)'); args.push(s, s, s); }
        if (category) {
            if (/^\d+$/.test(category)) { where.push('(p.category_id = ? OR c.parent_id = ?)'); args.push(+category, +category); }
            else { where.push('(c.slug = ? OR pc.slug = ?)'); args.push(category, category); }
        }
        if (Number.isFinite(+min) && min !== '' && min != null) { where.push(`${SALE} >= ?`); args.push(+min); }
        if (Number.isFinite(+max) && max !== '' && max != null) { where.push(`${SALE} <= ?`); args.push(+max); }
        const flags = { featured: 'p.is_featured', new: 'p.is_new_arrival', best: 'p.is_best_selling' };
        if (flags[flag]) where.push(`${flags[flag]} = 1`);
        const order = {
            newest: 'p.id DESC', price_asc: `${SALE} ASC`, price_desc: `${SALE} DESC`,
            popular: 'p.views_count DESC, p.id DESC', name: 'p.name ASC'
        }[sort] || 'p.id DESC';
        const from = `FROM products p JOIN categories c ON c.id = p.category_id LEFT JOIN categories pc ON pc.id = c.parent_id
                      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;
        const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total ${from}`, args);
        const extra = admin ? ', p.sku, p.status, p.views_count, p.cost_price, p.created_at' : '';
        const [items] = await db.query(`SELECT ${CARD}${extra} ${from} ORDER BY ${order} LIMIT ? OFFSET ?`, [...args, pg.limit, pg.offset]);
        return { items, ...pageMeta(total, pg) };
    }

    static async byIds(ids) {
        if (!ids.length) return [];
        const [rows] = await db.query(
            `SELECT ${CARD} FROM products p JOIN categories c ON c.id = p.category_id WHERE p.status = 'published' AND p.id IN (?)`, [ids]);
        return rows;
    }

    static async detail(key) {
        const col = /^\d+$/.test(String(key)) ? 'p.id' : 'p.slug';
        const [rows] = await db.query(
            `SELECT p.id, p.category_id, p.name, p.name_bn, p.slug, p.sku, p.short_description, p.description, p.price, p.discount_price,
                    ${SALE} AS sale_price, p.stock_quantity, p.product_video, p.is_new_arrival, p.meta_title, p.meta_description,
                    c.name AS category_name, c.slug AS category_slug
             FROM products p JOIN categories c ON c.id = p.category_id WHERE ${col} = ? AND p.status = 'published'`, [key]);
        const p = rows[0];
        if (!p) return null;
        const [images] = await db.query('SELECT id, image_path, alt_text FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order, id', [p.id]);
        const [variants] = await db.query(
            'SELECT id, size, color, color_hex, price_override, stock_quantity FROM product_variants WHERE product_id = ? AND is_active = 1 ORDER BY id', [p.id]);
        const [related] = await db.query(
            `SELECT ${CARD} FROM products p JOIN categories c ON c.id = p.category_id
             WHERE p.status = 'published' AND p.category_id = ? AND p.id <> ? ORDER BY p.is_featured DESC, p.id DESC LIMIT 4`, [p.category_id, p.id]);
        db.query('UPDATE products SET views_count = views_count + 1 WHERE id = ?', [p.id]).catch(() => {});
        return { ...p, images, variants, related };
    }

    static async adminGet(id) {
        const [rows] = await db.query('SELECT * FROM products WHERE id = ?', [id]);
        if (!rows[0]) return null;
        const [images] = await db.query('SELECT id, image_path FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order, id', [id]);
        const [variants] = await db.query('SELECT * FROM product_variants WHERE product_id = ? ORDER BY id', [id]);
        return { ...rows[0], images, variants };
    }

    // Create (id = null) or update a product together with its images and variants
    static async save(d, adminId, id = null) {
        return db.tx(async (c) => {
            const [cat] = await c.query('SELECT id FROM categories WHERE id = ?', [d.category_id]);
            if (!cat.length) throw new AppError('Please choose a valid category.');
            const active = d.variants.filter((v) => v.is_active);
            const stock = d.variants.length ? active.reduce((s, v) => s + v.stock_quantity, 0) : d.stock_quantity;
            const common = [d.category_id, d.name, d.name_bn, d.short_description, d.description, d.price, d.discount_price, d.cost_price,
                stock, d.is_featured, d.is_best_selling, d.is_new_arrival, d.status, d.meta_title, d.meta_description];
            let pid = id;
            if (id) {
                const [r] = await c.query('SELECT id, sku FROM products WHERE id = ? FOR UPDATE', [id]);
                if (!r.length) throw new AppError('Product not found.', 404);
                await c.query(
                    `UPDATE products SET category_id=?, name=?, name_bn=?, short_description=?, description=?, price=?, discount_price=?, cost_price=?,
                     stock_quantity=?, is_featured=?, is_best_selling=?, is_new_arrival=?, status=?, meta_title=?, meta_description=?, sku=? WHERE id=?`,
                    [...common, d.sku || r[0].sku, id]);
            } else {
                const slug = await unique(c, 'products', 'slug', slugify(d.name) || 'product');
                const sku = d.sku || await unique(c, 'products', 'sku', 'SKU-' + Math.floor(10000 + Math.random() * 90000),
                    () => 'SKU-' + Math.floor(10000 + Math.random() * 90000));
                const [ins] = await c.query(
                    `INSERT INTO products (category_id, name, name_bn, short_description, description, price, discount_price, cost_price,
                     stock_quantity, is_featured, is_best_selling, is_new_arrival, status, meta_title, meta_description, slug, sku, created_by) VALUES (?)`,
                    [[...common, slug, sku, adminId]]);
                pid = ins.insertId;
            }

            await c.query('DELETE FROM product_images WHERE product_id = ?', [pid]);
            if (d.images.length) {
                await c.query('INSERT INTO product_images (product_id, image_path, alt_text, is_primary, sort_order) VALUES ?',
                    [d.images.map((p, i) => [pid, p, d.name.slice(0, 150), i === 0 ? 1 : 0, i])]);
            }

            const [existing] = await c.query('SELECT id FROM product_variants WHERE product_id = ?', [pid]);
            const have = new Set(existing.map((e) => e.id));
            const keep = new Set(d.variants.filter((v) => v.id && have.has(v.id)).map((v) => v.id));
            const drop = [...have].filter((i) => !keep.has(i));
            if (drop.length) await c.query('DELETE FROM product_variants WHERE id IN (?)', [drop]);
            for (const v of d.variants) {
                const vals = [v.size, v.color, v.color_hex, v.price_override, v.stock_quantity, v.is_active];
                if (v.id && have.has(v.id)) {
                    await c.query('UPDATE product_variants SET size=?, color=?, color_hex=?, price_override=?, stock_quantity=?, is_active=? WHERE id=? AND product_id=?', [...vals, v.id, pid]);
                } else {
                    await c.query('INSERT INTO product_variants (size, color, color_hex, price_override, stock_quantity, is_active, product_id) VALUES (?)', [[...vals, pid]]);
                }
            }
            return pid;
        });
    }

    static async setStatus(id, status) {
        const [r] = await db.query('UPDATE products SET status = ? WHERE id = ?', [status, id]);
        if (!r.affectedRows) throw new AppError('Product not found.', 404);
    }

    static async remove(id) {
        const [imgs] = await db.query('SELECT image_path FROM product_images WHERE product_id = ?', [id]);
        const [r] = await db.query('DELETE FROM products WHERE id = ?', [id]);
        if (!r.affectedRows) throw new AppError('Product not found.', 404);
        // Clean up uploaded files that nothing else uses
        for (const { image_path } of imgs) {
            if (!image_path.startsWith('/uploads/')) continue;
            const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM product_images WHERE image_path = ?', [image_path]);
            if (!n) fs.promises.unlink(path.join(__dirname, '..', image_path)).catch(() => {});
        }
    }

    /**
     * Turns cart lines [{product_id, variant_id, quantity}] into priced lines using the DATABASE prices.
     * Never trust prices sent by the browser. Each line gets `.error` when it cannot be bought.
     */
    static async resolveLines(conn, items, { lock = false } = {}) {
        const ids = [...new Set(items.map((i) => i.product_id))];
        if (!ids.length) return [];
        const fu = lock ? ' FOR UPDATE' : '';
        const [prods] = await conn.query(
            `SELECT p.id, p.name, p.slug, p.price, p.discount_price, p.stock_quantity, p.status, ${IMG} AS image FROM products p WHERE p.id IN (?)${fu}`, [ids]);
        const [vars] = await conn.query(`SELECT * FROM product_variants WHERE product_id IN (?) AND is_active = 1${fu}`, [ids]);
        const pm = new Map(prods.map((p) => [p.id, p]));
        const vm = new Map(vars.map((v) => [v.id, v]));
        const hasVariants = new Set(vars.map((v) => v.product_id));

        return items.map((it) => {
            const line = { product_id: it.product_id, variant_id: it.variant_id || null, quantity: it.quantity };
            const p = pm.get(it.product_id);
            if (!p || p.status !== 'published') return { ...line, name: p?.name || 'Product', error: 'This product is no longer available.' };
            const regular = Number(p.price), disc = p.discount_price == null ? null : Number(p.discount_price);
            let price = disc != null && disc < regular ? disc : regular;
            let stock = p.stock_quantity;
            Object.assign(line, { name: p.name, slug: p.slug, image: p.image });
            if (it.variant_id) {
                const v = vm.get(it.variant_id);
                if (!v || v.product_id !== p.id) return { ...line, error: `The selected option for ${p.name} is unavailable.` };
                stock = v.stock_quantity;
                if (v.price_override != null) price = Number(v.price_override);
                line.size = v.size; line.color = v.color;
            } else if (hasVariants.has(p.id)) {
                return { ...line, error: `Please choose a size/color for ${p.name}.` };
            }
            line.unit_price = price; line.stock = stock;
            if (stock <= 0) line.error = `${p.name} is out of stock.`;
            else if (it.quantity > stock) line.error = `Only ${stock} left of ${p.name}.`;
            return line;
        });
    }
}

module.exports = Product;
