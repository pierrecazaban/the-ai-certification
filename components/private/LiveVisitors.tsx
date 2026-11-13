'use client';

import { useEffect, useState } from 'react';

type Live = { total: number; pages: { path: string; n: number }[] };

// Admin KPI: how many people have the site open right now, refreshed every 10 seconds.
export default function LiveVisitors() {
  const [live, setLive] = useState<Live | null>(null);

  useEffect(() => {
    let stop = false;
    const load = () =>
      fetch('/api/live', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (!stop && d) setLive(d); })
        .catch(() => {});
    load();
    const t = setInterval(load, 10_000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  const top = live?.pages.slice(0, 3).map((p) => `${p.path} (${p.n})`).join(' · ');
  return (
    <div className="cx-kpi cx-live">
      <span><i className="cx-live-dot" aria-hidden /> Live visitors</span>
      <strong>{live ? live.total : '…'}</strong>
      <small>{live?.total ? top : 'On the site right now · updates every 10 s'}</small>
    </div>
  );
}
