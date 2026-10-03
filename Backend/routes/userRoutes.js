const router = require('express').Router();
const user = require('../controllers/user/userController');
const products = require('../controllers/user/productController');
const questions = require('../controllers/user/productQuestionController');
const cart = require('../controllers/user/cartController');
const orders = require('../controllers/user/orderController');
const { verifyCustomer, optionalCustomer } = require('../middlewares/auth');
const limit = require('../middlewares/rateLimit');

const authLimit = limit({ max: 10 });
const lookupLimit = limit({ max: 20 });
const questionLimit = limit({ max: 5 });

// Public catalog
router.get('/home', user.getHomeData);
router.get('/products', products.list);
router.get('/products/by-ids', products.byIds);
router.get('/products/:key', products.detail);
router.get('/products/:key/questions', questions.list);
router.post('/products/:key/questions', verifyCustomer, questionLimit, questions.ask);
router.get('/categories', products.categories);
router.get('/delivery-areas', products.deliveryAreas);

// Auth
router.post('/register', authLimit, user.registerUser);
router.post('/login', authLimit, user.loginUser);
router.get('/me', verifyCustomer, user.me);
router.patch('/me', verifyCustomer, user.updateMe);
router.get('/coupons', verifyCustomer, user.coupons);

// Cart & checkout (guests allowed)
router.post('/cart/validate', cart.validate);
router.post('/coupon/validate', optionalCustomer, orders.couponPreview);
router.post('/order/place', optionalCustomer, limit({ max: 15 }), orders.placeOrder);
router.get('/order/track', lookupLimit, orders.track);

// Logged-in customers
router.get('/orders', verifyCustomer, orders.myOrders);
router.get('/wishlist', verifyCustomer, user.getWishlist);
router.post('/wishlist/:productId', verifyCustomer, user.toggleWishlist);

module.exports = router;
