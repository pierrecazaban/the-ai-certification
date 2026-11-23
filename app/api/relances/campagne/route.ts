import { NextRequest, NextResponse } from 'next/server';
import { relancesKeyOk } from '@/lib/relances';
import { finishNudgeList, sendFinishNudges } from '@/lib/finishNudge';
import { payReminderList, runPayReminders } from '@/lib/payReminder';

// Reminders, triggered from the Smart Mail servers only (their IP + the shared key):
//   { campagne: 'payer', envoyer: true, source: 'ovh' | 'paris' }   the automatic payment reminders: a scheduled task on
//                                                                    each server calls this every 10 minutes
//   { campagne: 'finir', envoyer: true, max?: number }               « finissez votre formation », only when asked for
// Without `envoyer`, nothing leaves: only the figures. No address is ever returned.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  if (!(await relancesKeyOk(req.headers.get('x-relances-key'), ip))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const max = Math.max(1, Math.min(200, Math.trunc(Number(body?.max) || 200)));
  const key = (e: { why: string }) => e.why.replace(/TCK-\w+/, 'TCK');
  const why = (list: { why: string }[]) => list.reduce<Record<string, number>>((m, e) => ({ ...m, [key(e)]: (m[key(e)] ?? 0) + 1 }), {});

  if (body?.campagne === 'finir') {
    if (body?.envoyer === true) return NextResponse.json({ campagne: 'finir', ...(await sendFinishNudges(40_000, { max })) });
    const l = await finishNudgeList();
    return NextResponse.json({ campagne: 'finir', a_envoyer: l.targets.length, deja: l.already, plus_tard: l.later, ecartes: why(l.excluded) });
  }
  if (body?.campagne === 'payer') {
    const source = String(body?.source ?? '').replace(/[^a-z0-9-]/gi, '').slice(0, 20) || 'main';
    if (body?.envoyer === true) return NextResponse.json({ campagne: 'payer', ...(await runPayReminders(source, { max })) });
    const l = await payReminderList();
    return NextResponse.json({
      campagne: 'payer', a_rappeler: l.targets.filter((t) => !t.control).length, temoin: l.targets.filter((t) => t.control).length,
      deja: l.already, moins_d_une_heure: l.waiting, ecartes: why(l.excluded),
    });
  }
  return NextResponse.json({ error: 'campagne' }, { status: 400 });
}
