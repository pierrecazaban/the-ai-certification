import 'server-only';
import { randomUUID } from 'node:crypto';
import universities from '@/data/universities.json';

type Row = Record<string, any>;
type Query = (text: string, params?: unknown[]) => Promise<Row[]>;

const SCHEMA = `
create table if not exists universities (
  id uuid primary key,
  name text not null,
  short_name text not null default '',
  state text not null default '',
  email_domains text[] not null default '{}',
  timezone text not null default 'Europe/Paris',
  active boolean not null default true
);

create table if not exists intakes (
  id uuid primary key,
  name text not null,
  starts_at timestamptz not null,
  registration_deadline timestamptz not null,
  capacity integer not null,
  status text not null default 'open'
);

create table if not exists registrations (
  id uuid primary key,
  reference text not null unique,
  client_token text not null,
  intake_id uuid not null references intakes(id),
  university_id uuid not null references universities(id),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null default '',
  email_domain_mismatch boolean not null default false,
  terms_accepted boolean not null,
  age_confirmed boolean not null,
  independence_acknowledged boolean not null,
  marketing_opt_in boolean not null default false,
  sms_opt_in boolean not null default false,
  terms_version text not null,
  currency text not null,
  amount_cents integer not null,
  status text not null,
  hold_expires_at timestamptz not null,
  payment_id text,
  paid_at timestamptz,
  utm jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table registrations add column if not exists locale text not null default 'en-us';

create index if not exists registrations_email on registrations (lower(email));
create index if not exists registrations_payment on registrations (payment_id);

create table if not exists waitlist (
  id uuid primary key,
  first_name text not null,
  email text not null,
  reason text not null,
  intake_id uuid,
  university_id uuid,
  other_university_name text,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key,
  email text not null unique,
  role text not null default 'student',
  first_name text not null default '',
  last_name text not null default '',
  locale text not null default 'en-us',
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists login_tokens (
  token_hash text primary key,
  user_id uuid not null references users(id),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  token_hash text primary key,
  user_id uuid not null references users(id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists emails (
  id uuid primary key,
  to_email text not null,
  subject text not null,
  kind text not null,
  locale text not null default 'en-us',
  html text not null,
  status text not null,
  provider_id text,
  error text,
  registration_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists lesson_progress (
  user_id uuid not null references users(id),
  lesson_id text not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

alter table registrations add column if not exists user_id uuid;
alter table users add column if not exists password_hash text;
-- Biz Dev accounts (20/11): name + password, no email. The name (lower case) is the sign-in identifier.
alter table users add column if not exists username text;
create unique index if not exists users_username on users (username) where username is not null;

-- Catalogue purchases: no university, a programme slug instead of the student programme.
alter table registrations alter column university_id drop not null;
alter table registrations add column if not exists program text not null default 'student-ai';
alter table registrations add column if not exists organization text not null default '';
-- Set when the payment created the buyer's account (15/11): only then may the confirmation page set its first password.
alter table registrations add column if not exists created_account boolean not null default false;
-- A paid sale in another currency, in euro cents as Stripe credited it (19/11): the admin counts all revenue in euros.
alter table registrations add column if not exists eur_cents integer;

-- Journal of the admin (15/11): sign-ins, failed attempts, pages opened, actions. Shown in /admin › Journal.
create table if not exists admin_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid,
  email text not null default '',
  ip text not null default '',
  place text not null default '',
  ua text not null default '',
  action text not null,
  detail text not null default ''
);
create index if not exists admin_log_at on admin_log (at desc);

create table if not exists ambassadors (
  user_id uuid primary key references users(id),
  invite_code text not null unique,
  parent_user_id uuid references users(id),
  iban text,
  iban_holder text,
  terms_version text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists school_claims (
  university_id uuid primary key references universities(id),
  user_id uuid not null references users(id),
  claimed_at timestamptz not null default now()
);

create table if not exists payouts (
  id uuid primary key,
  user_id uuid not null references users(id),
  currency text not null,
  amount_cents integer not null,
  iban text not null,
  iban_holder text not null,
  status text not null default 'requested',
  requested_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists commissions (
  id uuid primary key,
  user_id uuid not null references users(id),
  registration_id uuid not null references registrations(id),
  level integer not null,
  rate_bp integer not null,
  amount_cents integer not null,
  currency text not null,
  status text not null default 'owed',
  payout_id uuid references payouts(id),
  created_at timestamptz not null default now(),
  unique (user_id, registration_id)
);

-- Catalogue certifications put on sale from /admin (Formation). No row = not on sale, the student course always is.
-- An ambassador holds one school, a second one is asked for and decided from /admin (Ambassadeurs).
create table if not exists school_requests (
  id uuid primary key,
  user_id uuid not null references users(id),
  university_id uuid references universities(id),
  new_name text not null default '',
  new_city text not null default '',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table if not exists course_visibility (
  program text primary key,
  on_sale boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists tickets (
  id uuid primary key,
  reference text not null unique,
  name text not null,
  email text not null,
  category text not null,
  registration_ref text not null default '',
  locale text not null default 'en-us',
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ticket_messages (
  id uuid primary key,
  ticket_id uuid not null references tickets(id),
  author text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key,
  name text not null,
  email text not null,
  organization text not null default '',
  audience text not null,
  message text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists exercise_submissions (
  user_id uuid not null references users(id),
  program text not null,
  exercise_id text not null,
  content text not null,
  submitted_at timestamptz not null default now(),
  primary key (user_id, program, exercise_id)
);

create table if not exists quiz_attempts (
  id uuid primary key,
  user_id uuid not null references users(id),
  program text not null,
  module_id text not null,
  score int not null,
  total int not null,
  answers jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists exam_attempts (
  id uuid primary key,
  user_id uuid not null references users(id),
  program text not null,
  score int not null,
  total int not null,
  passed boolean not null,
  created_at timestamptz not null default now()
);

create table if not exists certificates (
  reference text primary key,
  user_id uuid not null references users(id),
  program text not null,
  holder_name text not null,
  score int not null,
  total int not null,
  issued_at timestamptz not null default now(),
  unique (user_id, program)
);

-- Ambassador calls (/call): the admin's availability windows, and the 45-minute calls booked in them.
create table if not exists call_windows (
  id uuid primary key,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists call_bookings (
  id uuid primary key,
  reference text not null unique,
  token text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  first_name text not null,
  last_name text not null default '',
  email text not null,
  school text not null default '',
  linkedin text not null default '',
  meet_url text not null default '',
  calendar_event_id text,
  status text not null default 'booked',
  created_at timestamptz not null default now()
);

create unique index if not exists call_bookings_slot on call_bookings (starts_at) where status = 'booked';

create table if not exists call_prospects (
  token text primary key,
  linkedin text not null unique,
  first_name text not null default '',
  last_name text not null default '',
  school text not null default '',
  created_at timestamptz not null default now()
);

alter table call_bookings add column if not exists prospect_token text;
alter table call_bookings add column if not exists linkedin_notified_at timestamptz;

-- LinkedIn prospecting run by the script on the admin's Mac, watched and steered from /admin › Prospection.
create table if not exists outreach_prospects (
  linkedin text primary key,
  name text not null default '',
  first_name text not null default '',
  school text not null default '',
  headline text not null default '',
  token text,
  status text not null default 'found',
  found_at timestamptz not null default now(),
  invited_at timestamptz,
  accepted_at timestamptz,
  messaged_at timestamptz,
  booked_at timestamptz,
  error text not null default ''
);

create table if not exists outreach_log (
  id uuid primary key,
  kind text not null,
  text text not null,
  at timestamptz not null default now()
);

create table if not exists outreach_config (
  id integer primary key,
  data jsonb not null default '{}'
);

-- Refusals, follow-ups and withdrawn invitations, and when each school was last searched (searches are rationed).
alter table outreach_prospects add column if not exists declined_at timestamptz;
alter table outreach_prospects add column if not exists followed_up_at timestamptz;
alter table outreach_prospects add column if not exists withdrawn_at timestamptz;
-- The student gave a way to reach them outside LinkedIn (Instagram, WhatsApp, phone…): Pierre carries on there.
alter table outreach_prospects add column if not exists contact text not null default '';
alter table outreach_prospects add column if not exists contact_at timestamptz;
alter table outreach_prospects add column if not exists contacted_at timestamptz;
create table if not exists outreach_school_search (
  school text primary key,
  searched_at timestamptz not null default now(),
  found integer not null default 0
);

-- Visitors with a page open right now (live counter in the admin console). One row per browser tab, no personal data.
create table if not exists live_visitors (
  vid text primary key,
  path text not null,
  seen_at timestamptz not null default now()
);
-- One person with several tabs counts once: pid is a random id kept by the browser (no personal data).
alter table live_visitors add column if not exists pid text;

-- The secret invite link giving free access to the course (one row, a new code replaces the old link).
create table if not exists guest_invite (
  id integer primary key,
  code text not null
);

-- Ambassadeurs « court terme » (18/11) : ceux qu'on consomme avec des mails, comptes Smart Mail envoyés par le
-- serveur Smart Mail (/api/smartmail/ambassadors). Aucune adresse d'élève ici : seulement des totaux.
create table if not exists short_ambassadors (
  smartmail_id integer primary key,
  first_name text not null default '',
  domain text not null default '',
  sent integer not null default 0,
  buyers integer not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
-- Qui a fait venir l'ambassadeur court terme : le code personnel tapé à l'entrée du tool (18/11).
alter table short_ambassadors add column if not exists recruiter_code text not null default '';
-- Ambassadeurs court terme supprimés depuis l'espace ambassadeur (19/11) : la synchro Smart Mail ne les remet plus,
-- et la suppression du compte Smart Mail est retentée tant qu'elle n'a pas abouti (done).
create table if not exists short_removed (smartmail_id integer primary key, removed_at timestamptz not null default now(), done boolean not null default false);
-- Code personnel de chaque ambassadeur (18/11) : il ouvre le tool Smart Mail comme le code du jour, sans expirer,
-- et rattache la personne à lui comme ambassadeur court terme.
alter table ambassadors add column if not exists tool_code text unique;
-- Grade Master (19/11): who named this ambassador Master, and when. Other grades are computed (lib/grades.ts).
alter table ambassadors add column if not exists master_by uuid references users(id);
alter table ambassadors add column if not exists master_at timestamptz;
-- Nom qu'un ambassadeur donne à quelqu'un de sa pyramide, visible par lui seul (22/11).
-- Compte Smart Mail lié à cet ambassadeur (23/11) : il n'apparaît plus en double dans la pyramide.
alter table ambassadors add column if not exists smartmail_id integer;
create table if not exists ambassador_aliases (owner_id uuid not null, target_id uuid not null, alias text not null, primary key (owner_id, target_id));
-- Ambassadeurs venus par Smart Mail, sans compte sur le site (23/11) : grade Legend et nom donné, comme les autres.
-- (Pas d apostrophe dans ces commentaires : le schéma est découpé sur les points-virgules puis envoyé tel quel.)
alter table short_ambassadors add column if not exists master_by uuid;
alter table short_ambassadors add column if not exists master_at timestamptz;
create table if not exists short_aliases (owner_id uuid not null, smartmail_id integer not null, alias text not null, primary key (owner_id, smartmail_id));
-- Arbre des ambassadeurs (23/11) : en retirer une personne la masque, rien de plus. Son compte, ses envois Smart Mail,
-- ses commissions restent intacts, et on la remet en un clic. Les anciennes suppressions deviennent des masquages.
create table if not exists tree_hidden (target_id text primary key, hidden_at timestamptz not null default now());
insert into tree_hidden (target_id) select 'sm-' || smartmail_id from short_removed where smartmail_id <> 10 on conflict do nothing;
delete from short_removed;
-- Tracker des parcours (18/11) : qui a reçu le mail Smart Mail (empreinte de l'adresse seulement) et les relances.
-- Note de l'admin sur une inscription (18/11) : « compte supprimé à sa demande », etc. Le tracker l'affiche au lieu d'un trou.
alter table registrations add column if not exists admin_note text not null default '';
create table if not exists mail_received (
  email_hash text primary key,
  received_at timestamptz not null,
  smartmail_id integer not null default 0
);
create table if not exists reminders (
  registration_id text not null,
  step integer not null,
  sent_at timestamptz not null,
  ok boolean not null,
  primary key (registration_id, step)
);
-- Note du certificat (22/11), demandée avant le bouton LinkedIn. Le commentaire n'est pas obligatoire.
alter table certificates add column if not exists rating smallint;
alter table certificates add column if not exists rating_comment text not null default '';
alter table certificates add column if not exists rated_at timestamptz;
-- Relance « finissez votre formation » (23/11) : une ligne par adresse, posée avant l'envoi, pour n'écrire qu'une fois.
create table if not exists finish_nudges (
  email text primary key,
  registration_id uuid,
  status text not null default 'sending',
  sent_at timestamptz not null default now()
);
-- Rappels de paiement par e-mail Kai (23/11), à la place des relances Smart Mail : une ligne par adresse et par étape
-- (1 = inscription commencée et pas payée, 2 = veille de la clôture), posée avant l'envoi. Table à part de « reminders »,
-- que Smart Mail réécrit à chaque synchronisation.
create table if not exists kai_reminders (
  email text not null,
  step integer not null,
  registration_id text not null,
  sent_at timestamptz not null default now(),
  ok boolean not null default false,
  primary key (email, step)
);
-- Rappel de paiement automatique (23/11). control = groupe témoin : la personne remplit toutes les conditions mais on ne
-- lui écrit pas, pour mesurer ce que le rappel rapporte vraiment.
alter table kai_reminders add column if not exists control boolean not null default false;
-- Adresses qui ont cliqué « ne plus recevoir de rappel » dans un mail de relance.
create table if not exists relance_stops (email text primary key, at timestamptz not null default now());
-- Dernier passage de chaque horloge (serveur OVH, serveur de Paris) qui déclenche les rappels automatiques.
create table if not exists relance_heartbeat (source text primary key, at timestamptz not null default now());
-- Journal des passages où quelque chose est parti ou a été retenu, et des alertes envoyées à l'admin (source « alerte:… »).
create table if not exists relance_runs (
  id uuid primary key,
  at timestamptz not null default now(),
  source text not null,
  sent integer not null default 0,
  failed integer not null default 0,
  skipped integer not null default 0,
  control integer not null default 0,
  why text not null default ''
);
-- Écran Trustpilot du certificat (23/11), affiché seulement après une note de 5 étoiles : première fois où il a été vu,
-- premier clic sur le bouton qui ouvre Trustpilot, nombre de clics. Un clic ne prouve pas qu'un avis a été déposé.
alter table certificates add column if not exists tp_shown_at timestamptz;
alter table certificates add column if not exists tp_clicked_at timestamptz;
alter table certificates add column if not exists tp_clicks integer not null default 0;
-- Question ambassadeur posée avant le certificat (24/11) : une seule réponse par personne. Oui avec le réseau social
-- et le pseudo où la joindre (et les écoles où elle connaît du monde), ou non. contacted_at : Pierre a pris contact.
create table if not exists ambassador_leads (
  user_id uuid primary key references users(id) on delete cascade,
  program text not null,
  interested boolean not null,
  network text not null default '',
  handle text not null default '',
  schools text not null default '',
  answered_at timestamptz not null default now(),
  contacted_at timestamptz
);
-- Commissions saisies à la main dans /admin (24/11). Une ligne saisie na pas de vente rattachée et porte une note que
-- lambassadeur voit. Les nouvelles ventes ne créent plus de ligne (recordCommissions, lib/team.ts). Les lignes déjà là restent.
alter table commissions alter column registration_id drop not null;
alter table commissions add column if not exists label text not null default '';
-- Le ticket ouvert pour une demande de virement, pour que Transfer done close celui-là et aucun autre.
alter table payouts add column if not exists ticket_id uuid;
-- Frais Stripe réels de chaque vente (26/11), en centimes deuro, lus une seule fois chez Stripe (lib/revenue.ts) :
-- ladmin ne rebalaie plus toutes les ventes à chaque ouverture. stripe_fee_checked_at = dernière lecture tentée.
alter table registrations add column if not exists stripe_fee_cents integer;
alter table registrations add column if not exists stripe_fee_checked_at timestamptz;
-- Prospection LinkedIn à plusieurs comptes (26/11) : le compte de Pierre et ceux des ambassadeurs qui relient leur
-- LinkedIn. id = pierre, hippolyte ou amb- suivi de l’identifiant de l’utilisateur. status : connecting, active, paused,
-- stop_requested (le serveur de Paris efface alors la connexion) puis stopped.
create table if not exists prospect_accounts (
  id text primary key,
  user_id uuid references users(id) on delete cascade,
  name text not null default '',
  linkedin_url text not null default '',
  status text not null default 'connecting',
  reason text not null default '',
  consent_at timestamptz,
  connected_at timestamptz,
  started_at timestamptz,
  last_pass_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Chaque prospect appartient au compte qui l’a trouvé (jamais contacté par un autre) et à son école de la base.
alter table outreach_prospects add column if not exists account text not null default 'pierre';
alter table outreach_prospects add column if not exists school_id uuid;
create index if not exists outreach_prospects_account on outreach_prospects (account, status);
-- L’identifiant interne de LinkedIn du prospect (lien /in/ACoA… de la messagerie), appris au premier message : il
-- reconnaît la conversation sans se fier au nom affiché.
alter table outreach_prospects add column if not exists urn text;
create index if not exists outreach_prospects_urn on outreach_prospects (urn);
-- La base des écoles à prospecter (26/11) : elle grandit sans fin. key = nom sans accents ni ponctuation, une seule
-- ligne par école. assigned_to = le compte qui la prospecte en ce moment (7 jours, puis elle tourne). cursor = où en est
-- la recherche LinkedIn. exhausted_until = plus de nouvel étudiant trouvé, elle revient seule après 30 jours.
-- covered_manual : vide = automatique (ambassadeur connecté), sinon le choix de Pierre.
create table if not exists prospect_schools (
  id uuid primary key,
  name text not null,
  key text not null unique,
  city text not null default '',
  university_id uuid,
  email_domains text[] not null default '{}',
  source text not null default '',
  covered_manual boolean,
  paused boolean not null default false,
  assigned_to text,
  assigned_at timestamptz,
  cursor jsonb not null default '{}',
  searches integer not null default 0,
  found integer not null default 0,
  last_searched_at timestamptz,
  exhausted_until timestamptz,
  added_at timestamptz not null default now()
);
-- Ce que chaque serveur Smart Mail dit de ses comptes, toutes les 10 minutes : les domaines des adresses, rien d’autre.
create table if not exists coverage_feed (
  source text primary key,
  domains jsonb not null default '[]',
  received_at timestamptz not null default now()
);
-- Contacts donnés par les étudiants (26/11) : un par réseau et identifiant, avec la phrase où ils le donnent.
-- status : new, verify (à vérifier), contacted, invalid. source : auto, image ou manual.
create table if not exists prospect_contacts (
  id uuid primary key,
  linkedin text not null,
  account text not null default 'pierre',
  network text not null,
  value text not null,
  normalized text not null,
  quote text not null default '',
  status text not null default 'new',
  source text not null default 'auto',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (linkedin, network, normalized)
);
-- Registre des messages d’étudiants lus par l’agent (26/11) : chacun reçoit une décision (outcome : contact, none,
-- verify, declined, error). Un message vu sans décision après 2 heures déclenche l’alerte de la nuit.
create table if not exists prospect_messages (
  linkedin text not null,
  msg text not null,
  account text not null default 'pierre',
  seen_at timestamptz not null default now(),
  analyzed_at timestamptz,
  outcome text not null default '',
  excerpt text not null default '',
  attempts integer not null default 0,
  primary key (linkedin, msg)
);
-- Calendrier des envois (28/11) : mails Smart Mail reçus par les élèves, par serveur, compte et heure (aucune adresse).
-- Chaque serveur remplace ses lignes toutes les 10 minutes (/api/smartmail/envois). La table feed garde ses comptes
-- (domaine, prénom) et la dernière réception, pour dire si les chiffres sont à jour.
create table if not exists smartmail_sends (
  source text not null,
  account integer not null,
  hour timestamptz not null,
  sent integer not null,
  primary key (source, account, hour)
);
create index if not exists smartmail_sends_hour on smartmail_sends (hour);
create table if not exists smartmail_send_feed (
  source text primary key,
  accounts jsonb not null default '[]',
  received_at timestamptz not null default now()
);
-- Arrivees sur la page de connexion (28/11) : provenance de chaque visite de /login, sans adresse IP (lib/loginArrivals.ts).
create table if not exists login_arrivals (
  id bigserial primary key,
  at timestamptz not null default now(),
  path text not null,
  query text not null default '',
  ref text not null default '',
  host text not null default '',
  kind text not null,
  fetch_site text not null default '',
  country text not null default '',
  device text not null default '',
  browser text not null default '',
  bot boolean not null default false
);
create index if not exists login_arrivals_at on login_arrivals (at);
-- Mise en place du 28/11 : visites de l associe et tests (US, avant 15:00 UTC) retirees, appareils equipe exclus ensuite.
delete from login_arrivals where at < timestamptz '2026-11-28 15:00:00+00' and (country = 'US' or ref like '%.invalid%')
`;

/** Moves everything attached to school `from` onto school `into`, then deletes `from`. No-op once done. */
async function mergeSchool(q: Query, from: string, into: string) {
  const [gone] = await q('select id from universities where id = $1', [from]);
  if (!gone) return;
  // Jamais vers une école absente (26/11) : la mise à jour des inscriptions échouerait et bloquerait le démarrage du site.
  const [target] = await q('select id from universities where id = $1', [into]);
  if (!target || from === into) return;
  const moved = await q(
    `update registrations set university_id = $2 where university_id = $1 returning id::text as id, status`,
    [from, into],
  );
  await q('update waitlist set university_id = $2 where university_id = $1', [from, into]);
  await q('update school_requests set university_id = $2 where university_id = $1', [from, into]);
  // The claim follows only if the target school is still free; otherwise the target's holder keeps it.
  await q(
    `update school_claims set university_id = $2 where university_id = $1
     and not exists (select 1 from school_claims where university_id = $2)`,
    [from, into],
  );
  await q('delete from school_claims where university_id = $1', [from]);
  await q('delete from universities where id = $1', [from]);
  const paid = moved.filter((r: Row) => r.status === 'paid').map((r: Row) => String(r.id));
  console.log(`[db] merged school ${from} into ${into}: ${moved.length} registrations (${paid.length} paid)`);
  if (paid.length) {
    // After init: recordCommissions goes through sql(), which waits for this initialisation to finish.
    setTimeout(async () => {
      const { recordCommissions } = await import('./team');
      for (const id of paid) await recordCommissions(id).catch((e) => console.error('[db] commission', id, e));
    }, 0);
  }
}

async function seed(q: Query) {
  // Schools of data/universities.json missing from the database are inserted on the next start, whatever the total
  // (schools created from the ambassador space count too, so a count comparison would miss new ones: McGill, 14/11).
  // Their email domains follow the file (registration pre-fills them: neoma-bs.com, edu.escp.eu…).
  const enBase = new Map(
    (await q('select id::text as id, email_domains from universities')).map((r: Row) => [String(r.id), (r.email_domains as string[]) ?? []]),
  );
  for (const u of universities as Row[]) {
    const domaines = (u.email_domains as string[]) ?? [];
    if (!enBase.has(String(u.id))) {
      await q(
        `insert into universities (id, name, short_name, state, email_domains, timezone)
         values ($1, $2, $3, $4, $5, $6) on conflict (id) do nothing`,
        [u.id, u.name, u.short_name ?? '', u.state ?? '', domaines, u.timezone ?? 'Europe/Paris'],
      );
    } else if (domaines.length && domaines.join(',') !== (enBase.get(String(u.id)) ?? []).join(',')) {
      await q('update universities set email_domains = $2 where id = $1', [u.id, domaines]);
    }
  }

  // NEOMA is one school with one ambassador (17/11): the old “NEOMA Paris” campus entry is merged into NEOMA.
  // Its registrations, waitlist rows, requests and claim move over, then the entry is removed. Paid sales that
  // moved get their commissions once the database is ready (recordCommissions is idempotent).
  await mergeSchool(q, 'd1fdfd3e-d78c-5ef8-916d-13f6baabd02b', '826a2869-d10b-49e0-a6fa-1a525f42523d');
  // One entry per school, all campuses together (21/11): the entries that named a single campus (ECE Lyon,
  // EM Lyon Paris, KEDGE Marseille, IÉSEG Lille…) or repeated a school under another name are merged into the school.
  for (const [campus, school] of [
    ['fc941576-28c3-5145-aecd-6f49cdcfef15', '798eec0b-ef1d-41dc-98bb-872dbe857c1c'],
    ['0a2e73e0-0b5a-5427-8ff5-44d319b87a5e', 'd5f25c47-3b8e-491a-b721-3ba5a2a72523'],
    ['affeb3b1-a6f3-538a-8a89-7ef4b9ff4109', '831e374a-f072-44fa-9c51-f838b56fafab'],
    ['74bb25fb-3341-5d1e-b1ef-0c47847ecfd6', '57f06641-1a90-4222-af07-9631ff572687'],
    ['473bd5d6-b746-5eb4-88ed-8ff9eafad93a', '7a6a5b54-32c3-4d88-bd1d-160b155e20a9'],
    ['319a049a-262f-565d-ac75-d0e501aff2f4', '5490c8e0-9271-419e-820c-e67d5d751220'],
    ['790b1c75-8336-59c7-9aa8-b5dec865d693', '6259d2c9-9a06-4e12-9c73-e704abb1879a'],
    ['d6033a85-2330-5473-a49e-a42e35e2aa2a', '85ddfc3f-cec5-4372-9f17-3c62e35f3efb'],
    ['c4ff0abd-ed85-48e3-a5c4-12c1144f9b95', 'aaca2deb-5c28-4922-95b5-f2a0bdd9a077'],
  ]) await mergeSchool(q, campus, school);
  // Une seule entrée par école, tous campus confondus (26/11, demande de Pierre : « fusionne les partout ») : l'entrée d'un
  // campus, d'une ville, d'une composante ou d'une autre orthographe de la même école rejoint l'école (inscriptions, liste
  // d'attente, demandes, école tenue). Ces entrées sont aussi retirées de data/universities.json. Restent à part les écoles
  // distinctes qui partagent un nom : Sciences Po de région, IAE, HEC Lausanne et Montréal, Polytech, ISEN, Institut Agro,
  // ESIEE Amiens, ESG Sport et Tourisme, Sup de Pub, Audencia SciencesCom, UTS Insearch, EBS Paris.
  // Une fusion qui échoue est notée au journal et ne bloque jamais le démarrage du site.
  for (const [campus, school] of [
  ['a885c58a-2a8f-43fc-9772-1e1956c9fcc4', '826a2869-d10b-49e0-a6fa-1a525f42523d'], // NEOMA (Rouen) → NEOMA Business School
  ['ba301a57-0eda-460d-9802-b6bccaf1b3a4', '826a2869-d10b-49e0-a6fa-1a525f42523d'], // Neoma (Paris campus) → NEOMA Business School
  ['160db773-11da-40f6-a7eb-2ba6928a2cb2', '826a2869-d10b-49e0-a6fa-1a525f42523d'], // NEOMA Reims → NEOMA Business School
  ['83be722e-add7-4eed-a78f-04ef5a54df04', '34839d62-d3f4-4fe1-8319-4d2d126b570a'], // ESCP (Turin/Berlin campus) → ESCP Business School
  ['960aad3c-d85f-4007-bc4b-e964382d0ca0', '6259d2c9-9a06-4e12-9c73-e704abb1879a'], // Kedge Bordeaux → KEDGE Business School
  ['49a8ad96-46a9-4be8-aea5-de95fefda2bd', '6259d2c9-9a06-4e12-9c73-e704abb1879a'], // Kedge Marseille → KEDGE Business School
  ['97c37576-e0e5-44d4-9eb9-c568a6ce4ca5', '94c51031-69d5-43e5-aad0-20ec89e239b0'], // EDHEC (Nice campus) → EDHEC Business School
  ['b85d2ea0-9523-4199-93f1-193df02d698d', '5490c8e0-9271-419e-820c-e67d5d751220'], // IÉSEG (Lille campus) → IÉSEG School of Management
  ['0e11b969-baff-450f-beb6-bfae6de85d17', '5490c8e0-9271-419e-820c-e67d5d751220'], // IÉSEG (Lille) → IÉSEG School of Management
  ['ac7fb286-f2c3-4f28-80b9-61c6fa834f3a', '5490c8e0-9271-419e-820c-e67d5d751220'], // IÉSEG Network → IÉSEG School of Management
  ['c54ef0b8-3a95-4d35-bb55-f0115a3377aa', '8871d5b1-24a8-4326-93d0-6ff874ecba76'], // INSEEC Bordeaux → INSEEC Grande École
  ['1cfed939-ffbd-4036-86c1-78e8491e358a', '8871d5b1-24a8-4326-93d0-6ff874ecba76'], // INSEEC Lyon → INSEEC Grande École
  ['b9272b40-ff94-4d14-9e69-16d35fc23074', '5ed69841-1472-4666-b7f7-ba56ca4f9a31'], // Grenoble École de Management (Paris) → Grenoble École de Management
  ['57279447-9d19-46b9-9693-00bbee3926d2', 'f954d4d8-574a-473d-8169-6630b38427b1'], // IPSA Paris → IPSA
  ['3a91a475-759b-4fd7-ba69-4ea76a61f540', 'f1fbe538-862d-5136-ad2c-ba64d6443986'], // ESIEE Paris (Noisy) → ESIEE Paris
  ['5554cf0a-28b3-4277-95ad-2e80c6fa4bd4', '726d20dd-c821-5086-9c0a-236c56d8da52'], // ISTEC Paris → ISTEC
  ['25a839eb-a751-4c57-b896-a651c97ee449', '87fdb318-5556-4915-82bf-3a5cdc839cde'], // IDRAC Lyon → IDRAC Business School
  ['6b165628-6964-4d26-9687-2fcb408f0c24', '91137d2b-ac9f-5fc2-b7b0-bfc0de1e0ca3'], // ESG Management School → ESG
  ['dc2d1827-d781-4aa5-9209-969020b64682', '91137d2b-ac9f-5fc2-b7b0-bfc0de1e0ca3'], // ESG Lyon → ESG
  ['02289ead-dcf1-466e-ae16-1bdb6070f13d', '91137d2b-ac9f-5fc2-b7b0-bfc0de1e0ca3'], // ESG Rennes → ESG
  ['60510704-903d-4e02-b669-011b5951b752', '8831fa9b-6c3f-467e-9f22-a2ade0a7dc27'], // Isg → ISG International Business School
  ['462cfe63-bf82-40e0-b729-fe10af1bea8d', 'ec9d0ebf-c205-4d16-8471-7532a0dd902f'], // Ynov Informatique → Ynov Campus
  ['49d22033-4ad9-4ae9-a8d3-de296925ca62', 'ec9d0ebf-c205-4d16-8471-7532a0dd902f'], // Ynov Business → Ynov Campus
  ['401c5572-278e-4918-b884-3f1f739bea39', '4fb2b779-7421-5594-9756-f76b9f336052'], // ESTP Paris → ESTP
  ['0e61ea06-c4ff-4e7b-b0a4-cd4bba7833f2', 'cc0d8c3e-816a-523c-b04b-2934cdf01167'], // EDC Paris → EDC Paris Business School
  ['a3dbf92e-21fa-4e54-9fbd-d8b049b6cf22', 'c7be2a9d-9a63-4c93-b1c0-7167d6e7251d'], // ENSAE Paris (ParisTech) → ENSAE Paris
  ['2dbf5225-7a9c-5033-a577-78171797f023', 'c0609097-e9e8-44a6-83cb-17eb699060bb'], // Gobelins Paris → Gobelins, l'école de l'image
  ['144bd1a7-cac0-498d-9da6-0d58b8f1e6f0', 'df043fb8-2b8f-4703-8d33-f35809199d23'], // LISAA Rennes → LISAA
  ['201e977b-ac8a-4435-8cee-d98e4eb7bac6', '70e3a0cc-26f1-4b47-b6e9-509562b64cf5'], // ESMA Toulouse → ESMA
  ['b04cf061-a6f0-45f3-8b26-c823c08ffd46', '990ad95e-8a94-4c42-a4ca-6e3999576562'], // ArtFX Lille → ARTFX
  ['a337c3d5-318e-4585-b4b4-ea871d20b685', 'e6e51769-e876-4121-83f2-bf16f460ea53'], // Vatel Paris → Vatel
  ['d27b12de-8f52-4e66-8bc0-cb1200baadf8', 'e6e51769-e876-4121-83f2-bf16f460ea53'], // Vatel Lyon → Vatel
  ['8060be7a-bccf-4868-aaed-bc51f4152fd0', 'e6e51769-e876-4121-83f2-bf16f460ea53'], // Institut Vatel → Vatel
  ['32fcddbb-3339-420f-9c04-30103161db3e', '831e374a-f072-44fa-9c51-f838b56fafab'], // EM Lyon (Saint-Étienne) → emlyon business school
  ['4f4468bc-9298-424e-9e7f-a55d0a4d255a', '80fadbc6-199b-46eb-8ab7-ed763bc8e1d4'], // École Ferrandi (Bordeaux) → Ferrandi Paris
  ['3fb19b09-cefc-4df9-84a7-2fcceffb1a6c', '5b31d169-ec14-4335-a966-bef0b8490653'], // HEAD Paris (droit) → HEAD (droit)
  ['e1624adb-c4ac-49bb-92db-3a0958ac3ef3', '380464be-cebb-4dcd-9055-3462bbab7c92'], // Université Clermont Auvergne (IUT) → Université Clermont Auvergne
  ['d7ace43b-77db-4dad-b504-e378f7572b63', '379b5e49-eec3-4ab6-ac82-638c8cd67f84'], // Université Grenoble Alpes (IUT) → Université Grenoble Alpes
  ['74a4a580-7f23-4de2-a3ed-772a02f57c77', '0bf227d2-9fb9-49f5-8602-9a09c0a376f9'], // Nantes Université (Polytech) → Polytech Nantes
  ['aee2d292-9027-4722-ac97-830f720d5e0d', 'ce342e34-a1d6-4155-8d82-295c572c797c'], // Arizona State University (West) → Arizona State University
  ['6a436f09-a801-4810-84a4-f2e85a3aa967', '707f203c-6246-4b77-96ea-fa8876dcad39'], // San Diego State University (Imperial) → San Diego State University
  ['9d7c6aa0-af86-408d-b883-4857ec83e1b3', '9dace563-7a3f-4f7a-9424-98bbd778e4f3'], // University of Sydney (Business) → University of Sydney
  ['867918b0-7b9f-427b-b48f-7e13a01d21c3', 'fe5c7b59-5dbe-4479-a17a-ce8f818bb5e0'], // National University of Singapore (Business) → National University of Singapore
  ['52fbdcaf-d4db-411f-8e0f-8a2732aa1745', '67b053bb-349e-4eae-aa1b-541f2b777c4a'], // University of Amsterdam (Business) → University of Amsterdam
  ['17e97460-b659-472f-a0d7-5aaa2c7bf925', '31993312-24e2-4e9b-9fa8-b7c8fd894549'], // Radboud (Nijmegen) → Radboud University
  ['e6b1d69b-06bd-44a3-80d7-8ab7dbbb2ce4', 'dfeccbd4-c6af-57e6-a2a5-d0a311b08187'], // Bocconi (SDA) → Università Bocconi
  ['065f87bb-5101-4244-8433-f3fff3a24ccd', 'dfeccbd4-c6af-57e6-a2a5-d0a311b08187'], // Bocconi Graduate → Università Bocconi
  ]) await mergeSchool(q, campus, school).catch((e) => console.error('[db] merge school', campus, e));
  // Les mêmes écoles tapées à la main dans l'espace ambassadeur (« Neoma Rouen », « IESEG Paris »…), absentes du fichier :
  // reconnues au début de leur nom, pour les seules marques qui ne désignent qu'une école.
  const plainName = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const sameSchool: [RegExp, string][] = [
    [/^neoma\b/, '826a2869-d10b-49e0-a6fa-1a525f42523d'],
    [/^escp\b/, '34839d62-d3f4-4fe1-8319-4d2d126b570a'],
    [/^kedge\b/, '6259d2c9-9a06-4e12-9c73-e704abb1879a'],
    [/^edhec\b/, '94c51031-69d5-43e5-aad0-20ec89e239b0'],
    [/^ieseg\b/, '5490c8e0-9271-419e-820c-e67d5d751220'],
    [/^inseec\b/, '8871d5b1-24a8-4326-93d0-6ff874ecba76'],
    [/^ipsa\b/, 'f954d4d8-574a-473d-8169-6630b38427b1'],
    [/^ynov\b/, 'ec9d0ebf-c205-4d16-8471-7532a0dd902f'],
    [/^(institut )?vatel\b/, 'e6e51769-e876-4121-83f2-bf16f460ea53'],
    [/^em ?lyon\b/, '831e374a-f072-44fa-9c51-f838b56fafab'],
    [/^essec\b/, '7a6a5b54-32c3-4d88-bd1d-160b155e20a9'],
    [/^skema\b/, 'cc5a68c4-d50c-4fc5-805b-76788601b320'],
    [/^ece\b/, 'd5f25c47-3b8e-491a-b721-3ba5a2a72523'],
  ];
  for (const u of await q('select id::text as id, name from universities')) {
    const into = sameSchool.find(([re]) => re.test(plainName(String(u.name))))?.[1];
    if (into && into !== u.id) await mergeSchool(q, String(u.id), into).catch((e) => console.error('[db] merge school', u.id, e));
  }
  // No school shows a campus as its city any more ("All campuses", "Tous campus"), and names typed by hand get their capitals.
  await q(`update universities set state = '' where state ilike '%campus%'`);
  await q(`update universities set name = 'Université Toulouse Capitole' where name = 'Université toulouse capitole'`);

  // The admin account is shown as “Pierre” (ambassador view, invite pages).
  // The old test account (test@test.test) is removed with what hangs on it. Its registrations, if any, stay as
  // history, detached from the account; schools it held become free again.
  const [test] = await q(`select id from users where lower(email) = 'test@test.test'`);
  if (test) {
    const id = test.id;
    await q('update ambassadors set parent_user_id = null where parent_user_id = $1', [id]);
    await q('update registrations set user_id = null where user_id = $1', [id]);
    for (const table of ['commissions', 'payouts', 'school_claims', 'ambassadors', 'certificates', 'exam_attempts', 'quiz_attempts',
      'exercise_submissions', 'lesson_progress', 'sessions', 'login_tokens']) {
      await q(`delete from ${table} where user_id = $1`, [id]);
    }
    await q('delete from users where id = $1', [id]);
    console.log('[db] removed the test@test.test account');
  }

  // A single admin account: the first address of ADMIN_EMAILS. Any other admin goes back to ambassador or student.
  const admin = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).find(Boolean);
  if (admin) {
    await q(`update users set first_name = 'Pierre' where lower(email) = $1 and first_name <> 'Pierre'`, [admin]);
    await q(
      `update users set role = case when exists (select 1 from ambassadors a where a.user_id = users.id) then 'ambassador' else 'student' end
       where role = 'admin' and lower(email) <> $1`,
      [admin],
    );
  }

  const [{ m }] = await q('select count(*)::int as m from intakes');
  if (m === 0) {
    // First cohort: next Monday 08:00 UTC, registration closes the evening before.
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + ((8 - start.getUTCDay()) % 7 || 7));
    start.setUTCHours(8, 0, 0, 0);
    const deadline = new Date(start.getTime() - 9 * 3600 * 1000);
    await q(
      `insert into intakes (id, name, starts_at, registration_deadline, capacity, status)
       values ($1, $2, $3, $4, $5, 'open')`,
      [randomUUID(), `Start ${start.toISOString().slice(0, 10)}`, start.toISOString(), deadline.toISOString(), 100000],
    );
  }
}

async function netlifyConnectionString(): Promise<string | null> {
  try {
    const { getConnectionString } = await import('@netlify/database');
    return getConnectionString();
  } catch {
    return null; // not running on Netlify (or no database provisioned)
  }
}

async function connect(): Promise<Query> {
  let q: Query;
  // Production database: DATABASE_URL if set, otherwise the Netlify Database provisioned for the site
  // (its connection string can rotate, so it is read on every query). Neither: the local PGlite file.
  const netlifyUrl = await netlifyConnectionString();
  if (process.env.DATABASE_URL || netlifyUrl) {
    const { neon } = await import('@neondatabase/serverless');
    const { getConnectionString } = await import('@netlify/database');
    const url = () => process.env.DATABASE_URL || getConnectionString();
    q = (text, params = []) => (neon(url()) as any)(text, params);
    console.log(`[db] using ${process.env.DATABASE_URL ? 'DATABASE_URL' : 'Netlify Database'}`);
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const { mkdirSync } = await import('node:fs');
    mkdirSync('./.data', { recursive: true });
    console.log('[db] using local PGlite');
    const db = new PGlite('./.data/pglite');
    await db.waitReady;
    q = async (text, params = []) => (await db.query<Row>(text, params)).rows;
  }
  // The structure and the seed run once per version of the site, not at every cold start (23/11): a waking server
  // used to send some 70 statements and check every school, one by one, before answering its first page.
  // The fingerprint covers the schema, the schools file, the admin address and the seed code itself.
  const { createHash } = await import('node:crypto');
  const version = createHash('sha256')
    .update([SCHEMA, JSON.stringify(universities), process.env.ADMIN_EMAILS ?? '', seed.toString(), mergeSchool.toString()].join('\u0000'))
    .digest('hex');
  const applied = await q(`select value from schema_meta where key = 'schema'`).then((r) => r[0]?.value, () => undefined);
  if (applied === version) return q;
  for (const statement of SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) {
    await q(statement);
  }
  await seed(q);
  await q('create table if not exists schema_meta (key text primary key, value text not null)');
  await q(`insert into schema_meta (key, value) values ('schema', $1) on conflict (key) do update set value = excluded.value`, [version]);
  console.log('[db] schema and seed applied');
  return q;
}

// One connection per process, kept across hot reloads in development.
const g = globalThis as unknown as { __theaicertDb?: Promise<Query> };

export function sql(text: string, params: unknown[] = []): Promise<Row[]> {
  g.__theaicertDb ??= connect().catch((err) => {
    g.__theaicertDb = undefined; // retry on the next query
    throw err;
  });
  return g.__theaicertDb.then((q) => q(text, params));
}
