// School search shared by the registration form and the ambassador pickers.
// A school covers all of its campuses, so a query like "IPSA Toulouse" or "Neoma Business School Rouen"
// must still find it: the query is split into words and schools are ranked by the words they match.

type Searchable = { name: string; short_name?: string; state?: string; email_domains?: string[] };

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function searchSchools<T extends Searchable>(schools: T[], query: string): T[] {
  const words = normalize(query).split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
  if (!words.length) return query.trim() ? [] : schools;
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
