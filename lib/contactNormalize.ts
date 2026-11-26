// Contacts donnés par les étudiants dans LinkedIn (26/11) : mis au propre et vérifiés avant d'être enregistrés.
// Sans base de données, donc testable seul. La même logique tourne dans l'agent de prospection (contacts.mjs) : toute
// règle changée ici doit l'être là-bas aussi (le jeu d'essai commun les vérifie toutes les deux).

export const CONTACT_NETWORKS = ['instagram', 'whatsapp', 'phone', 'email', 'snapchat', 'tiktok', 'telegram', 'teams', 'other'] as const;
export type ContactNetwork = (typeof CONTACT_NETWORKS)[number];
export type RawContact = { network: string; value: string; quote?: string };
/** ok = sûr (format valide et écrit tel quel dans le message) ; sinon « à vérifier », avec la raison. */
export type CleanContact = { network: ContactNetwork; value: string; normalized: string; quote: string; ok: boolean; why: string };

export const NETWORK_LABEL: Record<ContactNetwork, string> = {
  instagram: 'Instagram', whatsapp: 'WhatsApp', phone: 'Téléphone', email: 'E-mail', snapchat: 'Snapchat',
  tiktok: 'TikTok', telegram: 'Telegram', teams: 'Teams', other: 'Autre',
};

const lower = (s: string) => s.normalize('NFKC').toLowerCase();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Mots qui ne sont jamais un pseudo (« mon insta », « ajoute-moi »…).
const NOT_HANDLE = new Set(['instagram', 'insta', 'ig', 'snap', 'snapchat', 'tiktok', 'telegram', 'whatsapp', 'moi', 'me', 'mon', 'compte', 'profil', 'pseudo',
  // Chemins d'Instagram qui ne sont pas un compte (lien vers une publication, une story…).
  'p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'tv', 'direct']);

/** The handle in an @handle, a bare handle or a profile link of the network (query string and trailing slash dropped). */
function handleOf(value: string, host: RegExp, prefix = ''): string {
  const v = value.trim();
  const url = v.match(new RegExp(`(?:https?://)?(?:www\\.|m\\.)?${host.source}/${prefix}([^/?#\\s]+)`, 'i'));
  const raw = url ? url[1] : v;
  return lower(raw).replace(/^@+/, '').replace(/[.,;:!?)\]]+$/, '').trim();
}

/** E.164 (+33612345678) from what was written: +33 6…, 0033 6…, 06 12…, 6 12… (French by default), wa.me/336…. */
export function phoneOf(value: string): string {
  const v = value.trim();
  const wa = v.match(/wa\.me\/\+?(\d{6,15})/i);
  if (wa) return `+${wa[1]}`;
  const digits = v.replace(/[^\d+]/g, '');
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  const only = digits.replace(/\+/g, '');
  if (/^00\d{8,15}$/.test(only)) return `+${only.slice(2)}`;
  if (/^0[1-9]\d{8}$/.test(only)) return `+33${only.slice(1)}`;
  if (/^[67]\d{8}$/.test(only)) return `+33${only}`;
  return '';
}

/** The digits a reader sees in the text, with spaces, dots and dashes between digits removed (06 12.34-56 78 → 0612345678). */
const digitStream = (text: string) => text.replace(/(\d)[\s.\-()]+(?=\d)/g, '$1').replace(/[^\d+]/g, ' ');

/** True when the contact is written in the message as it is (no invention): the handle, the number, the address. */
export function writtenIn(c: { network: ContactNetwork; normalized: string }, text: string): boolean {
  const t = lower(text);
  if (!c.normalized) return false;
  if (c.network === 'whatsapp' || c.network === 'phone') {
    const national = c.normalized.startsWith('+33') ? c.normalized.slice(3) : c.normalized.replace(/^\+/, '');
    const stream = digitStream(t);
    return stream.includes(national) || stream.includes(c.normalized.replace(/^\+/, ''));
  }
  if (c.network === 'email') return t.includes(c.normalized);
  // Handles: as written, case aside (with or without the @, or inside a link).
  return t.includes(c.normalized);
}

/**
 * One contact cleaned: network known, value in its usual form, normalized form for duplicates, and whether it is sure.
 * `text` is the student's message (or the conversation): a contact absent from it is never “sure”.
 */
export function cleanContact(raw: RawContact, text: string, fromImage = false): CleanContact {
  const network = (CONTACT_NETWORKS as readonly string[]).includes(raw.network) ? (raw.network as ContactNetwork) : 'other';
  const value = String(raw.value ?? '').trim().slice(0, 200);
  const quote = String(raw.quote ?? '').trim().slice(0, 500);
  let normalized = '';
  let shown = value;
  let why = '';
  switch (network) {
    case 'instagram': {
      const h = handleOf(value, /instagram\.com/);
      if (/^(?!\.)(?!.*\.\.)[a-z0-9._]{1,30}$/.test(h) && !h.endsWith('.') && !NOT_HANDLE.has(h)) { normalized = h; shown = `@${h}`; } else why = 'pseudo Instagram illisible';
      break;
    }
    case 'snapchat': {
      const h = handleOf(value, /snapchat\.com/, 'add/');
      if (/^[a-z][a-z0-9._-]{2,14}$/.test(h) && !NOT_HANDLE.has(h)) { normalized = h; shown = h; } else why = 'pseudo Snapchat illisible';
      break;
    }
    case 'tiktok': {
      const h = handleOf(value, /tiktok\.com/, '@?');
      if (/^[a-z0-9._]{2,24}$/.test(h) && !NOT_HANDLE.has(h)) { normalized = h; shown = `@${h}`; } else why = 'pseudo TikTok illisible';
      break;
    }
    case 'telegram': {
      const h = handleOf(value, /t\.me/);
      if (/^[a-z0-9_]{5,32}$/.test(h) && !NOT_HANDLE.has(h)) { normalized = h; shown = `@${h}`; } else why = 'pseudo Telegram illisible';
      break;
    }
    case 'whatsapp':
    case 'phone': {
      const p = phoneOf(value);
      if (p) { normalized = p; shown = p; } else why = 'numéro illisible';
      break;
    }
    case 'email': {
      const e = lower(value).replace(/^mailto:/, '');
      if (EMAIL.test(e)) { normalized = e; shown = e; } else why = 'adresse e-mail illisible';
      break;
    }
    case 'teams': {
      const e = lower(value);
      if (EMAIL.test(e)) { normalized = e; shown = e; } else { normalized = lower(value).replace(/\s+/g, ' '); why = 'Teams sans adresse : à vérifier'; }
      break;
    }
    default:
      normalized = lower(value).replace(/\s+/g, ' ');
      why = 'réseau non reconnu : à vérifier';
  }
  if (!why && fromImage) why = 'lu sur une image : à vérifier';
  if (!why && !writtenIn({ network, normalized }, `${text}\n${quote}`)) why = 'pas écrit tel quel dans le message : à vérifier';
  return { network, value: shown, normalized, quote, ok: !why, why };
}

/** Every contact of one message, cleaned, without duplicates (same network and normalized value). */
export function cleanContacts(list: RawContact[], text: string, fromImage = false): CleanContact[] {
  const seen = new Set<string>();
  const out: CleanContact[] = [];
  for (const raw of list.slice(0, 10)) {
    const c = cleanContact(raw, text, fromImage);
    if (!c.normalized && !c.value) continue;
    const k = `${c.network}|${c.normalized || c.value}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

/** Where the admin or the ambassador clicks to write to the student, or null (read it as written). */
export function contactLink(network: string, normalized: string): string | null {
  if (!normalized) return null;
  switch (network) {
    case 'instagram': return `https://www.instagram.com/${encodeURIComponent(normalized)}/`;
    case 'snapchat': return `https://www.snapchat.com/add/${encodeURIComponent(normalized)}`;
    case 'tiktok': return `https://www.tiktok.com/@${encodeURIComponent(normalized)}`;
    case 'telegram': return `https://t.me/${encodeURIComponent(normalized)}`;
    case 'whatsapp': return /^\+\d{8,15}$/.test(normalized) ? `https://wa.me/${normalized.slice(1)}` : null;
    case 'phone': return /^\+\d{8,15}$/.test(normalized) ? `tel:${normalized}` : null;
    case 'email': return EMAIL.test(normalized) ? `mailto:${normalized}` : null;
    default: return null;
  }
}
