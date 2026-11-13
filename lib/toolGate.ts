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
