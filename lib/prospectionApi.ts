import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import {
  accountPlan, accountsForServer, addDiscoveredSchools, discoveryInput, isAccountId, markSeen, prospectIndex, reconcile,
  recordAnalysis, recordSchoolSearch, recordUrn, setAccountStatus,
} from './prospection';
import { addProspects, firstAlert, log, prospects, type ProspectIn } from './outreach';
import { sendOutreachAlert } from './email';

// Routes du script de prospection et du service de Paris (26/11), à côté de celles d'avant (app/api/outreach/[action]).
// Même clé (Authorization: Bearer CALLS_API_KEY), vérifiée par la route avant d'arriver ici. Rend null quand l'action
// n'est pas d'ici : la route garde alors son ancien traitement.
//   GET  plan?account=…                       → quotas, écoles attribuées, écoles couvertes, ce que le compte peut faire
//   GET  queue?status=…&account=…&uncovered=1  → prospects du compte (sans les écoles couvertes si uncovered=1)
//   GET  index?account=…                      → tous les prospects du compte, pour reconnaître chaque conversation
//   GET  accounts?server=paris                → les comptes des ambassadeurs que le serveur de Paris fait tourner
//   GET  discovery                            → noms déjà dans la base, noms vus ailleurs (pour la découverte du jour)
//   GET  reconcile                            → messages vus sans décision depuis 2 h (alerte une fois par jour)
//   POST prospects {prospects, account}       → nouveaux prospects du compte (avec school_id)
//   POST urn {account, linkedin, urn}         → identifiant interne LinkedIn du prospect (lien de la messagerie)
//   POST seen {account, items:[{linkedin,msg}]}
//   POST analysis {linkedin, account, msg, outcome, contacts, text, fromImage, note}
//   POST school-search {school_id, account, cursor, foundNew, exhausted}
//   POST schools {schools:[…], source}
//   POST account {id, user_id, status, linkedin_url, name, reason}

export async function prospectionGet(action: string, req: NextRequest): Promise<NextResponse | null> {
  const q = req.nextUrl.searchParams;
  const account = q.get('account') ?? undefined;
  if (action === 'plan' && account) return NextResponse.json(await accountPlan(account));
  if (action === 'queue' && (account || q.get('uncovered'))) {
    const status = q.get('status') ?? 'found';
    const limit = Math.min(200, Number(q.get('limit') ?? 50) || 50);
    const skip = q.get('uncovered') === '1' ? (await accountPlan(account)).covered.map((s) => s.id) : [];
    return NextResponse.json({ prospects: await prospects(status, limit, isAccountId(account) ? account : 'pierre', skip) });
  }
  if (action === 'index') return NextResponse.json({ prospects: await prospectIndex(account) });
  if (action === 'accounts') return NextResponse.json(await accountsForServer());
  if (action === 'discovery') return NextResponse.json(await discoveryInput());
  if (action === 'reconcile') {
    const r = await reconcile();
    if (r.pending > 0 && (await firstAlert('alerte-registre', 20))) {
      await sendOutreachAlert({
        subject: `Prospection : ${r.pending} message(s) d’étudiant sans décision`,
        lines: [`Ces messages ont été vus par l’agent il y a plus de 2 heures et n’ont pas encore été analysés :`, ...r.rows.slice(0, 15).map((m) => `${m.name ?? m.linkedin} (${m.school ?? ''}) · compte ${m.account}`), 'L’agent réessaie à chaque passage. S’ils restent là, la messagerie LinkedIn a peut-être changé.'],
      }).catch(() => {});
    }
    return NextResponse.json({ pending: r.pending, seen: r.seen, analyzed: r.analyzed });
  }
  return null;
}

export async function prospectionPost(action: string, body: Record<string, unknown>): Promise<NextResponse | null> {
  if (action === 'prospects' && body?.account !== undefined) {
    const account = isAccountId(body.account) ? body.account : 'pierre';
    const list = (Array.isArray(body.prospects) ? body.prospects : []) as ProspectIn[];
    return NextResponse.json({ added: await addProspects(list, account) });
  }
  if (action === 'urn') return NextResponse.json({ ok: await recordUrn(body.account, body.linkedin, body.urn) });
  if (action === 'seen') return NextResponse.json({ added: await markSeen(body.account, body.items) });
  if (action === 'analysis') {
    const r = await recordAnalysis(body);
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  }
  if (action === 'school-search') {
    const ok = await recordSchoolSearch({ schoolId: body.school_id, account: body.account, cursor: body.cursor, foundNew: body.foundNew, exhausted: body.exhausted });
    return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
  }
  if (action === 'schools') {
    const added = await addDiscoveredSchools(Array.isArray(body.schools) ? body.schools : [], String(body.source ?? 'découverte'));
    return NextResponse.json({ added });
  }
  if (action === 'account') {
    const r = await setAccountStatus(body);
    if (!r.ok) await log('compte', `Mise à jour refusée pour ${String(body.id ?? '?')} : ${r.error}`);
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  }
  return null;
}
