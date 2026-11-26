import { NextResponse, type NextRequest } from 'next/server';

// Smart Mail runs on two servers (22/11): the first one (next.config.mjs relays /tool to it) keeps the
// accounts already connected, the second one (Paris) takes every new account. A mailbox session never
// moves between servers. The device's `sm_srv` cookie, set by the tool itself, says which server holds
// its account: only `paris` is handled here, everything else follows the default relay.
const PARIS = process.env.TOOL_URL_PARIS ?? 'https://2-25-7-244.sslip.io';

// Countries we show the French site to by default. Students in France often receive the English link
// (/school, $35) from an ambassador mail and never find the French page (/ecole, 30 €), so they miss
// that the purchase is non-refundable. From a French IP we send /school to /ecole, unless they ask for
// English (a `?en`/`?lang=en…` link, remembered with the `site_lang` cookie).
const FRENCH_GEO = new Set(['FR', 'MC']);

export function middleware(req: NextRequest) {
  const { pathname, search, searchParams } = req.nextUrl;

  // Smart Mail relay (/tool), unchanged.
  if (pathname === '/tool' || pathname.startsWith('/tool/')) {
    if (req.cookies.get('sm_srv')?.value !== 'paris') return NextResponse.next();
    const path = pathname.replace(/^\/tool/, '') || '/';
    return NextResponse.rewrite(new URL(path + search, PARIS));
  }

  // Explicit English choice: remember it so we never bounce this visitor again.
  if (searchParams.has('en') || (searchParams.get('lang') ?? '').startsWith('en')) {
    const res = NextResponse.next();
    res.cookies.set('site_lang', 'en', { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
    return res;
  }
  if (req.cookies.get('site_lang')?.value === 'en') return NextResponse.next();

  // French IP on the English sales page → the French one.
  const country = (req.headers.get('x-vercel-ip-country') ?? '').toUpperCase();
  if (FRENCH_GEO.has(country)) {
    const url = req.nextUrl.clone();
    url.pathname = '/ecole';
    url.search = '';
    return NextResponse.redirect(url, 307);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/school', '/tool', '/tool/:path*'] };
