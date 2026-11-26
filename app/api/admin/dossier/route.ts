import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { sql } from '@/lib/db';
import { setting } from '@/lib/settings';

// Dossier d'une vente pour répondre à un litige (26/11) : tout ce que le site sait d'une inscription, horodaté. Réservé à
// l'admin (sinon « introuvable »). Lecture seule. Jamais de mot de passe ni de jeton : seulement les dates. GET ?ref=TAC-…
export const dynamic = 'force-dynamic';

const SECRET = ['password_hash', 'token_hash', 'client_token'];
const clean = (rows: Record<string, unknown>[]) => rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !SECRET.includes(k))));

export async function GET(req: NextRequest) {
  const admin = await currentUser();
  if (admin?.role !== 'admin') return NextResponse.json({ error: 'not found' }, { status: 404 });
  const ref = String(req.nextUrl.searchParams.get('ref') ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,40}$/.test(ref)) return NextResponse.json({ error: 'ref' }, { status: 400 });

  const [r] = await sql(
    `select r.*, u.name as school, i.name as intake, i.starts_at as intake_starts_at
       from registrations r left join universities u on u.id = r.university_id left join intakes i on i.id = r.intake_id
      where upper(r.reference) = $1`,
    [ref],
  );
  if (!r) return NextResponse.json({ error: 'unknown' }, { status: 404 });
  const email = String(r.email).trim().toLowerCase();
  const uid = r.user_id ? String(r.user_id) : null;
  const out: Record<string, unknown> = { generated_at: new Date().toISOString(), registration: clean([r])[0] };
  // Chaque partie à part : une table absente ou une colonne renommée ne fait pas tomber tout le dossier.
  const part = async (key: string, run: () => Promise<Record<string, unknown>[]>) => {
    try {
      out[key] = clean(await run());
    } catch (err) {
      out[key] = { error: String((err as Error)?.message ?? err).slice(0, 200) };
    }
  };
  await part('user', () => (uid ? sql(`select *, password_hash is not null as has_password from users where id = $1`, [uid]) : Promise.resolve([])));
  await part('sessions', () => (uid ? sql('select created_at, expires_at from sessions where user_id = $1 order by created_at', [uid]) : Promise.resolve([])));
  await part('login_tokens', () => (uid ? sql('select created_at, expires_at, used_at from login_tokens where user_id = $1 order by created_at', [uid]) : Promise.resolve([])));
  await part('lesson_progress', () => (uid ? sql('select * from lesson_progress where user_id = $1', [uid]) : Promise.resolve([])));
  await part('quiz_attempts', () => (uid ? sql('select * from quiz_attempts where user_id = $1', [uid]) : Promise.resolve([])));
  await part('exam_attempts', () => (uid ? sql('select * from exam_attempts where user_id = $1', [uid]) : Promise.resolve([])));
  // Le travail rendu n'est pas recopié : seulement l'exercice, la date et la longueur.
  await part('exercise_submissions', async () =>
    uid ? (await sql('select * from exercise_submissions where user_id = $1', [uid])).map(({ content, ...x }) => ({ ...x, content_length: String(content ?? '').length })) : []);
  await part('certificates', () => (uid ? sql('select * from certificates where user_id = $1', [uid]) : Promise.resolve([])));
  await part('emails', () => sql('select * from emails where registration_id = $1 or lower(to_email) = $2 order by created_at', [r.id, email]));
  // Ce que Resend (le service d'envoi) sait de chaque e-mail : dernier état connu (envoyé, remis, ouvert, cliqué…).
  // La clé reste sur le serveur. Une clé limitée à l'envoi ne peut pas lire : l'erreur de Resend est alors rendue telle quelle.
  await part('resend', async () => {
    const key = await setting('RESEND_API_KEY');
    const ids = (Array.isArray(out.emails) ? (out.emails as Record<string, unknown>[]) : [])
      .map((e) => String(e.provider_id ?? '')).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
    if (!key || !ids.length) return [];
    return Promise.all(ids.map(async (id) => {
      const res = await fetch(`https://api.resend.com/emails/${id}`, { headers: { authorization: `Bearer ${key}` }, cache: 'no-store' });
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { id, http: res.status, last_event: j.last_event ?? null, created_at: j.created_at ?? null, to: j.to ?? null,
        from: j.from ?? null, subject: j.subject ?? null, error: res.ok ? null : (j.message ?? j.name ?? null) };
    }));
  });
  await part('other_registrations', () =>
    sql('select reference, status, created_at, paid_at, amount_cents, currency, payment_id from registrations where lower(email) = $1 and id <> $2 order by created_at', [email, r.id]));
  await part('tickets', () => sql('select * from tickets where lower(email) = $1 order by created_at', [email]));
  await part('ticket_messages', () =>
    sql('select m.* from ticket_messages m join tickets t on t.id = m.ticket_id where lower(t.email) = $1 order by m.created_at', [email]));
  await part('payment_reminders', () => sql('select * from kai_reminders where lower(email) = $1 or registration_id = $2', [email, String(r.id)]));
  await part('school_reminders', () => sql('select * from reminders where registration_id = $1', [String(r.id)]));
  await part('finish_nudges', () => sql('select * from finish_nudges where registration_id = $1', [r.id]));
  // Le mail d'information reçu dans sa boîte d'école (suivi Smart Mail, empreinte de l'adresse seulement).
  await part('mail_received', () => sql('select received_at, smartmail_id from mail_received where email_hash = $1', [createHash('sha256').update(email).digest('hex')]));
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
}
