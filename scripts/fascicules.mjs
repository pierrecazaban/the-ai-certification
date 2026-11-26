#!/usr/bin/env node
// Fascicules des modules du cours étudiant v2 (24/11) : un PDF par module et par langue, demandé par un élève (« des
// vidéos ou des fascicules seraient bienvenus pour approfondir »). Chaque fascicule reprend le module tel qu'il est
// dans le cours : les leçons, leurs schémas (images fixes des widgets animés), l'exercice, l'écran de Make (modules 3
// et 4), le glossaire et les deux vidéos. Les questions du quiz et de l'examen n'y sont pas.
//
// À relancer après toute modification d'une leçon, d'un exercice, du glossaire ou des vidéos :
//   ~/.local/node/actuel/bin/node scripts/fascicules.mjs          (Node 26 : lit les fichiers .ts du cours tels quels)
// Les PDF sont écrits dans fascicules/<langue>/<module>.pdf, hors de public/ : ils sont servis aux élèves connectés
// par app/space/[program]/module/[id]/fascicule/route.ts (next.config.mjs les joint à cette route).
// Rendu par le Chromium de Playwright déjà installé sur ce Mac (voir CHROMIUM et PLAYWRIGHT ci-dessous).

import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLAYWRIGHT = process.env.PLAYWRIGHT_FROM ?? path.join(os.homedir(), 'prospection-ambassadeurs/package.json');
const CHROMIUM = process.env.CHROMIUM ?? path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-mac-arm64/chrome-headless-shell');

const load = (rel) => import(pathToFileURL(path.join(root, rel)).href);
const { makeScenarioSvg, makeScenarioLegend } = await load('lib/learning/makeScenario.ts');
const { lessonWidgets } = await load('lib/learning/figures.ts');

const LANGS = {
  fr: {
    modules: (await load('lib/learning/student-ai-v2/fr-modules.ts')).modules,
    extras: (await load('lib/learning/student-ai-v2/fr-extras.ts')).extras,
    t: {
      course: 'L’IA au travail', kicker: 'Fascicule', module: (n) => `Module ${n}`, contents: 'Dans ce fascicule', lesson: (n) => `Leçon ${n}`,
      minutes: (n) => `${n} min`, exercise: 'Exercice', steps: 'Étapes', submit: 'À rendre',
      make: 'À quoi ressemble ton scénario dans Make', makeNote: 'Reproduction de l’écran de Make, pour illustrer. Dans Make, les libellés sont en anglais.',
      glossary: 'Les mots à retenir', videos: 'Pour aller plus loin : deux vidéos', videoHint: 'Touche un titre pour ouvrir la vidéo sur YouTube.',
      kai: 'Une question ? Kai, l’assistant IA du cours, te répond sur la page du module, dans ton espace élève.',
      reserved: 'Document réservé aux élèves de The AI Certification', keep: 'À garder, imprimer ou relire avant le quiz.',
    },
  },
  en: {
    modules: (await load('lib/learning/student-ai-v2/en-modules.ts')).modules,
    extras: (await load('lib/learning/student-ai-v2/en-extras.ts')).extras,
    t: {
      course: 'AI at work', kicker: 'Booklet', module: (n) => `Module ${n}`, contents: 'In this booklet', lesson: (n) => `Lesson ${n}`,
      minutes: (n) => `${n} min`, exercise: 'Exercise', steps: 'Steps', submit: 'What to submit',
      make: 'What your scenario looks like in Make', makeNote: 'A reproduction of the Make screen, for illustration. In Make, the labels are in English.',
      glossary: 'Words to remember', videos: 'Go further: two videos', videoHint: 'Tap a title to open the video on YouTube.',
      kai: 'A question? Kai, the AI assistant of the course, answers on the module page, in your student space.',
      reserved: 'For learners of The AI Certification only', keep: 'To keep, print or read again before the quiz.',
    },
  },
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dataUrl = (file, type) => `data:${type};base64,${readFileSync(file).toString('base64')}`;
const publicFile = (p) => path.join(root, 'public', p.replace(/^\//, ''));
const font = (name) => dataUrl(path.join(root, 'node_modules/@fontsource-variable/manrope/files', name), 'font/woff2');

/** Le texte d'une leçon, comme components/learning/LessonBody : titres, listes, idée clé, exemple.
 *  figures : schéma à placer à côté d'un bloc (par son numéro dans le texte) ; il flotte à droite, le texte l'habille. */
function body(blocks, figures = {}) {
  const out = [];
  let list = [];
  const flush = () => { if (list.length) out.push(`<ul>${list.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`); list = []; };
  blocks.forEach((b, i) => {
    if (figures[i]) { flush(); out.push(figures[i]); }
    if (b.startsWith('- ')) { list.push(b.slice(2)); return; }
    flush();
    if (b.startsWith('## ')) out.push(`<h3>${esc(b.slice(3))}</h3>`);
    else if (b.startsWith('> ')) out.push(`<p class="tip">${esc(b.slice(2))}</p>`);
    else if (b.startsWith('! ')) out.push(`<p class="example">${esc(b.slice(2))}</p>`);
    else if (b.startsWith('$ ')) out.push(`<pre>${esc(b.slice(2))}</pre>`);
    else out.push(`<p>${esc(b)}</p>`);
  });
  flush();
  return out.join('\n');
}

// foot : la ligne de pied de page (le texte d'une marge de page ne peut pas venir du document dans Chromium).
const css = (foot) => `
@font-face { font-family: 'Manrope'; font-weight: 200 800; src: url('${font('manrope-latin-wght-normal.woff2')}') format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
@font-face { font-family: 'Manrope'; font-weight: 200 800; src: url('${font('manrope-latin-ext-wght-normal.woff2')}') format('woff2'); }
@page { size: A4; margin: 17mm 16mm 19mm;
  @bottom-left { content: '${foot.replace(/'/g, '’')}'; font: 600 7.6pt 'Manrope', sans-serif; color: #7A8296; }
  @bottom-right { content: counter(page) ' / ' counter(pages); font: 700 7.6pt 'Manrope', sans-serif; color: #7A8296; } }
@page :first { margin: 0; @bottom-left { content: none; } @bottom-right { content: none; } }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: 'Manrope', system-ui, sans-serif; color: #17274C; font-size: 10.3pt; line-height: 1.58; }
h1, h2, h3 { line-height: 1.22; letter-spacing: -.2px; margin: 0; }
p { margin: 0 0 2.6mm; }
ul, ol { margin: 0 0 2.8mm; padding-left: 5mm; }
li { margin-bottom: 1.1mm; }
a { color: #1F3A75; }

/* Couverture */
.cover { position: relative; width: 210mm; height: 297mm; padding: 24mm 20mm 20mm; overflow: hidden; page-break-after: always;
  background: radial-gradient(60% 46% at 92% 14%, #FBF1DC 0%, rgba(251,241,220,0) 70%), linear-gradient(160deg, #F7F8FC 0%, #EEF1F8 100%); }
.cover::before { content: ''; position: absolute; left: 0; top: 0; width: 70mm; height: 9mm; background: linear-gradient(135deg, #17274C 0 52%, #D4A74C 52% 100%); }
.cover::after { content: ''; position: absolute; right: 0; bottom: 0; width: 86mm; height: 9mm; background: linear-gradient(135deg, #F1DFB4 0 30%, #D4A74C 30% 62%, #17274C 62%); }
.brand { font-weight: 800; font-size: 12pt; letter-spacing: -.1px; color: #17274C; }
.brand small { display: block; margin-top: 1mm; font-weight: 600; font-size: 9.6pt; color: #6B7590; }
.cover .accent { display: block; width: 16mm; height: 1.2mm; border-radius: 1mm; background: #F5B82E; margin: 46mm 0 6mm; }
.cover .kicker { display: inline-block; background: #E9EEFA; color: #1F3A75; border-radius: 99mm; padding: 1.5mm 4.4mm; font-weight: 800; font-size: 10pt; }
.cover h1 { font-size: 31pt; margin: 4mm 0 6mm; max-width: 150mm; letter-spacing: -.8px; }
.cover .lead { font-size: 12.6pt; line-height: 1.5; color: #4A5370; max-width: 128mm; margin: 0; }
.cover .art { position: absolute; right: 12mm; bottom: 50mm; width: 96mm; height: 96mm; border-radius: 50%; background: #E6EBF6; overflow: hidden; }
.cover .art img { width: 100%; height: 100%; display: block; }
.cover .inside { position: absolute; left: 20mm; bottom: 26mm; width: 84mm; }
.cover .inside b { display: block; font-size: 10.4pt; font-weight: 800; color: #17274C; margin-bottom: 2.4mm; }
.cover .inside li { font-size: 10pt; margin-bottom: 1.3mm; color: #17274C; }
.cover .inside ol { margin: 0; padding-left: 5mm; }
.cover .keep { position: absolute; left: 20mm; bottom: 15mm; font-size: 8.8pt; color: #6B7590; }

/* Leçons */
.lesson { page-break-before: always; }
.eyebrow { display: inline-block; background: #E9EEFA; color: #1F3A75; border-radius: 99mm; padding: 1mm 3.4mm; font-weight: 800; font-size: 8.6pt; margin-bottom: 2.4mm; }
h2 { font-size: 19pt; margin-bottom: 4.4mm; padding-bottom: 3mm; border-bottom: .5mm solid #F5B82E; }
h3 { font-size: 12pt; margin: 5mm 0 2mm; break-after: avoid; }
li { break-inside: avoid; }
.tip, .example { display: flow-root; }
.tip { background: #FFF6DD; border-left: 1.1mm solid #F5B82E; border-radius: 0 2.4mm 2.4mm 0; padding: 2.8mm 4mm; font-weight: 600; break-inside: avoid; }
.example { background: #EEF1F8; border-radius: 2.4mm; padding: 2.8mm 4mm; color: #22346A; font-size: 9.8pt; break-inside: avoid; }
pre { background: #17274C; color: #fff; border-radius: 2.4mm; padding: 3mm 4mm; font-size: 8.8pt; white-space: pre-wrap; break-inside: avoid; }
.lesson::after { content: ''; display: block; clear: both; }
.fig { float: right; clear: right; height: auto; margin: 1mm 0 4mm 7mm; border-radius: 3mm; box-shadow: 0 0 0 .25mm #E1E5EC; background: #F7F8FA; break-inside: avoid; }
.strip { display: flex; flex-wrap: wrap; gap: 4mm; align-items: flex-start; margin-top: 4mm; clear: both; }
.fig-row { display: block; height: auto; border-radius: 3mm; box-shadow: 0 0 0 .25mm #E1E5EC; background: #F7F8FA; break-inside: avoid; }
.fig-wide { display: block; height: auto; margin: 3mm auto 4mm; border-radius: 3mm; box-shadow: 0 0 0 .25mm #E1E5EC; background: #F7F8FA; break-inside: avoid; }

/* Exercice, glossaire, vidéos */
.block { page-break-before: always; }
.steps { list-style: none; padding: 0; margin: 2mm 0 4mm; counter-reset: step; }
.steps li { counter-increment: step; position: relative; padding: 0 0 0 10mm; margin-bottom: 3mm; break-inside: avoid; }
.steps li::before { content: ''; position: absolute; left: 0; top: .6mm; width: 4.6mm; height: 4.6mm; border: .45mm solid #9AA4B8; border-radius: 1.2mm; }
.submit { background: #EEF1F8; border-radius: 2.4mm; padding: 3mm 4mm; break-inside: avoid; }
.submit b { display: block; font-size: 10pt; font-weight: 800; color: #17274C; margin-bottom: 1mm; }
.make { margin-top: 6mm; break-inside: avoid; }
.make svg { display: block; width: 150mm; height: auto; margin: 0 auto; border-radius: 3mm; box-shadow: 0 0 0 .25mm #E1E5EC; }
.legend { list-style: none; counter-reset: mk; padding: 0; margin: 4mm 0 2mm; }
.legend li { counter-increment: mk; position: relative; padding-left: 8mm; margin-bottom: 2mm; font-size: 9.6pt; break-inside: avoid; }
.legend li::before { content: counter(mk); position: absolute; left: 0; top: .2mm; width: 5.2mm; height: 5.2mm; border-radius: 50%; background: #F5B82E; color: #17274C;
  font-weight: 800; font-size: 8pt; display: grid; place-items: center; }
.small { font-size: 8.6pt; color: #6B7590; }
.glossary { columns: 2; column-gap: 9mm; margin: 0; }
.glossary div { break-inside: avoid; margin-bottom: 3.4mm; }
.glossary dt { font-weight: 800; font-size: 10.4pt; }
.glossary dd { margin: 0; font-size: 9.6pt; color: #4A5370; }
.videos { margin-top: 9mm; break-inside: avoid; }
.videos h3 { margin-top: 0; }
.video { display: flex; gap: 4mm; align-items: flex-start; border: .3mm solid #E1E5EC; border-radius: 3mm; padding: 3.4mm 4mm; margin-bottom: 3mm; text-decoration: none; color: inherit; break-inside: avoid; }
.video i { flex: none; width: 9mm; height: 9mm; border-radius: 50%; background: #F5B82E; display: grid; place-items: center; }
.video i::before { content: ''; border-left: 3mm solid #17274C; border-top: 1.9mm solid transparent; border-bottom: 1.9mm solid transparent; margin-left: .8mm; }
.video b { display: block; font-size: 10.6pt; line-height: 1.3; }
.video span { display: block; font-size: 9.2pt; color: #4A5370; }
.video u { font-size: 8.6pt; color: #1F3A75; }
.kai { margin-top: 4mm; padding: 3.4mm 5mm; border-radius: 3mm; background: #17274C; color: #fff; font-weight: 600; font-size: 10pt; break-inside: avoid; }
`;

function html(lang, index) {
  const { modules, extras, t } = LANGS[lang];
  const m = modules[index];
  const x = extras[m.id];
  const n = index + 1;
  const img = (src, w) => `<img data-src="${esc(src)}" data-w="${w}" alt="">`;
  const lessons = m.lessons.map((l, k) => {
    // Chaque schéma (image fixe d'un widget animé) se place à côté du bloc qu'il illustre : étroit, il flotte à droite ;
    // très large, il prend la largeur du texte.
    const figures = {};
    for (const w of lessonWidgets(l.id, lang)) {
      const ratio = w.media.w / w.media.h;
      const wide = ratio > 2;
      const width = wide ? 150 : ratio > 1.15 ? 76 : 50;
      const at = Math.max(0, Math.min(l.body.length - 1, w.after));
      figures[at] = (figures[at] ?? '') + `<img class="${wide ? 'fig-wide' : 'fig'}" data-src="${esc(w.media.still)}" data-w="${wide ? 900 : 500}" data-mm="${width}" alt="" style="width:${width}mm">`;
    }
    return `<section class="lesson">
      <span class="eyebrow">${esc(t.lesson(k + 1))} · ${esc(t.minutes(l.minutes))}</span>
      <h2>${esc(l.title)}</h2>
      ${body(l.body, figures)}
    </section>`;
  }).join('\n');
  const make = m.id === 'v2-m3' || m.id === 'v2-m4'
    ? `<div class="make"><h3>${esc(t.make)}</h3>${makeScenarioSvg(lang, false, false)}
        <ol class="legend">${makeScenarioLegend(lang, m.id === 'v2-m4' ? 'project' : 'exercise').map((line) => `<li>${esc(line)}</li>`).join('')}</ol>
        <p class="small">${esc(t.makeNote)}</p></div>`
    : '';
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(`${t.kicker} · ${t.module(n)} · ${m.title}`)}</title><style>${css(`The AI Certification · ${t.course} · ${t.module(n)} · ${t.reserved}`)}</style></head><body>
  <section class="cover">
    <div class="brand">The AI Certification<small>${esc(t.course)}</small></div>
    <span class="accent"></span>
    <span class="kicker">${esc(t.kicker)} · ${esc(t.module(n))}</span>
    <h1>${esc(m.title)}</h1>
    <p class="lead">${esc(m.summary)}</p>
    <div class="art">${img(`/assets/course/${m.id}.webp`, 600).replace('<img ', '<img data-bg="#E6EBF6" ')}</div>
    <div class="inside"><b>${esc(t.contents)}</b><ol>
      ${m.lessons.map((l) => `<li>${esc(l.title)}</li>`).join('')}
      <li>${esc(t.exercise)} : ${esc(m.exercise.title)}</li><li>${esc(t.glossary)}</li><li>${esc(t.videos)}</li>
    </ol></div>
    <div class="keep">${esc(t.keep)}</div>
  </section>
  ${lessons}
  <section class="block">
    <span class="eyebrow">${esc(t.exercise)} · ${esc(t.minutes(m.exercise.minutes))}</span>
    <h2>${esc(m.exercise.title)}</h2>
    <p>${esc(m.exercise.intro)}</p>
    <h3>${esc(t.steps)}</h3>
    <ol class="steps">${m.exercise.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    <div class="submit"><b>${esc(t.submit)}</b>${esc(m.exercise.submission)}</div>
    <div class="kai">${esc(t.kai)}</div>
    ${make}
  </section>
  <section class="block">
    <span class="eyebrow">${esc(t.module(n))}</span>
    <h2>${esc(t.glossary)}</h2>
    <dl class="glossary">${x.glossary.map((g) => `<div><dt>${esc(g.term)}</dt><dd>${esc(g.def)}</dd></div>`).join('')}</dl>
    <div class="videos"><h3>${esc(t.videos)}</h3>
      ${x.videos.map((v) => `<a class="video" href="https://www.youtube.com/watch?v=${esc(v.id)}"><i></i><div><b>${esc(v.title)}</b><span>${esc(v.channel)} · ${esc(t.minutes(v.minutes))} · ${esc(v.why)}</span><u>youtu.be/${esc(v.id)}</u></div></a>`).join('')}
      <p class="small">${esc(t.videoHint)}</p>
    </div>
  </section>
  </body></html>`;
}

const require = createRequire(PLAYWRIGHT);
const { chromium } = require('playwright');
const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newPage();
let total = 0;
for (const lang of Object.keys(LANGS)) {
  mkdirSync(path.join(root, 'fascicules', lang), { recursive: true });
  for (let i = 0; i < LANGS[lang].modules.length; i++) {
    const m = LANGS[lang].modules[i];
    await page.setContent(html(lang, i), { waitUntil: 'load' });
    // Les images du cours (WebP) passent en JPEG à la taille utile : des PDF légers, qui s'ouvrent vite sur téléphone.
    const sources = await page.$$eval('img[data-src]', (els) => els.map((e) => e.getAttribute('data-src')));
    const files = Object.fromEntries([...new Set(sources)].map((s) => [s, dataUrl(publicFile(s), 'image/webp')]));
    await page.evaluate(async (data) => {
      for (const el of document.querySelectorAll('img[data-src]')) {
        const source = new Image();
        source.src = data[el.getAttribute('data-src')];
        await source.decode();
        const scale = Math.min(1, Number(el.getAttribute('data-w')) / source.naturalWidth);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(source.naturalWidth * scale);
        canvas.height = Math.round(source.naturalHeight * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = el.getAttribute('data-bg') ?? '#F7F8FA';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
        el.src = canvas.toDataURL('image/jpeg', 0.82);
        await el.decode();
      }
      await document.fonts.ready;
      // Les schémas flottent à droite du texte. Si leur colonne descend plus bas que le texte de la leçon, le dernier
      // partirait seul sur une page : on les rétrécit par paliers, puis on fait démarrer la colonne en haut de la
      // leçon, et en dernier recours on les aligne en bande à la fin. Mesuré à la largeur du texte imprimé (178 mm).
      document.body.style.width = '178mm';
      for (const lesson of document.querySelectorAll('.lesson')) {
        const figs = [...lesson.querySelectorAll('img.fig')];
        if (!figs.length) continue;
        const overflow = () => {
          const text = [...lesson.children].filter((el) => !el.classList.contains('fig'));
          return Math.max(...figs.map((el) => el.getBoundingClientRect().bottom)) - Math.max(...text.map((el) => el.getBoundingClientRect().bottom));
        };
        for (const k of [0.9, 0.8, 0.72]) {
          if (overflow() <= 8) break;
          figs.forEach((f) => { f.style.width = `${(Number(f.dataset.mm) * k).toFixed(1)}mm`; });
        }
        if (overflow() > 8) {
          const first = lesson.querySelector('h2').nextElementSibling;
          figs.forEach((f) => lesson.insertBefore(f, first));
        }
        if (overflow() > 8) {
          const strip = document.createElement('div');
          strip.className = 'strip';
          figs.forEach((f) => { f.className = 'fig-row'; strip.appendChild(f); });
          lesson.appendChild(strip);
        }
      }
      // Une leçon qui déborde de quelques lignes sur une page de plus : on la resserre un peu (schémas larges, puis
      // corps du texte) pour qu'elle tienne sur ses pages, au lieu de laisser trois lignes seules en haut d'une page.
      const pageHeight = (297 - 17 - 19) * (96 / 25.4);
      for (const lesson of document.querySelectorAll('.lesson')) {
        const spill = () => { const pages = lesson.getBoundingClientRect().height / pageHeight; return pages > 1 && pages - Math.floor(pages) < 0.16; };
        if (!spill()) continue;
        lesson.querySelectorAll('img.fig-wide').forEach((f) => { f.style.width = `${(parseFloat(f.style.width) * 0.8).toFixed(1)}mm`; });
        for (const size of ['9.9pt', '9.6pt', '9.3pt']) {
          if (!spill()) break;
          lesson.style.fontSize = size;
        }
      }
      document.body.style.width = '';
    }, files);
    // L'image de la couverture (publique), montrée entrouverte sur la page du module.
    await page.setViewportSize({ width: 794, height: 1123 });
    const shot = await page.locator('.cover').screenshot({ type: 'png' });
    const small = await page.evaluate(async (png) => {
      const source = new Image();
      source.src = png;
      await source.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 420;
      canvas.height = Math.round((420 * source.naturalHeight) / source.naturalWidth);
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.84);
    }, `data:image/png;base64,${shot.toString('base64')}`);
    const cover = path.join(root, 'public/images/course/v2', `fascicule-${lang}-${m.id}.jpg`);
    writeFileSync(cover, Buffer.from(small.split(',')[1], 'base64'));
    const file = path.join(root, 'fascicules', lang, `${m.id}.pdf`);
    await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
    const size = statSync(file).size;
    total += size;
    console.log(`${lang}/${m.id}.pdf  ${(size / 1024).toFixed(0)} Ko`);
  }
}
await browser.close();
console.log(`Total : ${(total / 1024 / 1024).toFixed(1)} Mo`);
// Les pages en images (26/11), pour lire le fascicule dans la page du module : à refaire à chaque nouveau PDF.
const { execFileSync } = await import('node:child_process');
execFileSync(process.execPath, [path.join(root, 'scripts/fascicules-pages.mjs')], { stdio: 'inherit' });
