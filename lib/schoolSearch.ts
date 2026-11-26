// School search shared by the registration form and the ambassador pickers.
// A school covers all of its campuses, so a query like "IPSA Toulouse" or "Neoma Business School Rouen"
// must still find it: the query is split into words and schools are ranked by the words they match.

type Searchable = { name: string; short_name?: string; state?: string; email_domains?: string[] };

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function searchSchools<T extends Searchable>(schools: T[], query: string): T[] {
  const words = normalize(query).split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
  if (!words.length) {
    // The list only opens once the person types: a first letter shows the schools whose name starts with it.
    const letter = normalize(query).replace(/[^a-z0-9]/g, '');
    if (!letter) return query.trim() ? [] : schools;
    return schools.filter((s) => [s.name, s.short_name ?? ''].some((n) => normalize(n).replace(/[^a-z0-9]/g, '').startsWith(letter)));
  }
  const hays = schools.map((s) =>
    normalize(`${s.name} ${s.short_name ?? ''} ${s.state ?? ''} ${(s.email_domains ?? []).join(' ')}`),
  );
  // A rare word ("ipsa") weighs more than a common one ("toulouse", "business"), so the school typed comes first.
  const weight = words.map((w) => 1 / Math.max(1, hays.filter((h) => h.includes(w)).length));
  return schools
    .map((s, i) => ({ s, score: words.reduce((sum, w, k) => sum + (hays[i].includes(w) ? weight[k] : 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.s);
}
