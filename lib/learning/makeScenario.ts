// Reproduction de l'écran de Make pour l'exercice du module 3 (24/11) : le scénario à construire, tel qu'il apparaît
// dans l'éditeur de Make (modules ronds aux couleurs des applications, liaisons en pointillés, filtre sur la liaison,
// bulles après « Run once », barre du bas). Demandé après l'avis d'un élève : « J'ai eu des problèmes sur Make ».
// Les libellés de l'écran restent en anglais, comme dans Make ; seuls le nom du scénario et la légende (dans le
// composant) sont dans la langue de l'élève. Icônes dessinées ici (pas les logos des éditeurs).
// Fonction pure qui renvoie du SVG : utilisée par la page du module et par le fascicule (scripts/fascicules.mjs).

type Lang = 'fr' | 'en';

const MAKE = '#6D00CC'; // violet de Make
const SHEETS = '#0FA35B'; // vert du module Google Sheets
const INK = '#1B1B2B';
const GREY = '#6B7280';
const GOLD = '#F5B82E'; // repères de la légende : jaune d'or des modules du cours
const NAVY = '#17274C';

type Mod = { app: string; action: string[]; color: string; icon: 'sheet' | 'spark'; trigger?: boolean };

const MODULES: Mod[] = [
  { app: 'Google Sheets', action: ['Watch New Rows'], color: SHEETS, icon: 'sheet', trigger: true },
  { app: 'Make AI Toolkit', action: ['Extract information', 'from text'], color: MAKE, icon: 'spark' },
  { app: 'Google Sheets', action: ['Add a Row'], color: SHEETS, icon: 'sheet' },
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n = (v: number) => (Math.round(v * 10) / 10).toString();

/** Mélange deux couleurs #RRGGBB (t de 0 à 1) : les pointillés passent de la couleur d'un module à celle du suivant. */
function mix(a: string, b: string, t: number) {
  const p = (c: string, i: number) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
  return '#' + [0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, '0')).join('');
}

function icon(kind: Mod['icon'], cx: number, cy: number, s: number) {
  if (kind === 'sheet') {
    // Une feuille de tableur : cadre arrondi, ligne d'en-tête pleine, quadrillage.
    const w = 0.74 * s, h = 0.92 * s, x = cx - w / 2, y = cy - h / 2, r = 0.09 * s, sw = 0.075 * s;
    const row = (k: number) => y + (h * k) / 4;
    return `<g fill="none" stroke="#fff" stroke-width="${n(sw)}" stroke-linejoin="round">
      <rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(r)}"/>
      <path d="M${n(x)} ${n(row(1))}H${n(x + w)}M${n(x)} ${n(row(2))}H${n(x + w)}M${n(x)} ${n(row(3))}H${n(x + w)}M${n(cx)} ${n(row(1))}V${n(y + h)}"/>
    </g><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h / 4)}" rx="${n(r)}" fill="#fff" opacity=".92"/>`;
  }
  // Étincelles de l'IA : une grande étoile à quatre branches et deux petites.
  const star = (x: number, y: number, r: number) =>
    `<path d="M${n(x)} ${n(y - r)}Q${n(x + r * 0.16)} ${n(y - r * 0.16)} ${n(x + r)} ${n(y)}Q${n(x + r * 0.16)} ${n(y + r * 0.16)} ${n(x)} ${n(y + r)}Q${n(x - r * 0.16)} ${n(y + r * 0.16)} ${n(x - r)} ${n(y)}Q${n(x - r * 0.16)} ${n(y - r * 0.16)} ${n(x)} ${n(y - r)}Z"/>`;
  return `<g fill="#fff">${star(cx - 0.1 * s, cy + 0.06 * s, 0.46 * s)}${star(cx + 0.36 * s, cy - 0.36 * s, 0.2 * s)}${star(cx + 0.38 * s, cy + 0.38 * s, 0.13 * s)}</g>`;
}

/** Repère numéroté de la légende (pastille jaune d'or, chiffre marine). */
const marker = (x: number, y: number, k: number, r: number) =>
  `<g><circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${GOLD}" stroke="#fff" stroke-width="2"/><text x="${n(x)}" y="${n(y + r * 0.36)}" text-anchor="middle" font-size="${n(r * 1.08)}" font-weight="800" fill="${NAVY}">${k}</text></g>`;

/** Où poser un repère « clique ici » (anneau doré + numéro) dans le tuto pas à pas (26/11). */
export type CanvasMark = { at: 'plus' | 'link12' | 'link23' | 'run' | 'bubble1' | 'bubble2' | 'bubble3'; n: number };

/**
 * Réglages du canevas pour le tuto pas à pas : le scénario à chaque stade de sa construction. Sans réglages, l'écran
 * est celui d'origine (trois modules, le filtre, des bulles « 1 » et les repères 1 à 5 de la légende).
 */
export type CanvasOpts = {
  modules?: 0 | 1 | 2 | 3;
  filter?: boolean;
  bubbles?: (number | null)[] | null;
  legend?: boolean;
  marks?: CanvasMark[];
};

/**
 * Le scénario de l'exercice dans l'éditeur de Make.
 * compact : mise en page pour téléphone (trois modules sur 360 px de large, textes plus gros à l'échelle).
 * grid : le fond à points du canevas (à l'écran ; retiré dans le fascicule, où un motif s'imprime mal).
 */
export function makeScenarioSvg(lang: Lang, compact = false, grid = true, opts: CanvasOpts = {}): string {
  const count = opts.modules ?? 3;
  const showFilter = (opts.filter ?? true) && count === 3;
  const bubbles = opts.bubbles === null ? null : opts.bubbles ?? [1, 1, 1];
  const shown = MODULES.slice(0, count);
  const W = compact ? 360 : 720;
  const H = compact ? 296 : 400;
  const r = compact ? 30 : 46;
  const cy = compact ? 126 : 176;
  const xs = compact ? [58, 180, 302] : [140, 360, 580];
  const fName = compact ? 11.8 : 15.5;
  const fAct = compact ? 10.4 : 13;
  const title = lang === 'fr' ? 'Mon premier workflow' : 'My first workflow';
  const label = lang === 'fr' ? 'Reproduction de l’éditeur de Make : un scénario en trois modules, avec un filtre' : 'A reproduction of the Make editor: a scenario of three modules, with a filter';
  // Identifiants propres à chaque mise en page : les deux SVG sont dans la même page (l'un caché selon l'écran), et un
  // dégradé défini dans un SVG caché ne s'appliquerait pas à l'autre.
  const id = (compact ? 'mkc' : 'mkw') + (opts.modules === undefined && !opts.marks ? '' : `-${count}${showFilter ? 'f' : ''}${(opts.marks ?? []).map((m) => m.at).join('')}`);
  const out: string[] = [];

  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}" font-family="'Manrope Variable','Manrope',system-ui,-apple-system,'Segoe UI',sans-serif">`);
  out.push(`<defs>
    <radialGradient id="${id}-shine" cx="32%" cy="26%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity=".26"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <linearGradient id="${id}-run" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8A1FE0"/><stop offset="1" stop-color="${MAKE}"/></linearGradient>
    <pattern id="${id}-grid" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#DDDAE8"/></pattern>
  </defs>`);
  // La zone de travail : fond très clair à points, comme le canevas de Make.
  out.push(`<rect width="${W}" height="${H}" rx="18" fill="#F6F5FA"/>${grid ? `<rect width="${W}" height="${H}" rx="18" fill="url(#${id}-grid)" opacity=".7"/>` : ''}`);

  // Barre du haut : retour, nom du scénario, menu.
  const top = compact ? 30 : 34;
  out.push(`<g>
    <circle cx="${compact ? 26 : 34}" cy="${top}" r="${compact ? 13 : 15}" fill="${MAKE}"/>
    <path d="M${compact ? 29 : 38} ${top}H${compact ? 21 : 29}m4 -4.5l-4.5 4.5l4.5 4.5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="${compact ? 48 : 60}" y="${top + 5}" font-size="${compact ? 14 : 16.5}" font-weight="700" fill="${INK}">${esc(title)}</text>
    <g fill="#9AA0AE"><circle cx="${W - (compact ? 40 : 52)}" cy="${top}" r="2.4"/><circle cx="${W - (compact ? 31 : 42)}" cy="${top}" r="2.4"/><circle cx="${W - (compact ? 22 : 32)}" cy="${top}" r="2.4"/></g>
  </g>`);

  // Liaisons en pointillés (des ronds, comme dans Make), de la couleur d'un module à celle du suivant.
  const dots: number = compact ? 3 : 7;
  const dr = compact ? 3.6 : 5.2;
  for (let i = 0; i < shown.length - 1; i++) {
    const a = xs[i] + r + (compact ? 7 : 10), b = xs[i + 1] - r - (compact ? 7 : 10);
    const withFilter = i === 1 && showFilter;
    for (let k = 0; k < dots; k++) {
      const t = dots === 1 ? 0.5 : k / (dots - 1);
      const x = a + (b - a) * t;
      // La place du filtre reste libre au milieu de la deuxième liaison.
      if (withFilter && Math.abs(x - (a + b) / 2) < (compact ? 11 : 16)) continue;
      out.push(`<circle cx="${n(x)}" cy="${cy}" r="${dr}" fill="${mix(MODULES[i].color, MODULES[i + 1].color, t)}" opacity=".5"/>`);
    }
    if (withFilter) {
      // Le filtre : un entonnoir posé sur la liaison, sa condition écrite dessous.
      const fx = (a + b) / 2, fr = compact ? 10.5 : 14, u = fr / 14;
      out.push(`<g><circle cx="${n(fx)}" cy="${cy}" r="${fr}" fill="#fff" stroke="#C9CEDA" stroke-width="1.4"/>
        <path d="M${n(fx - 6.5 * u)} ${n(cy - 5.5 * u)}H${n(fx + 6.5 * u)}L${n(fx + 1.8 * u)} ${n(cy + 0.4 * u)}V${n(cy + 6 * u)}L${n(fx - 1.8 * u)} ${n(cy + 4.2 * u)}V${n(cy + 0.4 * u)}Z" fill="#5B6170"/>
        <text x="${n(fx + (compact ? 2 : 0))}" y="${n(cy + fr + (compact ? 15 : 17))}" text-anchor="middle" font-size="${compact ? 10 : 12.8}" font-weight="700" fill="#4A5370">score ≥ 70</text></g>`);
    }
  }

  // Les modules : rond de la couleur de l'application, icône blanche, nom, numéro et action dessous.
  shown.forEach((m, i) => {
    const cx = xs[i];
    out.push(`<g>
      <ellipse cx="${cx}" cy="${n(cy + r + 5)}" rx="${n(r * 0.78)}" ry="${n(r * 0.17)}" fill="#1B1B2B" opacity=".1"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="${m.color}"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-shine)"/>
      ${icon(m.icon, cx, cy, r * 0.86)}`);
    if (m.trigger) {
      // Le déclencheur porte une petite horloge : il tourne selon la planification.
      const bx = cx - r * 0.72, by = cy + r * 0.72, br = compact ? 10 : 13;
      out.push(`<circle cx="${n(bx)}" cy="${n(by)}" r="${br}" fill="#fff" stroke="#D5D9E2" stroke-width="1.3"/>
        <circle cx="${n(bx)}" cy="${n(by)}" r="${n(br * 0.52)}" fill="none" stroke="${GREY}" stroke-width="1.5"/>
        <path d="M${n(bx)} ${n(by - br * 0.3)}V${n(by)}H${n(bx + br * 0.26)}" fill="none" stroke="${GREY}" stroke-width="1.5" stroke-linecap="round"/>`);
    }
    // Bulle après « Run once » : le nombre d'opérations du module (1 dans l'écran d'origine).
    const ux = cx + r * 0.78, uy = cy - r * 0.86, ur = compact ? 10 : 13;
    const bubble = bubbles ? bubbles[i] : null;
    if (bubble !== null && bubble !== undefined) out.push(`<path d="M${n(ux - ur * 0.5)} ${n(uy + ur * 0.75)}l${n(-ur * 0.55)} ${n(ur * 0.75)}l${n(ur * 1.0)} ${n(-ur * 0.45)}Z" fill="#fff" stroke="${m.color}" stroke-width="1.6" stroke-linejoin="round"/>
      <circle cx="${n(ux)}" cy="${n(uy)}" r="${ur}" fill="#fff" stroke="${m.color}" stroke-width="1.8"/>
      <text x="${n(ux)}" y="${n(uy + ur * 0.38)}" text-anchor="middle" font-size="${n(ur * 1.05)}" font-weight="800" fill="${INK}">${bubble}</text>`);
    // Nom de l'application, numéro du module dans une pastille, puis l'action.
    const ny = cy + r + (compact ? 23 : 31);
    if (compact) {
      // Sur téléphone, pas de pastille de numéro : les trois noms tiennent côte à côte.
      out.push(`<text x="${cx}" y="${n(ny)}" text-anchor="middle" font-size="${fName}" font-weight="700" fill="${INK}">${esc(m.app)}</text>`);
    } else {
      const half = (m.app.length * fName * 0.53) / 2;
      const bw = 18;
      out.push(`<text x="${n(cx - bw / 2 - 2)}" y="${n(ny)}" text-anchor="middle" font-size="${fName}" font-weight="700" fill="${INK}">${esc(m.app)}</text>
      <rect x="${n(cx + half - bw / 2 + 2)}" y="${n(ny - bw * 0.78)}" width="${bw}" height="${bw}" rx="${n(bw / 2)}" fill="#E4E2EE"/>
      <text x="${n(cx + half + 2)}" y="${n(ny - bw * 0.78 + bw * 0.72)}" text-anchor="middle" font-size="${n(bw * 0.62)}" font-weight="700" fill="#5B6170">${i + 1}</text>`);
    }
    m.action.forEach((line, k) => {
      out.push(`<text x="${cx}" y="${n(ny + (compact ? 14 : 19) + k * (compact ? 12.5 : 16))}" text-anchor="middle" font-size="${fAct}" fill="${GREY}">${esc(line)}</text>`);
    });
    out.push('</g>');
  });

  // Le « + » qui propose d'ajouter un module à la suite (écran large seulement quand les trois modules sont là).
  // Canevas vide : le gros « + » violet du milieu, comme dans un scénario neuf.
  let plusAt: [number, number] | null = null;
  if (count === 0) {
    const px = W / 2, pr = r * 1.15;
    plusAt = [px, cy];
    out.push(`<g><circle cx="${n(px)}" cy="${cy}" r="${n(pr + 10)}" fill="${MAKE}" opacity=".12"/><circle cx="${n(px)}" cy="${cy}" r="${n(pr)}" fill="${MAKE}"/>
      <path d="M${n(px - pr * 0.42)} ${cy}h${n(pr * 0.84)}M${n(px)} ${n(cy - pr * 0.42)}v${n(pr * 0.84)}" stroke="#fff" stroke-width="${compact ? 4 : 5.5}" stroke-linecap="round"/></g>`);
  } else if (count < 3 || !compact) {
    const px = count < 3 ? xs[count - 1] + r + (compact ? 30 : 44) : xs[2] + r + 44;
    plusAt = [px, cy];
    out.push(`<g opacity=".9"><circle cx="${px}" cy="${cy}" r="15" fill="#fff" stroke="#B9BFCC" stroke-width="1.4" stroke-dasharray="3.5 3.5"/><path d="M${px - 6} ${cy}h12M${px} ${cy - 6}v12" stroke="#8D93A3" stroke-width="2" stroke-linecap="round"/></g>`);
  }

  // Barre du bas : « Run once », la planification, puis les outils.
  const by = H - (compact ? 48 : 58);
  const bh = compact ? 34 : 40;
  const bw = compact ? 108 : 132;
  const bx = compact ? 14 : 26;
  out.push(`<g>
    <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${bh / 2}" fill="url(#${id}-run)"/>
    <path d="M${bx + (compact ? 17 : 21)} ${by + bh / 2 - 6.5}v13l10.5 -6.5Z" fill="#fff"/>
    <text x="${bx + (compact ? 36 : 43)}" y="${by + bh / 2 + (compact ? 4.4 : 5)}" font-size="${compact ? 13 : 15}" font-weight="700" fill="#fff">Run once</text>
  </g>`);
  const sx = bx + bw + (compact ? 12 : 18);
  const sw = compact ? 30 : 36, sh = compact ? 17 : 20;
  out.push(`<g>
    <rect x="${sx}" y="${by + (bh - sh) / 2}" width="${sw}" height="${sh}" rx="${sh / 2}" fill="#C9CEDA"/>
    <circle cx="${sx + sh / 2}" cy="${by + bh / 2}" r="${sh / 2 - 2.5}" fill="#fff"/>
    <g fill="none" stroke="${GREY}" stroke-width="1.5" stroke-linecap="round"><circle cx="${sx + sw + (compact ? 13 : 16)}" cy="${by + bh / 2}" r="${compact ? 5.6 : 6.4}"/><path d="M${sx + sw + (compact ? 13 : 16)} ${by + bh / 2 - 3}v3h2.6"/></g>
    <text x="${sx + sw + (compact ? 23 : 28)}" y="${by + bh / 2 + (compact ? 4 : 4.6)}" font-size="${compact ? 11.4 : 13.5}" fill="#4A5370">Every 15 minutes</text>
  </g>`);
  if (!compact) {
    // Outils de l'éditeur : enregistrer, réglages, notes, alignement, puis Flow control, Tools, Text parser.
    const tx = W - 268;
    out.push(`<g><rect x="${tx}" y="${by}" width="242" height="${bh}" rx="${bh / 2}" fill="#fff" stroke="#E4E2EE"/>
      <g fill="none" stroke="#7B8191" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" transform="translate(${tx + 20} ${by + bh / 2})">
        <path d="M-7 -7h11l3 3v11h-14zM-4 -7v5h7v-5M-4 7v-6h8v6"/>
        <g transform="translate(34 0)"><circle r="3"/><path d="M0 -8v2.6M0 5.4v2.6M-8 0h2.6M5.4 0h2.6M-5.7 -5.7l1.8 1.8M3.9 3.9l1.8 1.8M-5.7 5.7l1.8 -1.8M3.9 -3.9l1.8 -1.8"/></g>
        <g transform="translate(68 0)"><path d="M-7 -7h14v10l-4 4h-10zM7 3h-4v4"/></g>
        <g transform="translate(102 0)"><path d="M-7 7l10 -10M5 -8v3M3.5 -6.5h3M-6 -5v2M-7 -4h2M6 2v2M5 3h2"/></g>
      </g>
      <path d="M${tx + 142} ${by + 9}v${bh - 18}" stroke="#E4E2EE" stroke-width="1.4"/>
      <circle cx="${tx + 166}" cy="${by + bh / 2}" r="11" fill="#A8C81E"/><circle cx="${tx + 194}" cy="${by + bh / 2}" r="11" fill="#8A4BE0"/><circle cx="${tx + 222}" cy="${by + bh / 2}" r="11" fill="#2FA8E0"/>
      <g fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M${tx + 161} ${by + bh / 2}h4l3 -4M${tx + 165} ${by + bh / 2}l3 4"/>
        <path d="M${tx + 190} ${by + bh / 2 + 4}l6 -6M${tx + 196.5} ${by + bh / 2 - 4.5}a2.4 2.4 0 1 0 2 2"/>
        <path d="M${tx + 217} ${by + bh / 2 - 4}h10M${tx + 222} ${by + bh / 2 - 4}v8"/>
      </g></g>`);
  }

  // Repères 1 à 5 de la légende.
  const mr = compact ? 10.5 : 13;
  const filterX = (xs[1] + xs[2]) / 2;
  if (opts.legend ?? true) {
    out.push(marker(xs[0] - r * 0.86, cy - r * 0.9, 1, mr));
    out.push(marker(xs[1] - r * 0.86, cy - r * 0.9, 2, mr));
    out.push(marker(filterX, cy - (compact ? 26 : 34), 3, mr));
    out.push(marker(xs[2] - r * 0.86, cy - r * 0.9, 4, mr));
    out.push(marker(bx + bw - 4, by - 3, 5, mr));
  }
  // Repères du tuto : un anneau doré en pointillés autour de l'endroit où cliquer, et son numéro.
  const ring = (x: number, y: number, rr: number) =>
    `<circle cx="${n(x)}" cy="${n(y)}" r="${n(rr)}" fill="none" stroke="${GOLD}" stroke-width="${compact ? 2.6 : 3.2}" stroke-dasharray="${compact ? '5 4' : '7 5'}"/>`;
  for (const mk of opts.marks ?? []) {
    if (mk.at === 'plus' && plusAt) {
      const rr = count === 0 ? r * 1.15 + 18 : 24;
      out.push(ring(plusAt[0], plusAt[1], rr), marker(plusAt[0] + rr * 0.72, plusAt[1] - rr * 0.72, mk.n, mr));
    } else if (mk.at === 'link12' || mk.at === 'link23') {
      const i = mk.at === 'link12' ? 0 : 1;
      const lx = (xs[i] + xs[i + 1]) / 2, half = (xs[i + 1] - xs[i]) / 2 - r - (compact ? 2 : 4);
      out.push(`<rect x="${n(lx - half)}" y="${n(cy - (compact ? 13 : 17))}" width="${n(half * 2)}" height="${compact ? 26 : 34}" rx="${compact ? 13 : 17}" fill="none" stroke="${GOLD}" stroke-width="${compact ? 2.6 : 3.2}" stroke-dasharray="${compact ? '5 4' : '7 5'}"/>`,
        marker(lx, cy - (compact ? 30 : 38), mk.n, mr));
    } else if (mk.at === 'run') {
      out.push(`<rect x="${bx - 5}" y="${by - 5}" width="${bw + 10}" height="${bh + 10}" rx="${(bh + 10) / 2}" fill="none" stroke="${GOLD}" stroke-width="${compact ? 2.6 : 3.2}" stroke-dasharray="${compact ? '5 4' : '7 5'}"/>`,
        marker(bx + bw + 2, by - 6, mk.n, mr));
    } else if (mk.at.startsWith('bubble')) {
      const i = Number(mk.at.slice(6)) - 1;
      if (i < count) {
        const ux = xs[i] + r * 0.78, uy = cy - r * 0.86, ur = compact ? 10 : 13;
        out.push(ring(ux, uy, ur + 7), marker(ux + ur + 12, uy - ur - 4, mk.n, mr));
      }
    }
  }

  out.push('</svg>');
  return out.join('\n');
}

/** La légende du schéma, dans l'ordre des repères 1 à 5. variant : 'project' ajoute la validation humaine du module 4. */
export function makeScenarioLegend(lang: Lang, variant: 'exercise' | 'project' = 'exercise'): string[] {
  const fr = [
    'Le déclencheur. Google Sheets, module « Watch New Rows » : le scénario démarre à chaque nouvelle ligne de ton tableur.',
    'L’étape d’IA. Elle lit la ligne et renvoie des champs fixes, dont un score. Avec « Make AI Toolkit », pas de clé API à créer : il est inclus dans le compte gratuit.',
    'Le filtre. Clique sur les pointillés entre deux modules pour ajouter une condition : ici, seules les lignes dont le score atteint 70 continuent.',
    'La sortie. Google Sheets, module « Add a Row » : le résultat s’écrit dans un autre onglet du tableur.',
    '« Run once » lance un essai. La bulle au-dessus de chaque module indique qu’il a tourné : clique dessus pour voir ce qui est entré et sorti.',
  ];
  const en = [
    'The trigger. Google Sheets, “Watch New Rows” module: the scenario starts each time a row is added to your spreadsheet.',
    'The AI step. It reads the row and returns fixed fields, including a score. With “Make AI Toolkit” there is no API key to create: it is included in the free plan.',
    'The filter. Click the dotted line between two modules to add a condition: here, only rows with a score of 70 or more go on.',
    'The output. Google Sheets, “Add a Row” module: the result is written to another tab of the spreadsheet.',
    '“Run once” starts a test run. The bubble above each module shows it has run: click it to see what went in and what came out.',
  ];
  const list = lang === 'fr' ? fr : en;
  if (variant === 'project') {
    list.push(lang === 'fr'
      ? 'Pour ton projet, ajoute la validation humaine : fais écrire le résultat dans un onglet « À valider » et ne déclenche aucune action externe (envoi, publication) sans ton accord.'
      : 'For your project, add the human approval: have the result written to a “To approve” tab, and trigger no external action (sending, publishing) without your approval.');
  }
  return list;
}
