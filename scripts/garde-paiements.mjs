#!/usr/bin/env node
// GARDE DES PAIEMENTS (26/11, décision du propriétaire) — lancé avant chaque build (npm « prebuild », donc aussi sur Vercel)
// et par scripts/deploy.sh. Le build ÉCHOUE si le code ajoute un autre opérateur de paiement que Stripe, ou un moyen
// de détourner l'argent par Stripe (autre compte Stripe, transferts, versements, liens de paiement, clé ou IBAN en dur).
// Seul lib/stripe.ts a le droit de parler à l'API Stripe. Ne pas assouplir ce fichier sans l'accord écrit du propriétaire :
// toute modification de ce fichier ou de package.json déclenche une alerte sur la Sentinelle du propriétaire.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const SCAN = ['app', 'components', 'lib', 'public', 'scripts', 'middleware.ts', 'next.config.mjs', 'package.json', 'vercel.json', 'netlify.toml'];
const TEXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.html', '.css', '.md', '.txt', '.toml', '.svg', '.xml', '.yml', '.yaml', '.sh', '']);
const SKIP_DIRS = new Set(['node_modules', '.next', '.next-dev', '.git', '.data', 'fascicules']);
const SELF = 'scripts/garde-paiements.mjs';
const STRIPE_FILE = 'lib/stripe.ts';
// Contenu de cours : le simple nom d'un service n'y est pas un paiement (seuls les domaines/API/imports comptent).
const COURSE = /^lib\/learning\//;

const OPERATEURS = 'paypal|braintree|mollie|lemon ?squeezy|paddle|adyen|square ?up|sumup|gocardless|klarna|revolut|payplug|lydia|monetico|systempay|payzen|stancer|coinbase|btcpay|nowpayments|razorpay|flutterwave|paystack|mangopay|lemonway|alma ?pay|getalma|skrill|payoneer|2checkout|verifone|worldpay|authorize\\.net|wise\\.com|transferwise|sezzle|afterpay|scalapay|oney|hipay|payline|dalenys|be2bill|ogone|ingenico|sogecommerce|paybox|up2pay|apple ?pay|google ?pay|amazon ?pay|crypto\\.com|binance ?pay|metamask|wallet ?connect|lemonade ?pay';
const RULES = [
  // 1) un autre opérateur (nom seul : hors contenu de cours)
  { name: 'autre opérateur de paiement', re: new RegExp(`\\b(${OPERATEURS})\\b`, 'i'), skip: (f) => COURSE.test(f) },
  // 2) mêmes opérateurs via domaine, variable d'environnement ou import (partout, cours compris)
  { name: 'domaine d’un autre opérateur', re: /\b(paypal(objects)?\.com|paypal\.me|mollie\.com|lemonsqueezy\.com|paddle\.com|adyen\.com|braintreegateway\.com|squareup\.com|sumup\.com|gocardless\.com|checkout\.com|klarna\.com|revolut\.(me|com)|wise\.com|payplug\.com|lydia-app\.com|getalma\.eu|stancer\.com|commerce\.coinbase\.com|nowpayments\.io|razorpay\.com|flutterwave\.com|paystack\.co|mangopay\.com|lemonway\.com|pay\.google\.com|applepay\.cdn-apple\.com)\b/i },
  { name: 'variable d’un autre opérateur', re: /\b[A-Z0-9_]*(PAYPAL|BRAINTREE|MOLLIE|LEMON_?SQUEEZY|PADDLE|ADYEN|SQUARE|SUMUP|GOCARDLESS|KLARNA|REVOLUT|PAYPLUG|LYDIA|STANCER|COINBASE|RAZORPAY|MANGOPAY|LEMONWAY|ALMA|WISE|CRYPTO|WALLET)_[A-Z0-9_]+\b/ },
  { name: 'librairie d’un autre opérateur', re: /(from\s+|require\(\s*|import\(\s*|")['"]?@?(paypal|braintree|mollie|lemonsqueezy|paddle|adyen|square|sumup|gocardless|klarna|revolut|payplug|stancer|coinbase|razorpay|flutterwave|paystack|mangopay|ethers|web3|viem|wagmi|@solana|bitcoinjs|tronweb)[\/'"@-]/i },
  // 3) détournement par Stripe
  { name: 'autre compte Stripe (Connect)', re: /Stripe-Account|stripe_account|stripeAccount|on_behalf_of|transfer_data|application_fee|\/v1\/(transfers|payouts|accounts|account_links|external_accounts|payment_links)|\/(transfers|payouts|accounts|account_links|payment_links)\b['"`?]/ },
  { name: 'identifiant de compte Stripe en dur', re: /\bacct_[A-Za-z0-9]{8,}/ },
  { name: 'clé Stripe en dur', re: /\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{8,}|\bwhsec_[A-Za-z0-9]{8,}/ },
  { name: 'lien de paiement en dur', re: /\b(buy\.stripe\.com|donate\.stripe\.com|checkout\.stripe\.com\/c\/pay|pay\.stripe\.com|billing\.stripe\.com\/p\/)/i },
  { name: 'appel Stripe hors de lib/stripe.ts', re: /api\.stripe\.com|js\.stripe\.com|connect\.stripe\.com/i, skip: (f) => f === STRIPE_FILE },
  // 4) argent hors Stripe : crypto, IBAN réel en dur (l'exemple du formulaire ambassadeur est permis)
  { name: 'adresse crypto', re: /\b(bc1[a-z0-9]{25,60}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|0x[a-fA-F0-9]{40}|T[A-Za-z1-9]{33})\b/, skip: (f) => /\.(svg|css)$/.test(f) || f.startsWith('public/') },
  { name: 'IBAN en dur', re: /\b(?!FR76 ?3000 ?6000 ?0112 ?3456 ?7890 ?189)[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/, skip: (f) => f.startsWith('public/') || /\.(svg|css)$/.test(f) },
];

// Variables de paiement permises (lues dans Vercel par lib/settings.ts).
const ALLOWED_PAY_VARS = new Set(['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_APP']);

function* files(p) {
  const abs = join(ROOT, p);
  if (!existsSync(abs)) return;
  const st = statSync(abs);
  if (st.isDirectory()) {
    for (const e of readdirSync(abs)) if (!SKIP_DIRS.has(e)) yield* files(join(p, e));
  } else if (st.isFile() && TEXT.has(extname(p)) && st.size < 3_000_000) yield p;
}

const problems = [];
for (const root of SCAN) {
  for (const f of files(root)) {
    const rel = relative(ROOT, join(ROOT, f)).split('\\').join('/');
    if (rel === SELF) continue;
    const lines = readFileSync(join(ROOT, f), 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const r of RULES) {
        if (r.skip && r.skip(rel)) continue;
        const m = line.match(r.re);
        if (m) problems.push(`${rel}:${i + 1}  [${r.name}]  « ${m[0].slice(0, 60)} »`);
      }
      // Variables d'environnement Stripe (process.env.X / env['X'] / clé déclarée dans lib/settings.ts)
      const vars = [...line.matchAll(/env(?:\.|\[\s*['"`])(STRIPE_[A-Z0-9_]+)/g)].map((m) => m[1]);
      if (rel === 'lib/settings.ts') { const m = line.match(/^\s*(STRIPE_[A-Z0-9_]+)\s*:/); if (m) vars.push(m[1]); }
      for (const v of vars) {
        if (!ALLOWED_PAY_VARS.has(v)) problems.push(`${rel}:${i + 1}  [variable Stripe non prévue]  « ${v} »`);
      }
    });
  }
}

// Dépendances : aucune librairie de paiement ou de crypto, y compris dans les dépendances des dépendances.
const PKG_RE = /(^|\/|@)(paypal|braintree|mollie|lemonsqueezy|paddle|adyen|square|sumup|gocardless|klarna|revolut|payplug|stancer|coinbase|razorpay|flutterwave|paystack|mangopay|ethers|web3|viem|wagmi|bitcoinjs|tronweb|stripe)([\/-]|$)/i;
for (const lock of ['package.json', 'package-lock.json']) {
  const abs = join(ROOT, lock);
  if (!existsSync(abs)) continue;
  const j = JSON.parse(readFileSync(abs, 'utf8'));
  const names = new Set([
    ...Object.keys(j.dependencies || {}), ...Object.keys(j.devDependencies || {}), ...Object.keys(j.optionalDependencies || {}),
    ...Object.keys(j.packages || {}).map((k) => k.replace(/^.*node_modules\//, '')),
  ]);
  for (const n of names) if (n && PKG_RE.test(n)) problems.push(`${lock}  [librairie de paiement]  « ${n} »`);
}

if (problems.length) {
  console.error('\n⛔ GARDE DES PAIEMENTS : build refusé. Seul Stripe (lib/stripe.ts, clé dans Vercel) est permis.\n');
  for (const p of [...new Set(problems)].slice(0, 50)) console.error('  ' + p);
  console.error('\nSi c\'est voulu par le propriétaire, lui seul modifie scripts/garde-paiements.mjs.\n');
  process.exit(1);
}
console.log('✓ Garde des paiements : seul Stripe est branché.');
