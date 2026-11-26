import { Suspense } from 'react';
import { toContactCount } from '@/lib/outreach';
import { leadsToContactCount } from '@/lib/ambassadorLeads';

// The red dot on “Admin view” and on the Prospection tab: students who gave a contact and whom Pierre has not called
// yet, plus (24/11) the certified learners who asked to become ambassadors.
async function Count() {
  const [given, wanting] = await Promise.all([toContactCount().catch(() => 0), leadsToContactCount().catch(() => 0)]);
  const n = given + wanting;
  return n ? <span className="cx-dot" title={`${n} personne${n > 1 ? 's' : ''} à contacter`} aria-label={`${n} à contacter`}>{n}</span> : null;
}

export default function ToContactBadge() {
  return <Suspense fallback={null}><Count /></Suspense>;
}
