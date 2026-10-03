const Product = require('../../models/Product');
const { Category, DeliveryArea } = require('../../models/Catalog');
const { AppError, wrap, ok, str, int, paging } = require('../../utils/helpers');

exports.list = wrap(async (req, res) => {
    const q = req.query;
    const data = await Product.list({
        search: str(q.q, 80), category: str(q.category, 120), sort: str(q.sort, 20), min: q.min, max: q.max, flag: str(q.flag, 10),
        paging: paging(q, 12, 48)
    });
    ok(res, data);
});

exports.byIds = wrap(async (req, res) => {
    const ids = [...new Set(String(req.query.ids || '').split(',').map((n) => int(n)).filter(Boolean))].slice(0, 60);
    ok(res, await Product.byIds(ids));
});

exports.detail = wrap(async (req, res) => {
    const p = await Product.detail(str(req.params.key, 220));
    if (!p) throw new AppError('This product could not be found.', 404);
    ok(res, p);
});

exports.categories = wrap(async (req, res) => ok(res, await Category.publicList()));
exports.deliveryAreas = wrap(async (req, res) => ok(res, await DeliveryArea.list(true)));
