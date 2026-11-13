import { NextRequest, NextResponse } from 'next/server';
import { registerProspect } from '@/lib/calls';
import { scriptAuthorised } from '@/lib/callsApi';
import { siteUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

// The outreach script registers LinkedIn prospects and gets their personal /call link.
// Body: { prospects: [{ linkedin, first_name?, last_name?, school? }] } → { links: [{ linkedin, token, url }] }
export async function POST(req: NextRequest) {
  if (!(await scriptAuthorised(req))) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const list: unknown[] = Array.isArray(body?.prospects) ? body.prospects.slice(0, 500) : [];
  const links = [];
  for (const p of list) {
    if (!p || typeof p !== 'object' || typeof (p as { linkedin?: unknown }).linkedin !== 'string') continue;
    const q = p as { linkedin: string; first_name?: string; last_name?: string; school?: string };
    const token = await registerProspect({ linkedin: q.linkedin, first_name: String(q.first_name ?? ''), last_name: String(q.last_name ?? ''), school: String(q.school ?? '') });
    if (token) links.push({ linkedin: q.linkedin, token, url: `${siteUrl()}/call?t=${token}` });
  }
  return NextResponse.json({ links });
}
