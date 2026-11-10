// /scripts/admin/admin-header.js — <admin-header> web component.
//
// Renders the shared admin navbar (logo, section nav, logout) so every
// admin page pulls from one place — add/rename a section here and every
// page picks it up. Styling lives in styles/admin/navbar.css. Light DOM,
// mirrors <site-header>/<site-footer> on the customer-facing side.

const NAV_LINKS = [
  { href: '/admin.html', label: 'Orders' },
  { href: '/admin-customers.html', label: 'Customers' },
  { href: '/admin-distributors.html', label: 'Distributors' },
  { href: '/admin-sales.html', label: 'Sales' },
  { href: '/admin-products.html', label: 'Products' }
];

function normalizePath(path) {
  // Vercel's clean URLs serve these pages with the .html suffix stripped
  // (e.g. /admin.html resolves at /admin), so compare without it.
  path = path.replace(/\.html$/, '');
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path || '/';
}

class AdminHeader extends HTMLElement {
  connectedCallback() {
    if (this.dataset.rendered) return;
    this.dataset.rendered = 'true';
    this.classList.add('admin-header');
    this.setAttribute('role', 'banner');
    this.innerHTML = this.template();

    this.querySelector('.admin-logout')?.addEventListener('click', (e) => {
      e.preventDefault();
      window.adminLogout?.();
    });
  }

  template() {
    const pathname = normalizePath(window.location.pathname);
    const navLinks = NAV_LINKS.map(({ href, label }) => {
      const cls = normalizePath(href) === pathname ? ' class="active"' : '';
      return `<a href="${href}"${cls}>${label}</a>`;
    }).join('\n        ');

    return `
      <div class="admin-header-left">
        <a href="/" class="admin-brand" aria-label="Force Dowel Company — back to home">
          <img src="/images/LOGO_Wordmark+Icon-WhiteAccent@1024.png" alt="Force Dowel Company logo" class="admin-logo" />
        </a>
        <h1>Admin</h1>
      </div>
      <nav class="admin-nav">
        ${navLinks}
        <a href="#" class="admin-logout" style="margin-left: auto;">Logout</a>
      </nav>
    `;
  }
}

customElements.define('admin-header', AdminHeader);
