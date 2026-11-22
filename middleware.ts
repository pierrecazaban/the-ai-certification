import { NextResponse, type NextRequest } from 'next/server';

// Smart Mail runs on two servers (22/11): the first one (next.config.mjs relays /tool to it) keeps the
// accounts already connected, the second one (Paris) takes every new account. A mailbox session never
// moves between servers. The device's `sm_srv` cookie, set by the tool itself, says which server holds
// its account: only `paris` is handled here, everything else follows the default relay.
const PARIS = process.env.TOOL_URL_PARIS ?? 'https://2-25-7-244.sslip.io';

export function middleware(req: NextRequest) {
  if (req.cookies.get('sm_srv')?.value !== 'paris') return NextResponse.next();
  const path = req.nextUrl.pathname.replace(/^\/tool/, '') || '/';
  return NextResponse.rewrite(new URL(path + req.nextUrl.search, PARIS));
}

export const config = { matcher: ['/tool', '/tool/:path*'] };
