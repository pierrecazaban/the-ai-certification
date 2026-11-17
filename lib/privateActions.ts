'use server';

// Form actions for the private pages. They are called by opaque ids, and every one checks the session itself.
import { redirect } from 'next/navigation';
import { currentUser } from './auth';
import { describeForm, logAdmin } from './adminLog';
import { claimSchool, decideSchoolRequest, pickedSchool, requestSchool, schoolCount, joinTeam, markPayoutPaid, releaseSchool, requestPayout, saveBankDetails } from './team';
import { PRIVATE_SLUGS } from './private';
import { replyToTicket, setTicketStatus } from './tickets';
import { type SettingKey } from './settings';
import { testSetting } from './settingsTest';
import { setOnSale } from './visibility';
import { resetGuestCode } from './guest';
import { programBySlug } from './catalog';
import { cancelBooking, deleteWindow, updateAvailability } from './calls';
import { getConfig, saveConfig, setStatus as setOutreachStatus } from './outreach';

// Schools sit on the overview now: messages about them land there, at the schools section.
const team = (tab: string, msg: string) =>
  redirect(`/${PRIVATE_SLUGS.ambassador}?${tab === 'earnings' ? 'tab=earnings&' : ''}msg=${msg}${tab === 'schools' ? '#schools' : ''}`);
const pro = (tab: string, msg: string) => redirect(`/${PRIVATE_SLUGS.admin}?tab=${tab}&msg=${msg}`);

async function ambassador() {
  const user = await currentUser();
  if (!user || (user.role !== 'ambassador' && user.role !== 'admin')) redirect('/');
  return user;
}

async function admin(action = '', formData?: FormData) {
  const user = await currentUser();
  if (!user || user.role !== 'admin') {
    // Someone not signed in as the admin tried an admin action: written in the journal.
    if (action) await logAdmin(`REFUSÉ · ${action}`, describeForm(formData), user);
    redirect('/');
  }
  if (action) await logAdmin(action, describeForm(formData), user);
  return user;
}

export async function joinAction(formData: FormData) {
  const code = String(formData.get('code') ?? '');
  const result = await joinTeam({
    code,
    first_name: String(formData.get('first_name') ?? ''),
    last_name: String(formData.get('last_name') ?? ''),
    email: String(formData.get('email') ?? ''),
    university_id: String(formData.get('university_id') ?? ''),
    new_school: String(formData.get('new_school') ?? ''),
    new_school_city: String(formData.get('new_school_city') ?? ''),
    terms: formData.get('terms') === 'on',
  });
  redirect(`/${code}?${result.ok ? 'sent=1' : `error=${result.error}`}`);
}

export async function claimSchoolAction(formData: FormData) {
  const user = await ambassador();
  const universityId = String(formData.get('university_id') ?? '');
  const newName = String(formData.get('new_school') ?? '');
  const newCity = String(formData.get('new_school_city') ?? '');
  // One school per ambassador: the first is taken at once, any other one is asked for and decided in /admin.
  if (user.role !== 'admin' && (await schoolCount(user.id)) >= 1) {
    team('schools', await requestSchool(user.id, { universityId, newName, newCity }));
  }
  const school = await pickedSchool(universityId, newName, newCity);
  if (!school || !('id' in school)) team('schools', 'pick');
  const ok = await claimSchool(user.id, (school as { id: string }).id);
  team('schools', ok ? 'claimed' : 'taken');
}

export async function decideSchoolRequestAction(formData: FormData) {
  await admin('decideSchoolRequestAction', formData);
  const result = await decideSchoolRequest(String(formData.get('request_id') ?? ''), formData.get('accept') === '1');
  pro('ambassadeurs', result);
}

export async function saveBankAction(formData: FormData) {
  const user = await ambassador();
  const ok = await saveBankDetails(user.id, String(formData.get('holder') ?? ''), String(formData.get('iban') ?? ''));
  team('earnings', ok ? 'bank_saved' : 'bank_invalid');
}

export async function requestPayoutAction() {
  const user = await ambassador();
  team('earnings', await requestPayout(user.id));
}

export async function markPayoutPaidAction(formData: FormData) {
  await admin('markPayoutPaidAction', formData);
  await markPayoutPaid(String(formData.get('payout_id') ?? ''));
  pro('versements', 'paye');
}

export async function releaseSchoolAction(formData: FormData) {
  await admin('releaseSchoolAction', formData);
  await releaseSchool(String(formData.get('university_id') ?? ''));
  pro('ambassadeurs', 'libere');
}

export async function replyTicketAction(formData: FormData) {
  await admin('replyTicketAction', formData);
  const id = String(formData.get('ticket_id') ?? '');
  await replyToTicket(id, String(formData.get('body') ?? ''));
  redirect(`/${PRIVATE_SLUGS.admin}?tab=tickets&id=${id}&msg=envoye`);
}

export async function ticketStatusAction(formData: FormData) {
  await admin('ticketStatusAction', formData);
  const id = String(formData.get('ticket_id') ?? '');
  const status = String(formData.get('status') ?? '');
  if (status === 'open' || status === 'answered' || status === 'closed') await setTicketStatus(id, status);
  redirect(`/${PRIVATE_SLUGS.admin}?tab=tickets&id=${id}`);
}

// Keys are no longer changed from the admin (15/11): only in Vercel. The form and its action are gone.

export async function testSettingAction(formData: FormData) {
  const user = await admin('testSettingAction', formData);
  const key = String(formData.get('key') ?? '') as SettingKey;
  const result = await testSetting(key, user.email);
  redirect(`/${PRIVATE_SLUGS.admin}?tab=reglages&test=${key}&ok=${result.ok ? 1 : 0}&detail=${encodeURIComponent(result.detail)}`);
}

/** Puts a written catalogue certification on sale, or takes it off (/admin → Formation). */
export async function courseOnSaleAction(formData: FormData) {
  await admin('courseOnSaleAction', formData);
  const program = String(formData.get('program') ?? '');
  const lang = String(formData.get('lang') ?? 'fr');
  if (programBySlug(program)) await setOnSale(program, formData.get('on_sale') === '1');
  redirect(lang === 'settings' ? `/${PRIVATE_SLUGS.admin}?tab=reglages#ventes` : `/${PRIVATE_SLUGS.admin}?tab=formation&program=${program}&lang=${lang}`);
}

// Calls (/admin › Calls): availability told to Claude in plain words, and the bookings.
export async function availabilityAction(formData: FormData) {
  await admin('availabilityAction', formData);
  const text = String(formData.get('text') ?? '').trim();
  if (!text) pro('appels', 'empty');
  const result = await updateAvailability(text);
  if (!result.ok) pro('appels', result.error);
  redirect(`/${PRIVATE_SLUGS.admin}?tab=appels&msg=ok&summary=${encodeURIComponent(result.ok ? result.summary : '')}`);
}

export async function deleteWindowAction(formData: FormData) {
  await admin('deleteWindowAction', formData);
  await deleteWindow(String(formData.get('id') ?? ''));
  pro('appels', 'window-deleted');
}

export async function cancelCallAction(formData: FormData) {
  await admin('cancelCallAction', formData);
  await cancelBooking(String(formData.get('id') ?? ''));
  pro('appels', 'call-canceled');
}

// Prospection (/admin › Prospection): the plan the LinkedIn script follows.
export async function outreachConfigAction(formData: FormData) {
  await admin('outreachConfigAction', formData);
  const num = (k: string) => Number(formData.get(k) ?? 0);
  await saveConfig({
    invitesPerDay: num('invitesPerDay'),
    weeklyCap: num('weeklyCap'),
    messagesPerDay: num('messagesPerDay'),
    repostPerDay: num('repostPerDay'),
    perSchool: num('perSchool'),
    searchesPerDay: num('searchesPerDay'),
    schools: String(formData.get('schools') ?? '').split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 200),
    message: String(formData.get('message') ?? '').trim().slice(0, 1500),
    inviteNote: String(formData.get('inviteNote') ?? '').trim().slice(0, 280),
    followUp: String(formData.get('followUp') ?? '').trim().slice(0, 1000),
    followUpAfterDays: num('followUpAfterDays'),
    withdrawAfterDays: num('withdrawAfterDays'),
    searchCooldownDays: num('searchCooldownDays'),
  });
  pro('prospection', 'saved');
}

export async function outreachPauseAction() {
  await admin('outreachPauseAction');
  const c = await getConfig();
  await saveConfig({ paused: !c.paused });
  pro('prospection', c.paused ? 'resumed' : 'paused');
}

/** Admin: replaces the free-access invite link (the old one stops working). */
export async function resetGuestLinkAction() {
  await admin('resetGuestLinkAction');
  await resetGuestCode();
  redirect(`/${PRIVATE_SLUGS.admin}?msg=guest-link#invite`);
}

/** “Ne plus contacter”: the student is never written to again (no invitation, message, follow-up or reply). */
export async function outreachDeclineAction(formData: FormData) {
  await admin('outreachDeclineAction', formData);
  await setOutreachStatus(String(formData.get('linkedin') ?? ''), 'declined');
  pro('prospection', 'declined');
}
