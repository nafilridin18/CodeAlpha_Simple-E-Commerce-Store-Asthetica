<<<<<<< HEAD
# Aesthetica E-commerce

Node.js + Express + MySQL backend, plain HTML/CSS/JS frontend. One server runs everything.

## Run (XAMPP)
1. Start **MySQL** in XAMPP.
2. `cd Backend` then `npm install`
3. Check `Backend/.env` (DB_PORT, DB_PASSWORD, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD).
4. `npm run setup`  creates the database/tables, the first admin, categories, delivery areas, a WELCOME10 coupon and sample products.
5. `npm start`
   - Shop: http://localhost:5000
   - Admin: http://localhost:5000/admin/login.html (login = ADMIN_EMAIL / ADMIN_PASSWORD from .env, change the password!)

Reset the admin password: set ADMIN_PASSWORD in `.env`, then `node seed.js --reset-admin`.

Run `npm run setup` again on an existing database to add the product Q&A table; existing store data is preserved. Customers can manage profile, offers, and invoices from **My account**. Admins reply to product questions from **Product Q&A**.

## Structure
- `Backend/` : server.js, routes/, controllers/user|admin, models/, middlewares/, utils/, seed.js, uploads/ (product photos)
- `Frontend/user/` : shop pages + js/user-script.js + css/user-style.css
- `Frontend/admin/` : admin pages + js/admin-script.js + css/admin-style.css
- `database/schema.sql` : table definitions

## Customise
- Currency symbol: `CONFIG.currency` at the top of both user-script.js and admin-script.js (default ৳).
- Delivery areas, coupons, categories: all editable from the admin panel.
email: admin@aesthetica.com
pass: Admin@12345
=======
# CodeAlpha_Simple-E-Commerce-Store-Asthetica
>>>>>>> 16310daaf10b9a32b365b60a84397b3687303cd2
