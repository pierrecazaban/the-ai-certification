import { NextRequest, NextResponse } from 'next/server';
import { scriptAuthorised } from '@/lib/callsApi';
import { addProspects, budget, log, prospects, schoolCounts, setStatus } from '@/lib/outreach';
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
  if (action === 'plan') return NextResponse.json({ ...(await budget()), schoolCounts: await schoolCounts() });
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
    await log(result.needsHuman ? 'à traiter' : 'réponse auto', `${body.name ?? ''} (${body.school ?? ''}) : ${result.reason}`);
    return NextResponse.json(result);
  }
  if (action === 'log' && typeof body?.text === 'string') {
    await log(String(body.kind ?? 'info'), body.text);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'bad request' }, { status: 400 });
}
