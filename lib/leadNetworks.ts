// The "become an ambassador?" question asked before the certificate (24/11): the networks a learner can leave to be
// reached on. Shared by the form (browser check), the action (server check) and the admin list (link to the profile).
export const LEAD_NETWORKS = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'snapchat', label: 'Snapchat' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'whatsapp', label: 'WhatsApp' },
] as const;

export type LeadNetwork = (typeof LEAD_NETWORKS)[number]['id'];

export const LEAD_HANDLE_MIN = 2;
export const LEAD_HANDLE_MAX = 120;
export const LEAD_SCHOOLS_MAX = 200;

export const isLeadNetwork = (v: string): v is LeadNetwork => LEAD_NETWORKS.some((n) => n.id === v);
export const leadNetworkLabel = (id: string) => LEAD_NETWORKS.find((n) => n.id === id)?.label ?? id;

const PROFILE: Record<LeadNetwork, (name: string) => string> = {
  instagram: (n) => `https://www.instagram.com/${n}`,
  linkedin: (n) => `https://www.linkedin.com/in/${n}`,
  snapchat: (n) => `https://www.snapchat.com/add/${n}`,
  tiktok: (n) => `https://www.tiktok.com/@${n}`,
  whatsapp: (n) => `https://wa.me/${n}`,
};

/**
 * Where the admin clicks to reach the learner: the link they pasted, or the profile built from their handle.
 * Null when what they wrote is neither (a full name, a local phone number): the admin reads it as written.
 * Only http(s) addresses ever come out of here.
 */
export function leadLink(network: string, handle: string): string | null {
  const h = handle.trim();
  if (/^https?:\/\/\S+$/i.test(h)) return h;
  if (/^(www\.)?(instagram|linkedin|snapchat|tiktok)\.com\/\S+$/i.test(h) || /^wa\.me\/\S+$/i.test(h)) return `https://${h}`;
  if (!isLeadNetwork(network)) return null;
  if (network === 'whatsapp') {
    // Only a number written with its country code: a local one cannot be turned into a link without guessing.
    if (!/^(\+|00)/.test(h)) return null;
    const digits = h.replace(/\D/g, '').replace(/^00/, '');
    return digits.length >= 8 && digits.length <= 15 ? PROFILE.whatsapp(digits) : null;
  }
  const name = h.replace(/^@/, '');
  return /^[\w.-]{2,60}$/.test(name) ? PROFILE[network](name) : null;
}
