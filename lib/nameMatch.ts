// Même personne d'après le nom (26/11) : un ticket peut venir d'une autre adresse que celle du paiement, sans référence
// de commande (le formulaire laisse taper n'importe quelle adresse et la référence y est facultative). Pour les relances,
// le nom tapé dans le ticket est donc comparé au prénom et au nom de l'inscription. Sans base de données : testable seul.

/** The words of a name, without accents or case; single letters (initials) and punctuation dropped. */
export function nameTokens(name: string): string[] {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 2);
}

/**
 * True when two names are the same person's: each has at least two words (a first name alone proves nothing), and every
 * word of the shorter one is in the longer one, in any order ("Dupont Marie" = "Marie Dupont" = "Marie Claire Dupont").
 */
export function sameName(a: string, b: string): boolean {
  const x = new Set(nameTokens(a));
  const y = new Set(nameTokens(b));
  if (x.size < 2 || y.size < 2) return false;
  const [small, big] = x.size <= y.size ? [x, y] : [y, x];
  return [...small].every((w) => big.has(w));
}
