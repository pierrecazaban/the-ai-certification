/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets a local dev server build elsewhere (NEXT_DIST_DIR=.next-dev) while a deploy uses .next.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // No Next.js badge in the corner while testing locally.
  devIndicators: false,
  // PGlite (local database) ships WASM files and must not be bundled.
  serverExternalPackages: ['@electric-sql/pglite', 'nodemailer'],
  // Public pages are the same for every visitor: the host's CDN (Vercel or Netlify) keeps a copy for 5 minutes and serves it
  // instantly (refreshed in the background), so a click never waits for a cold server.
  // Student programme: /school (English) and /ecole (French). Former addresses and /école lead there.
  async redirects() {
    return [
      { source: '/studies', destination: '/school', permanent: true },
      { source: '/etudes', destination: '/ecole', permanent: true },
      { source: '/%C3%A9cole', destination: '/ecole', permanent: true },
    ];
  },
  // Smart Mail (the outreach tool) stays on its own server; the site only relays /tool to it.
  // Its live login screen uses a WebSocket, which the app opens straight to that server.
  async rewrites() {
    const tool = 'https://158-69-232-131.sslip.io';
    return {
      beforeFiles: [
        { source: '/tool', destination: `${tool}/` },
        { source: '/tool/:path*', destination: `${tool}/:path*` },
      ],
    };
  },
  async headers() {
    const cdn = [
      { key: 'Netlify-CDN-Cache-Control', value: 'public, durable, s-maxage=300, stale-while-revalidate=604800' },
      { key: 'Vercel-CDN-Cache-Control', value: 'public, s-maxage=300, stale-while-revalidate=604800' },
    ];
    // Only pages that ignore the query string: the CDN does not vary on ?lang=.
    const pages = ['/', '/school', '/canada', '/ecole', '/estudios', '/studi', '/studium', '/certifications/:slug'];
    return pages.map((source) => ({ source, headers: cdn }));
  },
};

export default nextConfig;
