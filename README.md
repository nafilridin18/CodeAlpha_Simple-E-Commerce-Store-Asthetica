# Asthetica E-commerce

Node.js + Express + MySQL backend with a plain HTML/CSS/JS frontend. A single server handles everything.

## Features
- **User Authentication:** Secure JWT-based login for both customers and administrators.
- **Admin Panel:** Comprehensive dashboard to manage categories, products, delivery areas, coupons, and respond to product Q&As.
- **Customer Portal:** Shop pages allowing users to browse products, manage their profile, view offers, access invoices, and ask product questions.
- **Database Initialization:** Automated setup script (`npm run setup`) to scaffold tables and seed initial data.
- **Customizable Storefront:** Easily edit currency symbols, delivery zones, and coupons.

## Project Structure

```text
Ecommerce/
├── Backend/                 # Node.js backend source code
│   ├── config/              # Database & server configurations
│   ├── controllers/         # Request handlers for user and admin features
│   ├── middlewares/         # Authentication and custom middlewares
│   ├── models/              # Database models/queries
│   ├── routes/              # API endpoint definitions
│   ├── utils/               # Helper utilities
│   ├── uploads/             # Storage for uploaded product photos
│   ├── server.js            # Main application entry point
│   ├── seed.js              # Database seeding and admin reset script
│   └── .env                 # Environment variables configuration
├── Frontend/                # Frontend source files
│   ├── admin/               # Admin dashboard HTML, CSS, and JS
│   ├── user/                # Customer-facing shop HTML, CSS, and JS
│   └── assets/              # Global static assets
└── database/                
    └── schema.sql           # MySQL database table definitions
```

## How to Use

### Prerequisites
- [Node.js](https://nodejs.org/) installed
- [XAMPP](https://www.apachefriends.org/) (or any other local MySQL server)

### Installation & Setup

1. **Start MySQL:** Open XAMPP and start the MySQL module.
2. **Install Dependencies:** Navigate to the `Backend` directory and install the required npm packages.
   ```bash
   cd Backend
   npm install
   ```
3. **Configure Environment:** Check and configure `Backend/.env` (use `.env.example` as a template if needed). Set the following variables:
   - `DB_PORT`, `DB_PASSWORD`
   - `JWT_SECRET`
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD`
4. **Setup Database:** Run the setup script. This creates the necessary database, tables, the first admin account, categories, delivery areas, a `WELCOME10` coupon, and sample products.
   ```bash
   npm run setup
   ```
   *(Note: You can safely run `npm run setup` again on an existing database to add new tables, like the product Q&A table, without losing existing store data.)*

### Running the Application

1. **Start the server:**
   ```bash
   npm start
   ```
2. **Access the Store:**
   - **Shop:** http://localhost:5000
   - **Admin:** http://localhost:5000/admin/login.html
     - *Login Credentials:* Use the `ADMIN_EMAIL` and `ADMIN_PASSWORD` you set in `.env` (Default example: `admin@aesthetica.com` / `Admin@12345`). **Make sure to change the password!**

### Password Reset

If you need to reset the admin password, update `ADMIN_PASSWORD` in your `.env` file, then run:
```bash
node seed.js --reset-admin
```

## Customisation

- **Currency Symbol:** Edit `CONFIG.currency` at the top of both `Frontend/user/js/user-script.js` and `Frontend/admin/js/admin-script.js` (default is `৳`).
- **Store Data:** Delivery areas, coupons, and categories are all dynamically editable from the Admin Panel.
