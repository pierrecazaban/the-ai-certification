import { NextRequest, NextResponse } from 'next/server';
import { scriptAuthorised } from '@/lib/callsApi';
import { addProspects, budget, log, markFollowedUp, prospects, recentlySearched, recordSearch, saveConfig, schoolCounts, firstAlert, setContact, setStatus } from '@/lib/outreach';
import { sendOutreachAlert } from '@/lib/email';
import { draftReply } from '@/lib/outreachReply';
import { siteUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

// API of the LinkedIn script on the admin's Mac (Authorization: Bearer CALLS_API_KEY).
//   GET  /api/outreach/plan                 → config + what is left to do today
//   GET  /api/outreach/queue?status=found   → prospects in a status
//   POST /api/outreach/prospects {prospects} → new prospects (each gets its /call link)
//   POST /api/outreach/status {linkedin, status, error?}
//   POST /api/outreach/log {kind, text}
type Ctx = { params: Promise<{ action: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  if (!(await scriptAuthorised(req))) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const { action } = await params;
  if (action === 'plan') {
    const b = await budget();
    return NextResponse.json({ ...b, schoolCounts: await schoolCounts(), recentlySearched: await recentlySearched(b.config.searchCooldownDays) });
  }
  if (action === 'queue') {
    const status = req.nextUrl.searchParams.get('status') ?? 'found';
    const limit = Math.min(200, Number(req.nextUrl.searchParams.get('limit') ?? 50) || 50);
    return NextResponse.json({ prospects: await prospects(status, limit) });
  }
  return NextResponse.json({ error: 'unknown' }, { status: 404 });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  if (!(await scriptAuthorised(req))) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const { action } = await params;
  const body = await req.json().catch(() => ({}));
  if (action === 'prospects') return NextResponse.json({ added: await addProspects(Array.isArray(body?.prospects) ? body.prospects : []) });
  if (action === 'status' && typeof body?.linkedin === 'string' && typeof body?.status === 'string') {
    await setStatus(body.linkedin, body.status, String(body.error ?? ''));
    return NextResponse.json({ ok: true });
  }
  // A student answered the LinkedIn message: draft Pierre's reply (or hand it to him).
  if (action === 'reply' && Array.isArray(body?.history)) {
    const history = body.history
      .filter((t: unknown) => t && typeof t === 'object' && typeof (t as { text?: unknown }).text === 'string')
      .map((t: { from?: string; text: string }) => ({ from: t.from === 'pierre' ? 'pierre' as const : 'student' as const, text: t.text }));
    const result = await draftReply({ firstName: String(body.firstName ?? ''), school: String(body.school ?? ''), link: String(body.link ?? `${siteUrl()}/call`), base: siteUrl(), history });
    if (result.declined && typeof body.linkedin === 'string') await setStatus(body.linkedin, 'declined');
    const who = `${body.name ?? ''} (${body.school ?? ''})`;
    const last = history[history.length - 1]?.text ?? '';
    if (result.contact && !result.declined && typeof body.linkedin === 'string') {
      await setContact(body.linkedin, result.contact);
      await log('contact', `${who} : ${result.contact}`);
      await sendOutreachAlert({ subject: `Prospection : ${body.name ?? 'un étudiant'} t’a donné son contact`, linkedin: body.linkedin,
        lines: [`${who} préfère continuer ici : ${result.contact}`, `Son message : « ${last.slice(0, 600)} »`, result.reply ? `Réponse envoyée sur LinkedIn : « ${result.reply} »` : 'Aucune réponse envoyée sur LinkedIn.', 'À toi de lui écrire sur ce canal.'] }).catch(() => {});
    } else if (result.needsHuman) {
      await sendOutreachAlert({ subject: `Prospection : ${body.name ?? 'un étudiant'} attend ta réponse sur LinkedIn`, linkedin: typeof body.linkedin === 'string' ? body.linkedin : undefined,
        lines: [`${who} a écrit : « ${last.slice(0, 600)} »`, `Pourquoi c’est pour toi : ${result.reason}`, 'L’agent n’a rien répondu.'] }).catch(() => {});
    }
    await log(result.declined ? 'refus' : result.needsHuman ? 'à traiter' : 'réponse auto', `${who} : ${result.reason}`);
    // What was actually said, kept for Pierre to check (the script sends `reply` as it is).
    await log('échange', `${who} : « ${last.slice(0, 200)} » → ${result.reply ? `« ${result.reply.slice(0, 230)} »` : 'pas de réponse envoyée'}`);
    return NextResponse.json(result);
  }
  // The two texts the script sends (first message, follow-up); everything else of the plan stays in /admin.
  if (action === 'texts' && (typeof body?.message === 'string' || typeof body?.followUp === 'string' || typeof body?.inviteNote === 'string')) {
    await saveConfig({ ...(typeof body.message === 'string' ? { message: body.message.trim().slice(0, 1500) } : {}), ...(typeof body.followUp === 'string' ? { followUp: body.followUp.trim().slice(0, 1000) } : {}), ...(typeof body.inviteNote === 'string' ? { inviteNote: body.inviteNote.trim().slice(0, 280) } : {}) });
    await log('info', 'Textes de la prospection modifiés (note, premier message ou relance)');
    return NextResponse.json({ ok: true });
  }
  // A contact noted outside the automatic replies (Pierre got it himself in the conversation).
  if (action === 'contact' && typeof body?.linkedin === 'string' && typeof body?.contact === 'string' && body.contact.trim()) {
    await setContact(body.linkedin, body.contact);
    await log('contact', `${body.name ?? body.linkedin} : ${body.contact}`);
    return NextResponse.json({ ok: true });
  }
  if (action === 'followup' && typeof body?.linkedin === 'string') {
    await markFollowedUp(body.linkedin);
    return NextResponse.json({ ok: true });
  }
  if (action === 'searched' && typeof body?.school === 'string') {
    await recordSearch(body.school, Number(body.found) || 0);
    return NextResponse.json({ ok: true });
  }
  if (action === 'pause' && typeof body?.paused === 'boolean') {
    await saveConfig({ paused: body.paused });
    await log('info', body.paused ? 'Prospection mise en pause' : 'Prospection relancée');
    return NextResponse.json({ ok: true, paused: body.paused });
  }
  if (action === 'log' && typeof body?.text === 'string') {
    await log(String(body.kind ?? 'info'), body.text);
    // The script hands a conversation to Pierre (he is already talking to the student, or 3 automatic answers were sent).
    if (body.kind === 'à traiter') await sendOutreachAlert({ subject: 'Prospection : une réponse LinkedIn t’attend', lines: [body.text, 'L’agent n’a rien répondu : à toi de jouer sur LinkedIn.'] }).catch(() => {});
    // LinkedIn signed out or restricted: the script cannot do anything until Pierre signs in again. One e-mail a day.
    if (body.kind === 'erreur' && /déconnecté|restreint/i.test(body.text) && (await firstAlert('alerte-session', 24))) {
      await sendOutreachAlert({ subject: 'Prospection : LinkedIn est déconnecté', lines: [body.text, 'L’agent est à l’arrêt : plus d’invitations, de messages ni de réponses tant que la session n’est pas rétablie sur le serveur.'] }).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'bad request' }, { status: 400 });
}
