import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { relancesKeyOk } from '@/lib/relances';
import { retryShortDeletions } from '@/lib/team';

// Ambassadeurs « court terme » (18/11), appelé seulement par le serveur Smart Mail (son IP + la clé partagée des relances).
// GET : empreintes (sha256) des e-mails des acheteurs, pour que Smart Mail compte les ventes de chaque ambassadeur
//       sans qu'aucune adresse ne quitte le site.
// POST : la liste des ambassadeurs Smart Mail avec leurs totaux (mails reçus, acheteurs).
export const dynamic = 'force-dynamic';

const ipOf = (req: NextRequest) => req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

export async function GET(req: NextRequest) {
  if (!(await relancesKeyOk(req.headers.get('x-relances-key'), ipOf(req)))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const rows = await sql(`select distinct lower(email) as e from registrations where status = 'paid' and payment_id like 'cs\\_live\\_%'`);
  // Tracker (18/11) : toutes les personnes qui ont commencé une inscription, pour savoir lesquelles avaient reçu le mail.
  const all = await sql(`select distinct lower(email) as e from registrations`);
  const h = (e: unknown) => createHash('sha256').update(String(e)).digest('hex');
  return NextResponse.json({ buyers: rows.map((r) => h(r.e)), registrations: all.map((r) => h(r.e)) }, { headers: { 'Cache-Control': 'no-store' } });
}

type In = { id: number; first_name: string; domain: string; sent: number; buyers: number; active: boolean; recruiter_code?: string };

export async function POST(req: NextRequest) {
  if (!(await relancesKeyOk(req.headers.get('x-relances-key'), ipOf(req)))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = (await req.json().catch(() => null)) as {
    ambassadors?: In[];
    received?: { h: string; at: number; sm: number }[];
    reminders?: { reg: string; step: number; at: number; ok: boolean }[];
  } | null;
  const list = Array.isArray(body?.ambassadors) ? body!.ambassadors.slice(0, 500) : null;
  if (!list) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  // Supprimés depuis l'espace ambassadeur (19/11) : jamais remis, et leur suppression Smart Mail est retentée.
  const removed = new Set((await sql('select smartmail_id from short_removed')).map((r) => Number(r.smartmail_id)));
  await retryShortDeletions().catch(() => {});
  for (const a of list) {
    const id = Math.trunc(Number(a.id));
    if (!Number.isFinite(id) || id <= 0 || removed.has(id)) continue;
    await sql(
      `insert into short_ambassadors (smartmail_id, first_name, domain, sent, buyers, active, recruiter_code, updated_at) values ($1, $2, $3, $4, $5, $6, $7, now())
       on conflict (smartmail_id) do update set first_name = excluded.first_name, domain = excluded.domain, sent = excluded.sent,
         buyers = excluded.buyers, active = excluded.active, recruiter_code = excluded.recruiter_code, updated_at = now()`,
      [id, String(a.first_name ?? '').slice(0, 60), String(a.domain ?? '').toLowerCase().slice(0, 120), Math.max(0, Math.trunc(Number(a.sent) || 0)),
       Math.max(0, Math.trunc(Number(a.buyers) || 0)), a.active !== false,
       String(a.recruiter_code ?? '').trim().toUpperCase().slice(0, 12)],
    );
  }
  // Tracker : mail reçu (empreinte seulement) et relances, envoyés en une fois.
  const rec = (body?.received ?? []).filter((r) => /^[0-9a-f]{64}$/.test(String(r.h)) && Number(r.at) > 0).slice(0, 20000);
  if (rec.length) {
    await sql(
      `insert into mail_received (email_hash, received_at, smartmail_id)
       select h, to_timestamp(at), sm from unnest($1::text[], $2::float8[], $3::int[]) as t(h, at, sm)
       on conflict (email_hash) do update set received_at = excluded.received_at, smartmail_id = excluded.smartmail_id`,
      [rec.map((r) => r.h), rec.map((r) => Number(r.at)), rec.map((r) => Math.trunc(Number(r.sm) || 0))],
    );
  }
  const rem = (body?.reminders ?? []).filter((r) => /^[0-9a-f-]{36}$/.test(String(r.reg)) && Number(r.at) > 0).slice(0, 20000);
  if (rem.length) {
    await sql(
      `insert into reminders (registration_id, step, sent_at, ok)
       select reg, step, to_timestamp(at), ok from unnest($1::text[], $2::int[], $3::float8[], $4::bool[]) as t(reg, step, at, ok)
       on conflict (registration_id, step) do update set sent_at = excluded.sent_at, ok = excluded.ok`,
      [rem.map((r) => r.reg), rem.map((r) => Math.trunc(Number(r.step))), rem.map((r) => Number(r.at)), rem.map((r) => Boolean(r.ok))],
    );
  }
  const ids = list.map((a) => Math.trunc(Number(a.id))).filter((n) => Number.isFinite(n));
  if (ids.length) await sql(`update short_ambassadors set active = false where not (smartmail_id = any($1::int[]))`, [ids]);
  return NextResponse.json({ ok: true, count: ids.length });
}
