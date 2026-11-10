// /scripts/shared/site-header.js — <site-header> web component.
//
// Renders the site navbar (logo, primary nav + Distributors dropdown,
// theme toggle, cart, auth controls, mobile hamburger drawer) and owns
// all of its own behavior. Styling lives in navbar.css and applies via
// the regular document stylesheet — this component renders into light
// DOM (no shadow root) on purpose, since it needs to interoperate with
// existing global scripts (cart badge, order/checkout pages) that look
// up header elements by id via the plain document.

const MOBILE_BREAKPOINT = '(max-width: 900px)';

const NAV_LINKS = [
  { href: '/', label: 'Home', match: ['/', '/index.html'] },
  { href: '/order.html', label: 'Order', match: ['/order', '/order.html', '/order-success', '/order-success.html'] },
  { href: '/videos.html', label: 'Videos', match: ['/videos', '/videos.html'] },
  { href: '/faq.html', label: 'FAQ', match: ['/faq', '/faq.html'] },
  { href: '/contact.html', label: 'Contact', match: ['/contact', '/contact.html'] }
];
const DISTRIBUTOR_MATCH = ['/distributors', '/distributors.html', '/distributor-application', '/distributor-application.html'];

function normalizePath(path) {
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path || '/';
}
function isActive(matchList, pathname) {
  const p = normalizePath(pathname);
  return matchList.some((m) => normalizePath(m) === p);
}

/* ── Theme (applied at module load so it isn't gated on the header
   rendering; the toggle button wiring below just needs the button to
   exist by the time connectedCallback runs) ─────────────────────────── */
function getStoredTheme() {
  return localStorage.getItem('theme');
}
function applyTheme(theme) {
  if (theme === 'auto') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  localStorage.setItem('theme', theme);
}
function currentTheme() {
  return document.documentElement.getAttribute('data-theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
(function initTheme() {
  const saved = getStoredTheme();
  if (saved) applyTheme(saved);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!document.documentElement.hasAttribute('data-theme')) {
      document.body.classList.add('theme-transition');
      setTimeout(() => document.body.classList.remove('theme-transition'), 100);
    }
  });
})();

function clerkAppearance() {
  const theme = currentTheme();
  return {
    baseTheme: theme === 'dark' ? 'dark' : 'light',
    variables: {
      colorPrimary: '#224d8f',
      colorText: theme === 'dark' ? '#ffffff' : '#000000',
      colorBackground: theme === 'dark' ? '#1e2a3f' : '#ffffff',
      colorInputBackground: theme === 'dark' ? '#0f1420' : '#ffffff',
      colorInputText: theme === 'dark' ? '#ffffff' : '#000000',
    },
  };
}

class SiteHeader extends HTMLElement {
  connectedCallback() {
    if (this.dataset.rendered) return;
    this.dataset.rendered = 'true';
    this.classList.add('site-header');
    this.setAttribute('role', 'banner');
    this.innerHTML = this.template();

    this.wireMobileNav();
    this.wireThemeToggle();
    this.wireAuth();
  }

  template() {
    const pathname = window.location.pathname;
    const navLinks = NAV_LINKS.map(({ href, label, match }) => {
      const cls = isActive(match, pathname) ? ' class="active"' : '';
      return `<a href="${href}"${cls}>${label}</a>`;
    }).join('\n          ');
    const distActive = isActive(DISTRIBUTOR_MATCH, pathname) ? ' active' : '';

    return `
      <nav id="nav" class="container">
        <a
          href="/"
          class="brand"
          aria-label="Force Dowel Company"
        >
          <img
            src="/images/LOGO_Icon-FullColor@512.png"
            alt="Force Dowel Company Icon"
            class="brand-logo"
          />
          <img
            src="/images/LOGO_Wordmark-White@512.png"
            alt="Force Dowel Company Wordmark"
            class="brand-logo"
          />
        </a>

        <div class="nav" id="primary-nav" aria-label="Primary">
            ${navLinks}

            <div class="nav-dropdown">
              <button class="nav-dropbtn ${distActive}" type="button" aria-haspopup="true" aria-expanded="false">
                <span class="nav-drop-label">Distributors</span>
                <span class="nav-caret">▾</span>
              </button>
              <div class="nav-dropmenu" role="menu">
                <a href="/distributors" role="menuitem">Find a Distributor</a>
                <a href="/distributor-application" role="menuitem">Become a Distributor</a>
              </div>
            </div>
        </div>

        <div class="header-actions">
          <button class="btn btn--accent" id="theme-toggle" type="button" aria-label="Toggle theme">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" class="theme-icon theme-icon-light">
              <path fill="currentColor" d="M12 18a6 6 0 1 1 0-12a6 6 0 0 1 0 12M12 2a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1m0 18a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1M20.66 7.34a1 1 0 0 1 0 1.41l-.71.71a1 1 0 1 1-1.41-1.41l.71-.71a1 1 0 0 1 1.41 0M5.46 17.54a1 1 0 0 1 0 1.41l-.71.71a1 1 0 1 1-1.41-1.41l.71-.71a1 1 0 0 1 1.41 0M22 12a1 1 0 0 1-1 1h-1a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1M4 12a1 1 0 0 1-1 1H2a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1m16.66 4.66a1 1 0 0 1-1.41 0l-.71-.71a1 1 0 0 1 1.41-1.41l.71.71a1 1 0 0 1 0 1.41M7.75 6.25a1 1 0 0 1-1.41 0l-.71-.71a1 1 0 0 1 1.41-1.41l.71.71a1 1 0 0 1 0 1.41"/>
            </svg>

            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" class="theme-icon theme-icon-dark">
              <path fill="currentColor" d="M12 21q-3.75 0-6.375-2.625T3 12q0-3.75 2.625-6.375T12 3q.35 0 .688.025t.662.075q-1.025.725-1.638 1.888T11.1 7.5q0 2.25 1.575 3.825T16.5 12.9q1.375 0 2.525-.613T20.9 10.65q.05.325.075.662T21 12q0 3.75-2.625 6.375T12 21"/>
            </svg>
          </button>

          <a
            href="/cart.html"
            class="btn btn--invert"
            id="btn-cart"
            aria-label="Shopping cart"
            onclick="window.location='/cart.html'; return false;"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" d="M7 18a2 2 0 1 0 0 4a2 2 0 0 0 0-4m10 0a2 2 0 1 0 0 4a2 2 0 0 0 0-4M6.2 6l.3 2h12.3a1 1 0 0 1 1 1l-1.2 6a2 2 0 0 1-2 1.6H8.7a2 2 0 0 1-2-1.7L5.3 5H3V3h3a1 1 0 0 1 1 .9L7.2 6Z"/>
            </svg>

            <span class="hide-sm">
              Cart
            </span>

            <span id="cart-count" class="badge"></span>
          </a>

          <!-- Authentication buttons
          <div class="auth-buttons">
            <button
              type="button"
              id="btn-login"
              class="btn btn--accent"
            >
              Login
            </button>
    
            
            <button
              type="button"
              id="btn-signup"
              class="btn btn--accent"
            >
              Sign Up
            </button>
          </div>
          -->

          <button
            type="button"
            id="btn-signout"
            style="display:none;"
            class="btn btn--ghost btn--invert"
          >
            Sign Out
          </button>

          <button
            class="nav-toggle"
            type="button"
            aria-label="Toggle navigation menu"
            aria-expanded="false"
            aria-controls="primary-nav"
          >
            <span class="nav-toggle-bar"></span>
            <span class="nav-toggle-bar"></span>
            <span class="nav-toggle-bar"></span>
          </button>
        </div>
      </nav>
    `;
  }

  /* ── Mobile hamburger drawer + dropdown ─────────────────────────────── */
  wireMobileNav() {
    const toggle = this.querySelector('.nav-toggle');
    const nav = this.querySelector('.nav');
    const actions = this.querySelector('.header-actions');
    if (!toggle || !nav) return;

    // Below the breakpoint the header row only has room for the logo,
    // cart, and hamburger — move the theme toggle and auth controls
    // into the nav drawer (and back out again above the breakpoint) so
    // nothing gets clipped.
    const themeToggle = this.querySelector('#theme-toggle');
    const authButtons = this.querySelector('.auth-buttons');
    const btnSignout = this.querySelector('#btn-signout');

    // In the drawer, the theme toggle and the auth control (Login, or
    // Sign Out once signed in) share one row: a circular toggle on the
    // left with the auth control filling the rest. Built only at the
    // mobile breakpoint so desktop's header-actions row (where these are
    // separate, independently-positioned items) is untouched.
    const authRow = document.createElement('div');
    authRow.className = 'mobile-auth-row';

    const mobileQuery = window.matchMedia(MOBILE_BREAKPOINT);
    const placeRelocatedControls = () => {
      if (!actions) return;
      if (mobileQuery.matches) {
        if (themeToggle) authRow.appendChild(themeToggle);
        if (authButtons) authRow.appendChild(authButtons);
        nav.appendChild(authRow);
        if (btnSignout) nav.appendChild(btnSignout);
      } else {
        // Restore the original header-actions order: toggle, cart
        // (never moved), auth controls, then the hamburger.
        if (themeToggle) actions.insertBefore(themeToggle, actions.firstChild);
        if (authButtons) actions.insertBefore(authButtons, toggle);
        if (btnSignout) actions.insertBefore(btnSignout, toggle);
      }
    };
    placeRelocatedControls();
    mobileQuery.addEventListener('change', placeRelocatedControls);

    const closeDropdowns = () => {
      nav.querySelectorAll('.nav-dropdown.is-open').forEach((dropdown) => {
        dropdown.classList.remove('is-open');
        dropdown.querySelector('.nav-dropbtn')?.setAttribute('aria-expanded', 'false');
      });
    };
    const closeNav = () => {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      closeDropdowns();
    };

    toggle.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(isOpen));
      if (!isOpen) closeDropdowns();
    });

    nav.querySelectorAll('.nav-dropdown').forEach((dropdown) => {
      const btn = dropdown.querySelector('.nav-dropbtn');
      if (!btn) return;
      btn.addEventListener('click', () => {
        const isOpen = dropdown.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', String(isOpen));
      });
    });

    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', closeNav);
    });

    document.addEventListener('click', (e) => {
      if (!this.contains(e.target)) closeNav();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeNav();
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 900) closeNav();
    });
  }

  /* ── Theme toggle button ─────────────────────────────────────────────── */
  wireThemeToggle() {
    const themeToggle = this.querySelector('#theme-toggle');
    if (!themeToggle) return;
    themeToggle.addEventListener('click', () => {
      const theme = document.documentElement.getAttribute('data-theme');
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      let next;
      if (!theme) next = systemPrefersDark ? 'light' : 'dark';
      else if (theme === 'light') next = 'dark';
      else next = 'light';
      applyTheme(next);
    });
  }

  /* ── Clerk auth wiring (login / sign up / sign out / account menu) ──── */
  async wireAuth() {
    if (!window.Clerk) {
      await new Promise((resolve) => {
        const t = setInterval(() => {
          if (window.Clerk) { clearInterval(t); resolve(); }
        }, 50);
      });
    }

    try {
      await window.Clerk.load();
    } catch (e) {
      console.error('[Clerk] load() failed:', e);
    }

    const authWrap = this.querySelector('.auth-buttons');
    const btnLogin = this.querySelector('#btn-login');
    const btnSignup = this.querySelector('#btn-signup');
    const btnSignout = this.querySelector('#btn-signout');

    // Signed-in visitors get a Sign Out button and nothing more — no Clerk
    // account menu (managing the account isn't something users should do here).
    const render = () => {
      const signedIn = !!(window.Clerk?.user && window.Clerk?.session);
      if (authWrap) authWrap.style.display = signedIn ? 'none' : '';
      if (btnSignout) btnSignout.style.display = signedIn ? '' : 'none';
      document.body.classList.toggle('authed', signedIn);
    };

    if (window.Clerk?.addListener) window.Clerk.addListener(render);
    render();

    const goSignIn = () => {
      // Send the visitor to the dedicated login page, stashing where they were
      // so it can return them there after a successful sign-in. Uses
      // sessionStorage rather than a query param because Vercel's clean-URL
      // redirect (/login.html -> /login) drops the query string.
      try {
        sessionStorage.setItem('fd_post_login_redirect', window.location.pathname + window.location.search);
      } catch (_) {}
      window.location.assign('/login.html');
    };
    const goSignUp = () => {
      if (window.Clerk?.openSignUp) {
        window.Clerk.openSignUp({ afterSignUpUrl: window.location.href, appearance: clerkAppearance() });
      } else if (window.Clerk?.redirectToSignUp) {
        window.Clerk.redirectToSignUp({ returnBackUrl: window.location.href });
      } else {
        console.error('[Clerk] No sign-up methods available.');
      }
    };

    const goSignOut = async () => {
      try {
        await window.Clerk?.signOut?.();
      } catch (e) {
        console.error('[Clerk] signOut failed:', e);
      }
      // Hard reload to a clean, logged-out state regardless of whether the
      // in-page Clerk listener updated the UI.
      window.location.assign('/');
    };

    if (btnLogin) btnLogin.onclick = goSignIn;
    if (btnSignup) btnSignup.onclick = goSignUp;
    if (btnSignout) btnSignout.onclick = goSignOut;

    // Dev helper: test the protected API
    window.__pingProtected = async function () {
      try {
        const token = await window.Clerk?.session?.getToken({ skipCache: true });
        const res = await fetch('/api/protected', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const text = await res.text();
        try { return { status: res.status, body: JSON.parse(text) }; }
        catch { return { status: res.status, body: text }; }
      } catch (e) {
        return { error: true, message: e?.message || String(e) };
      }
    };
  }
}

customElements.define('site-header', SiteHeader);
