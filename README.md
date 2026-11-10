# Force Dowels

Next.js (App Router, Cache Components) rebuild of the static `forcedowels-preview` site: storefront, Stripe checkout,
live UPS/USPS/TQL shipping rates, order e-mails, distributor tools and an admin panel.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the values (see below)
npm run dev                  # http://localhost:3000
npm run build && npm start   # production build
npm run lint
```

`.env.local` was seeded from the original project's `.env`. Every variable the original used is listed in
`.env.example`; the only additions are the admin credentials described below.

## Project structure

```
src/
  app/
    layout.tsx            Root: fonts, theme-before-paint script, global CSS
    (site)/               Storefront shell (providers + global Navbar + Footer)
      page.tsx            Home          order/   Order configurator
      cart/ checkout/ order-success/    videos/ faq/ contact/
      distributors/ distributor-application/ login/
    admin/                Admin panel (own shell, no storefront chrome)
      login/  (panel)/    Orders · Customers · Distributors · Sales · Products
    api/                  Route handlers (checkout, shipping/rates, stripe-webhook, contact, …)
  components/
    ui/                   Design-system primitives: Button, Container/Section, Card, form controls
    layout/ home/ order/ cart/ checkout/ faq/ forms/ distributors/ admin/ providers/
  lib/                    Shared client+server code: products.ts (single pricing source), cart.ts, cn.ts, format.ts
  server/                 Server-only: db, Stripe, Resend, Clerk auth, carriers (UPS/USPS/TQL), e-mail templates
  proxy.ts                Redirects unauthenticated /admin/* page requests to the admin login
```

## Styling

Tailwind CSS v4, written inline as utility classes — there are no component CSS files. `src/app/globals.css` is the only
stylesheet and holds just three things:

1. **Light/dark variables** — every themed value is declared once, e.g. `--page: light-dark(#fdfeff, #0f1420)`.
   `color-scheme` picks the side: the OS setting by default, or `<html data-theme="light|dark">` once the visitor
   toggles the theme (saved in `localStorage`, applied before first paint).
2. **`@theme inline`** — exposes those variables as utilities: `bg-page`, `bg-card`, `text-fg`, `text-fg-muted`,
   `border-line`, `bg-brand`, `text-accent`, `rounded-card`, `shadow-card`, …
3. **A small base layer** — heading/paragraph defaults.

Because the colours are variables, components rarely need `dark:` — `bg-card text-fg` is already correct in both
themes. A `dark:` variant exists (same switch) for the few non-colour differences, e.g. the sun/moon icons.
Shared patterns live in `components/ui/` (`buttonStyles`, `Container`, `Section`, `Card`, `Field`/`Input`) and are
merged with `cn()` (clsx + tailwind-merge). Responsive rules use `max-[900px]:`-style variants matching the original
breakpoints (nav 900, grids 980, footer 1280/1120/768, phones 560).

The admin panel uses the same system rather than its own: its header reuses the navbar styles (`layout/navStyles.ts`) and
theme toggle, `AdminButton`/`AdminCard`/forms wrap the storefront `Button`/`Card`/`Field`, and every admin page is an
`AdminPage` (same `PageHeader` and gutters; `Container wide` only raises the max width for data tables). Tables use
`<Td label>` so they stack into labelled cards when their container is under 640px.

## Environment variables

| Area | Variables |
| --- | --- |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| Clerk (sign-in) | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` |
| Database (Neon) | `NEON_DATABASE_URL` → `DATABASE_URL_UNPOOLED` → `DATABASE_URL` (first one set is used) |
| E-mail (Resend) | `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_BCC`, `CONTACT_INBOX`, `EMAIL_LOGO_URL` |
| Shipping | `SHIP_FROM_*`, `UPS_*`, `USPS_*`, `TQL_*`, `NEXT_PUBLIC_TQL_SUBSCRIPTION_KEY` |
| Site | `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_LOGO_URL` |
| **Admin (new)** | `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` |

The original kept the admin username/password hard-coded in source and only "checked" login in the browser. Admin
credentials now come from the environment and sign-in sets a signed, expiring, `httpOnly` cookie that every
`/api/admin/*` route verifies. **Rotate `ADMIN_PASSWORD`** — the old value lived in the previous project's source code.

## Notes

- **Stripe webhook:** point Stripe at `/api/stripe-webhook` (event `checkout.session.completed`).
- **Old URLs:** `*.html` URLs redirect to their clean equivalents; `admin.forcedowels.com/…` is rewritten to `/admin/…`.
- **Pricing:** all prices come from `src/lib/products.ts`, used by the UI *and* the Stripe checkout route.
- **Cart:** stored in `localStorage` (`fd_cart`), as before.
