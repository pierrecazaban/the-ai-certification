import { NextResponse, type NextRequest } from 'next/server';
import { STAFF_COOKIE } from './lib/staffDevice';

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

// Journal des arrivées sur /login et /space (28/11) : d'où vient chaque visite de la connexion et de l'espace, pour repérer un renvoi
// depuis un autre site. Une ligne par requête dans les journaux Vercel, sans adresse IP. Les valeurs des paramètres
// sont masquées (sauf lang, sso, reset, expired) et la page d'où l'on vient est réduite à son adresse sans paramètres,
// le code d'invitation masqué : aucun jeton n'est jamais écrit. Ne bloque jamais la page (try/catch).
const LOGIN_KEEP = new Set(['lang', 'sso', 'reset', 'expired']);
function logLoginArrival(req: NextRequest) {
  try {
    const { pathname, searchParams } = req.nextUrl;
    const h = req.headers;
    const query = Array.from(searchParams.keys())
      .map((k) => (LOGIN_KEEP.has(k) ? `${k}=${(searchParams.get(k) ?? '').slice(0, 20)}` : `${k}=…`))
      .join('&');
    let ref = '';
    const raw = h.get('referer') ?? '';
    if (raw) {
      try {
        const u = new URL(raw);
        ref = u.origin + u.pathname.replace(/^\/invite\/.+/, '/invite/…').slice(0, 160);
      } catch {
        ref = 'illisible';
      }
    }
    const ua = h.get('user-agent') ?? '';
    const purpose = `${h.get('purpose') ?? ''} ${h.get('sec-purpose') ?? ''}`;
    console.log('[arrivee-login] ' + JSON.stringify({
      path: pathname,
      query,
      ref,
      site: h.get('sec-fetch-site') ?? '',
      mode: h.get('sec-fetch-mode') ?? '',
      rsc: h.get('rsc') === '1',
      prefetch: h.has('next-router-prefetch') || purpose.includes('prefetch'),
      pays: (h.get('x-vercel-ip-country') ?? '').toUpperCase(),
      appareil: /mobile|iphone|android/i.test(ua) ? 'mobile' : 'ordinateur',
      robot: /bot|crawl|spider|preview|curl|python|headless|wget|http/i.test(ua),
      nav: (ua.match(/(Edg|OPR|Chrome|Firefox|Safari)\//) ?? [])[1] ?? '',
    }));
  } catch {
    // never block the login page
  }
}

export function middleware(req: NextRequest) {
  const { pathname, search, searchParams } = req.nextUrl;

  // Page de connexion : on note d'où vient la visite, puis la page s'affiche comme avant.
  if (pathname === '/login' || pathname.startsWith('/login/') || pathname === '/space') {
    if (req.cookies.get(STAFF_COOKIE)?.value !== '1') logLoginArrival(req);
    return NextResponse.next();
  }

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

export const config = { matcher: ['/school', '/tool', '/tool/:path*', '/login', '/login/:path*', '/space'] };
