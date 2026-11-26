import 'server-only';
import { sql } from './db';

// Answers to the "become an ambassador?" question asked before the certificate (24/11). One row per learner: yes with
// the network and handle to reach them on, or no. The owner contacts those who said yes himself (admin › Prospection).
export type Lead = {
  user_id: string;
  program: string;
  interested: boolean;
  network: string;
  handle: string;
  schools: string;
  answered_at: string;
  contacted_at: string | null;
};

export type LeadRow = Lead & { email: string; holder_name: string | null; rating: number | null; school: string | null };

/** The learner's answer, or null while they have not answered. */
export async function getLead(userId: string): Promise<Lead | null> {
  const [r] = await sql('select * from ambassador_leads where user_id = $1', [userId]);
  return (r as Lead | undefined) ?? null;
}

/** Saves the answer once: answering again changes nothing. True when this call is the one that wrote it. */
export async function saveLead(input: { userId: string; program: string; interested: boolean; network: string; handle: string; schools: string }) {
  const rows = await sql(
    `insert into ambassador_leads (user_id, program, interested, network, handle, schools) values ($1, $2, $3, $4, $5, $6)
     on conflict (user_id) do nothing returning user_id`,
    [input.userId, input.program, input.interested, input.network, input.handle, input.schools],
  );
  return rows.length > 0;
}

/** Those who said yes, the ones still to contact first. */
export async function leads(): Promise<LeadRow[]> {
  const rows = await sql(
    `select l.*, u.email, c.holder_name, c.rating,
       (select coalesce(nullif(un.short_name, ''), un.name) from registrations r join universities un on un.id = r.university_id
         where r.user_id = l.user_id order by r.created_at desc limit 1) as school
     from ambassador_leads l join users u on u.id = l.user_id
     left join certificates c on c.user_id = l.user_id and c.program = l.program
     where l.interested order by (l.contacted_at is not null), l.answered_at desc limit 300`,
  );
  return rows as LeadRow[];
}

/** How many answered yes and no, to see how the question converts. */
export async function leadCounts() {
  const [r] = await sql(
    `select count(*) filter (where interested)::int as yes, count(*) filter (where not interested)::int as no from ambassador_leads`,
  );
  return { yes: Number(r.yes), no: Number(r.no) };
}

/** Said yes and not contacted yet: counted in the red dot of the admin. */
export async function leadsToContactCount() {
  const [r] = await sql('select count(*)::int as n from ambassador_leads where interested and contacted_at is null');
  return r.n as number;
}

/** The owner got in touch; `done = false` puts the learner back in the list to contact. */
export async function markLeadContacted(userId: string, done = true) {
  await sql(`update ambassador_leads set contacted_at = ${done ? 'coalesce(contacted_at, now())' : 'null'} where user_id = $1`, [userId]);
}
