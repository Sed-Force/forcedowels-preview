// script-success.js  (Place at site root or /public; referenced by success.html)
// Fetches the session summary and fills the success page.
// NOTE: We intentionally DO NOT render a per-line $ total on the item row.

(function () {
  function qs(name) {
    const m = new RegExp('[?&]' + name + '=([^&]+)').exec(window.location.search);
    return m ? decodeURIComponent(m[1]) : '';
  }

  async function load() {
    const sid = qs('session_id');
    if (!sid) return;

    try {
      const res = await fetch(`/api/order-summary?session_id=${encodeURIComponent(sid)}`);
      if (!res.ok) throw new Error('Failed to load order summary');
      const data = await res.json();

      // Fill key values (colons are handled by CSS in success.html)
      const $ = (id) => document.getElementById(id);
      if ($('s-order'))  $('s-order').textContent  = data.short_id || data.id || '—';
      if ($('s-status')) $('s-status').textContent = (data.payment_status || '—').toUpperCase();
      if ($('s-amount')) $('s-amount').textContent = data.amount_formatted || '—';
      if ($('s-email'))  $('s-email').textContent  = data.customer_email || '—';

      // Build items list with NO trailing $ on the same row
      // We'll show only the textual description (name + detail), as requested
      const itemsBox = document.getElementById('s-items');
      if (!itemsBox) return;

      const items = Array.isArray(data.items) ? data.items : [];
      if (!items.length) {
        itemsBox.textContent = 'No items found.';
        return;
      }

      // Example line: "Force Dowels — Bulk — 5,000 units @ $0.0720/unit"
      // We ignore line.total on purpose to avoid showing $360.00 again here.
      itemsBox.innerHTML = items.map(it => {
        const safeName = (it.name || 'Item').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const safeDesc = (it.desc || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const qty = it.qty || 1;
        // Show a helpful one-line detail if available
        const detail = safeDesc ? ` — ${safeDesc}` : '';
        const qtyNote = qty > 1 ? ` (x${qty})` : '';
        return `<div>${safeName}${detail}${qtyNote}</div>`;
      }).join('');
    } catch (err) {
      console.error('SUCCESS_PAGE_ERROR', err);
    }
  }

  window.addEventListener('DOMContentLoaded', load);
})();
