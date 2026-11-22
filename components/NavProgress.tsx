'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

// A thin bar at the top while the next page is on its way. It replaces the full-screen turning logo: the current
// page stays on screen until the new one is ready.
export default function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [busy, setBusy] = useState(false);

  // The address changed: the new page is there.
  useEffect(() => { setBusy(false); }, [pathname, search]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => { setBusy(true); clearTimeout(timer); timer = setTimeout(() => setBusy(false), 12000); };
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const to = new URL(a.href, location.href);
      if (to.origin !== location.origin) return;
      if (to.pathname === location.pathname && to.search === location.search) return; // same page (or just an anchor)
      start();
    };
    // Capture phase: Next's own link handler cancels the click before it would reach a normal listener.
    document.addEventListener('click', onClick, true);
    return () => { document.removeEventListener('click', onClick, true); clearTimeout(timer); };
  }, []);

  return busy ? <div className="nav-progress" role="progressbar" aria-label="Loading" /> : null;
}
