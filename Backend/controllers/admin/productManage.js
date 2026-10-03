const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Product = require('../../models/Product');
const { Category } = require('../../models/Catalog');
const { AppError, wrap, ok, str, num, int, bool, paging, logActivity } = require('../../utils/helpers');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
const SIG = { // file signatures — stops disguised uploads
    jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    png: (b) => b.slice(0, 4).toString('hex') === '89504e47',
    gif: (b) => b.slice(0, 4).toString() === 'GIF8',
    webp: (b) => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP'
};

exports.upload = wrap(async (req, res) => {
    const m = /^data:image\/(jpeg|png|gif|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body.data || ''));
    if (!m) throw new AppError('Please upload a JPG, PNG, WEBP or GIF image.');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 5 * 1024 * 1024) throw new AppError('Image is larger than 5 MB.', 413);
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    if (!SIG[ext](buf)) throw new AppError('That file is not a valid image.');
    const name = `${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}.${ext}`;
    await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.promises.writeFile(path.join(UPLOAD_DIR, name), buf);
    ok(res, { path: `/uploads/${name}` }, 'Image uploaded.', 201);
});

function parseProduct(b) {
    const d = {
        category_id: int(b.category_id), name: str(b.name, 200), name_bn: str(b.name_bn, 255) || null, sku: str(b.sku, 50),
        short_description: str(b.short_description, 500) || null, description: str(b.description, 10000) || null,
        price: num(b.price, NaN), discount_price: b.discount_price === '' || b.discount_price == null ? null : num(b.discount_price, NaN),
        cost_price: b.cost_price === '' || b.cost_price == null ? null : num(b.cost_price, NaN),
        stock_quantity: int(b.stock_quantity), is_featured: bool(b.is_featured), is_best_selling: bool(b.is_best_selling), is_new_arrival: bool(b.is_new_arrival),
        status: str(b.status, 12) || 'published', meta_title: str(b.meta_title, 200) || null, meta_description: str(b.meta_description, 300) || null
    };
    if (d.name.length < 2) throw new AppError('Product name is required.');
    if (!d.category_id) throw new AppError('Please choose a category.');
    if (!Number.isFinite(d.price) || d.price <= 0) throw new AppError('Enter a price greater than 0.');
    if (d.discount_price !== null && (!Number.isFinite(d.discount_price) || d.discount_price <= 0 || d.discount_price >= d.price))
        throw new AppError('Sale price must be lower than the regular price.');
    if (d.cost_price !== null && !Number.isFinite(d.cost_price)) throw new AppError('Cost price must be a number.');
    if (d.stock_quantity < 0) throw new AppError('Stock cannot be negative.');
    if (!['draft', 'published', 'archived'].includes(d.status)) throw new AppError('Unknown product status.');

    d.images = (Array.isArray(b.images) ? b.images : []).map((x) => str(x, 255))
        .filter((x) => /^(\/uploads\/[\w.-]+|https?:\/\/\S+)$/.test(x)).slice(0, 8);
    d.variants = (Array.isArray(b.variants) ? b.variants : []).slice(0, 60).map((v) => {
        const size = str(v.size, 50), color = str(v.color, 50);
        if (!size || !color) throw new AppError('Every variant needs a size and a color (use "Free" or "Standard" if not applicable).');
        const hex = /^#[0-9a-f]{6}$/i.test(v.color_hex || '') ? v.color_hex : null;
        const po = v.price_override === '' || v.price_override == null ? null : num(v.price_override, NaN);
        if (po !== null && (!Number.isFinite(po) || po <= 0)) throw new AppError('Variant price must be greater than 0.');
        return { id: int(v.id) || null, size, color, color_hex: hex, price_override: po, stock_quantity: Math.max(int(v.stock_quantity), 0), is_active: v.is_active === undefined ? 1 : bool(v.is_active) };
    });
    return d;
}

exports.list = wrap(async (req, res) => {
    const q = req.query;
    ok(res, await Product.list({ admin: true, search: str(q.q, 80), category: str(q.category, 20), status: str(q.status, 12), sort: str(q.sort, 12), paging: paging(q, 15, 100) }));
});

exports.get = wrap(async (req, res) => {
    const p = await Product.adminGet(int(req.params.id));
    if (!p) throw new AppError('Product not found.', 404);
    ok(res, p);
});

exports.create = wrap(async (req, res) => {
    const id = await Product.save(parseProduct(req.body), req.admin.id);
    logActivity(req, 'product.create', 'product', id, { name: req.body.name });
    ok(res, { id }, 'Product added.', 201);
});

exports.update = wrap(async (req, res) => {
    const id = int(req.params.id);
    await Product.save(parseProduct(req.body), req.admin.id, id);
    logActivity(req, 'product.update', 'product', id);
    ok(res, { id }, 'Product updated.');
});

exports.setStatus = wrap(async (req, res) => {
    const status = str(req.body.status, 12), id = int(req.params.id);
    if (!['draft', 'published', 'archived'].includes(status)) throw new AppError('Unknown product status.');
    await Product.setStatus(id, status);
    logActivity(req, 'product.status', 'product', id, { status });
    ok(res, {}, 'Status updated.');
});

exports.remove = wrap(async (req, res) => {
    const id = int(req.params.id);
    await Product.remove(id);
    logActivity(req, 'product.delete', 'product', id);
    ok(res, {}, 'Product deleted.');
});

// ---- categories ----
const parseCategory = (b) => {
    const d = { name: str(b.name, 100), name_bn: str(b.name_bn, 150) || null, parent_id: int(b.parent_id) || null, sort_order: int(b.sort_order), is_active: b.is_active === undefined ? 1 : bool(b.is_active) };
    if (!d.name) throw new AppError('Category name is required.');
    return d;
};
exports.categories = wrap(async (req, res) => ok(res, await Category.adminList()));
exports.saveCategory = wrap(async (req, res) => {
    const id = req.params.id ? int(req.params.id) : null;
    const saved = await Category.save(parseCategory(req.body), id);
    logActivity(req, id ? 'category.update' : 'category.create', 'category', saved);
    ok(res, { id: saved }, id ? 'Category updated.' : 'Category added.', id ? 200 : 201);
});
exports.removeCategory = wrap(async (req, res) => {
    await Category.remove(int(req.params.id));
    logActivity(req, 'category.delete', 'category', int(req.params.id));
    ok(res, {}, 'Category deleted.');
});
