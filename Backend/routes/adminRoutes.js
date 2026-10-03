const router = require('express').Router();
const admin = require('../controllers/admin/adminController');
const products = require('../controllers/admin/productManage');
const orders = require('../controllers/admin/orderManage');
const questions = require('../controllers/admin/productQuestionManage');
const settings = require('../controllers/admin/settingsManage');
const { verifyAdmin } = require('../middlewares/auth');
const limit = require('../middlewares/rateLimit');

router.post('/login', limit({ max: 8 }), admin.adminLogin);

// Everything below needs an admin token
router.use(verifyAdmin);
router.get('/dashboard', admin.dashboard);
router.get('/customers', admin.customers);

// (the 9 MB body parser for this route is registered in server.js)
router.post('/upload', products.upload);

router.get('/products', products.list);
router.post('/products', products.create);
router.post('/product/add', products.create); // legacy path
router.get('/products/:id', products.get);
router.put('/products/:id', products.update);
router.patch('/products/:id/status', products.setStatus);
router.delete('/products/:id', products.remove);

router.get('/categories', products.categories);
router.post('/categories', products.saveCategory);
router.put('/categories/:id', products.saveCategory);
router.delete('/categories/:id', products.removeCategory);

router.get('/orders', orders.getAllOrders);
router.get('/orders/:id', orders.getOrder);
router.patch('/orders/:id', orders.updateStatus);

router.get('/questions', questions.list);
router.patch('/questions/:id', questions.answer);

router.get('/delivery-areas', settings.areas);
router.post('/delivery-areas', settings.saveArea);
router.put('/delivery-areas/:id', settings.saveArea);
router.delete('/delivery-areas/:id', settings.removeArea);

router.get('/coupons', settings.coupons);
router.post('/coupons', settings.saveCoupon);
router.put('/coupons/:id', settings.saveCoupon);
router.delete('/coupons/:id', settings.removeCoupon);

module.exports = router;
