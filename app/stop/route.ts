import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// « Ne plus recevoir de rappel » (23/11) : the link at the bottom of a reminder mail. The address of that registration
// goes on relance_stops and never gets a reminder again (lib/relanceGuard.ts). Same id + token as the /finish link.
export const dynamic = 'force-dynamic';

const TEXT = {
  fr: { title: 'C’est noté', body: 'Tu ne recevras plus de rappel de notre part.', back: 'Retour au site' },
  en: { title: 'Noted', body: 'You will not receive any more reminders from us.', back: 'Back to the site' },
};

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? '';
  const token = req.nextUrl.searchParams.get('t') ?? '';
  let fr = false;
  try {
    const [r] = /^[0-9a-f-]{36}$/.test(id) ? await sql('select lower(email) as email, locale from registrations where id::text = $1 and client_token = $2', [id, token]) : [];
    if (r) {
      fr = r.locale === 'fr';
      await sql('insert into relance_stops (email) values ($1) on conflict (email) do nothing', [r.email]);
    }
  } catch (error) {
    console.error('[stop]', error);
  }
  const t = fr ? TEXT.fr : TEXT.en;
  const html = `<!doctype html><html lang="${fr ? 'fr' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${t.title}</title></head>
<body style="margin:0;background:#EEF2F7;font-family:Arial,Helvetica,sans-serif;color:#17274C">
<div style="max-width:460px;margin:12vh auto;padding:0 16px"><div style="background:#fff;border-radius:20px;padding:32px;text-align:center;box-shadow:0 12px 32px rgba(23,39,76,.10)">
<p style="font-size:24px;font-weight:800;margin:0 0 10px">${t.title}</p><p style="font-size:16px;line-height:1.5;margin:0 0 22px">${t.body}</p>
<a href="/" style="display:inline-block;background:#17274C;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 20px;border-radius:999px">${t.back}</a></div></div></body></html>`;
  return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
