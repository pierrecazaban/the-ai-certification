import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { inviterByCode, toolCodeOf } from '@/lib/team';

export const dynamic = 'force-dynamic';

// Les deux serveurs Smart Mail (voir middleware.ts) : la porte est la même sur les deux (même secret).
const TOOL = process.env.TOOL_URL || 'https://158-69-232-131.sslip.io';
const TOOL_PARIS = process.env.TOOL_URL_PARIS ?? 'https://2-25-7-244.sslip.io';

// Vers Smart Mail (/tool) sans taper de code (23/11). La page entre elle-même un code personnel à la porte de /tool
// (même domaine, POST /tool/porte), puis ouvre l'app :
//   ?invite=<code d'invitation> → le code de celui qui invite : la personne se place sous lui ;
//   ?espace=1 (depuis /login, « Continuer avec mon école ») → le code de l'admin, puis retour vers l'espace ambassadeur.
export async function GET(req: NextRequest) {
  const invite = req.nextUrl.searchParams.get('invite') ?? '';
  let code = '';
  if (invite) {
    const inviter = await inviterByCode(invite);
    if (inviter) code = await toolCodeOf(String(inviter.user_id));
  } else {
    const [admin] = await sql(`select id from users where role = 'admin' order by created_at limit 1`);
    if (admin) code = await toolCodeOf(String(admin.id));
  }
  // Sans barre finale : « /tool/ » coûtait une redirection de plus.
  const next = invite ? '/tool' : '/tool?espace=1';
  // (23/11) Le code est entré à la porte d'ici même, côté serveur, et ses cookies partent avec la redirection :
  // plus de page d'attente ni d'aller-retour du navigateur. Si l'outil ne répond pas, l'ancienne page prend le relais.
  if (code) {
    try {
      // Une invitation = un nouvel ambassadeur : sans serveur déjà noté sur l'appareil, il va droit sur celui des
      // nouveaux comptes (Paris), sans passer par le premier. (Un appareil déjà connecté ailleurs y retourne seul.)
      const known = req.cookies.get('sm_srv')?.value;
      const server = known === 'paris' || known === 'ovh' ? known : invite ? 'paris' : 'ovh';
      const base = server === 'paris' ? TOOL_PARIS : TOOL;
      const r = await fetch(`${base}/porte`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
        cache: 'no-store',
        signal: AbortSignal.timeout(4000),
      });
      const cookies = r.headers.getSetCookie();
      if (r.ok && cookies.length) {
        const res = NextResponse.redirect(new URL(next, req.nextUrl.origin), 302);
        res.headers.set('Cache-Control', 'no-store');
        for (const c of cookies) res.headers.append('Set-Cookie', c);
        if (!known && server === 'paris') res.headers.append('Set-Cookie', `sm_srv=paris; Path=/; Max-Age=${400 * 86400}; SameSite=Lax; Secure`);
        return res;
      }
    } catch {}
  }
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Smart Mail</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;background:#F6F7FB;color:#17274C}</style></head>
<body><p>Ouverture de Smart Mail…</p>
<script>
(async function () {
  try { await fetch("/tool/porte", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: ${JSON.stringify(code)} }) }); } catch (e) {}
  location.replace(${JSON.stringify(next)});
})();
</script></body></html>`;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
