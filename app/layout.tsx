import type { Metadata } from 'next';
import '@fontsource-variable/manrope/wght.css';
import '@fontsource/caveat/latin-600.css'; // handwritten notes in the margins
import './globals.css';
import { Suspense } from 'react';
import LiveBeacon from '@/components/LiveBeacon';
import NavProgress from '@/components/NavProgress';
import { siteUrl } from '@/lib/site';

export const metadata: Metadata = {
  title: 'The AI Certification | Learn to master AI, get certified in 2 hours',
  description:
    'The AI certification for students: build an agent that does a real job for you and earn a certificate employers can check. 3 modules, about 2 hours, no code.',
  icons: { icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }, { url: '/icon-192.png', sizes: '192x192', type: 'image/png' }], apple: '/apple-touch-icon.png' },
  appleWebApp: { title: 'The AI Certification', capable: true, statusBarStyle: 'default' },
  // Static file (not app/manifest.ts) so a page can declare its own, like the admin's.
  manifest: '/manifest.webmanifest',
  // Link previews (Snapchat, WhatsApp, LinkedIn…). Pages keep their own <title> and description.
  metadataBase: new URL(siteUrl()),
  openGraph: { siteName: 'The AI Certification', type: 'website', images: [{ url: '/og.png', width: 1200, height: 630, alt: 'The AI Certification' }] },
  twitter: { card: 'summary_large_image', images: ['/og.png'] },
};


export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* No full-screen logo between two pages any more (23/11): the page stays, a thin bar shows the click was taken. */}
        <Suspense fallback={null}><NavProgress /></Suspense>
        {children}
        <LiveBeacon />
        {/* The assistant only appears once an Anthropic API key is configured. */}
        {/* Assistant (bulle de chat) retiré du site le 14/11 : components/ChatWidget.tsx reste prêt à être remis. */}
      </body>
    </html>
  );
}
