import { Cinzel, Cormorant_Garamond, Mrs_Saint_Delafield, Pinyon_Script } from 'next/font/google';
import Logo from '@/components/Logo';
import type { LearnDict } from '@/lib/i18n/learn';

// The learner's certificate, drawn as one SVG (1264 × 816) so it keeps exactly the same layout on every screen and on paper.
// Design chosen on 17/11: ivory paper with guilloché lines, silver ribbons in two corners, holder's name in calligraphy,
// founder's signature, silver “verified” seal.

const serif = Cormorant_Garamond({ subsets: ['latin', 'latin-ext'], weight: ['500', '600'], style: ['normal', 'italic'], variable: '--cert-serif', display: 'swap' });
const caps = Cinzel({ subsets: ['latin', 'latin-ext'], weight: ['500', '600'], variable: '--cert-caps', display: 'swap' });
const calligraphy = Pinyon_Script({ subsets: ['latin', 'latin-ext'], weight: '400', variable: '--cert-name', display: 'swap' });
const signature = Mrs_Saint_Delafield({ subsets: ['latin', 'latin-ext'], weight: '400', variable: '--cert-sign', display: 'swap' });

const SIGNER = 'Pierre Cazaban';
// The founder's signature, drawn as strokes (not written letters): [path, width]. Box about 400 × 110.
const SIGNATURE: [string, number][] = [
  // Large opening loop, swept from the left
  ['M 34 84 C 4 70, 18 34, 92 22 C 160 11, 206 24, 182 48 C 160 70, 96 76, 58 66 C 40 61, 44 50, 66 46', 1.9],
  // Tall downstrokes, slightly slanted
  ['M 120 14 C 116 44, 108 76, 96 108', 2.3],
  ['M 146 30 C 142 52, 136 76, 128 98', 1.5],
  // Fast scribble of the name
  ['M 128 78 C 140 50, 156 42, 152 64 C 148 84, 164 80, 172 56 C 178 38, 188 42, 184 64 C 181 82, 198 78, 208 54 C 214 40, 222 40, 218 58 C 214 76, 230 76, 242 60', 1.7],
  // Long rising tail that comes back and crosses
  ['M 242 60 C 268 30, 312 14, 344 18 C 360 20, 352 32, 330 42 C 290 60, 240 82, 206 100', 1.6],
  // Underline flourish
  ['M 52 96 C 150 84, 270 72, 368 62', 1.2],
  ['M 280 76 C 312 71, 342 68, 372 66', .7],
];
const W = 1264;
const C = W / 2;
const INK = '#2B3142';
const MUTED = '#4C5263';
const GOLD = '#B8955A';
const SANS = '"Manrope Variable", Manrope, system-ui, sans-serif';
const SERIF = 'var(--cert-serif), "Cormorant Garamond", Georgia, serif';

type Props = { holder: string; title: string; reference: string; issuedOn: string; verifyUrl: string; l: LearnDict };

// Thin wavy lines of the paper, sweeping from one corner.
function guilloche(flip: boolean) {
  return Array.from({ length: 34 }, (_, i) => {
    const o = i * 9;
    const d = `M ${-20} ${430 + o} C ${260} ${300 + o * 0.6}, ${420} ${860 - o * 0.3}, ${760} ${840 - o * 0.1}`;
    return <path key={i} d={d} transform={flip ? `rotate(180 ${C} 408)` : undefined} />;
  });
}

// The silver seal: serrated rim, ring text, TAC, gold laurels and VERIFIED.
function Seal({ x, y }: { x: number; y: number }) {
  const teeth = Array.from({ length: 72 }, (_, i) => {
    const a = (i * Math.PI) / 36;
    const r = i % 2 ? 72 : 79;
    return `${(r * Math.sin(a)).toFixed(2)},${(-r * Math.cos(a)).toFixed(2)}`;
  }).join(' ');
  // Two laurel branches under TAC, leaves set along an arc and turned along it.
  const leaves = (side: 1 | -1) =>
    Array.from({ length: 7 }, (_, i) => {
      const phi = 18 + i * 15;
      const r = (phi * Math.PI) / 180;
      const px = (side * 31 * Math.sin(r)).toFixed(1);
      const py = (2 + 29 * Math.cos(r)).toFixed(1);
      return <ellipse key={i} cx={px} cy={py} rx="2.4" ry="5.6" transform={`rotate(${side * (90 - phi) + side * 30} ${px} ${py})`} />;
    });
  return (
    <g transform={`translate(${x} ${y})`}>
      <polygon points={teeth} fill="url(#c-silver)" stroke="#9EA3AE" strokeWidth=".6" filter="url(#c-shadow)" />
      <circle r="66" fill="url(#c-silver-in)" stroke="#A9AEB8" strokeWidth="1" />
      <circle r="60" fill="none" stroke="#B9BDC6" strokeWidth=".8" />
      <circle r="43" fill="#FBFAF7" stroke={GOLD} strokeWidth="1.1" />
      <path id="c-seal-top" d="M -51,0 A 51,51 0 0,1 51,0" fill="none" />
      <path id="c-seal-bottom" d="M -53,0 A 53,53 0 0,0 53,0" fill="none" />
      <text fill="#5B6070" fontSize="9" fontWeight="600" letterSpacing="2.2" style={{ fontFamily: SANS }}>
        <textPath href="#c-seal-top" startOffset="50%" textAnchor="middle">THE AI CERTIFICATION</textPath>
      </text>
      <text fill="#5B6070" fontSize="9" fontWeight="600" letterSpacing="2.6" style={{ fontFamily: SANS }} dy="7">
        <textPath href="#c-seal-bottom" startOffset="50%" textAnchor="middle">VERIFIED</textPath>
      </text>
      <text y="4" textAnchor="middle" fill={INK} fontSize="22" fontWeight="600" letterSpacing="1" style={{ fontFamily: 'var(--cert-caps), serif' }}>TAC</text>
      <g fill={GOLD}>{leaves(1)}{leaves(-1)}</g>
    </g>
  );
}

export default function Certificate({ holder, title, reference, issuedOn, verifyUrl, l }: Props) {
  // The calligraphy is wide: long names get a smaller size so they stay between the flourishes.
  const nameSize = Math.min(124, Math.round(1800 / Math.max(holder.length, 6)));
  const titleSize = title.length > 26 ? 36 : title.length > 18 ? 44 : 54;
  const info = [
    [l.certIdLabel, reference],
    [l.certIssueLabel, issuedOn],
    [l.certVerifyLabel, verifyUrl.replace(/^https?:\/\//, '')],
  ];
  return (
    <article className={`certificate ${serif.variable} ${caps.variable} ${calligraphy.variable} ${signature.variable}`}>
      <svg className="certificate-svg" viewBox={`0 0 ${W} 816`} role="img" aria-label={`${l.certKicker} · ${holder} · ${title}`}>
        <defs>
          <linearGradient id="c-silver" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#F2F3F6" /><stop offset=".45" stopColor="#C9CDD5" /><stop offset=".7" stopColor="#E6E8EC" /><stop offset="1" stopColor="#A4A9B4" />
          </linearGradient>
          <radialGradient id="c-silver-in" cx=".4" cy=".35" r=".8">
            <stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#D9DCE2" />
          </radialGradient>
          <linearGradient id="c-ribbon" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#A3A9B5" /><stop offset=".55" stopColor="#D3D6DD" /><stop offset="1" stopColor="#B4B9C3" />
          </linearGradient>
          <radialGradient id="c-paper" cx=".5" cy=".5" r=".62">
            <stop offset="0" stopColor="#FDFCFA" /><stop offset=".75" stopColor="#FAF8F3" /><stop offset="1" stopColor="#F3EFE7" />
          </radialGradient>
          <filter id="c-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#5B6070" floodOpacity=".28" />
          </filter>
        </defs>

        {/* Paper, guilloché, ribbons, frame */}
        <rect width={W} height="816" fill="url(#c-paper)" />
        <g fill="none" stroke="#E4D9C6" strokeWidth=".7" opacity=".75">{guilloche(false)}{guilloche(true)}</g>
        <g>
          <path d="M0 0 H300 C220 40 120 110 0 200 Z" fill="url(#c-ribbon)" />
          <path d="M0 0 H235 C165 40 90 95 0 160 Z" fill="#9AA0AD" opacity=".55" />
          <path d="M0 0 H150 C105 30 55 70 0 108 Z" fill="#7F8696" opacity=".5" />
          <path d="M0 200 C120 110 220 40 300 0 H360 C260 50 140 130 0 240 Z" fill="#E7E3DA" opacity=".6" />
          <path d="M300 0 C220 40 120 110 0 200" fill="none" stroke={GOLD} strokeWidth="1" opacity=".7" />
          <path d="M330 0 C240 50 130 125 0 228" fill="none" stroke="#D4C6AE" strokeWidth=".8" opacity=".7" />
        </g>
        <g transform={`rotate(180 ${C} 408)`}>
          <path d="M0 0 H300 C220 40 120 110 0 200 Z" fill="url(#c-ribbon)" />
          <path d="M0 0 H235 C165 40 90 95 0 160 Z" fill="#9AA0AD" opacity=".55" />
          <path d="M0 0 H150 C105 30 55 70 0 108 Z" fill="#7F8696" opacity=".5" />
          <path d="M0 200 C120 110 220 40 300 0 H360 C260 50 140 130 0 240 Z" fill="#E7E3DA" opacity=".6" />
          <path d="M300 0 C220 40 120 110 0 200" fill="none" stroke={GOLD} strokeWidth="1" opacity=".7" />
          <path d="M330 0 C240 50 130 125 0 228" fill="none" stroke="#D4C6AE" strokeWidth=".8" opacity=".7" />
        </g>
        <rect x="10" y="10" width={W - 20} height="796" fill="none" stroke="#A7ACB7" strokeWidth="1.4" />
        <rect x="21" y="21" width={W - 42} height="774" fill="none" stroke="#CFC6B4" strokeWidth=".8" />
        <g fill="none" stroke={GOLD} strokeWidth="1.4">
          <path d="M30 54 V30 H54" /><path d={`M${W - 54} 30 H${W - 30} V54`} />
          <path d={`M30 762 V786 H54`} /><path d={`M${W - 54} 786 H${W - 30} V762`} />
        </g>

        {/* Brand: TAC | The AI Certification */}
        <g transform="translate(488 56)" style={{ color: INK, ['--logo-accent' as string]: INK }}>
          <Logo variant="wordmark" height={56} title="" />
        </g>
        <line x1="633" y1="50" x2="633" y2="120" stroke={INK} strokeWidth="1.2" />
        <g fill={INK} style={{ fontFamily: SANS }} fontSize="21" fontWeight="500">
          <text x="651" y="84">The AI</text>
          <text x="651" y="109">Certification</text>
        </g>

        {/* Kicker */}
        <g stroke="#CDBFA6" strokeWidth="1"><line x1="105" y1="163" x2="272" y2="163" /><line x1="992" y1="163" x2="1159" y2="163" /></g>
        <text x={C} y="169" textAnchor="middle" fill={INK} fontSize="16.5" fontWeight="500" letterSpacing="5.2" style={{ fontFamily: SANS }}>{l.certKicker.toUpperCase()}</text>

        <text x={C} y="219" textAnchor="middle" fill={MUTED} fontSize="25" fontStyle="italic" style={{ fontFamily: SERIF }}>{l.certCertify}</text>

        {/* Holder, in calligraphy, between two flourishes */}
        <text x={C} y="322" textAnchor="middle" fill="#3A3F4E" fontSize={nameSize} style={{ fontFamily: 'var(--cert-name), cursive' }}>{holder}</text>
        <g fill="none" stroke="#3A3F4E" strokeLinecap="round">
          <path d="M384 354 C470 344 560 337 650 334 C740 331 810 333 846 336" strokeWidth="1.4" />
          <path d="M440 346 C560 350 680 352 880 342" strokeWidth=".8" opacity=".8" />
        </g>

        <text x={C} y="396" textAnchor="middle" fill={MUTED} fontSize="21.5" fontStyle="italic" style={{ fontFamily: SERIF }}>{l.certCompleted}</text>

        {/* Programme */}
        <text x={C} y="462" textAnchor="middle" fill={INK} fontSize={titleSize} fontWeight="600" letterSpacing="6" style={{ fontFamily: 'var(--cert-caps), serif' }}>{title.toUpperCase()}</text>
        <g stroke="#CDBFA6" strokeWidth="1"><line x1="378" y1="486" x2="614" y2="486" /><line x1="650" y1="486" x2="886" y2="486" /></g>
        <path d={`M${C} 476 C${C + 1.5} 483 ${C + 3} 484.5 ${C + 10} 486 C${C + 3} 487.5 ${C + 1.5} 489 ${C} 496 C${C - 1.5} 489 ${C - 3} 487.5 ${C - 10} 486 C${C - 3} 484.5 ${C - 1.5} 483 ${C} 476 Z`} fill={GOLD} />
        <text x={C} y="517" textAnchor="middle" fill={INK} fontSize="15" fontWeight="500" letterSpacing="6" style={{ fontFamily: SANS }}>{l.certType.toUpperCase()}</text>

        {/* Signature */}
        <g transform="translate(118 528)" fill="none" stroke="#1F2438" strokeLinecap="round" strokeLinejoin="round">
          {SIGNATURE.map(([d, w], i) => <path key={i} d={d} strokeWidth={w} />)}
        </g>
        <line x1="108" y1="631" x2="490" y2="631" stroke="#6E7385" strokeWidth=".9" />
        <text x="300" y="668" textAnchor="middle" fill={INK} fontSize="15.5" fontWeight="600" letterSpacing="1.2" style={{ fontFamily: SERIF }}>{SIGNER.toUpperCase()}</text>
        <text x="300" y="691" textAnchor="middle" fill={MUTED} fontSize="15.5" fontStyle="italic" style={{ fontFamily: SERIF }}>{l.certSignerRole}</text>

        <Seal x={C} y={632} />
        <line x1="766" y1="588" x2="766" y2="700" stroke="#8C91A0" strokeWidth="1" />

        {/* ID, date, verification */}
        {info.map(([label, value], i) => (
          <text key={label} x="802" y={627 + i * 27} fill={INK} fontSize="12.5" style={{ fontFamily: SANS }}>
            <tspan fontWeight="500" letterSpacing="1.1">{label.toUpperCase()}: </tspan>
            <tspan fontSize={i === 2 ? 12 : 14.5} style={{ fontFamily: SERIF }} fontWeight="500" letterSpacing="0">{value}</tspan>
          </text>
        ))}

        {/* Motto */}
        <g stroke="#CDBFA6" strokeWidth="1"><line x1="108" y1="761" x2="404" y2="761" /><line x1="860" y1="761" x2="1156" y2="761" /></g>
        <text x={C} y="766" textAnchor="middle" fill={INK} fontSize="14" fontWeight="500" letterSpacing="5.5" style={{ fontFamily: SANS }}>
          {l.certMotto.toUpperCase().split(' · ').join('  •  ')}
        </text>
      </svg>
    </article>
  );
}
