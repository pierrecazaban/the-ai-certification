// Images des pages de chaque fascicule (26/11) : le fascicule se lit dans la page du module, par-dessus, sans la quitter
// (components/learning/BookletViewer). Pour chaque fascicules/<langue>/<module>.pdf, écrit fascicules/<langue>/<module>/<n>.jpg
// (hors de public/ : réservées aux élèves, servies par app/space/[program]/module/[id]/fascicule/pages/[n]/route.ts) et
// lib/learning/booklet-pages.ts (nombre de pages et taille des images). Lancé à la fin de scripts/fascicules.mjs ; seul :
//   ~/.local/node/actuel/bin/node scripts/fascicules-pages.mjs        (Mac : utilise le moteur PDF du système, via swift)
import { execFileSync } from 'node:child_process';
import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIDTH = 1240; // A4 à ~150 points par pouce : net sur un écran Retina, environ 150 Ko par page
const pages = {};
for (const lang of ['fr', 'en']) {
  const dir = path.join(root, 'fascicules', lang);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.pdf')).sort()) {
    const id = file.slice(0, -4);
    const out = path.join(dir, id);
    rmSync(out, { recursive: true, force: true }); // une version précédente pouvait avoir plus de pages
    const line = execFileSync('swift', [path.join(root, 'scripts', 'fascicules-pages.swift'), path.join(dir, file), out, String(WIDTH)]).toString().trim().split('\n').pop();
    const [n, w, h] = line.split(' ').map(Number);
    if (!(n > 0 && w > 0 && h > 0)) throw new Error(`${lang}/${file} : rendu impossible (${line})`);
    pages[`${lang}/${id}`] = { pages: n, width: w, height: h };
    console.log(`${lang}/${id} : ${n} pages ${w}×${h}`);
  }
}
writeFileSync(
  path.join(root, 'lib/learning/booklet-pages.ts'),
  `// Généré par scripts/fascicules-pages.mjs : ne pas modifier à la main.\n` +
    `export const BOOKLET_PAGES: Record<string, { pages: number; width: number; height: number }> = ${JSON.stringify(pages, null, 2)};\n`,
);
