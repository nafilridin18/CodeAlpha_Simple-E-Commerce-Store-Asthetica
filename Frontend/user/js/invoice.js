(() => {
    'use strict';

    const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const copies = {
        customer: { label: 'CUSTOMER COPY', title: 'Order invoice', tone: 'customer', note: 'Keep this invoice for your records.' },
        store: { label: 'STORE COPY', title: 'Sales invoice', tone: 'store', note: 'Store record · retain for accounts.' },
        courier: { label: 'COURIER COPY', title: 'Parcel manifest', tone: 'courier', note: 'Attach to parcel · collect the amount shown.' }
    };

    window.printInvoice = (order, copy = 'customer', currency = '৳') => {
        if (!order || !Array.isArray(order.items)) return false;
        const type = copies[copy] || copies.customer;
        const popup = window.open('', '_blank');
        if (!popup) {
            window.alert('Allow pop-ups to print this invoice.');
            return false;
        }
        const money = (value) => currency + Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const date = new Date(String(order.placed_at || '').replace(' ', 'T'));
        const dateText = Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
        const lines = order.items.map((item) => `<tr><td><strong>${escape(item.product_name || item.name)}</strong>${item.size || item.color ? `<small>${escape([item.size, item.color].filter(Boolean).join(' · '))}</small>` : ''}</td><td>${money(item.unit_price || item.price)}</td><td>${Number(item.quantity) || 0}</td><td class="amount">${money(item.line_total ?? (Number(item.unit_price || item.price) * Number(item.quantity || 0)))}</td></tr>`).join('');
        const discount = Number(order.discount_amount || 0);
        const totalLabel = copy === 'courier' ? 'Cash to collect' : 'Total';
        popup.document.open();
        popup.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(type.title)} · ${escape(order.order_number)}</title><style>
            :root{--walnut:#5c4033;--clay:#a8432a;--peach:#ffdab9;--paper:#fffdfa;--ink:#211c19;--muted:#756b63;--line:#e8ded5}
            *{box-sizing:border-box}body{margin:0;background:#f5f0e9;color:var(--ink);font:14px/1.55 Arial,sans-serif}.sheet{--accent:var(--walnut);max-width:820px;margin:32px auto;padding:36px;background:var(--paper);border:1px solid var(--line);box-shadow:0 16px 44px rgba(50,34,24,.12)}
            .sheet.store{--accent:#34302d;border-top:7px double var(--accent)}.sheet.courier{--accent:var(--clay);border-top:7px solid var(--accent);background:linear-gradient(180deg,#fffdfa,#fff8f1)}
            .topline{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:1px solid var(--line);padding-bottom:20px}.brand{font:700 22px Georgia,serif;letter-spacing:2px;color:var(--walnut)}.tag{display:inline-block;margin-top:9px;padding:5px 10px;border:1px solid var(--accent);border-radius:3px;color:var(--accent);font-size:10px;font-weight:bold;letter-spacing:1px}.title{text-align:right}.title h1{margin:0;color:var(--accent);font:600 25px Georgia,serif}.title p,.muted{margin:5px 0;color:var(--muted);font-size:12px}
            .details{display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:22px 0}.details h2{margin:0 0 7px;color:var(--accent);font-size:11px;letter-spacing:1px;text-transform:uppercase}.details p{margin:2px 0;white-space:pre-line}.meta{text-align:right}.meta strong{display:block;font-size:16px}.items{width:100%;border-collapse:collapse}.items th{padding:10px 8px;background:#f4ece4;color:var(--walnut);font-size:11px;text-align:left;text-transform:uppercase}.items td{padding:12px 8px;border-bottom:1px solid var(--line);vertical-align:top}.items td small{display:block;color:var(--muted);margin-top:3px}.items .amount,.items th:last-child{text-align:right}.totals{width:min(100%,330px);margin:18px 0 0 auto}.totals div{display:flex;justify-content:space-between;padding:5px 0;color:var(--muted)}.totals .grand{margin-top:6px;padding:12px 0;border-top:2px solid var(--accent);color:var(--ink);font-size:17px;font-weight:bold}.foot{display:flex;justify-content:space-between;gap:18px;margin-top:28px;padding-top:14px;border-top:1px solid var(--line);color:var(--muted);font-size:11px}.print{display:block;margin:20px auto 0;padding:10px 18px;border:0;background:var(--walnut);color:white;border-radius:5px;font-weight:bold;cursor:pointer}
            @media(max-width:600px){.sheet{margin:0;padding:22px 16px;border:0}.topline{gap:10px}.brand{font-size:18px}.title h1{font-size:21px}.details{gap:14px}.items{font-size:12px}.items td,.items th{padding:9px 5px}.foot{flex-direction:column}}
            @media print{body{background:#fff}.sheet{max-width:none;margin:0;padding:16mm;border:0;box-shadow:none}.print{display:none}@page{size:A4;margin:0}}
        </style></head><body><main class="sheet ${type.tone}"><header class="topline"><div><div class="brand">AESTHETICA</div><span class="tag">${type.label}</span></div><div class="title"><h1>${type.title}</h1><p>Order ${escape(order.order_number)}</p><p>${escape(dateText)}</p></div></header>
            <section class="details"><div><h2>Deliver to</h2><p><strong>${escape(order.shipping_name)}</strong></p><p>${escape(order.shipping_phone)}</p><p>${escape(order.guest_email || order.invoice_email || order.email || '')}</p><p>${escape(order.shipping_address)}${order.shipping_district ? `\n${escape(order.shipping_district)}` : ''}</p></div><div class="meta"><h2>Order details</h2><strong>${escape(order.status || 'new').toUpperCase()}</strong><p>${escape(order.payment_method || 'Cash on delivery')}</p>${order.courier_name ? `<p>${escape(order.courier_name)}${order.courier_tracking_id ? ` · ${escape(order.courier_tracking_id)}` : ''}</p>` : ''}</div></section>
            <table class="items"><thead><tr><th>Item</th><th>Price</th><th>Qty</th><th>Total</th></tr></thead><tbody>${lines}</tbody></table>
            <section class="totals"><div><span>Subtotal</span><span>${money(order.subtotal)}</span></div>${discount ? `<div><span>Discount</span><span>−${money(discount)}</span></div>` : ''}<div><span>Delivery</span><span>${money(order.delivery_charge)}</span></div><div class="grand"><span>${totalLabel}</span><span>${money(order.total_amount)}</span></div></section>
            <footer class="foot"><span>${type.note}</span><span>Thank you for choosing Aesthetica.</span></footer></main><button class="print" id="print-btn">Print this copy</button><script>document.getElementById('print-btn').addEventListener('click', () => window.print());</script></body></html>`);
        popup.document.close();
        return true;
    };
})();
