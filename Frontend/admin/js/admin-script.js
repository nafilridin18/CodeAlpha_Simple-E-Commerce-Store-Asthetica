/* Aesthetica admin — one script drives every admin page (see <body data-page="...">) */
(() => {
'use strict';

const CONFIG = { currency: '৳' };
const local = ['localhost', '127.0.0.1', ''].includes(location.hostname);
const isAppPort = /^500[0-9]$/.test(location.port);
const ORIGIN = local && !isAppPort ? 'http://localhost:5000' : '';
const API = ORIGIN + '/api/admin';
const page = document.body.dataset.page;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => CONFIG.currency + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const imgUrl = (p) => (/^https?:/.test(p) ? p : ORIGIN + p);
const debounce = (fn, ms = 350) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const when = (s) => { const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? '' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
const pill = (s, label) => `<span class="pill ${esc(s)}">${esc(label || s)}</span>`;
const thumb = (src, name) => `<span class="thumb">${src ? `<img src="${esc(imgUrl(src))}" alt="" loading="lazy">` : esc(String(name || '?').charAt(0).toUpperCase())}</span>`;
const ST = ['new', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'];
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
applyTheme();

let auth = null;
try { auth = JSON.parse(localStorage.getItem('aes_admin')); } catch { /* none */ }
const toLogin = () => { localStorage.removeItem('aes_admin'); location.href = 'login.html'; };
if (page !== 'login' && !auth?.token) toLogin();

async function api(path, { method = 'GET', body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth?.token) headers.Authorization = 'Bearer ' + auth.token;
    let res;
    try { res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined }); }
    catch { throw new Error('Cannot reach the server. Is it running?'); }
    let data = {};
    try { data = await res.json(); } catch { /* ignore */ }
    if (res.status === 401 && page !== 'login') toLogin();
    if (!res.ok || data.success === false) throw new Error(data.message || 'Something went wrong.');
    return data;
}
function toast(msg, type = '') {
    const el = document.createElement('div'); el.className = 'toast ' + type; el.textContent = msg; $('#toasts').appendChild(el); setTimeout(() => el.remove(), 3600);
}
const app = () => $('#app');
const fail = (e) => { app().innerHTML = `<div class="notice err">${esc(e.message)}</div>`; };

function modal(title, html, wide) {
    const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = `<div class="dialog ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h3>${esc(title)}</h3><button class="x" aria-label="Close">×</button></header><div class="body">${html}</div></div>`;
    document.body.appendChild(m);
    const close = () => m.remove();
    m.addEventListener('mousedown', (e) => { if (e.target === m) close(); });
    $('.x', m).onclick = close;
    return { el: m, body: $('.body', m), close };
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { const m = $$('.modal').pop(); if (m) m.remove(); } });

function pager(host, data, go) {
    if (data.pages <= 1) { host.innerHTML = data.total ? `<div class="pager"><span>${data.total} total</span></div>` : ''; return; }
    host.innerHTML = `<div class="pager"><span>Page ${data.page} of ${data.pages} · ${data.total} total</span><span><button class="btn ghost sm" data-p="-1" ${data.page <= 1 ? 'disabled' : ''}>Previous</button> <button class="btn ghost sm" data-p="1" ${data.page >= data.pages ? 'disabled' : ''}>Next</button></span></div>`;
    $$('[data-p]', host).forEach((b) => { b.onclick = () => go(data.page + +b.dataset.p); });
}

// ---------- shell ----------
const NAV = [['dashboard', 'index.html', 'fa-chart-line', 'Dashboard'], ['products', 'products.html', 'fa-box', 'Products'], ['product-form', 'add-product.html', 'fa-plus-circle', 'Add product'],
    ['categories', 'categories.html', 'fa-tags', 'Categories'], ['banners', 'banners.html', 'fa-image', 'Banners'], ['questions', 'questions.html', 'fa-comments', 'Product Q&A'], ['orders', 'orderlist.html', 'fa-receipt', 'Orders'], ['delivery', 'delivery.html', 'fa-truck', 'Delivery'],
    ['coupons', 'coupons.html', 'fa-ticket', 'Coupons'], ['customers', 'customers.html', 'fa-users', 'Customers']];
function shell(title) {
    document.title = `${title} · Aesthetica Admin`;
    $('#side').innerHTML = `<div class="brand">AESTHETICA<small>Admin panel</small></div><nav class="nav">${NAV.map(([id, href, ic, label]) =>
        `<a href="${href}" class="${id === page ? 'on' : ''}"><i class="fa-solid ${ic}"></i>${label}</a>`).join('')}<a href="${ORIGIN || ''}/" target="_blank" rel="noopener"><i class="fa-solid fa-store"></i>View shop</a>
        <button data-logout style="margin-top:auto"><i class="fa-solid fa-right-from-bracket"></i>Log out</button></nav>`;
    $('#top').innerHTML = `<button class="menu-btn" data-menu aria-label="Menu"><i class="fa-solid fa-bars"></i></button><h2>${esc(title)}</h2><div class="top-tools"><button class="icon-btn theme-toggle" data-theme-toggle aria-label="Toggle theme"><i class="fa-solid fa-moon"></i></button><span class="who"><i class="fa-regular fa-user"></i> ${esc(auth?.admin?.name || 'Admin')}</span></div>`;
    applyTheme();
}
document.addEventListener('click', (e) => {
    const passwordToggle = e.target.closest('[data-password-toggle]');
    if (passwordToggle) {
        const input = document.getElementById(passwordToggle.dataset.passwordToggle);
        if (!input) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        passwordToggle.innerHTML = `<i class="fa-regular fa-eye${show ? '-slash' : ''}"></i>`;
        passwordToggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        passwordToggle.title = show ? 'Hide password' : 'Show password';
    }
    else if (e.target.closest('[data-menu]')) document.body.classList.toggle('nav-open');
    else if (e.target.closest('[data-theme-toggle]')) {
        const next = getTheme() === 'dark' ? 'light' : 'dark';
        localStorage.setItem('aes_theme', next);
        applyTheme();
    }
    else if (e.target.closest('[data-logout]')) toLogin();
    else if (document.body.classList.contains('nav-open') && !e.target.closest('aside')) document.body.classList.remove('nav-open');
});

const P = {};

// ---------- login ----------
P.login = () => {
    if (auth?.token) { location.href = 'index.html'; return; }
    $('#f').onsubmit = async (e) => {
        e.preventDefault(); const err = $('#err'), btn = $('#f button'); err.hidden = true; btn.disabled = true;
        try {
            const r = await api('/login', { method: 'POST', body: { email: $('#email').value, password: $('#pw').value } });
            localStorage.setItem('aes_admin', JSON.stringify({ token: r.data.token, admin: r.data.admin })); location.href = 'index.html';
        } catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; }
    };
};

// ---------- dashboard ----------
P.dashboard = async () => {
    shell('Dashboard'); app().innerHTML = '<p class="muted">Loading…</p>';
    const { totals: t, byStatus, chart, lowStock, recent, top, lowStockLimit } = (await api('/dashboard')).data;
    const max = Math.max(...chart.map((c) => c.sales), 1);
    app().innerHTML = `
<div class="stats">
  <div class="stat"><span>Sales (excl. cancelled)</span><b>${money(t.sales)}</b><small>${money(t.delivered_revenue)} delivered</small></div>
  <div class="stat"><span>Orders</span><b>${t.orders}</b><small>${t.new_orders} waiting to be processed</small></div>
  <div class="stat"><span>Products</span><b>${t.published}</b><small>${t.products} in total</small></div>
  <div class="stat"><span>Customers</span><b>${t.customers}</b><small>registered accounts</small></div></div>
<div class="grid2"><div class="panel"><h3>Sales, last 7 days</h3><div class="bars">${chart.map((c) => `<div class="bar" title="${c.orders} orders"><em>${c.sales ? money(c.sales) : ''}</em><i style="height:${Math.max((c.sales / max) * 100, 2)}%"></i>${new Date(c.date + 'T00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}</div>`).join('')}</div></div>
<div class="panel"><h3>Orders by status</h3><ul class="list">${ST.map((s) => `<li><a href="orderlist.html?status=${s}">${pill(s)}</a><b>${byStatus[s] || 0}</b></li>`).join('')}</ul></div></div>
<div class="grid2"><div class="panel"><div class="panel-head"><h3>Recent orders</h3><a class="btn ghost sm" href="orderlist.html">All orders</a></div>
${recent.length ? `<div class="tablewrap"><table><tbody>${recent.map((o) => `<tr class="click" onclick="location.href='orderlist.html?open=${o.id}'"><td><b>${esc(o.order_number)}</b><br><small class="muted">${when(o.placed_at)}</small></td><td>${esc(o.shipping_name)}</td><td>${money(o.total_amount)}</td><td>${pill(o.status)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No orders yet. They will appear here as soon as customers check out.</p>'}</div>
<div><div class="panel"><h3>Low stock (${lowStockLimit} or fewer)</h3>${lowStock.length ? `<ul class="list">${lowStock.map((p) => `<li><a href="add-product.html?id=${p.id}">${esc(p.name)}</a><b class="low">${p.stock_quantity}</b></li>`).join('')}</ul>` : '<p class="muted">Everything is well stocked.</p>'}</div>
<div class="panel"><h3>Top sellers, 30 days</h3>${top.length ? `<ul class="list">${top.map((p) => `<li><span>${esc(p.name)}</span><b>${p.qty} sold</b></li>`).join('')}</ul>` : '<p class="muted">No sales in the last 30 days.</p>'}</div></div></div>`;
};

// ---------- products list ----------
P.products = async () => {
    shell('Products');
    const cats = (await api('/categories')).data;
    app().innerHTML = `<div class="panel"><div class="toolbar"><input class="grow" id="q" type="search" placeholder="Search by name or SKU" aria-label="Search"><select id="cat" aria-label="Category"><option value="">All categories</option>${cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
<select id="st" aria-label="Status"><option value="all">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select><a class="btn" href="add-product.html"><i class="fa-solid fa-plus"></i> Add product</a></div>
<div class="tablewrap"><table><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr></thead><tbody id="rows"></tbody></table></div><div id="pg"></div></div>`;
    const load = async (pg = 1) => {
        const p = new URLSearchParams({ page: pg, limit: 15, q: $('#q').value.trim(), category: $('#cat').value, status: $('#st').value });
        try {
            const { data } = await api('/products?' + p);
            $('#rows').innerHTML = data.items.length ? data.items.map((x) => `<tr><td><div class="cell">${thumb(x.image, x.name)}<div><b>${esc(x.name)}</b><br><small class="muted">${esc(x.sku)}</small></div></div></td><td>${esc(x.category_name)}</td>
<td>${Number(x.sale_price) < Number(x.price) ? `<b>${money(x.sale_price)}</b> <s class="muted">${money(x.price)}</s>` : money(x.price)}</td><td class="${x.stock_quantity <= 5 ? 'low' : ''}">${x.stock_quantity}</td>
<td><select data-status="${x.id}" aria-label="Status of ${esc(x.name)}" style="width:auto">${['published', 'draft', 'archived'].map((s) => `<option ${s === x.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
<td class="nowrap right"><a class="btn ghost sm" href="add-product.html?id=${x.id}">Edit</a> <button class="btn danger sm" data-del="${x.id}" data-name="${esc(x.name)}">Delete</button></td></tr>`).join('')
                : `<tr><td colspan="6" class="empty">No products found. <a href="add-product.html"><u>Add your first product</u></a>.</td></tr>`;
            pager($('#pg'), data, load);
        } catch (e) { toast(e.message, 'error'); }
    };
    $('#q').oninput = debounce(() => load(1)); $('#cat').onchange = $('#st').onchange = () => load(1);
    app().addEventListener('change', async (e) => {
        const s = e.target.closest('[data-status]'); if (!s) return;
        try { await api(`/products/${s.dataset.status}/status`, { method: 'PATCH', body: { status: s.value } }); toast('Status updated.', 'ok'); } catch (x) { toast(x.message, 'error'); load(1); }
    });
    app().addEventListener('click', async (e) => {
        const b = e.target.closest('[data-del]'); if (!b || !confirm(`Delete "${b.dataset.name}"? This cannot be undone.\nTip: set it to Draft to hide it instead.`)) return;
        try { await api('/products/' + b.dataset.del, { method: 'DELETE' }); toast('Product deleted.', 'ok'); load(1); } catch (x) { toast(x.message, 'error'); }
    });
    load(1);
};

// ---------- product form (add + edit) ----------
const readFile = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
async function prepImage(file) {       // shrink big photos in the browser: faster uploads and a faster shop
    if (file.type === 'image/gif' || !window.createImageBitmap) return readFile(file);
    try {
        const bmp = await createImageBitmap(file), r = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas'); c.width = Math.round(bmp.width * r); c.height = Math.round(bmp.height * r);
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height);
        return c.toDataURL('image/jpeg', 0.85);
    } catch { return readFile(file); }
}

P['product-form'] = async () => {
    const id = new URLSearchParams(location.search).get('id');
    shell(id ? 'Edit product' : 'Add product');
    const cats = (await api('/categories')).data;
    if (!cats.length) { app().innerHTML = '<div class="notice">Create a category first.</div><a class="btn" href="categories.html">Add a category</a>'; return; }
    let p = { status: 'published', stock_quantity: 10, images: [], variants: [] };
    if (id) { try { p = (await api('/products/' + id)).data; } catch (e) { return fail(e); } }
    let images = p.images.map((i) => i.image_path), variants = p.variants.map((v) => ({ ...v }));
    const val = (k) => esc(p[k] ?? '');
    app().innerHTML = `<form id="f" novalidate>
<div class="notice err" id="err" hidden></div>
<div class="grid2"><div>
<div class="panel"><h3>Basics</h3><div class="field"><label for="name">Product name</label><input id="name" required maxlength="200" value="${val('name')}"></div>
<div class="row2"><div class="field"><label for="category_id">Category</label><select id="category_id">${cats.map((c) => `<option value="${c.id}" ${c.id === p.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
<div class="field"><label for="name_bn">Name in Bangla <small>(optional)</small></label><input id="name_bn" value="${val('name_bn')}"></div></div>
<div class="field"><label for="short_description">Short description</label><input id="short_description" maxlength="500" value="${val('short_description')}"></div>
<div class="field"><label for="description">Full description</label><textarea id="description" rows="6">${val('description')}</textarea></div></div>
<div class="panel"><div class="panel-head"><h3>Photos</h3><small class="muted">First photo is the main one. Up to 8.</small></div><div class="imgs" id="imgs"></div><input type="file" id="file" accept="image/*" multiple hidden></div>
<div class="panel"><div class="panel-head"><h3>Sizes &amp; colors</h3><button type="button" class="btn ghost sm" id="addv">Add option</button></div>
<p class="muted" id="vnote" style="margin-bottom:10px">Only needed for products that come in sizes or colors (e.g. a shirt). Leave empty for simple products.</p><div class="tablewrap"><table class="vtable"><thead id="vhead"></thead><tbody id="vrows"></tbody></table></div></div>
<details class="panel"><summary>Search engine details (optional)</summary><div class="field" style="margin-top:12px"><label for="meta_title">Page title</label><input id="meta_title" maxlength="200" value="${val('meta_title')}"></div><div class="field"><label for="meta_description">Page description</label><textarea id="meta_description" rows="2" maxlength="300">${val('meta_description')}</textarea></div></details></div>
<div><div class="panel"><h3>Price &amp; stock</h3><div class="field"><label for="price">Regular price (${CONFIG.currency})</label><input id="price" type="number" min="0" step="0.01" required value="${val('price')}"></div>
<div class="field"><label for="discount_price">Sale price <small>(leave empty if not on sale)</small></label><input id="discount_price" type="number" min="0" step="0.01" value="${p.discount_price != null && Number(p.discount_price) < Number(p.price) ? esc(p.discount_price) : ''}"></div>
<div class="field"><label for="cost_price">Your cost <small>(private)</small></label><input id="cost_price" type="number" min="0" step="0.01" value="${val('cost_price')}"></div>
<div class="field"><label for="stock_quantity">Stock</label><input id="stock_quantity" type="number" min="0" step="1" value="${val('stock_quantity')}"><small id="stocknote" hidden>Calculated from your sizes &amp; colors.</small></div>
<div class="field"><label for="sku">SKU <small>(auto if empty)</small></label><input id="sku" maxlength="50" value="${val('sku')}"></div></div>
<div class="panel"><h3>Visibility</h3><div class="field"><label for="status">Status</label><select id="status">${[['published', 'Published — visible in the shop'], ['draft', 'Draft — hidden'], ['archived', 'Archived — hidden']].map(([v, l]) => `<option value="${v}" ${v === p.status ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
${[['is_featured', 'Show in Featured'], ['is_new_arrival', 'Show in New arrivals'], ['is_best_selling', 'Show in Best sellers']].map(([k, l]) => `<div class="check field"><input type="checkbox" id="${k}" ${p[k] ? 'checked' : ''}><label for="${k}">${l}</label></div>`).join('')}</div></div></div>
<div class="sticky-save"><button class="btn" id="save">${id ? 'Save changes' : 'Add product'}</button><a class="btn ghost" href="products.html">Cancel</a></div></form>`;

    const drawImgs = () => {
        $('#imgs').innerHTML = images.map((s, i) => `<div class="im"><img src="${esc(imgUrl(s))}" alt=""><button type="button" data-rm="${i}" aria-label="Remove photo">×</button>${i ? `<span data-main="${i}">Make main</span>` : '<span>Main</span>'}</div>`).join('')
            + (images.length < 8 ? '<div class="im add" id="pick" role="button" tabindex="0"><span style="position:static;background:none;color:inherit"><i class="fa-solid fa-camera"></i><br>Add photos</span></div>' : '');
        $('#pick')?.addEventListener('click', () => $('#file').click());
    };
    const drawVars = () => {
        const has = variants.length > 0;
        $('#vhead').innerHTML = has ? '<tr><th>Size</th><th>Color</th><th>Swatch</th><th>Own price</th><th>Stock</th><th>On sale</th><th></th></tr>' : '';
        $('#vrows').innerHTML = variants.map((v, i) => `<tr><td><input data-v="${i}" data-k="size" value="${esc(v.size)}" placeholder="M"></td><td><input data-v="${i}" data-k="color" value="${esc(v.color)}" placeholder="Olive"></td>
<td><input type="color" data-v="${i}" data-k="color_hex" value="${esc(v.color_hex || '#cccccc')}"></td><td><input type="number" min="0" step="0.01" data-v="${i}" data-k="price_override" value="${v.price_override ?? ''}" placeholder="same"></td>
<td><input type="number" min="0" data-v="${i}" data-k="stock_quantity" value="${v.stock_quantity ?? 0}"></td><td><input type="checkbox" data-v="${i}" data-k="is_active" ${v.is_active === 0 || v.is_active === false ? '' : 'checked'}></td><td><button type="button" class="btn danger sm" data-rmv="${i}">Remove</button></td></tr>`).join('');
        $('#stock_quantity').disabled = has; $('#stocknote').hidden = !has;
    };
    drawImgs(); drawVars();
    $('#addv').onclick = () => { const last = variants[variants.length - 1]; variants.push({ size: last?.size || '', color: last?.color || '', color_hex: last?.color_hex || null, price_override: null, stock_quantity: 10, is_active: 1 }); drawVars(); };
    $('#vrows').addEventListener('input', (e) => { const t = e.target; if (t.dataset.v == null) return; variants[+t.dataset.v][t.dataset.k] = t.type === 'checkbox' ? (t.checked ? 1 : 0) : t.value; });
    $('#vrows').addEventListener('click', (e) => { const b = e.target.closest('[data-rmv]'); if (b) { variants.splice(+b.dataset.rmv, 1); drawVars(); } });
    $('#imgs').addEventListener('click', (e) => {
        const r = e.target.closest('[data-rm]'), m = e.target.closest('[data-main]');
        if (r) images.splice(+r.dataset.rm, 1); else if (m) images.unshift(images.splice(+m.dataset.main, 1)[0]); else return;
        drawImgs();
    });
    $('#file').onchange = async (e) => {
        const files = [...e.target.files].slice(0, 8 - images.length); e.target.value = '';
        for (const f of files) {
            if (!f.type.startsWith('image/')) { toast(`${f.name} is not an image.`, 'error'); continue; }
            try { images.push((await api('/upload', { method: 'POST', body: { data: await prepImage(f) } })).data.path); drawImgs(); } catch (x) { toast(`${f.name}: ${x.message}`, 'error'); }
        }
    };
    $('#f').onsubmit = async (e) => {
        e.preventDefault(); const err = $('#err'), btn = $('#save'); err.hidden = true;
        const v = (k) => $('#' + k).value.trim(), c = (k) => $('#' + k).checked;
        const body = { name: v('name'), name_bn: v('name_bn'), category_id: v('category_id'), short_description: v('short_description'), description: v('description'), price: v('price'),
            discount_price: v('discount_price'), cost_price: v('cost_price'), stock_quantity: v('stock_quantity') || 0, sku: v('sku'), status: v('status'), meta_title: v('meta_title'),
            meta_description: v('meta_description'), is_featured: c('is_featured'), is_new_arrival: c('is_new_arrival'), is_best_selling: c('is_best_selling'), images, variants };
        btn.disabled = true;
        try { await api(id ? '/products/' + id : '/products', { method: id ? 'PUT' : 'POST', body }); toast(id ? 'Product updated.' : 'Product added.', 'ok'); setTimeout(() => { location.href = 'products.html'; }, 600); }
        catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; window.scrollTo(0, 0); }
    };
};

// ---------- categories ----------
P.categories = async () => {
    shell('Categories');
    const load = async () => {
        const cats = (await api('/categories')).data;
        app().innerHTML = `<div class="panel"><div class="panel-head"><h3>All categories</h3><button class="btn" id="new"><i class="fa-solid fa-plus"></i> Add category</button></div>
${cats.length ? `<div class="tablewrap"><table><thead><tr><th>Name</th><th>Parent</th><th>Products</th><th>Order</th><th>Shown</th><th></th></tr></thead><tbody>${cats.map((c) => `<tr><td><b>${esc(c.name)}</b>${c.name_bn ? `<br><small class="muted">${esc(c.name_bn)}</small>` : ''}</td><td>${esc(c.parent_name || '—')}</td><td>${c.product_count}</td><td>${c.sort_order}</td><td>${pill(c.is_active ? 'on' : 'off', c.is_active ? 'Yes' : 'Hidden')}</td>
<td class="nowrap right"><button class="btn ghost sm" data-edit="${c.id}">Edit</button> <button class="btn danger sm" data-del="${c.id}" data-name="${esc(c.name)}">Delete</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No categories yet. Add one to start listing products.</p>'}</div>`;
        const form = (c = {}) => {
            const m = modal(c.id ? 'Edit category' : 'Add category', `<form id="cf"><div class="notice err" id="cerr" hidden></div><div class="field"><label for="cn">Name</label><input id="cn" required value="${esc(c.name || '')}"></div>
<div class="field"><label for="cb">Name in Bangla <small>(optional)</small></label><input id="cb" value="${esc(c.name_bn || '')}"></div><div class="row2"><div class="field"><label for="cp">Parent</label><select id="cp"><option value="">None</option>${cats.filter((x) => x.id !== c.id).map((x) => `<option value="${x.id}" ${x.id === c.parent_id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
<div class="field"><label for="cs">Display order</label><input id="cs" type="number" value="${c.sort_order ?? 0}"></div></div><div class="check field"><input type="checkbox" id="ca" ${c.is_active === 0 ? '' : 'checked'}><label for="ca">Show in the shop</label></div><button class="btn">Save category</button></form>`);
            $('#cf', m.el).onsubmit = async (e) => {
                e.preventDefault();
                try { await api(c.id ? '/categories/' + c.id : '/categories', { method: c.id ? 'PUT' : 'POST', body: { name: $('#cn').value, name_bn: $('#cb').value, parent_id: $('#cp').value, sort_order: $('#cs').value, is_active: $('#ca').checked } }); m.close(); toast('Category saved.', 'ok'); load(); }
                catch (x) { $('#cerr').textContent = x.message; $('#cerr').hidden = false; }
            };
        };
        $('#new').onclick = () => form();
        $$('[data-edit]').forEach((b) => { b.onclick = () => form(cats.find((c) => c.id === +b.dataset.edit)); });
        $$('[data-del]').forEach((b) => { b.onclick = async () => { if (!confirm(`Delete "${b.dataset.name}"?`)) return; try { await api('/categories/' + b.dataset.del, { method: 'DELETE' }); toast('Category deleted.', 'ok'); load(); } catch (x) { toast(x.message, 'error'); } }; });
    };
    load().catch(fail);
};

// ---------- orders ----------
const orderForm = (o) => {
    const closed = ['cancelled', 'returned'].includes(o.status);
    return `<form id="of"><div class="row2"><div class="field"><label for="os">Order status</label><select id="os" ${closed ? 'disabled' : ''}>${ST.map((s) => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select>${closed ? `<small>A ${o.status} order cannot be changed.</small>` : '<small>Cancelling or returning puts the stock back.</small>'}</div>
<div class="field"><label for="op">Payment</label><select id="op">${['pending', 'paid', 'failed'].map((s) => `<option ${s === o.payment_status ? 'selected' : ''}>${s}</option>`).join('')}</select><small>Marked paid automatically when delivered.</small></div></div>
<div class="row2"><div class="field"><label for="oc">Courier</label><input id="oc" value="${esc(o.courier_name || '')}" placeholder="e.g. Pathao, Steadfast"></div><div class="field"><label for="ot">Tracking ID</label><input id="ot" value="${esc(o.courier_tracking_id || '')}"></div></div>
<div class="field"><label for="on">Private note</label><textarea id="on" rows="2">${esc(o.admin_note || '')}</textarea></div><button class="btn noprint" id="osave">Save changes</button></form>`;
};
async function openOrder(id, after) {
    let o; try { o = (await api('/orders/' + id)).data; } catch (e) { return toast(e.message, 'error'); }
    const m = modal('Order ' + o.order_number, `<p>${pill(o.status)} ${pill(o.payment_status)} ${o.is_flagged_spam ? '<span class="pill failed">Possible spam</span>' : ''} <span class="muted">· ${when(o.placed_at)} · Cash on delivery</span></p>
<div class="grid3" style="margin:14px 0"><div><b>${esc(o.shipping_name)}</b><br><a href="tel:${esc(o.shipping_phone)}">${esc(o.shipping_phone)}</a>${o.guest_email ? `<br>${esc(o.guest_email)}` : ''}</div><div style="grid-column:span 2">${esc(o.shipping_address)}<br><span class="muted">${esc(o.shipping_district || '')}</span>${o.customer_note ? `<br><i>“${esc(o.customer_note)}”</i>` : ''}</div></div>
<div class="tablewrap"><table><thead><tr><th>Item</th><th>Price</th><th>Qty</th><th class="right">Total</th></tr></thead><tbody>${o.items.map((i) => `<tr><td>${esc(i.product_name)}${i.size ? ` <small class="muted">(${esc(i.size)}${i.color ? ', ' + esc(i.color) : ''})</small>` : ''}</td><td>${money(i.unit_price)}</td><td>${i.quantity}</td><td class="right">${money(i.line_total)}</td></tr>`).join('')}</tbody></table></div>
<div class="right" style="margin:12px 0 18px;line-height:1.8">Subtotal ${money(o.subtotal)}<br>${o.discount_amount > 0 ? `Discount (${esc(o.coupon_code || 'coupon')}) −${money(o.discount_amount)}<br>` : ''}Delivery ${money(o.delivery_charge)}<br><b style="font-size:18px">Collect ${money(o.total_amount)}</b></div>
${orderForm(o)} <div class="toolbar noprint" style="margin-top:12px"><button class="btn ghost" type="button" data-invoice-copy="store"><i class="fa-solid fa-file-invoice"></i> Print store copy</button><button class="btn" type="button" data-invoice-copy="courier"><i class="fa-solid fa-truck-fast"></i> Print courier copy</button></div>`, true);
    $$('[data-invoice-copy]', m.el).forEach((b) => { b.onclick = () => window.printInvoice(o, b.dataset.invoiceCopy, CONFIG.currency); });
    $('#of', m.el).onsubmit = async (e) => {
        e.preventDefault(); const btn = $('#osave', m.el); btn.disabled = true;
        const body = { payment_status: $('#op').value, courier_name: $('#oc').value, courier_tracking_id: $('#ot').value, admin_note: $('#on').value };
        if (!$('#os').disabled) body.status = $('#os').value;
        try { await api('/orders/' + id, { method: 'PATCH', body }); toast('Order updated.', 'ok'); m.close(); after?.(); } catch (x) { toast(x.message, 'error'); btn.disabled = false; }
    };
}

P.orders = async () => {
    shell('Orders');
    const q = new URLSearchParams(location.search);
    let status = q.get('status') || 'all';
    app().innerHTML = `<div class="panel"><div class="tabs" id="tabs"></div><div class="toolbar"><input class="grow" id="q" type="search" placeholder="Search order number, name or phone" aria-label="Search orders"></div>
<div class="tablewrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Area</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th></tr></thead><tbody id="rows"></tbody></table></div><div id="pg"></div></div>`;
    const load = async (pg = 1) => {
        try {
            const { data } = await api('/orders?' + new URLSearchParams({ page: pg, limit: 15, status, q: $('#q').value.trim() }));
            const all = Object.values(data.counts).reduce((a, b) => a + b, 0);
            $('#tabs').innerHTML = [['all', 'All', all], ...ST.map((s) => [s, s[0].toUpperCase() + s.slice(1), data.counts[s]])].map(([k, l, n]) => `<button data-s="${k}" class="${k === status ? 'on' : ''}">${l}<b>${n}</b></button>`).join('');
            $$('#tabs button').forEach((b) => { b.onclick = () => { status = b.dataset.s; load(1); }; });
            $('#rows').innerHTML = data.items.length ? data.items.map((o) => `<tr class="click" data-open="${o.id}"><td><b>${esc(o.order_number)}</b>${o.is_flagged_spam ? ' <i class="fa-solid fa-triangle-exclamation low" title="Possible spam"></i>' : ''}<br><small class="muted">${when(o.placed_at)}</small></td>
<td>${esc(o.shipping_name)}<br><small class="muted">${esc(o.shipping_phone)}</small></td><td>${esc(o.shipping_district || '')}</td><td>${o.item_count}</td><td><b>${money(o.total_amount)}</b></td><td>${pill(o.payment_status)}</td><td>${pill(o.status)}</td></tr>`).join('')
                : '<tr><td colspan="7" class="empty">No orders match.</td></tr>';
            pager($('#pg'), data, load);
        } catch (e) { toast(e.message, 'error'); }
    };
    $('#q').oninput = debounce(() => load(1));
    $('#rows').addEventListener('click', (e) => { const r = e.target.closest('[data-open]'); if (r) openOrder(r.dataset.open, () => load(1)); });
    await load(1);
    if (q.get('open')) openOrder(q.get('open'), () => load(1));
};

P.questions = async () => {
    shell('Product Q&A');
    let status = 'pending', questions = [];
    app().innerHTML = `<div class="panel"><div class="panel-head"><div><h3>Product questions and comments</h3><small class="muted">Replies marked answered appear on the product page.</small></div></div>
<div class="tabs" id="qTabs"></div><div class="toolbar"><input class="grow" id="qSearch" type="search" placeholder="Search product, customer or message" aria-label="Search product questions"></div>
<div class="tablewrap"><table><thead><tr><th>Product</th><th>Customer</th><th>Type</th><th>Message</th><th>Status</th><th></th></tr></thead><tbody id="qRows"></tbody></table></div></div>`;
    const render = () => {
        const query = $('#qSearch').value.trim().toLowerCase();
        const visible = questions.filter((q) => (status === 'all' || q.status === status) && (!query || `${q.product_name} ${q.customer_name} ${q.body}`.toLowerCase().includes(query)));
        $('#qTabs').innerHTML = [['all', 'All'], ['pending', 'Pending'], ['answered', 'Answered'], ['hidden', 'Hidden']].map(([key, label]) => {
            const count = key === 'all' ? questions.length : questions.filter((q) => q.status === key).length;
            return `<button data-qs="${key}" class="${status === key ? 'on' : ''}">${label}<b>${count}</b></button>`;
        }).join('');
        $$('[data-qs]').forEach((b) => { b.onclick = () => { status = b.dataset.qs; render(); }; });
        $('#qRows').innerHTML = visible.length ? visible.map((q) => `<tr><td><a href="../product-details.html?id=${q.product_id}" target="_blank" rel="noopener"><b>${esc(q.product_name)}</b></a></td>
<td>${esc(q.customer_name || 'Customer')}<br><small class="muted">${esc(q.customer_phone || '')}</small></td><td>${esc(q.kind)}</td><td>${esc(q.body)}</td><td>${pill(q.status)}</td><td class="right nowrap"><button class="btn ghost sm" data-qedit="${q.id}">${q.status === 'pending' ? 'Reply' : 'Manage'}</button></td></tr>`).join('')
            : '<tr><td colspan="6" class="empty">No messages in this view.</td></tr>';
        $$('[data-qedit]').forEach((b) => { b.onclick = () => edit(questions.find((q) => q.id === +b.dataset.qedit)); });
    };
    const edit = (q) => {
        const m = modal(`${q.kind === 'question' ? 'Question' : 'Comment'} · ${q.product_name}`, `<p class="muted">From ${esc(q.customer_name || 'Customer')} · ${when(q.created_at)}</p><div class="panel" style="margin:14px 0">${esc(q.body)}</div>
<form id="qForm"><div class="field"><label for="qAnswer">Reply</label><textarea id="qAnswer" rows="5" maxlength="2000">${esc(q.answer || '')}</textarea></div><div class="row2"><div class="field"><label for="qStatus">Visibility</label><select id="qStatus">${['pending', 'answered', 'hidden'].map((value) => `<option value="${value}" ${q.status === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div><div class="field" style="align-self:end"><button class="btn" id="qSave">Save reply</button></div></div></form>`);
        $('#qForm', m.el).onsubmit = async (e) => {
            e.preventDefault(); const button = $('#qSave', m.el); button.disabled = true;
            try { await api('/questions/' + q.id, { method: 'PATCH', body: { answer: $('#qAnswer', m.el).value, status: $('#qStatus', m.el).value } }); toast('Message updated.', 'ok'); m.close(); questions = (await api('/questions')).data; render(); }
            catch (error) { toast(error.message, 'error'); button.disabled = false; }
        };
    };
    questions = (await api('/questions')).data;
    $('#qSearch').oninput = debounce(render, 150);
    render();
};

// ---------- delivery ----------
P.delivery = async () => {
    shell('Delivery');
    app().innerHTML = '<div class="panel"><div class="panel-head"><h3>Orders to ship</h3><small class="muted">New, processing and shipped orders</small></div><div id="ship"></div></div><div class="panel"><div class="panel-head"><h3>Delivery areas &amp; charges</h3><button class="btn" id="newa"><i class="fa-solid fa-plus"></i> Add area</button></div><div id="areas"></div></div>';
    const ships = async () => {
        const { data } = await api('/orders?status=new,processing,shipped&limit=50');
        $('#ship').innerHTML = data.items.length ? data.items.map((o) => `<div class="panel" style="margin-bottom:12px" data-card="${o.id}"><div class="panel-head"><div><b>${esc(o.order_number)}</b> ${pill(o.status)}<br><small class="muted">${esc(o.shipping_name)} · ${esc(o.shipping_phone)} · ${esc(o.shipping_address)}</small></div><b>Collect ${money(o.total_amount)}</b></div>
<div class="row3"><div class="field"><label>Status</label><select data-f="status">${['new', 'processing', 'shipped', 'delivered', 'cancelled'].map((s) => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div><div class="field"><label>Courier</label><input data-f="courier_name" value="${esc(o.courier_name || '')}"></div><div class="field"><label>Tracking ID</label><input data-f="courier_tracking_id" value="${esc(o.courier_tracking_id || '')}"></div></div>
<button class="btn sm" data-upd="${o.id}">Update</button> <button class="btn ghost sm" data-view="${o.id}">Details</button></div>`).join('') : '<p class="empty">Nothing waiting to be shipped.</p>';
    };
    $('#ship').addEventListener('click', async (e) => {
        const v = e.target.closest('[data-view]'); if (v) return openOrder(v.dataset.view, ships);
        const b = e.target.closest('[data-upd]'); if (!b) return;
        const card = b.closest('[data-card]'), body = {}; $$('[data-f]', card).forEach((i) => { body[i.dataset.f] = i.value; });
        b.disabled = true;
        try { await api('/orders/' + b.dataset.upd, { method: 'PATCH', body }); toast('Order updated.', 'ok'); ships(); } catch (x) { toast(x.message, 'error'); b.disabled = false; }
    });
    const areas = async () => {
        const list = (await api('/delivery-areas')).data;
        $('#areas').innerHTML = `<div class="tablewrap"><table><thead><tr><th>Area</th><th>Charge</th><th>Estimated time</th><th>Active</th><th></th></tr></thead><tbody>${list.map((a) => `<tr><td><b>${esc(a.area_name)}</b></td><td>${money(a.delivery_charge)}</td><td>${esc(a.estimated_days || '—')}</td><td>${pill(a.is_active ? 'on' : 'off', a.is_active ? 'Yes' : 'Off')}</td><td class="right nowrap"><button class="btn ghost sm" data-ea="${a.id}">Edit</button> <button class="btn danger sm" data-da="${a.id}">Delete</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">Add at least one area so customers can check out.</td></tr>'}</tbody></table></div>`;
        const form = (a = {}) => {
            const m = modal(a.id ? 'Edit area' : 'Add area', `<form id="af"><div class="field"><label for="an">Area name</label><input id="an" required value="${esc(a.area_name || '')}"></div><div class="row2"><div class="field"><label for="ac">Delivery charge (${CONFIG.currency})</label><input id="ac" type="number" min="0" step="0.01" required value="${a.delivery_charge ?? ''}"></div><div class="field"><label for="ad">Estimated time</label><input id="ad" placeholder="2-3 days" value="${esc(a.estimated_days || '')}"></div></div>
<div class="check field"><input type="checkbox" id="aa" ${a.is_active === 0 ? '' : 'checked'}><label for="aa">Available at checkout</label></div><button class="btn">Save area</button></form>`);
            $('#af', m.el).onsubmit = async (e) => { e.preventDefault(); try { await api(a.id ? '/delivery-areas/' + a.id : '/delivery-areas', { method: a.id ? 'PUT' : 'POST', body: { area_name: $('#an').value, delivery_charge: $('#ac').value, estimated_days: $('#ad').value, is_active: $('#aa').checked } }); m.close(); toast('Area saved.', 'ok'); areas(); } catch (x) { toast(x.message, 'error'); } };
        };
        $('#newa').onclick = () => form();
        $$('[data-ea]').forEach((b) => { b.onclick = () => form(list.find((a) => a.id === +b.dataset.ea)); });
        $$('[data-da]').forEach((b) => { b.onclick = async () => { if (!confirm('Delete this delivery area?')) return; try { await api('/delivery-areas/' + b.dataset.da, { method: 'DELETE' }); toast('Area deleted.', 'ok'); areas(); } catch (x) { toast(x.message, 'error'); } }; });
    };
    ships().catch(fail); areas().catch(fail);
};

// ---------- coupons ----------
P.coupons = async () => {
    shell('Coupons');
    const dtl = (s) => (s ? String(s).replace(' ', 'T').slice(0, 16) : '');
    const load = async () => {
        const list = (await api('/coupons?limit=100')).data.items;
        app().innerHTML = `<div class="panel"><div class="panel-head"><h3>Discount codes</h3><button class="btn" id="new"><i class="fa-solid fa-plus"></i> Create coupon</button></div>
${list.length ? `<div class="tablewrap"><table><thead><tr><th>Code</th><th>Discount</th><th>Min order</th><th>Used</th><th>Valid until</th><th>Active</th><th></th></tr></thead><tbody>${list.map((c) => `<tr><td><b>${esc(c.code)}</b></td><td>${c.type === 'percentage' ? c.value + '%' + (c.max_discount_amount != null ? ` (max ${money(c.max_discount_amount)})` : '') : money(c.value)}</td><td>${money(c.min_order_amount)}</td><td>${c.used_count}${c.usage_limit != null ? ' / ' + c.usage_limit : ''}</td><td>${c.expires_at ? when(c.expires_at) : 'No expiry'}</td><td>${pill(c.is_active ? 'on' : 'off', c.is_active ? 'Yes' : 'Off')}</td>
<td class="nowrap right"><button class="btn ghost sm" data-e="${c.id}">Edit</button> <button class="btn danger sm" data-d="${c.id}" data-n="${esc(c.code)}">Delete</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No coupons yet.</p>'}</div>`;
        const form = (c = {}) => {
            const m = modal(c.id ? 'Edit coupon' : 'Create coupon', `<form id="cf"><div class="notice err" id="cerr" hidden></div><div class="row2"><div class="field"><label for="cc">Code</label><input id="cc" required maxlength="50" style="text-transform:uppercase" value="${esc(c.code || '')}"></div>
<div class="field"><label for="ct">Type</label><select id="ct"><option value="percentage" ${c.type !== 'fixed' ? 'selected' : ''}>Percentage (%)</option><option value="fixed" ${c.type === 'fixed' ? 'selected' : ''}>Fixed amount (${CONFIG.currency})</option></select></div></div>
<div class="row3"><div class="field"><label for="cv">Value</label><input id="cv" type="number" min="0" step="0.01" required value="${c.value ?? ''}"></div><div class="field"><label for="cm">Minimum order</label><input id="cm" type="number" min="0" value="${c.min_order_amount ?? 0}"></div><div class="field"><label for="cx">Max discount <small>(%)</small></label><input id="cx" type="number" min="0" value="${c.max_discount_amount ?? ''}"></div></div>
<div class="row2"><div class="field"><label for="cl">Total uses <small>(empty = unlimited)</small></label><input id="cl" type="number" min="1" value="${c.usage_limit ?? ''}"></div><div class="field"><label for="cp">Uses per customer</label><input id="cp" type="number" min="1" value="${c.usage_limit_per_customer ?? 1}"></div></div>
<div class="row2"><div class="field"><label for="cs">Starts</label><input id="cs" type="datetime-local" value="${dtl(c.starts_at)}"></div><div class="field"><label for="ce">Expires</label><input id="ce" type="datetime-local" value="${dtl(c.expires_at)}"></div></div>
<div class="check field"><input type="checkbox" id="ca" ${c.is_active === 0 ? '' : 'checked'}><label for="ca">Active</label></div><button class="btn">Save coupon</button></form>`);
            $('#cf', m.el).onsubmit = async (e) => {
                e.preventDefault();
                try { await api(c.id ? '/coupons/' + c.id : '/coupons', { method: c.id ? 'PUT' : 'POST', body: { code: $('#cc').value, type: $('#ct').value, value: $('#cv').value, min_order_amount: $('#cm').value, max_discount_amount: $('#cx').value, usage_limit: $('#cl').value, usage_limit_per_customer: $('#cp').value, starts_at: $('#cs').value, expires_at: $('#ce').value, is_active: $('#ca').checked } }); m.close(); toast('Coupon saved.', 'ok'); load(); }
                catch (x) { $('#cerr').textContent = x.message; $('#cerr').hidden = false; }
            };
        };
        $('#new').onclick = () => form();
        $$('[data-e]').forEach((b) => { b.onclick = () => form(list.find((c) => c.id === +b.dataset.e)); });
        $$('[data-d]').forEach((b) => { b.onclick = async () => { if (!confirm(`Delete coupon ${b.dataset.n}?`)) return; try { await api('/coupons/' + b.dataset.d, { method: 'DELETE' }); toast('Coupon deleted.', 'ok'); load(); } catch (x) { toast(x.message, 'error'); } }; });
    };
    load().catch(fail);
};

// ---------- customers ----------
P.customers = async () => {
    shell('Customers');
    app().innerHTML = `<div class="panel"><div class="toolbar"><input class="grow" id="q" type="search" placeholder="Search name, phone or email" aria-label="Search customers"></div><div class="tablewrap"><table><thead><tr><th>Customer</th><th>Phone</th><th>Email</th><th>City</th><th>Orders</th><th>Spent</th><th>Joined</th></tr></thead><tbody id="rows"></tbody></table></div><div id="pg"></div></div>`;
    const load = async (pg = 1) => {
        try {
            const { data } = await api('/customers?' + new URLSearchParams({ page: pg, limit: 20, q: $('#q').value.trim() }));
            $('#rows').innerHTML = data.items.length ? data.items.map((c) => `<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.phone)}</td><td>${esc(c.email || '—')}</td><td>${esc(c.city || '—')}</td><td>${c.orders}</td><td>${money(c.spent)}</td><td>${when(c.created_at)}</td></tr>`).join('') : '<tr><td colspan="7" class="empty">No customers yet. Guests who check out without an account are listed under Orders.</td></tr>';
            pager($('#pg'), data, load);
        } catch (e) { toast(e.message, 'error'); }
    };
    $('#q').oninput = debounce(() => load(1)); load(1);
};

(P[page] || P.dashboard)()?.catch?.(fail);
})();
