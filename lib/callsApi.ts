import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { NextRequest } from 'next/server';
import { setting } from './settings';

/** The LinkedIn script on the admin's Mac signs its calls with `Authorization: Bearer <CALLS_API_KEY>`. */
export async function scriptAuthorised(req: NextRequest) {
  const key = await setting('CALLS_API_KEY');
  const given = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!key || key.length < 24 || given.length !== key.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(key));
}
