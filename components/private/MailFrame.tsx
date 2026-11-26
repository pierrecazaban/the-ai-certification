'use client';

import { useEffect, useRef, useState } from 'react';

// One mail of the admin's « mails sent to this person » page (23/11), shown at its full height so the page scrolls
// from one mail to the next instead of scrolling inside each frame. Sandboxed without scripts: the frame is only
// same-origin so its height can be read.
export default function MailFrame({ html, title }: { html: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(640);
  const measure = () => {
    const doc = ref.current?.contentDocument;
    if (doc?.documentElement) setHeight(Math.min(3000, Math.max(160, doc.documentElement.scrollHeight + 2)));
  };
  useEffect(() => {
    measure();
    const timers = [300, 1200].map((ms) => setTimeout(measure, ms)); // once the images of the mail are in
    return () => timers.forEach(clearTimeout);
  }, [html]);
  return <iframe ref={ref} className="cx-email" sandbox="allow-same-origin" srcDoc={html} title={title} style={{ height }} onLoad={measure} />;
}
