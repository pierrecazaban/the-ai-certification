'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Tells the server this tab is open (live visitor counter in the admin console). The server ignores the private pages.
export default function LiveBeacon() {
  const path = usePathname() || '/';

  useEffect(() => {
    let vid = '';
    try { vid = sessionStorage.getItem('live_vid') ?? ''; } catch {}
    if (!vid) {
      vid = Math.random().toString(36).slice(2) + Date.now().toString(36);
      try { sessionStorage.setItem('live_vid', vid); } catch {}
    }
    const send = (leave = false) => {
      const body = JSON.stringify({ vid, path, leave });
      if (leave && navigator.sendBeacon) navigator.sendBeacon('/api/live', new Blob([body], { type: 'application/json' }));
      else fetch('/api/live', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    };
    const ping = () => { if (document.visibilityState === 'visible') send(); };
    ping();
    const timer = setInterval(ping, 30_000);
    const onVis = () => (document.visibilityState === 'visible' ? send() : send(true));
    const onHide = () => send(true);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
    };
  }, [path]);

  return null;
}
