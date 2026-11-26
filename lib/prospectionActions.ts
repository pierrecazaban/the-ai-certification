'use server';

// Actions de la prospection à plusieurs comptes (26/11) : celles de l'admin (contacts, comptes, écoles, réglages) et
// celles de l'ambassadeur (relier son LinkedIn, arrêter, noter un contact). Chacune vérifie la session elle-même, et
// celles de l'admin sont écrites dans son journal, comme dans lib/privateActions.ts.
import { redirect } from 'next/navigation';
import { currentUser } from './auth';
import { describeForm, logAdmin } from './adminLog';
import { PRIVATE_SLUGS } from './private';
import { sql } from './db';
import { saveConfig } from './outreach';
import { addDiscoveredSchools, adminSetAccount, ambAccountId, requestConnect, requestStop, schoolKey, setContactStatus, setSchoolFlags } from './prospection';

async function admin(action: string, formData?: FormData) {
  const user = await currentUser();
  if (!user || user.role !== 'admin') {
    await logAdmin(`REFUSÉ · ${action}`, describeForm(formData), user);
    redirect('/');
  }
  await logAdmin(action, describeForm(formData), user);
  return user;
}
const back = (msg: string, anchor: string, extra = '') => redirect(`/${PRIVATE_SLUGS.admin}?tab=prospection&msg=${msg}${extra}#${anchor}`);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** “Écrit”, “invalide” ou “confirmé” sur un contact donné par un étudiant. */
export async function prospectContactAction(formData: FormData) {
  await admin('prospectContactAction', formData);
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  if (UUID.test(id) && (status === 'contacted' || status === 'invalid' || status === 'new')) await setContactStatus(id, status);
  back('pc_saved', 'contacts');
}

/** Mettre en pause ou relancer un compte qui prospecte (celui de Pierre compris). */
export async function prospectAccountAction(formData: FormData) {
  await admin('prospectAccountAction', formData);
  const id = String(formData.get('id') ?? '');
  const op = String(formData.get('op') ?? '');
  if (op === 'pause' || op === 'resume') await adminSetAccount(id, op);
  back('pa_saved', 'comptes', `&compte=${encodeURIComponent(id)}`);
}

/** Une école : couverte ou non (choix de Pierre), retour à l'automatique, pause ou reprise. */
export async function prospectSchoolAction(formData: FormData) {
  await admin('prospectSchoolAction', formData);
  const id = String(formData.get('id') ?? '');
  const op = String(formData.get('op') ?? '');
  if (op === 'covered') await setSchoolFlags(id, { covered: true });
  else if (op === 'uncovered') await setSchoolFlags(id, { covered: false });
  else if (op === 'auto') await setSchoolFlags(id, { covered: null });
  else if (op === 'pause') await setSchoolFlags(id, { paused: true });
  else if (op === 'resume') await setSchoolFlags(id, { paused: false });
  back('ps_saved', 'ecoles');
}

/** Ajouter une école à la base à la main, ou marquer une école déjà là comme couverte. */
export async function prospectSchoolAddAction(formData: FormData) {
  await admin('prospectSchoolAddAction', formData);
  const name = String(formData.get('name') ?? '').trim().slice(0, 160);
  const city = String(formData.get('city') ?? '').trim().slice(0, 80);
  const covered = formData.get('covered') === 'on';
  if (name.length < 3) back('ps_name', 'ecoles');
  await addDiscoveredSchools([{ name, city, source: 'admin' }], 'admin');
  if (covered) await sql('update prospect_schools set covered_manual = true where key = $1', [schoolKey(name)]);
  back('ps_added', 'ecoles');
}

/** Prospection par les ambassadeurs : en service ou non, et le nombre de comptes au plus (pilote). */
export async function prospectSettingsAction(formData: FormData) {
  await admin('prospectSettingsAction', formData);
  const max = Math.round(Number(formData.get('max')));
  await saveConfig({ ambEnabled: formData.get('enabled') === 'on', ...(Number.isFinite(max) && max >= 0 ? { ambMaxAccounts: Math.min(50, max) } : {}) });
  back('pr_saved', 'comptes');
}

// ---------------------------------------------------------------- côté ambassadeur

/**
 * The ambassador agreed (box ticked) and asks to connect: returns the signed pass of the live LinkedIn sign-in, shown
 * in their space by the client component. Nothing is redirected: the page stays where it is.
 */
export async function ambConnectAction(consent: boolean): Promise<{ ok: true; token: string; url: string } | { ok: false; error: string }> {
  const user = await currentUser();
  if (!user || user.role !== 'ambassador') return { ok: false, error: 'reserved' };
  if (consent !== true) return { ok: false, error: 'consent' };
  const r = await requestConnect(user);
  return r.ok ? { ok: true, token: r.token, url: r.url } : { ok: false, error: r.error };
}

/** The ambassador stops: nothing more runs in their name and their LinkedIn connection is erased from the server. */
export async function ambStopAction() {
  const user = await currentUser();
  if (!user || user.role !== 'ambassador') redirect('/');
  await requestStop(user.id);
  redirect(`/${PRIVATE_SLUGS.ambassador}?msg=lk_stopped#linkedin`);
}

/** The ambassador wrote to a student on the contact they gave, or the contact does not work. */
export async function ambContactAction(formData: FormData) {
  const user = await currentUser();
  if (!user || user.role !== 'ambassador') redirect('/');
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  if (UUID.test(id) && (status === 'contacted' || status === 'invalid' || status === 'new')) await setContactStatus(id, status, ambAccountId(user.id));
  redirect(`/${PRIVATE_SLUGS.ambassador}?msg=lk_contact#linkedin`);
}
