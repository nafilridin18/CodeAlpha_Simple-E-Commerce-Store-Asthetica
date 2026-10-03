const ProductQuestion = require('../../models/ProductQuestion');
const { AppError, wrap, ok, str } = require('../../utils/helpers');

exports.list = wrap(async (req, res) => {
    const productId = await ProductQuestion.publishedProductId(str(req.params.key, 220));
    if (!productId) throw new AppError('This product could not be found.', 404);
    ok(res, await ProductQuestion.forProduct(productId));
});

exports.ask = wrap(async (req, res) => {
    const productId = await ProductQuestion.publishedProductId(str(req.params.key, 220));
    if (!productId) throw new AppError('This product could not be found.', 404);
    const body = str(req.body.body, 1000);
    if (body.length < 8) throw new AppError('Please write at least 8 characters.');
    const kind = req.body.kind === 'comment' ? 'comment' : 'question';
    const id = await ProductQuestion.create({ productId, customerId: req.customer.id, kind, body });
    ok(res, { id, status: 'pending' }, 'Sent to the store. It will appear here after an admin replies.', 201);
});
