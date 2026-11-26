/** Lower-cased, trimmed, accent-folded text for search comparison ("  Crème " -> "creme") */
export function normalizeSearch(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

/** True when the normalised query appears in any of the fields; a blank query matches everything */
export function matchesQuery(query: string, ...fields: string[]): boolean {
  const q = normalizeSearch(query);
  return q === "" || fields.some((f) => normalizeSearch(f).includes(q));
}
