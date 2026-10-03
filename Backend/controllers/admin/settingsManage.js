const { DeliveryArea, Coupon } = require('../../models/Catalog');
const { AppError, wrap, ok, str, num, int, bool, paging, logActivity } = require('../../utils/helpers');

// ---- delivery areas ----
const parseArea = (b) => {
    const d = { area_name: str(b.area_name, 100), delivery_charge: num(b.delivery_charge, NaN), estimated_days: str(b.estimated_days, 30) || null, is_active: b.is_active === undefined ? 1 : bool(b.is_active) };
    if (!d.area_name) throw new AppError('Area name is required.');
    if (!Number.isFinite(d.delivery_charge) || d.delivery_charge < 0) throw new AppError('Delivery charge must be 0 or more.');
    return d;
};
exports.areas = wrap(async (req, res) => ok(res, await DeliveryArea.list(false)));
exports.saveArea = wrap(async (req, res) => {
    const id = req.params.id ? int(req.params.id) : null;
    const saved = await DeliveryArea.save(parseArea(req.body), id);
    logActivity(req, id ? 'area.update' : 'area.create', 'delivery_area', saved);
    ok(res, { id: saved }, id ? 'Delivery area updated.' : 'Delivery area added.', id ? 200 : 201);
});
exports.removeArea = wrap(async (req, res) => { await DeliveryArea.remove(int(req.params.id)); ok(res, {}, 'Delivery area deleted.'); });

// ---- coupons ----
const dt = (v) => { const s = str(v, 25); return s ? s.replace('T', ' ').slice(0, 16) + ':00' : null; };
const optNum = (v) => (v === '' || v == null ? null : num(v, NaN));
const parseCoupon = (b) => {
    const d = {
        code: str(b.code, 50).toUpperCase(), type: str(b.type, 12), value: num(b.value, NaN), min_order_amount: optNum(b.min_order_amount) ?? 0,
        max_discount_amount: optNum(b.max_discount_amount), usage_limit: b.usage_limit === '' || b.usage_limit == null ? null : int(b.usage_limit),
        usage_limit_per_customer: b.usage_limit_per_customer === '' || b.usage_limit_per_customer == null ? null : int(b.usage_limit_per_customer),
        starts_at: dt(b.starts_at), expires_at: dt(b.expires_at), is_active: b.is_active === undefined ? 1 : bool(b.is_active)
    };
    if (!/^[A-Z0-9_-]{3,50}$/.test(d.code)) throw new AppError('Coupon code must be 3–50 letters, numbers, - or _.');
    if (!['percentage', 'fixed'].includes(d.type)) throw new AppError('Choose a coupon type.');
    if (!Number.isFinite(d.value) || d.value <= 0) throw new AppError('Coupon value must be greater than 0.');
    if (d.type === 'percentage' && d.value > 100) throw new AppError('A percentage coupon cannot exceed 100%.');
    if (!Number.isFinite(d.min_order_amount) || d.min_order_amount < 0) throw new AppError('Minimum order must be 0 or more.');
    if (d.max_discount_amount !== null && !Number.isFinite(d.max_discount_amount)) throw new AppError('Maximum discount must be a number.');
    if (d.starts_at && d.expires_at && d.starts_at >= d.expires_at) throw new AppError('Expiry must be after the start date.');
    return d;
};
exports.coupons = wrap(async (req, res) => ok(res, await Coupon.list(paging(req.query, 20, 100))));
exports.saveCoupon = wrap(async (req, res) => {
    const id = req.params.id ? int(req.params.id) : null;
    const saved = await Coupon.save(parseCoupon(req.body), req.admin.id, id);
    logActivity(req, id ? 'coupon.update' : 'coupon.create', 'coupon', saved);
    ok(res, { id: saved }, id ? 'Coupon updated.' : 'Coupon created.', id ? 200 : 201);
});
exports.removeCoupon = wrap(async (req, res) => { await Coupon.remove(int(req.params.id)); ok(res, {}, 'Coupon deleted.'); });
