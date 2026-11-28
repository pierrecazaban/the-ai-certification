import 'server-only';
import { headers } from 'next/headers';
import { after } from 'next/server';
import { sql } from './db';
import { STAFF_COOKIE } from './staffDevice';

// Arrivées sur la connexion, la confirmation et l'espace élève (28/11, demandé par un associé) : d'où vient chaque visite
// de /login, /login/password, /confirmation et /space, pour repérer un renvoi depuis un autre site. Rien qui identifie la personne : ni adresse IP ni cookie.
// La page d'origine est réduite à son adresse sans paramètres (code d'invitation masqué) et les valeurs des paramètres
// sont masquées, sauf lang, sso, reset et expired. Lignes gardées 90 jours. Affiché dans /admin › Réglages.

export type ArrivalKind = 'stripe' | 'reetma' | 'externe' | 'connu' | 'messagerie' | 'interne' | 'sans-provenance' | 'directe';

// ref = numéro d'inscription de la page de confirmation (le jeton t, lui, reste masqué).
const KEEP = new Set(['lang', 'sso', 'reset', 'expired', 'ref', 'canceled']);
const SITE = /^(www\.)?the-ai-certification\.com$|^the-ai-certification(-[a-z0-9]+)*\.vercel\.app$/;
const KNOWN =
  /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|yahoo\.[a-z.]+|ecosia\.org|qwant\.com|linkedin\.com|lnkd\.in|instagram\.com|facebook\.com|t\.co|x\.com|whatsapp\.com|snapchat\.com|tiktok\.com|youtube\.com|live\.com|office\.com|office365\.com|outlook\.com|microsoft\.com|microsoftonline\.com|gmail\.com|icloud\.com|sslip\.io|chatgpt\.com|claude\.ai)$/i;
const MAIL = /^(webmail|mail|outlook|courrier|messagerie|owa|zimbra|sogo|roundcube)\d*\./i;

/** Where a visit comes from, by the host of the page it came from (empty: no page given by the browser). */
export function arrivalKind(host: string, fetchSite: string): ArrivalKind {
  if (!host) return fetchSite === 'cross-site' ? 'sans-provenance' : 'directe';
  if (host === 'stripe.com' || host.endsWith('.stripe.com')) return 'stripe';
  if (host.includes('reetma')) return 'reetma';
  if (SITE.test(host)) return 'interne';
  if (KNOWN.test(host)) return 'connu';
  if (MAIL.test(host)) return 'messagerie';
  return 'externe';
}

type Search = Record<string, string | string[] | undefined>;

/** Called by /login, /login/password and /space: notes the visit once the page is sent. Never blocks or breaks the page. */
export async function noteLoginArrival(path: string, search: Search, opts: { staff?: boolean } = {}) {
  try {
    if (opts.staff) return;
    const h = await headers();
    if (new RegExp(`(^|;\\s*)${STAFF_COOKIE}=1(;|$)`).test(h.get('cookie') ?? '')) return;
    const purpose = `${h.get('purpose') ?? ''} ${h.get('sec-purpose') ?? ''}`;
    if (h.has('next-router-prefetch') || purpose.includes('prefetch')) return;
    const query = Object.keys(search)
      .map((k) => (KEEP.has(k) ? `${k}=${String(search[k] ?? '').slice(0, 20)}` : `${k}=…`))
      .join('&');
    let ref = '';
    let host = '';
    let kind: ArrivalKind;
    const raw = h.get('referer') ?? '';
    const fetchSite = h.get('sec-fetch-site') ?? '';
    if (raw) {
      try {
        const u = new URL(raw);
        host = u.hostname.toLowerCase();
        ref = u.origin + u.pathname.replace(/^\/invite\/.+/, '/invite/…');
        kind = arrivalKind(host, fetchSite);
      } catch {
        ref = 'illisible';
        kind = 'externe';
      }
    } else {
      kind = arrivalKind('', fetchSite);
    }
    const ua = h.get('user-agent') ?? '';
    const row = [
      path.slice(0, 60),
      query.slice(0, 200),
      ref.slice(0, 200),
      host.slice(0, 120),
      kind,
      fetchSite.slice(0, 20),
      (h.get('x-vercel-ip-country') ?? '').toUpperCase().slice(0, 4),
      /mobile|iphone|android/i.test(ua) ? 'mobile' : 'ordinateur',
      (ua.match(/(Edg|OPR|Chrome|Firefox|Safari)\//) ?? [])[1] ?? '',
      /bot|crawl|spider|preview|curl|python|headless|wget/i.test(ua),
    ];
    after(async () => {
      try {
        await sql(
          `insert into login_arrivals (path, query, ref, host, kind, fetch_site, country, device, browser, bot)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          row,
        );
        if (Math.random() < 0.02) await sql(`delete from login_arrivals where at < now() - interval '90 days'`);
      } catch (err) {
        console.error('[login-arrivals]', err);
      }
    });
  } catch {
    // never block the login page
  }
}

export type Arrival = {
  at: string; path: string; query: string; ref: string; host: string; kind: ArrivalKind;
  fetch_site: string; country: string; device: string; browser: string; bot: boolean;
};
export type OriginCount = { kind: ArrivalKind; host: string; conf: boolean; day: number; week: number; last: string };

/** The latest visits, newest first (robots included, marked). Hosts in .invalid are test visits, left out. */
export async function latestArrivals(limit = 150): Promise<Arrival[]> {
  return (await sql(
    `select at, path, query, ref, host, kind, fetch_site, country, device, browser, bot
     from login_arrivals where host not like '%.invalid' order by at desc limit $1`,
    [limit],
  )) as unknown as Arrival[];
}

/** Visits per origin over 24 h and 7 days, robots left out. */
export async function arrivalsByOrigin(): Promise<OriginCount[]> {
  return (await sql(
    `select kind, host, path like '/confirmation%' as conf,
            count(*) filter (where at > now() - interval '1 day')::int as day,
            count(*)::int as week,
            max(at) as last
     from login_arrivals where at > now() - interval '7 days' and not bot and host not like '%.invalid'
     group by kind, host, conf order by week desc, last desc limit 60`,
  )) as unknown as OriginCount[];
}

/** When the journal started (first line kept). */
export async function arrivalsSince(): Promise<string | null> {
  const [r] = await sql('select min(at) as since from login_arrivals');
  return (r?.since as string | null) ?? null;
}
