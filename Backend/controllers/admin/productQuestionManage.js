const ProductQuestion = require('../../models/ProductQuestion');
const { AppError, wrap, ok, str, int, logActivity } = require('../../utils/helpers');

exports.list = wrap(async (req, res) => {
    ok(res, await ProductQuestion.adminList(str(req.query.status, 20) || 'all'));
});

exports.answer = wrap(async (req, res) => {
    const id = int(req.params.id), answer = str(req.body.answer, 2000), status = str(req.body.status, 20);
    if (!id) throw new AppError('Invalid question.');
    await ProductQuestion.answer(id, req.admin.id, { answer, status });
    logActivity(req, 'product.question.answer', 'product_question', id, { status });
    ok(res, { id, status }, 'Question updated.');
});
