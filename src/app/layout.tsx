import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-inter',
  display: 'swap',
});

const description =
  'Force Dowels™: Experience the next generation of cabinet assembly—faster, stronger, and with a flawless finish. Patent Pending.';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL?.trim() || 'https://forcedowels.com'),
  title: {
    default: 'Force Dowels™ — Revolutionary Cabinet Assembly',
    template: '%s — Force Dowels™',
  },
  description,
  openGraph: {
    title: 'Force Dowels™ — Revolutionary Cabinet Assembly',
    description,
    type: 'website',
    images: ['/images/dowel-group-photo.jpg'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

/**
 * Applies the saved theme before first paint so there is no light/dark flash.
 * With no saved choice the OS preference (prefers-color-scheme) applies via CSS.
 */
const themeInitScript = `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
