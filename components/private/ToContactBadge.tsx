import { Suspense } from 'react';
import { toContactCount } from '@/lib/outreach';

// The red dot on “Admin view” and on the Prospection tab: students who gave a contact and whom Pierre has not called yet.
async function Count() {
  const n = await toContactCount().catch(() => 0);
  return n ? <span className="cx-dot" title={`${n} personne${n > 1 ? 's' : ''} à contacter`} aria-label={`${n} à contacter`}>{n}</span> : null;
}

export default function ToContactBadge() {
  return <Suspense fallback={null}><Count /></Suspense>;
}
