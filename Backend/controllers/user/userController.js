const bcrypt = require('bcryptjs');
const User = require('../../models/User');
const Product = require('../../models/Product');
const { Category, Coupon } = require('../../models/Catalog');
const { signCustomer } = require('../../middlewares/auth');
const { AppError, wrap, ok, str, int, isEmail, isPhone, cleanPhone } = require('../../utils/helpers');

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone });

exports.getHomeData = wrap(async (req, res) => {
    const paging = { page: 1, limit: 8, offset: 0 };
    const [featured, newArrivals, bestSelling, categories] = await Promise.all([
        Product.list({ flag: 'featured', paging }),
        Product.list({ flag: 'new', paging }),
        Product.list({ flag: 'best', paging }),
        Category.publicList()
    ]);
    let featuredItems = featured.items;
    if (!featuredItems.length) featuredItems = (await Product.list({ paging })).items; // nothing featured yet → show newest
    ok(res, { featured: featuredItems, newArrivals: newArrivals.items, bestSelling: bestSelling.items, categories });
});

exports.registerUser = wrap(async (req, res) => {
    const name = str(req.body.name, 100), phone = cleanPhone(str(req.body.phone, 20));
    const email = str(req.body.email, 150).toLowerCase() || null, password = String(req.body.password || '');
    if (name.length < 2) throw new AppError('Please enter your full name.');
    if (!isPhone(phone)) throw new AppError('Please enter a valid phone number.');
    if (email && !isEmail(email)) throw new AppError('Please enter a valid email address.');
    if (password.length < 6) throw new AppError('Password must be at least 6 characters.');

    const taken = await User.phoneOrEmailTaken(phone, email);
    if (taken) throw new AppError(taken.phone === phone ? 'This phone number is already registered. Try logging in.' : 'This email is already registered. Try logging in.', 409);

    const id = await User.createCustomer({ name, email, phone, password_hash: await bcrypt.hash(password, 10) });
    const user = { id, name, email, phone };
    ok(res, { token: signCustomer(user), user: publicUser(user) }, 'Welcome! Your account is ready.', 201);
});

exports.loginUser = wrap(async (req, res) => {
    const identifier = str(req.body.identifier, 150);
    const password = String(req.body.password || '');
    if (!identifier || !password) throw new AppError('Enter your phone or email and password.');
    // Users may type phone with spaces/dashes; try both raw and cleaned
    const user = (await User.findCustomerByEmailOrPhone(identifier.toLowerCase())) || (await User.findCustomerByEmailOrPhone(cleanPhone(identifier)));
    const good = user && user.password_hash && (await bcrypt.compare(password, user.password_hash));
    if (!good) throw new AppError('Incorrect phone/email or password.', 401);
    ok(res, { token: signCustomer(user), user: publicUser(user) }, 'Logged in.');
});

exports.me = wrap(async (req, res) => {
    const u = await User.findCustomerById(req.customer.id);
    if (!u) throw new AppError('Account not found.', 401);
    ok(res, u);
});

exports.updateMe = wrap(async (req, res) => {
    const name = str(req.body.name, 100), phone = cleanPhone(str(req.body.phone, 20));
    const email = str(req.body.email, 150).toLowerCase() || null;
    const address = str(req.body.address, 255), city = str(req.body.city, 100);
    if (name.length < 2) throw new AppError('Please enter your full name.');
    if (!isPhone(phone)) throw new AppError('Please enter a valid phone number.');
    if (email && !isEmail(email)) throw new AppError('Please enter a valid email address.');
    if (await User.customerContactTaken(phone, email, req.customer.id)) throw new AppError('That phone number or email is already in use.', 409);
    const user = await User.updateCustomer(req.customer.id, { name, email, phone, address, city });
    if (!user) throw new AppError('Account not found.', 404);
    ok(res, user, 'Profile updated.');
});

exports.coupons = wrap(async (req, res) => {
    const user = await User.findCustomerById(req.customer.id);
    ok(res, await Coupon.publicOffers(req.customer.id, user?.phone));
});

exports.getWishlist = wrap(async (req, res) => ok(res, { ids: await User.wishlistIds(req.customer.id) }));

exports.toggleWishlist = wrap(async (req, res) => {
    const id = int(req.params.productId);
    if (!id) throw new AppError('Invalid product.');
    const added = await User.toggleWishlist(req.customer.id, id);
    ok(res, { added }, added ? 'Saved to your wishlist.' : 'Removed from your wishlist.');
});
