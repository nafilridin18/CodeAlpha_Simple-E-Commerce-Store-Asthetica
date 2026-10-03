/* Aesthetica storefront — one script drives every page (see <body data-page="...">) */
(() => {
'use strict';

const CONFIG = { currency: '৳', store: 'AESTHETICA' };   // change the currency symbol here
const local = ['localhost', '127.0.0.1', ''].includes(location.hostname);
const isAppPort = /^500[0-9]$/.test(location.port);
const ORIGIN = local && !isAppPort ? 'http://localhost:5000' : '';
const API = ORIGIN + '/api/user';
const BANNERS_API = ORIGIN + '/api/banners';

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => CONFIG.currency + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
};
const imgUrl = (p) => (/^https?:/.test(p) ? p : ORIGIN + p);
const bannerUrl = (p) => (/^https?:/i.test(p || '') ? p : `${ORIGIN}/${String(p || '').replace(/^\/+/, '')}`);
const bannerMedia = (banner, className) => {
    if (!banner?.media_path) return '';
    const src = esc(bannerUrl(banner.media_path));
    return banner.media_type === 'video'
        ? `<video class="${className}" autoplay muted loop playsinline preload="metadata"><source src="${src}" type="video/mp4"></video>`
        : `<img class="${className}" src="${src}" alt="${esc(banner.title || '')}" loading="eager" decoding="async">`;
};
const pdUrl = (p) => `product-details.html?id=${p.id}`;
const debounce = (fn, ms = 350) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const safeNext = (n) => (/^[\w-]+\.html(\?[\w=&%.-]*)?$/.test(n || '') ? n : 'index.html');
const dateStr = (s) => { const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };

const S = { cart: store.get('aes_cart', []), auth: store.get('aes_auth', null), wish: new Set(), products: new Map(), banners: null };
const invoiceOrders = new Map();
const page = document.body.dataset.page || 'home';
const getTheme = () => localStorage.getItem('aes_theme') || 'light';
const applyTheme = () => {
    const isDark = getTheme() === 'dark';
    document.body.classList.toggle('dark-theme', isDark);
    const btn = document.querySelector('[data-theme-toggle]');
    if (btn) {
        btn.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
        btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    }
};

async function api(path, { method = 'GET', body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (S.auth?.token) headers.Authorization = 'Bearer ' + S.auth.token;
    let res;
    try { res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined }); }
    catch { throw new Error('Cannot reach the server. Check your internet connection and try again.'); }
    let data = {};
    try { data = await res.json(); } catch { /* non-JSON */ }
    if (res.status === 401 && S.auth) { S.auth = null; store.del('aes_auth'); renderAccount(); }
    if (!res.ok || data.success === false) { const e = new Error(data.message || 'Something went wrong. Please try again.'); e.status = res.status; throw e; }
    return data;
}

function toast(msg, type = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + type; el.setAttribute('role', 'status'); el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 3600);
}
const view = (html) => { $('#app').innerHTML = html; };
const setTitle = (t) => { document.title = t ? `${t} · ${CONFIG.store}` : CONFIG.store; };
const skeletons = (n = 4) => `<div class="grid">${'<div class="skeleton"></div>'.repeat(n)}</div>`;
const empty = (title, text, btn = '<a class="btn" href="shop.html">Browse the shop</a>') => `<div class="empty container"><h2>${esc(title)}</h2><p>${esc(text)}</p>${btn}</div>`;
const initial = (n) => esc(String(n || '?').trim().charAt(0).toUpperCase());
const img = (src, name) => (src ? `<img src="${esc(imgUrl(src))}" alt="${esc(name)}" loading="lazy" decoding="async">` : `<span class="ph" aria-hidden="true">${initial(name)}</span>`);

// ---------- cart ----------
const cartCount = () => S.cart.reduce((n, i) => n + i.quantity, 0);
function saveCart() { store.set('aes_cart', S.cart); badges(); }
function addToCart(item, stock) {
    const ex = S.cart.find((i) => i.product_id === item.product_id && (i.variant_id || null) === (item.variant_id || null));
    const next = (ex ? ex.quantity : 0) + item.quantity;
    if (stock != null && next > stock) { toast(stock > 0 ? `Only ${stock} available.` : 'Sorry, this is out of stock.', 'error'); return false; }
    if (ex) Object.assign(ex, item, { quantity: Math.min(next, 99) }); else S.cart.push({ ...item, variant_id: item.variant_id || null });
    saveCart(); return true;
}
const cartPayload = () => S.cart.map(({ product_id, variant_id, quantity }) => ({ product_id, variant_id, quantity }));

// ---------- wishlist ----------
async function toggleWish(id) {
    if (S.auth) {
        try { const r = await api('/wishlist/' + id, { method: 'POST' }); r.data.added ? S.wish.add(id) : S.wish.delete(id); toast(r.message, 'ok'); }
        catch (e) { toast(e.message, 'error'); return; }
    } else {
        S.wish.has(id) ? S.wish.delete(id) : S.wish.add(id);
        store.set('aes_wish', [...S.wish]);
        toast(S.wish.has(id) ? 'Saved to your wishlist.' : 'Removed from your wishlist.', 'ok');
    }
    $$(`[data-wish="${id}"]`).forEach((b) => {
        const on = S.wish.has(id);
        b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
        const i = $('i', b); if (i) i.className = `fa-${on ? 'solid' : 'regular'} fa-heart`;
    });
    badges();
    if (page === 'wishlist') pages.wishlist();
}

// ---------- layout ----------
function layout() {
    const here = { home: 'home', shop: 'shop', product: 'shop', orders: 'orders' }[page];
    const nav = (id, href, label) => `<a href="${href}" class="${here === id ? 'active' : ''}">${label}</a>`;
        const logo = S.banners?.current_logo ? `<img src="${esc(bannerUrl(S.banners.current_logo))}" alt="${CONFIG.store}" decoding="async">` : CONFIG.store;
    document.body.insertAdjacentHTML('afterbegin', `
<header class="site-header"><div class="nav">
  <button class="icon-btn menu-btn" data-menu aria-label="Open menu"><i class="fa-solid fa-bars"></i></button>
    <a class="logo" href="index.html">${logo}</a>
  <nav class="nav-links" aria-label="Main">${nav('home', 'index.html', 'Home')}${nav('shop', 'shop.html', 'Shop')}${nav('orders', 'orders.html', 'Track order')}</nav>
  <form class="search" action="shop.html" role="search"><input name="q" type="search" placeholder="Search products" aria-label="Search products"><button aria-label="Search"><i class="fa-solid fa-magnifying-glass"></i></button></form>
  <div class="nav-icons">
    <button class="icon-btn" data-theme-toggle aria-label="Switch theme"><i class="fa-solid fa-moon"></i></button>
    <a class="icon-btn" href="wishlist.html" aria-label="Wishlist"><i class="fa-regular fa-heart"></i><span class="badge" id="wishBadge"></span></a>
    <a class="icon-btn" href="cart.html" aria-label="Cart"><i class="fa-solid fa-bag-shopping"></i><span class="badge" id="cartBadge"></span></a>
    <div class="acct" id="acct"></div>
  </div>
</div></header>`);
    applyTheme();
    document.body.insertAdjacentHTML('beforeend', `
<footer><div class="container"><div class="foot">
  <div><h4>${CONFIG.store}</h4><p>Earthy home, wardrobe and lifestyle pieces. Pay cash when your order arrives.</p></div>
  <div><h4>Shop</h4><a href="shop.html">All products</a><a href="shop.html?sort=price_asc">Lowest price</a><a href="wishlist.html">Wishlist</a></div>
  <div><h4>Help</h4><a href="orders.html">Track your order</a><a href="login-register.html">Log in or register</a></div>
</div><p class="copy">&copy; ${new Date().getFullYear()} ${CONFIG.store}. All rights reserved.</p></div></footer><div id="toasts" aria-live="polite"></div>`);
    renderAccount(); badges();
}
function renderAccount() {
    const box = $('#acct'); if (!box) return;
    const u = S.auth?.user;
    box.innerHTML = u
          ? `<button class="icon-btn" data-acct aria-label="My account" aria-expanded="false" title="My account"><i class="fa-regular fa-user"></i></button>
              <div class="acct-menu" hidden><p>Hi, ${esc(u.name.split(' ')[0])}</p><a href="account.html">My account</a><a href="orders.html">My orders</a><a href="wishlist.html">Wishlist</a><button data-logout>Log out</button></div>`
          : `<a class="icon-btn" href="login-register.html?next=account.html" aria-label="My account"><i class="fa-regular fa-user"></i></a>`;
}
function badges() {
    const set = (id, n) => { const b = $('#' + id); if (b) { b.textContent = n || ''; b.dataset.n = n; } };
    set('cartBadge', cartCount()); set('wishBadge', S.wish.size);
}

// ---------- shared pieces ----------
function card(p) {
    S.products.set(p.id, p);
    const sale = Number(p.sale_price), reg = Number(p.price), onSale = sale < reg, out = p.stock_quantity <= 0, on = S.wish.has(p.id);
    const tag = onSale ? `<span class="tag sale">-${Math.round((1 - sale / reg) * 100)}%</span>` : p.is_new_arrival ? '<span class="tag">New</span>' : '';
    const action = out ? '<button class="btn btn-ghost" disabled>Sold out</button>'
        : p.variant_count > 0 ? `<a class="btn btn-ghost" href="${pdUrl(p)}">Choose options</a>`
        : `<button class="btn btn-ghost" data-quick="${p.id}">Add to cart</button>`;
    return `<article class="card">
  <a class="card-img" href="${pdUrl(p)}" aria-label="${esc(p.name)}">${img(p.image, p.name)}${tag}${out ? '<span class="tag out">Sold out</span>' : ''}</a>
  <button class="wish ${on ? 'on' : ''}" data-wish="${p.id}" aria-pressed="${on}" aria-label="Save ${esc(p.name)} to wishlist"><i class="fa-${on ? 'solid' : 'regular'} fa-heart"></i></button>
  <div class="card-body"><a class="card-title" href="${pdUrl(p)}">${esc(p.name)}</a>
    <div class="price"><b>${money(sale)}</b>${onSale ? `<s>${money(reg)}</s>` : ''}</div>${action}</div></article>`;
}
const section = (title, items, link) => items.length ? `<section class="section"><div class="section-head"><h2>${title}</h2>${link ? `<a href="${link}">View all</a>` : ''}</div><div class="grid">${items.map(card).join('')}</div></section>` : '';
const pill = (s) => `<span class="pill ${esc(s)}">${esc(s)}</span>`;
const STEPS = ['new', 'processing', 'shipped', 'delivered'];
const LABEL = { new: 'Placed', processing: 'Processing', shipped: 'Shipped', delivered: 'Delivered' };
const timeline = (s) => !STEPS.includes(s) ? pill(s)
    : `<ol class="steps" aria-label="Order progress">${STEPS.map((x, i) => `<li class="${i <= STEPS.indexOf(s) ? 'done' : ''}${x === s ? ' now' : ''}">${LABEL[x]}</li>`).join('')}</ol>`;
const itemsList = (items) => `<ul>${(items || []).map((i) => `<li><span>${esc(i.product_name)}${i.size ? ` (${esc(i.size)}${i.color ? ', ' + esc(i.color) : ''})` : ''} × ${i.quantity}</span><span>${money(i.line_total)}</span></li>`).join('')}</ul>`;

// ---------- pages ----------
const pages = {};

pages.home = async () => {
    setTitle('');
    const hero = S.banners?.banners?.hero_banner;
    const heroMedia = bannerMedia(hero, 'hero-media');
    const heroTitle = hero?.title?.trim() || 'Earthy pieces for home and wardrobe';
    view(`<section class="hero${heroMedia ? ' has-media' : ''}">${heroMedia}<div class="container"><h1>${esc(heroTitle)}</h1><p>Ceramics, linen, candles and everyday things in warm, natural tones — delivered to your door, pay on arrival.</p><a class="btn" href="shop.html">Shop the collection</a></div></section>
<div class="container" id="homeBody">${skeletons(4)}</div>`);
    const { featured, newArrivals, bestSelling, categories } = (await api('/home')).data;
    const cats = categories.filter((c) => c.product_count > 0);
    const catHtml = cats.length ? `<section class="section"><div class="section-head"><h2>Shop by category</h2></div><div class="cats">${cats.map((c) => {
        const categoryBanner = S.banners?.banners?.[`cat_img_${c.id}`];
        const artwork = categoryBanner?.media_path ? bannerMedia(categoryBanner, 'cat-media') : `<span class="ph">${initial(c.name)}</span>`;
        return `<a class="cat" href="shop.html?category=${encodeURIComponent(c.slug)}">${artwork}<span><b>${esc(c.name)}</b><small>${c.product_count} item${c.product_count > 1 ? 's' : ''}</small></span></a>`;
    }).join('')}</div></section>` : '';
    const promoHtml = Object.entries(S.banners?.banners || {}).filter(([key, banner]) => key !== 'hero_banner' && !key.startsWith('cat_img_') && banner.media_path)
        .map(([, banner]) => `<section class="promo-banner">${bannerMedia(banner, 'promo-media')}<div class="promo-copy">${banner.title ? `<h2>${esc(banner.title)}</h2>` : ''}<a class="btn" href="shop.html">Explore the collection</a></div></section>`).join('');
    const body = catHtml + promoHtml + section('Featured', featured, 'shop.html?flag=featured') + section('New arrivals', newArrivals, 'shop.html?flag=new') + section('Best sellers', bestSelling, 'shop.html?flag=best');
    $('#homeBody').innerHTML = body || empty('The shelves are being stocked', 'New products will appear here soon. Please check back shortly.', '');
};

pages.shop = async () => {
    setTitle('Shop');
    const q = new URLSearchParams(location.search);
    const f = { q: q.get('q') || '', category: q.get('category') || '', sort: q.get('sort') || 'newest', min: q.get('min') || '', max: q.get('max') || '', flag: q.get('flag') || '' };
    let cur = 1, pages_ = 1;
    const cats = (await api('/categories')).data;
    view(`<div class="container"><h1 class="page-title">${f.flag === 'new' ? 'New arrivals' : f.flag === 'best' ? 'Best sellers' : f.flag === 'featured' ? 'Featured' : 'Shop'}</h1>
<form class="filters" id="filters" role="search">
  <input name="q" type="search" placeholder="Search products" aria-label="Search" value="${esc(f.q)}">
  <select name="category" aria-label="Category"><option value="">All categories</option>${cats.map((c) => `<option value="${esc(c.slug)}" ${c.slug === f.category ? 'selected' : ''}>${esc(c.name)} (${c.product_count})</option>`).join('')}</select>
  <select name="sort" aria-label="Sort by">${[['newest', 'Newest'], ['popular', 'Most viewed'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['name', 'Name A–Z']].map(([v, l]) => `<option value="${v}" ${v === f.sort ? 'selected' : ''}>${l}</option>`).join('')}</select>
  <input name="min" type="number" min="0" placeholder="Min ${CONFIG.currency}" aria-label="Minimum price" value="${esc(f.min)}">
  <input name="max" type="number" min="0" placeholder="Max ${CONFIG.currency}" aria-label="Maximum price" value="${esc(f.max)}">
  <button type="button" class="link-btn" id="clear">Clear</button>
</form><p class="muted" id="count" aria-live="polite"></p><div id="grid" class="grid"></div><div class="center" style="margin-top:28px"><button class="btn btn-ghost" id="more" hidden>Load more</button></div></div>`);
    const grid = $('#grid'), more = $('#more');
    async function load(reset) {
        if (reset) { cur = 1; grid.innerHTML = '<div class="skeleton"></div>'.repeat(4); }
        const p = new URLSearchParams({ page: cur, limit: 12, sort: f.sort });
        ['q', 'category', 'min', 'max', 'flag'].forEach((k) => f[k] && p.set(k, f[k]));
        more.disabled = true;
        try {
            const { data } = await api('/products?' + p);
            pages_ = data.pages;
            if (reset) grid.innerHTML = '';
            grid.insertAdjacentHTML('beforeend', data.items.map(card).join(''));
            $('#count').textContent = data.total ? `${data.total} product${data.total > 1 ? 's' : ''}` : '';
            if (!data.total) grid.innerHTML = `<div style="grid-column:1/-1">${empty('No products found', 'Try a different search or clear the filters.', '')}</div>`;
        } catch (e) { grid.innerHTML = `<div class="notice err" style="grid-column:1/-1">${esc(e.message)}</div>`; }
        more.hidden = cur >= pages_; more.disabled = false;
    }
    const sync = () => {
        const fd = new FormData($('#filters'));
        ['q', 'category', 'sort', 'min', 'max'].forEach((k) => { f[k] = String(fd.get(k) || '').trim(); });
        const u = new URLSearchParams(); Object.entries(f).forEach(([k, v]) => v && u.set(k, v));
        history.replaceState(null, '', u.toString() ? '?' + u : location.pathname);
        load(true);
    };
    $('#filters').addEventListener('input', debounce(sync, 400));
    $('#filters').addEventListener('submit', (e) => { e.preventDefault(); sync(); });
    $('#clear').onclick = () => { $('#filters').reset(); $$('#filters input,#filters select').forEach((i) => { i.value = i.name === 'sort' ? 'newest' : ''; }); f.flag = ''; sync(); };
    more.onclick = () => { cur++; load(false); };
    load(true);
};

pages.product = async () => {
    const id = new URLSearchParams(location.search).get('id');
    if (!id) return view(empty('Product not found', 'That link looks incomplete.'));
    view(`<div class="container"><div class="pd"><div class="skeleton"></div><div class="skeleton"></div></div></div>`);
    let p;
    try { p = (await api('/products/' + encodeURIComponent(id))).data; } catch (e) { return view(empty('Product not found', e.message)); }
    setTitle(p.meta_title || p.name);
    const md = $('meta[name="description"]'); if (md) md.content = p.meta_description || p.short_description || p.name;
    p.related.forEach((r) => S.products.set(r.id, r));
    const vs = p.variants, hasV = vs.length > 0;
    const sizes = [...new Set(vs.map((v) => v.size))];
    const colors = [...new Map(vs.map((v) => [v.color, v.color_hex])).entries()];
    const sel = { size: sizes.length === 1 ? sizes[0] : null, color: colors.length === 1 ? colors[0][0] : null, qty: 1, shot: 0 };
    const cur = () => vs.find((v) => v.size === sel.size && v.color === sel.color);
    const avail = (size, color) => vs.some((v) => (!size || v.size === size) && (!color || v.color === color) && v.stock_quantity > 0);
    const images = p.images.length ? p.images.map((i) => i.image_path) : [null];

    view(`<div class="container"><p class="crumbs"><a href="index.html">Home</a> / <a href="shop.html?category=${encodeURIComponent(p.category_slug)}">${esc(p.category_name)}</a></p>
<div class="pd"><div><div class="gallery-main" id="main"></div><div class="thumbs" id="thumbs"></div></div>
<div><h1>${esc(p.name)}</h1>${p.short_description ? `<p class="muted">${esc(p.short_description)}</p>` : ''}<div id="buy"></div>
${p.description ? `<div class="desc">${esc(p.description).replace(/\n/g, '<br>')}</div>` : ''}</div></div>
<section class="section qna" id="questions"><div class="section-head"><h2>Questions &amp; comments</h2><span class="muted">Answered by our store team</span></div><div id="questionList"><p class="muted">Loading…</p></div>
${S.auth ? `<form class="panel qa-form" id="questionForm"><h3>Ask about this product</h3><div class="row2"><div class="field"><label for="questionKind">Message type</label><select id="questionKind"><option value="question">Question</option><option value="comment">Comment</option></select></div><div class="field"><label for="questionBody">Your message</label><textarea id="questionBody" rows="3" minlength="8" maxlength="1000" required placeholder="Ask about size, material, delivery, or share a comment"></textarea></div></div><p class="muted" id="questionMessage" aria-live="polite"></p><button class="btn" type="submit">Send to the store</button></form>`
: `<div class="panel qa-signin"><p>Sign in to ask a question or leave a comment.</p><a class="btn btn-ghost" href="login-register.html?next=${encodeURIComponent(location.pathname.split('/').pop() + location.search)}">Log in</a></div>`}</section>
${section('You may also like', p.related)}</div>`);

    const paintGallery = () => {
        $('#main').innerHTML = `<button class="zoom-trigger" type="button" data-zoom-image aria-label="Zoom ${esc(p.name)}">${img(images[sel.shot], p.name)}${images[sel.shot] ? '<span class="zoom-hint"><i class="fa-solid fa-magnifying-glass-plus"></i></span>' : ''}</button>`;
        $('#thumbs').innerHTML = images.length > 1 ? images.map((s, i) => `<button class="${i === sel.shot ? 'on' : ''}" data-shot="${i}" aria-label="Photo ${i + 1}">${img(s, p.name)}</button>`).join('') : '';
    };
    const openZoom = (trigger) => {
        const src = images[sel.shot];
        if (!src) return;
        let scale = 1;
        const zoom = document.createElement('dialog');
        zoom.className = 'zoom-modal';
        zoom.setAttribute('aria-label', `Zoomed ${p.name}`);
        zoom.innerHTML = `<section class="zoom-dialog"><div class="zoom-toolbar"><button type="button" data-zoom-out aria-label="Zoom out" title="Zoom out"><i class="fa-solid fa-minus"></i></button><output data-zoom-level>100%</output><button type="button" data-zoom-in aria-label="Zoom in" title="Zoom in"><i class="fa-solid fa-plus"></i></button><button type="button" data-zoom-reset aria-label="Reset zoom" title="Reset zoom"><i class="fa-solid fa-arrows-to-circle"></i></button><button type="button" data-zoom-close aria-label="Close zoom" title="Close"><i class="fa-solid fa-xmark"></i></button></div><div class="zoom-stage" tabindex="0"><img class="zoom-image" src="${esc(imgUrl(src))}" alt="${esc(p.name)}"></div></section>`;
        document.body.appendChild(zoom);
        const image = $('.zoom-image', zoom), level = $('[data-zoom-level]', zoom), stage = $('.zoom-stage', zoom);
        const setZoom = (value) => { scale = Math.min(3, Math.max(1, value)); image.style.transform = `scale(${scale})`; level.value = `${Math.round(scale * 100)}%`; };
        const close = () => {
            if (!zoom.open) return;
            zoom.close();
            document.removeEventListener('keydown', onKey);
            zoom.remove();
            trigger.focus();
        };
        const onKey = (event) => {
            if (event.key === 'Escape') close();
            else if (event.key === '+' || event.key === '=') setZoom(scale + .25);
            else if (event.key === '-') setZoom(scale - .25);
            else if (event.key === '0') setZoom(1);
        };
        zoom.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
        $('[data-zoom-in]', zoom).onclick = () => setZoom(scale + .25);
        $('[data-zoom-out]', zoom).onclick = () => setZoom(scale - .25);
        $('[data-zoom-reset]', zoom).onclick = () => setZoom(1);
        $('[data-zoom-close]', zoom).onclick = close;
        stage.addEventListener('wheel', (event) => { event.preventDefault(); setZoom(scale + (event.deltaY < 0 ? .25 : -.25)); }, { passive: false });
        image.addEventListener('dblclick', () => setZoom(scale === 1 ? 2 : 1));
        zoom.addEventListener('click', (event) => { if (event.target === zoom) close(); });
        document.addEventListener('keydown', onKey);
        zoom.showModal();
        setZoom(1);
        $('[data-zoom-close]', zoom).focus();
    };
    $('#main').addEventListener('click', (event) => { const trigger = event.target.closest('[data-zoom-image]'); if (trigger) openZoom(trigger); });
    const paint = () => {
        const v = cur();
        const price = v?.price_override != null ? Number(v.price_override) : Number(p.sale_price);
        const stock = hasV ? (v ? v.stock_quantity : null) : p.stock_quantity;
        const onSale = (!v || v.price_override == null) && Number(p.sale_price) < Number(p.price);
        if (stock != null && sel.qty > stock) sel.qty = Math.max(stock, 1);
        const stockTxt = stock == null ? '' : stock <= 0 ? '<p class="stock out">Out of stock</p>' : stock <= 5 ? `<p class="stock low">Only ${stock} left</p>` : '<p class="stock in">In stock</p>';
        const on = S.wish.has(p.id);
        $('#buy').innerHTML = `<div class="price"><b>${money(price)}</b>${onSale ? `<s>${money(p.price)}</s>` : ''}</div>${stockTxt}
${colors.length > 1 || (colors.length === 1 && hasV && colors[0][0] !== 'Standard') ? `<div class="opt"><label>Color${sel.color ? ': ' + esc(sel.color) : ''}</label><div class="chips">${colors.map(([c, hex]) => hex
    ? `<button class="swatch ${sel.color === c ? 'on' : ''}" style="background:${esc(hex)}" data-color="${esc(c)}" aria-label="${esc(c)}" ${avail(sel.size, c) ? '' : 'disabled'}></button>`
    : `<button class="chip ${sel.color === c ? 'on' : ''}" data-color="${esc(c)}" ${avail(sel.size, c) ? '' : 'disabled'}>${esc(c)}</button>`).join('')}</div></div>` : ''}
${sizes.length > 1 || (sizes.length === 1 && hasV && sizes[0] !== 'Free' && sizes[0] !== 'Standard') ? `<div class="opt"><label>Size${sel.size ? ': ' + esc(sel.size) : ''}</label><div class="chips">${sizes.map((s) => `<button class="chip ${sel.size === s ? 'on' : ''}" data-size="${esc(s)}" ${avail(s, sel.color) ? '' : 'disabled'}>${esc(s)}</button>`).join('')}</div></div>` : ''}
<div class="opt"><label>Quantity</label><div class="qty"><button data-q="-1" aria-label="Decrease">−</button><span aria-live="polite">${sel.qty}</span><button data-q="1" aria-label="Increase">+</button></div></div>
<div class="actions"><button class="btn" data-add ${stock === 0 ? 'disabled' : ''}>Add to cart</button><button class="btn btn-ghost" data-buy ${stock === 0 ? 'disabled' : ''}>Buy now</button>
<button class="btn btn-ghost" data-wish="${p.id}" aria-pressed="${on}"><i class="fa-${on ? 'solid' : 'regular'} fa-heart"></i> ${on ? 'Saved' : 'Save'}</button></div>`;
    };
    const add = () => {
        const v = cur();
        if (hasV && !v) { toast(`Please choose ${!sel.color && colors.length > 1 ? 'a color' : 'a size'} first.`, 'error'); return false; }
        const stock = hasV ? v.stock_quantity : p.stock_quantity;
        return addToCart({ product_id: p.id, variant_id: v?.id || null, quantity: sel.qty, name: p.name, price: v?.price_override != null ? Number(v.price_override) : Number(p.sale_price),
            image: p.images[0]?.image_path || null, slug: p.slug, size: v?.size || null, color: v?.color || null }, stock);
    };
    $('#buy').addEventListener('click', (e) => {
        const t = e.target.closest('button'); if (!t) return;
        if (t.dataset.size) { sel.size = sel.size === t.dataset.size ? null : t.dataset.size; paint(); }
        else if (t.dataset.color) { sel.color = sel.color === t.dataset.color ? null : t.dataset.color; paint(); }
        else if (t.dataset.q) { const v = cur(), max = hasV ? (v ? v.stock_quantity : 99) : p.stock_quantity; sel.qty = Math.min(Math.max(sel.qty + +t.dataset.q, 1), Math.min(max || 1, 99)); paint(); }
        else if ('add' in t.dataset) { if (add()) toast('Added to cart.', 'ok'); }
        else if ('buy' in t.dataset) { if (add()) location.href = 'checkout.html'; }
    });
    $('#thumbs').addEventListener('click', (e) => { const b = e.target.closest('[data-shot]'); if (b) { sel.shot = +b.dataset.shot; paintGallery(); } });
    paintGallery(); paint();
    window.addEventListener('wishchange', paint);
    const questionPath = '/products/' + encodeURIComponent(p.id) + '/questions';
    const loadQuestions = async () => {
        try {
            const { data } = await api(questionPath);
            $('#questionList').innerHTML = data.length ? data.map((q) => `<article class="qa-entry"><div class="qa-meta"><span class="pill">${esc(q.kind)}</span><b>${esc((q.customer_name || 'Customer').split(' ')[0])}</b><time>${dateStr(q.answered_at || q.created_at)}</time></div><p>${esc(q.body)}</p><div class="qa-answer"><b>Store reply</b><p>${esc(q.answer)}</p></div></article>`).join('') : '<p class="panel muted">No answered questions yet. Ask the store team below.</p>';
        } catch (error) { $('#questionList').innerHTML = `<p class="notice err">${esc(error.message)}</p>`; }
    };
    $('#questionForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const message = $('#questionMessage'), button = $('#questionForm button[type="submit"]');
        button.disabled = true;
        try {
            const result = await api(questionPath, { method: 'POST', body: { kind: $('#questionKind').value, body: $('#questionBody').value.trim() } });
            message.textContent = result.message; $('#questionBody').value = ''; toast(result.message, 'ok');
        } catch (error) { message.textContent = error.message; message.style.color = 'var(--brick)'; }
        button.disabled = false;
    });
    loadQuestions();
};

pages.cart = async () => {
    setTitle('Your cart');
    const render = () => {
        if (!S.cart.length) return view(empty('Your cart is empty', 'Add something you love and it will show up here.'));
        const sub = S.cart.reduce((s, i) => s + (i.error ? 0 : i.price * i.quantity), 0), blocked = S.cart.some((i) => i.error);
        view(`<div class="container"><h1 class="page-title">Your cart</h1><div class="cart-layout"><div class="panel">${S.cart.map((i, n) => `
<div class="line"><a class="thumb" href="product-details.html?id=${i.product_id}">${img(i.image, i.name)}</a>
 <div><a href="product-details.html?id=${i.product_id}"><b>${esc(i.name)}</b></a><div class="meta">${i.size ? esc(i.size) : ''}${i.size && i.color ? ' · ' : ''}${i.color ? esc(i.color) : ''}</div><div class="meta">${money(i.price)} each</div>${i.error ? `<div class="err">${esc(i.error)}</div>` : ''}</div>
 <div class="side"><b>${money(i.price * i.quantity)}</b><div class="qty"><button data-d="-1" data-i="${n}" aria-label="Decrease">−</button><span>${i.quantity}</span><button data-d="1" data-i="${n}" aria-label="Increase">+</button></div><button class="link-btn" data-rm="${n}">Remove</button></div></div>`).join('')}</div>
<aside class="panel"><h3>Order summary</h3><div class="sum"><span>Subtotal (${cartCount()} item${cartCount() > 1 ? 's' : ''})</span><span>${money(sub)}</span></div>
<p class="muted" style="font-size:14px">Delivery charge and coupons are applied at checkout.</p>
${blocked ? '<p class="notice err" style="margin-top:12px">Fix the highlighted items to continue.</p>' : ''}
<a class="btn btn-block" style="margin-top:16px;${blocked ? 'pointer-events:none;opacity:.5' : ''}" href="checkout.html">Checkout</a><a class="link-btn" style="display:block;text-align:center;margin-top:12px" href="shop.html">Continue shopping</a></aside></div></div>`);
    };
    render();
    $('#app').onclick = (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.rm) { S.cart.splice(+b.dataset.rm, 1); saveCart(); render(); }
        else if (b.dataset.d) { const it = S.cart[+b.dataset.i]; const q = it.quantity + +b.dataset.d;
            if (q < 1) return; if (it.stock != null && q > it.stock) return toast(`Only ${it.stock} available.`, 'error');
            it.quantity = Math.min(q, 99); saveCart(); render(); }
    };
    if (!S.cart.length) return;
    try {   // refresh prices/stock from the server
        const { data } = await api('/cart/validate', { method: 'POST', body: { items: cartPayload() } });
        S.cart = S.cart.map((it) => {
            const l = data.lines.find((x) => x.product_id === it.product_id && (x.variant_id || null) === (it.variant_id || null));
            if (!l) return it;
            return { ...it, name: l.name || it.name, image: l.image ?? it.image, price: l.unit_price ?? it.price, stock: l.stock, size: l.size ?? it.size, color: l.color ?? it.color, error: l.error || null };
        });
        saveCart(); render();
    } catch (e) { toast(e.message, 'error'); }
};

pages.checkout = async () => {
    setTitle('Checkout');
    if (!S.cart.length) return view(empty('Your cart is empty', 'Add something to your cart before checking out.'));
    view(`<div class="container"><h1 class="page-title">Checkout</h1>${skeletons(2)}</div>`);
    let areas, quote, me = null;
    try {
        [areas, quote] = await Promise.all([api('/delivery-areas'), api('/cart/validate', { method: 'POST', body: { items: cartPayload() } })]);
        if (S.auth) me = (await api('/me').catch(() => null))?.data || null;
    } catch (e) { return view(empty('Checkout is unavailable', e.message, '<a class="btn" href="cart.html">Back to cart</a>')); }
    areas = areas.data; const { lines, subtotal } = quote.data;
    const bad = lines.find((l) => l.error);
    if (bad) return view(empty('Please review your cart', bad.error, '<a class="btn" href="cart.html">Go to cart</a>'));
    if (!areas.length) return view(empty('Delivery is not set up yet', 'Please contact the store to place your order.', ''));
    let coupon = null;
    const area = () => areas.find((a) => a.id === +$('#area').value) || areas[0];
    const totals = () => {
        const d = coupon ? coupon.discount : 0, del = Number(area().delivery_charge);
        $('#sums').innerHTML = `<div class="sum"><span>Subtotal</span><span>${money(subtotal)}</span></div>${d ? `<div class="sum disc"><span>Discount (${esc(coupon.code)})</span><span>−${money(d)}</span></div>` : ''}
<div class="sum"><span>Delivery${area().estimated_days ? ` (${esc(area().estimated_days)})` : ''}</span><span>${del ? money(del) : 'Free'}</span></div><div class="sum total"><span>Total</span><span>${money(subtotal - d + del)}</span></div>`;
    };
    const preArea = me?.city ? areas.find((a) => a.area_name === me.city) : null;
    view(`<div class="container"><h1 class="page-title">Checkout</h1><div class="checkout"><form class="panel" id="form" novalidate><h3>Delivery details</h3>
<div class="row2"><div class="field"><label for="name">Full name</label><input id="name" autocomplete="name" required value="${esc(me?.name || '')}"></div>
<div class="field"><label for="phone">Phone number</label><input id="phone" type="tel" autocomplete="tel" inputmode="tel" required placeholder="01XXXXXXXXX" value="${esc(me?.phone || '')}"></div></div>
<div class="field"><label for="email">Email <small>(optional)</small></label><input id="email" type="email" autocomplete="email" value="${esc(me?.email || '')}"></div>
<div class="field"><label for="area">Delivery area</label><select id="area">${areas.map((a) => `<option value="${a.id}" ${a.id === (preArea || areas[0]).id ? 'selected' : ''}>${esc(a.area_name)} — ${Number(a.delivery_charge) ? money(a.delivery_charge) : 'Free'}</option>`).join('')}</select></div>
<div class="field"><label for="address">Full address</label><textarea id="address" rows="3" autocomplete="street-address" required placeholder="House, road, area, city">${esc(me?.address || '')}</textarea></div>
<div class="field"><label for="note">Note for the seller <small>(optional)</small></label><textarea id="note" rows="2" maxlength="500"></textarea></div>
<h3 style="margin-top:22px">Payment</h3><div class="radio-card"><i class="fa-solid fa-money-bill-wave"></i><span><b>Cash on delivery</b><br><small class="muted">Pay in cash when your order arrives.</small></span></div></form>
<aside class="panel"><h3>Order summary</h3>${lines.map((l) => `<div class="sum"><span>${esc(l.name)}${l.size ? ` (${esc(l.size)}${l.color ? ', ' + esc(l.color) : ''})` : ''} × ${l.quantity}</span><span>${money(l.unit_price * l.quantity)}</span></div>`).join('')}
<div class="coupon"><input id="code" placeholder="Coupon code" aria-label="Coupon code"><button class="btn btn-ghost" id="apply" type="button">Apply</button></div><p class="muted" id="cmsg" style="font-size:14px;min-height:20px" aria-live="polite"></p>
<div id="sums"></div><button class="btn btn-block" id="place" style="margin-top:18px">Place order</button><p class="muted center" style="font-size:13px;margin-top:10px">You will get a call to confirm your order.</p></aside></div></div>`);
    totals();
    $('#area').onchange = totals;
    $('#apply').onclick = async () => {
        const code = $('#code').value.trim(); if (!code) return;
        try {
            const r = await api('/coupon/validate', { method: 'POST', body: { code, items: cartPayload(), phone: $('#phone').value } });
            coupon = { code: r.data.code, discount: r.data.discount }; $('#cmsg').textContent = r.message; $('#cmsg').style.color = 'var(--ok)';
        } catch (e) { coupon = null; $('#cmsg').textContent = e.message; $('#cmsg').style.color = 'var(--brick)'; }
        totals();
    };
    $('#place').onclick = async (ev) => {
        const v = (id) => $('#' + id).value.trim();
        if (v('name').length < 2) return toast('Please enter your full name.', 'error');
        if (!/^\+?[0-9][0-9\s-]{6,17}$/.test(v('phone'))) return toast('Please enter a valid phone number.', 'error');
        if (v('address').length < 8) return toast('Please enter your full address.', 'error');
        const btn = ev.currentTarget; btn.disabled = true; btn.textContent = 'Placing order…';
        try {
            const r = await api('/order/place', { method: 'POST', body: { shipping_name: v('name'), shipping_phone: v('phone'), email: v('email'), shipping_address: v('address'),
                shipping_area_id: +$('#area').value, customer_note: v('note'), coupon_code: coupon?.code || '', items: cartPayload() } });
            S.cart = []; saveCart(); setTitle('Order placed');
            view(`<div class="success container"><div class="tick"><i class="fa-solid fa-check"></i></div><h1>Thank you, ${esc(v('name').split(' ')[0])}!</h1><p class="muted">Your order has been placed. Keep this number to track it:</p>
<div class="onum">${esc(r.data.order_number)}</div><p>Total to pay on delivery: <b>${money(r.data.total_amount)}</b></p>
<div class="actions" style="justify-content:center"><button class="btn" id="printCustomerInvoice"><i class="fa-solid fa-print"></i> Print invoice</button><a class="btn btn-ghost" href="orders.html?order=${encodeURIComponent(r.data.order_number)}&phone=${encodeURIComponent(v('phone'))}">Track my order</a><a class="btn btn-ghost" href="shop.html">Keep shopping</a></div></div>`);
            $('#printCustomerInvoice').onclick = () => window.printInvoice(r.data, 'customer', CONFIG.currency);
        } catch (e) { toast(e.message, 'error'); btn.disabled = false; btn.textContent = 'Place order'; if (e.status === 409) setTimeout(() => { location.href = 'cart.html'; }, 1800); }
    };
};

pages.auth = async () => {
    setTitle('Log in');
    if (S.auth) return void (location.href = safeNext(new URLSearchParams(location.search).get('next')));
    const next = safeNext(new URLSearchParams(location.search).get('next'));
    let tab = new URLSearchParams(location.search).get('tab') === 'register' ? 'register' : 'login';
    const draw = () => {
        const brandLogo = S.banners?.current_logo ? bannerUrl(S.banners.current_logo) : '../assets/logo-brand.svg';
        view(`<div class="auth-shell"><div class="auth-visual"><div class="orb orb-a"></div><div class="orb orb-b"></div><div class="auth-brand"><img src="${esc(brandLogo)}" alt="Aesthetica logo"><div><span>AESTHETICA</span><small>Curated living</small></div></div><div class="mini-card"><strong>New season</strong><span>Thoughtful home & lifestyle pieces</span></div></div><div class="auth-card panel"><div class="brand-row"><img src="${esc(brandLogo)}" alt="Aesthetica logo"><div><h1>${tab === 'login' ? 'Welcome back' : 'Create account'}</h1><p class="muted">${tab === 'login' ? 'Continue your Aesthetica journey.' : 'Start your next beautiful space.'}</p></div></div>
<div class="tabs" role="tablist"><button role="tab" class="${tab === 'login' ? 'on' : ''}" data-tab="login">Log in</button><button role="tab" class="${tab === 'register' ? 'on' : ''}" data-tab="register">Create account</button></div>
<div class="notice err" id="err" hidden></div>
${tab === 'login' ? `<form id="f" novalidate><div class="field"><label for="id">Phone or email</label><input id="id" autocomplete="username" required></div><div class="field"><label for="pw">Password</label><div class="password-control"><input id="pw" type="password" autocomplete="current-password" required><button class="password-toggle" type="button" data-password-toggle="pw" aria-label="Show password" title="Show password"><i class="fa-regular fa-eye"></i></button></div></div><button class="btn btn-block">Log in</button></form>`
: `<form id="f" novalidate><div class="field"><label for="n">Full name</label><input id="n" autocomplete="name" required></div><div class="row2"><div class="field"><label for="ph">Phone</label><input id="ph" type="tel" autocomplete="tel" required></div><div class="field"><label for="em">Email <small>(optional)</small></label><input id="em" type="email" autocomplete="email"></div></div>
<div class="row2"><div class="field"><label for="pw">Password</label><div class="password-control"><input id="pw" type="password" autocomplete="new-password" minlength="6" required><button class="password-toggle" type="button" data-password-toggle="pw" aria-label="Show password" title="Show password"><i class="fa-regular fa-eye"></i></button></div><small>At least 6 characters</small></div><div class="field"><label for="pw2">Confirm password</label><div class="password-control"><input id="pw2" type="password" autocomplete="new-password" required><button class="password-toggle" type="button" data-password-toggle="pw2" aria-label="Show password" title="Show password"><i class="fa-regular fa-eye"></i></button></div></div></div><button class="btn btn-block">Create account</button></form>`}</div></div>`);
        $$('[data-tab]').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; draw(); }; });
        $('#f').onsubmit = async (e) => {
            e.preventDefault();
            const v = (id) => ($('#' + id)?.value || '').trim(), err = $('#err'), btn = $('#f button'); err.hidden = true;
            if (tab === 'register' && v('pw') !== $('#pw2').value) { err.textContent = 'The two passwords do not match.'; err.hidden = false; return; }
            btn.disabled = true;
            try {
                const r = tab === 'login'
                    ? await api('/login', { method: 'POST', body: { identifier: v('id'), password: $('#pw').value } })
                    : await api('/register', { method: 'POST', body: { name: v('n'), phone: v('ph'), email: v('em'), password: $('#pw').value } });
                S.auth = { token: r.data.token, user: r.data.user }; store.set('aes_auth', S.auth);
                const server = new Set((await api('/wishlist').catch(() => ({ data: { ids: [] } }))).data.ids);   // move guest wishlist to the account
                for (const id of store.get('aes_wish', [])) if (!server.has(id)) await api('/wishlist/' + id, { method: 'POST' }).catch(() => {});
                store.del('aes_wish'); location.href = next;
            } catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; }
        };
    };
    draw();
};

pages.wishlist = async () => {
    setTitle('Wishlist');
    const ids = [...S.wish];
    if (!ids.length) return view(empty('Your wishlist is empty', 'Tap the heart on any product to save it for later.'));
    view(`<div class="container"><h1 class="page-title">My wishlist</h1>${skeletons(Math.min(ids.length, 4))}</div>`);
    const { data } = await api('/products/by-ids?ids=' + ids.join(','));
    view(data.length ? `<div class="container"><h1 class="page-title">My wishlist</h1><div class="grid">${data.map(card).join('')}</div></div>` : empty('Your wishlist is empty', 'The products you saved are no longer available.'));
};

pages.account = async () => {
    setTitle('My account');
    if (!S.auth) return view(empty('Sign in to your account', 'Manage your profile, offers and orders in one place.', '<a class="btn" href="login-register.html?next=account.html">Log in</a>'));
    view(`<div class="container"><h1 class="page-title">My account</h1><div class="account-grid"><div class="panel"><h3>Profile details</h3><form id="profileForm"><div class="field"><label for="profileName">Full name</label><input id="profileName" name="name" autocomplete="name" required></div><div class="row2"><div class="field"><label for="profilePhone">Phone</label><input id="profilePhone" name="phone" type="tel" autocomplete="tel" required></div><div class="field"><label for="profileEmail">Email</label><input id="profileEmail" name="email" type="email" autocomplete="email"></div></div><div class="field"><label for="profileCity">City / delivery area</label><input id="profileCity" name="city" autocomplete="address-level2"></div><div class="field"><label for="profileAddress">Address</label><textarea id="profileAddress" name="address" rows="3" maxlength="255" autocomplete="street-address"></textarea></div><p id="profileMessage" class="muted" aria-live="polite"></p><button class="btn" type="submit">Save profile</button></form></div>
<section class="panel"><h3>Available offers</h3><div id="accountCoupons"><p class="muted">Loading offers…</p></div></section></div><section class="section"><div class="section-head"><h2>Recent orders</h2><a href="orders.html">Track an order</a></div><div id="accountOrders"><p class="muted">Loading orders…</p></div></section></div>`);
    try {
        const [profile, orders, coupons] = await Promise.all([api('/me'), api('/orders'), api('/coupons')]);
        const user = profile.data;
        ['name', 'phone', 'email', 'city', 'address'].forEach((field) => { const input = $(`[name="${field}"]`, $('#profileForm')); input.value = user[field] || ''; });
        $('#accountCoupons').innerHTML = coupons.data.length ? `<div class="offer-list">${coupons.data.map((offer) => `<article class="offer"><div><span class="offer-code">${esc(offer.code)}</span><b>${offer.type === 'percentage' ? `${Number(offer.value)}% off` : `${money(offer.value)} off`}</b><p class="muted">Minimum order ${money(offer.min_order_amount)}${offer.expires_at ? ` · Expires ${dateStr(offer.expires_at)}` : ''}</p></div><button class="btn btn-ghost sm" type="button" data-copy-coupon="${esc(offer.code)}" aria-label="Copy ${esc(offer.code)}">Copy</button></article>`).join('')}</div>` : '<p class="muted">No available offers right now.</p>';
        $('#accountOrders').innerHTML = orders.data.length ? orders.data.slice(0, 8).map((order) => {
            invoiceOrders.set(String(order.id), order);
            return `<article class="panel order account-order"><header><div><b>${esc(order.order_number)}</b><div class="muted">${dateStr(order.placed_at)}</div></div><button class="btn btn-ghost sm" type="button" data-print-order="${esc(order.id)}"><i class="fa-solid fa-print"></i> Customer invoice</button></header>${timeline(order.status)}${itemsList(order.items)}<div class="sum total"><span>Total</span><b>${money(order.total_amount)}</b></div></article>`;
        }).join('') : '<div class="panel"><p class="muted">You have no orders yet.</p><a class="btn" href="shop.html">Browse the shop</a></div>';
        $('#profileForm').onsubmit = async (event) => {
            event.preventDefault(); const button = $('#profileForm button[type="submit"]'), message = $('#profileMessage'); button.disabled = true;
            const body = Object.fromEntries(new FormData(event.currentTarget));
            try {
                const result = await api('/me', { method: 'PATCH', body });
                S.auth.user = { ...S.auth.user, ...result.data }; store.set('aes_auth', S.auth); renderAccount();
                message.textContent = result.message; toast(result.message, 'ok');
            } catch (error) { message.textContent = error.message; message.style.color = 'var(--brick)'; }
            button.disabled = false;
        };
    } catch (error) { view(empty('Account could not be loaded', error.message, '<button class="btn" onclick="location.reload()">Try again</button>')); }
};

pages.orders = async () => {
    setTitle('My orders');
    const q = new URLSearchParams(location.search);
    const orderCard = (o) => { invoiceOrders.set(String(o.id), o); return `<article class="panel order"><header><div><b>${esc(o.order_number)}</b><div class="muted" style="font-size:14px">${dateStr(o.placed_at)}</div></div><div>${o.payment_status === 'paid' ? pill('paid') : '<span class="pill">Pay on delivery</span>'}</div></header>
${timeline(o.status)}${o.courier_name ? `<p class="muted" style="font-size:14px">Courier: ${esc(o.courier_name)}${o.courier_tracking_id ? ' — tracking ' + esc(o.courier_tracking_id) : ''}</p>` : ''}${itemsList(o.items)}
<div class="sum" style="margin:10px 0 0"><span>${Number(o.discount_amount) ? `Discount −${money(o.discount_amount)} · ` : ''}Delivery ${money(o.delivery_charge)}</span><b style="color:var(--ink)">Total ${money(o.total_amount)}</b></div><button class="btn btn-ghost sm" type="button" data-print-order="${esc(o.id)}"><i class="fa-solid fa-print"></i> Customer invoice</button></article>`; };
    view(`<div class="container"><h1 class="page-title">Track your order</h1><div class="cart-layout"><div id="mine"></div>
<aside class="panel"><h3>Find an order</h3><form id="track" novalidate><div class="field"><label for="on">Order number</label><input id="on" required value="${esc(q.get('order') || '')}" placeholder="SHV-XXXXXXXX"></div><div class="field"><label for="tp">Phone used for the order</label><input id="tp" type="tel" required value="${esc(q.get('phone') || '')}"></div><button class="btn btn-block">Track order</button></form><div id="found" style="margin-top:16px"></div></aside></div></div>`);
    const runTrack = async () => {
        const out = $('#found'); out.innerHTML = '<p class="muted">Looking…</p>';
        try { out.innerHTML = orderCard((await api(`/order/track?order_number=${encodeURIComponent($('#on').value.trim())}&phone=${encodeURIComponent($('#tp').value.trim())}`)).data); }
        catch (e) { out.innerHTML = `<div class="notice err">${esc(e.message)}</div>`; }
    };
    $('#track').onsubmit = (e) => { e.preventDefault(); runTrack(); };
    if (q.get('order') && q.get('phone')) runTrack();
    const mine = $('#mine');
    if (!S.auth) { mine.innerHTML = `<div class="panel"><h3>Have an account?</h3><p class="muted" style="margin-bottom:16px">Log in to see all your orders in one place.</p><a class="btn" href="login-register.html?next=orders.html">Log in</a></div>`; return; }
    mine.innerHTML = '<div class="skeleton" style="aspect-ratio:3/1"></div>';
    const { data } = await api('/orders');
    mine.innerHTML = data.length ? `<h3 style="margin-bottom:14px">Your orders</h3>${data.map(orderCard).join('')}` : `<div class="panel"><h3>No orders yet</h3><p class="muted" style="margin-bottom:16px">When you place an order it will appear here.</p><a class="btn" href="shop.html">Start shopping</a></div>`;
};

// ---------- global events ----------
document.addEventListener('click', (e) => {
    const t = e.target;
    const passwordToggle = t.closest('[data-password-toggle]');
    if (passwordToggle) {
        const input = document.getElementById(passwordToggle.dataset.passwordToggle);
        if (!input) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        passwordToggle.innerHTML = `<i class="fa-regular fa-eye${show ? '-slash' : ''}"></i>`;
        passwordToggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        passwordToggle.title = show ? 'Hide password' : 'Show password';
        return;
    }
    const w = t.closest('[data-wish]');
    if (w) { e.preventDefault(); toggleWish(+w.dataset.wish).then(() => window.dispatchEvent(new Event('wishchange'))); return; }
    const qk = t.closest('[data-quick]');
    if (qk) { const p = S.products.get(+qk.dataset.quick); if (p && addToCart({ product_id: p.id, variant_id: null, quantity: 1, name: p.name, price: Number(p.sale_price), image: p.image, slug: p.slug }, p.stock_quantity)) toast('Added to cart.', 'ok'); return; }
    if (t.closest('[data-menu]')) document.body.classList.toggle('nav-open');
    if (t.closest('[data-theme-toggle]')) {
        const next = getTheme() === 'dark' ? 'light' : 'dark';
        localStorage.setItem('aes_theme', next);
        applyTheme();
        return;
    }
    const invoiceButton = t.closest('[data-print-order]');
    if (invoiceButton) {
        const order = invoiceOrders.get(String(invoiceButton.dataset.printOrder));
        if (order) window.printInvoice(order, 'customer', CONFIG.currency);
        return;
    }
    const couponButton = t.closest('[data-copy-coupon]');
    if (couponButton) {
        const code = couponButton.dataset.copyCoupon;
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(code).then(() => toast(`${code} copied.`, 'ok')).catch(() => toast(`Coupon code: ${code}`));
        else toast(`Coupon code: ${code}`);
        return;
    }
    if (t.closest('[data-logout]')) { S.auth = null; store.del('aes_auth'); S.wish = new Set(store.get('aes_wish', [])); location.href = 'index.html'; return; }
    const a = t.closest('[data-acct]'), menu = $('.acct-menu');
    if (menu) { menu.hidden = a ? !menu.hidden : true; if (a) a.setAttribute('aria-expanded', String(!menu.hidden)); }
});
window.addEventListener('storage', (e) => { if (e.key === 'aes_cart') { S.cart = store.get('aes_cart', []); badges(); } });

// ---------- boot ----------
(async function boot() {
    applyTheme();
    try {
        const response = await fetch(BANNERS_API);
        if (response.ok) {
            const data = await response.json();
            if (data.success) S.banners = data;
        }
    } catch { /* Banner settings are optional; the storefront has built-in fallbacks. */ }
    layout();
    if (S.auth) { try { S.wish = new Set((await api('/wishlist')).data.ids); } catch { /* guest fallback */ } }
    if (!S.auth) S.wish = new Set(store.get('aes_wish', []));
    badges();
    try { await (pages[page] || pages.home)(); }
    catch (e) { view(empty('Something went wrong', e.message, '<button class="btn" onclick="location.reload()">Try again</button>')); }
})();
})();
