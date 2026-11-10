import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  async redirects() {
    // The previous static site used *.html URLs (still present in sent e-mails and bookmarks).
    return [
      { source: '/index.html', destination: '/', permanent: true },
      { source: '/:page(success).html', destination: '/order-success', permanent: true },
      { source: '/:page(order|order-success|cart|checkout|videos|faq|contact|distributors|distributor-application|login|privacy|terms).html', destination: '/:page', permanent: true },
    ];
  },
  async rewrites() {
    // admin.forcedowels.com serves the admin panel at its root (/, /sales, /login, ...).
    const adminHost = [{ type: 'host' as const, value: 'admin.forcedowels.com' }];
    return {
      beforeFiles: [
        { source: '/', has: adminHost, destination: '/admin' },
        { source: '/:path((?!admin|api|_next|images|icon|apple-icon).*)', has: adminHost, destination: '/admin/:path' },
      ],
    };
  },
};

export default nextConfig;