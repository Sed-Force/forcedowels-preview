// scripts/email-preview-server.mjs
// Local visual preview of the admin/team order-notification emails.
// Renders each template with sample data and hot-reloads the browser when
// any email source file changes. Not part of the deployed app.
//
//   npm run dev:emails      →  http://localhost:4180

import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.EMAIL_PREVIEW_PORT || 4180);

// Point template links (logo, Download PDF) at this preview server so the
// in-email "Download PDF" button resolves to the local /api/order-print route.
process.env.NEXT_PUBLIC_BASE_URL = `http://localhost:${PORT}`;

// Files that, when edited, should trigger a browser reload.
const WATCH_FILES = [
  'api/_lib/email/internalNotification.js',
  'api/_lib/email/orderFormatting.js',
  'api/_lib/email/internationalInternalNotification.js',
  'api/_lib/email/orderContext.js',
  'api/order-print.js',
  'api/international-order.js',
  'api/stripe-webhook.js'
].map((p) => join(ROOT, p));

function watchSignature() {
  return WATCH_FILES.map((f) => {
    try { return `${f}:${statSync(f).mtimeMs}`; } catch { return `${f}:0`; }
  }).join('|');
}

// ----------------------------------------------------------------------------
// Sample data
// ----------------------------------------------------------------------------

const ORDER_DATE = 'August 31, 2026, 10:30 AM UTC';

const domesticSample = {
  invoiceNumber: '10412',
  customerName: 'Ridgeline Cabinetry LLC',
  customerEmail: 'orders@ridgelinecab.com',
  customerPhone: '+1 (480) 555-0148',
  orderDate: ORDER_DATE,
  sessionId: 'cs_test_a1b2c3d4e5f6g7h8i9j0',
  subtotalCents: 268900,
  shippingCents: 14250,
  taxCents: 21512,
  totalCents: 304662,
  metaSummary: {
    lines: [
      { type: 'bulk', sizeId: '8x38', units: 35000 },
      { type: 'kit', sizeId: '8x38', qty: 2 }
    ]
  },
  shippingMethod: 'UPS Ground',
  shippingAddress: {
    name: 'Ridgeline Cabinetry LLC',
    line1: '2140 W Industrial Way',
    line2: 'Building C',
    city: 'Mesa',
    state: 'AZ',
    postal_code: '85201',
    country: 'US'
  },
  billingAddress: {
    line1: '2140 W Industrial Way',
    city: 'Mesa',
    state: 'AZ',
    postal_code: '85201',
    country: 'US'
  },
  isTest: false
};

const internationalPaidSample = {
  invoiceNumber: '10413',
  customerName: 'John Smith',
  customerEmail: 'john.smith@example.com',
  customerPhone: '+1 (416) 555-0123',
  orderDate: ORDER_DATE,
  sessionId: 'cs_test_i1n2t3l4p5a6i7d8',
  units: 35000,
  unitPrice: '0.0675',
  tierLabel: '8mm x 38mm • Tier: 25,000–164,999',
  lineTotal: '2362.50',
  subtotalCents: 236250,
  taxCents: 18900,
  totalCents: 255150,
  orderType: 'bulk',
  shippingAddress: {
    name: 'John Smith',
    line1: '123 Business Parkway',
    line2: 'Suite 400',
    city: 'Toronto',
    state: 'ON',
    postal_code: 'M5H 2N2',
    country: 'Canada',
    phone: '+1 (416) 555-0123'
  },
  billingAddress: { line1: '123 Business Parkway', line2: 'Suite 400', country: 'Canada' },
  businessName: 'Acme Corp International',
  taxId: 'CA123456789',
  comments: 'Please use expedited shipping if possible — this order is time-sensitive.',
  shippingLabel: 'Customer will provide their own carrier account'
};

const internationalRequestSample = {
  action: 'reserve',
  quantity_display: '35,000 units (8mm x 38mm)',
  business_name: 'Acme Corp International',
  contact_name: 'John Smith',
  email: 'john.smith@example.com',
  phone: '+1 (416) 555-0123',
  shipping_address: '123 Business Parkway\nSuite 400\nToronto, ON M5H 2N2\nCanada',
  tax_id: 'CA123456789',
  comments: 'We ship to a bonded warehouse — please include a commercial invoice.',
  identityEmail: 'john.smith@example.com',
  identityId: 'user_2abc123',
  BRAND_BLUE: process.env.EMAIL_PRIMARY_COLOR || '#1C4A99',
  LOGO_URL: process.env.EMAIL_LOGO_URL
    || `${process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '')}/images/LOGO_Wordmark+Icon-WhiteAccent@1024.png`,
  LOGO_HEIGHT: Number(process.env.EMAIL_LOGO_HEIGHT || 48)
};

// ----------------------------------------------------------------------------
// Panels
// ----------------------------------------------------------------------------

const PANELS = [
  {
    slug: 'domestic',
    label: 'Domestic order → team',
    subject: 'New Order #10412 – Ridgeline Cabinetry LLC',
    source: 'api/_lib/email/internalNotification.js · buildInternalNotificationHTML()',
    module: '../api/_lib/email/internalNotification.js',
    export: 'buildInternalNotificationHTML',
    sample: domesticSample,
    note: 'The Download PDF button links to /api/order-print (rendered here from the same sample).'
  },
  {
    slug: 'international-paid',
    label: 'International order (paid, awaiting quote) → team',
    subject: 'New Order #10413 🌍 INTERNATIONAL – Acme Corp International',
    source: 'api/_lib/email/internationalInternalNotification.js · buildInternationalInternalNotificationHTML()',
    module: '../api/_lib/email/internationalInternalNotification.js',
    export: 'buildInternationalInternalNotificationHTML',
    sample: internationalPaidSample
  },
  {
    slug: 'international-request',
    label: 'International order request form → team',
    subject: 'International Order Request - Acme Corp International',
    source: 'api/international-order.js · buildEmailHtml()',
    module: '../api/international-order.js',
    export: 'buildEmailHtml',
    sample: internationalRequestSample
  }
];

async function importFresh(modulePath) {
  // Re-import with a cache-busting query so template edits take effect without a restart.
  return import(new URL(`${modulePath}?t=${Date.now()}`, import.meta.url));
}

async function renderPanel(panel) {
  const mod = await importFresh(panel.module);
  return mod[panel.export](panel.sample);
}

async function renderOrderPrint() {
  const { buildInternalNotificationHTML } = await importFresh('../api/_lib/email/internalNotification.js');
  const { toPrintDocument } = await importFresh('../api/order-print.js');
  const email = buildInternalNotificationHTML({ ...domesticSample, showDownloadButton: false });
  return toPrintDocument(email);
}

// ----------------------------------------------------------------------------
// HTTP server
// ----------------------------------------------------------------------------

const LIVE_RELOAD = `
<script>
  (function () {
    let last = null;
    async function tick() {
      try {
        const sig = await (await fetch('/__watch', { cache: 'no-store' })).text();
        if (last !== null && sig !== last) return location.reload();
        last = sig;
      } catch (_) {}
      setTimeout(tick, 1000);
    }
    tick();
  })();
</script>`;

function dashboard() {
  const cards = PANELS.map((p) => `
    <section class="card">
      <header>
        <h2>${p.label}</h2>
        <p class="subject"><span>Subject</span> ${escapeHtml(p.subject)}</p>
        <p class="source">${escapeHtml(p.source)}</p>
        ${p.note ? `<p class="note">${escapeHtml(p.note)}</p>` : ''}
        <a class="open" href="/email/${p.slug}" target="_blank" rel="noopener">Open full width ↗</a>
        ${p.slug === 'domestic' ? '<a class="open" href="/api/order-print" target="_blank" rel="noopener">Open A4 print view ↗</a>' : ''}
      </header>
      <iframe src="/email/${p.slug}" title="${escapeHtml(p.label)}" loading="lazy"></iframe>
    </section>`).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Admin order emails — preview</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #0f172a; color: #e2e8f0;
           font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
    .page-header { padding: 20px 24px; background: #1e293b; border-bottom: 1px solid #334155; }
    .page-header h1 { margin: 0 0 4px; font-size: 18px; }
    .page-header p { margin: 0; font-size: 13px; color: #94a3b8; }
    .grid { display: grid; gap: 24px; padding: 24px;
            grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); align-items: start; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 10px; overflow: hidden; }
    .card header { padding: 14px 16px; border-bottom: 1px solid #334155; }
    .card h2 { margin: 0 0 8px; font-size: 14px; }
    .subject { margin: 0 0 6px; font-size: 12px; color: #cbd5e1; }
    .subject span { display: inline-block; padding: 1px 6px; margin-right: 6px; border-radius: 4px;
                    background: #334155; color: #94a3b8; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
    .source { margin: 0 0 6px; font-size: 11px; color: #64748b; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .note { margin: 0 0 8px; font-size: 12px; color: #fbbf24; }
    .open { font-size: 12px; color: #7dd3fc; text-decoration: none; margin-right: 14px; }
    .open:hover { text-decoration: underline; }
    iframe { width: 100%; height: 780px; border: 0; background: #f3f4f6; display: block; }
    .reload-hint { padding: 0 24px 24px; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="page-header">
    <h1>Admin order-notification emails</h1>
    <p>Live preview with sample data. Edit any template source and this page reloads automatically.</p>
  </div>
  <div class="grid">
    ${cards}
  </div>
  <p class="reload-hint">Watching: ${WATCH_FILES.map((f) => f.replace(ROOT + '/', '')).join(' · ')}</p>
  ${LIVE_RELOAD}
</body>
</html>`;
}

function escapeHtml(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (url.pathname === '/__watch') return send(res, 200, 'text/plain', watchSignature());

    // Templates reference /images/... on the site; bounce those to production.
    if (url.pathname.startsWith('/images/')) {
      res.writeHead(302, { Location: `https://forcedowels.com${url.pathname}` });
      return res.end();
    }

    if (url.pathname === '/' || url.pathname === '') {
      return send(res, 200, 'text/html; charset=utf-8', dashboard());
    }

    if (url.pathname === '/api/order-print') {
      return send(res, 200, 'text/html; charset=utf-8', await renderOrderPrint());
    }

    const match = url.pathname.match(/^\/email\/([a-z-]+)$/);
    if (match) {
      const panel = PANELS.find((p) => p.slug === match[1]);
      if (!panel) return send(res, 404, 'text/plain', 'Unknown email');
      const html = await renderPanel(panel);
      return send(res, 200, 'text/html; charset=utf-8', html + LIVE_RELOAD);
    }

    return send(res, 404, 'text/plain', 'Not found');
  } catch (err) {
    console.error(err);
    return send(res, 500, 'text/plain', `Render error:\n\n${err?.stack || err}`);
  }
});

server.listen(PORT, () => {
  console.log(`Email preview → http://localhost:${PORT}`);
});
