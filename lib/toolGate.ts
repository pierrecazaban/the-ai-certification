import { createHmac } from 'node:crypto';

/**
 * Today's access code to Smart Mail (the-ai-certification.com/tool): 6 digits, new every day at midnight (Paris).
 * Same calculation as the tool's server (smart-mail/serveur/app/porte.py), from the shared TOOL_GATE_SECRET.
 */
export function toolCode(day?: string): string | null {
  const secret = process.env.TOOL_GATE_SECRET;
  if (!secret) return null;
  const d = day ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  const mac = createHmac('sha256', secret).update(`code:${d}`).digest('hex');
  return (BigInt(`0x${mac.slice(0, 16)}`) % 1000000n).toString().padStart(6, '0');
}

/**
 * Today's code for the admin page, always: computed here when TOOL_GATE_SECRET is set, otherwise asked
 * server-to-server to the Smart Mail server, which checks with this site that the session is the admin's
 * (/api/admin/whoami). Nothing depends on the browser and no secret has to be copied to Vercel.
 */
export async function toolCodeForAdmin(): Promise<string | null> {
  const local = toolCode();
  if (local) return local;
  try {
    const { cookies } = await import('next/headers');
    const session = (await cookies()).get('cfx_session')?.value;
    if (!session) return null;
    const base = process.env.TOOL_URL || 'https://158-69-232-131.sslip.io';
    const r = await fetch(`${base}/v1/porte/code-admin`, { headers: { Cookie: `cfx_session=${session}` }, cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const d = (await r.json()) as { code?: string };
    return d.code || null;
  } catch {
    return null;
  }
}
