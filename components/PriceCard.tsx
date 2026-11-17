import Link from 'next/link';
import { dict } from '@/lib/i18n';
import { registerPath, type Locale } from '@/lib/locales';

type Props = {
  locale: Locale;
  price: string;
  fullPrice: string;
  funding: string;
  taxLabel: string;
  status: 'open' | 'closed' | 'full' | null;
  closesOn: string | null; // formatted date, only when registration is open
};

const svg = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

export default function PriceCard({ locale, price, fullPrice, funding, taxLabel, status, closesOn }: Props) {
  const t = dict(locale).price;
  const open = status === 'open';
  return (
    <aside className="pass pc" id="reserve" aria-labelledby="reserve-title">
      <h2 id="reserve-title" className="pc-label">{t.standard}</h2>
      <div className="pc-std">
        <s className="pc-old">{fullPrice}</s>
        <span className="pc-std-note">{t.standardNote}</span>
      </div>

      <div className="pc-fund">
        <span className="pc-gift">
          <svg {...svg}><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" /></svg>
        </span>
        <div className="pc-fund-text">
          <strong>{t.fundTitle}</strong>
          <span>{t.fundSub}</span>
        </div>
        <b className="pc-fund-amount">−&nbsp;{funding}</b>
      </div>

      <hr className="pc-rule" />

      <p className="pc-label">{t.dueToday}</p>
      <p className="pc-due">
        <span className="pc-amount">{price}</span>
        <span className="pc-fee">{t.fee}</span>
      </p>
      <p className="pc-sub">{t.feeNote1}<br />{t.feeNote2}</p>
      <p className="pc-tax">{taxLabel}</p>

      {!open && <p className="pass-closed">{status === 'full' ? t.full : t.closed}</p>}

      <Link className="pc-cta" href={registerPath(locale)}>
        {open ? t.ctaSeat : status === 'full' ? t.ctaFull : t.ctaClosed}
        <svg {...svg} width={20} height={20}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </Link>
      {open && closesOn && <p className="pc-left">{t.closesLine} {closesOn}</p>}

      <hr className="pc-rule" />

      <ul className="pc-trust">
        <li><svg {...svg}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /><circle cx="12" cy="16" r="1" /></svg>{t.trustPay}</li>
        <li><svg {...svg}><path d="M2 8.8a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" /><circle cx="12" cy="19.5" r="0.8" /></svg>{t.trustOnline}</li>
        <li><svg {...svg}><path d="M22 10 12 5 2 10l10 5 10-5Z" /><path d="M6 12v5c3 2 9 2 12 0v-5" /></svg>{t.trustIndep}</li>
      </ul>
    </aside>
  );
}
