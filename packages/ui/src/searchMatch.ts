/**
 * Ordine dei suggerimenti mentre si scrive (campi "Cosa cerchi" e "Città"):
 * prima ciò che inizia con le lettere scritte, poi ciò che ha una parola che
 * inizia così ("Cisterna di Latina" per "lat"), poi ciò che le contiene, e
 * infine ciò che le somiglia con un errore di battitura ("Latna" → Latina,
 * docs/CHANGELOG.md §383). Accenti, maiuscole e apostrofi non contano.
 * Funzioni pure, senza dipendenze: girano uguali su web e app.
 */

export function normalizeSearchText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[''`\-./]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Distanza tra due parole contando anche due lettere scambiate ("lainta"/"latina" = 1). */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prevPrev: number[] = new Array(b.length + 1).fill(0);
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j]! + 1, current[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, prevPrev[j - 2]! + 1);
      current.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) return max + 1;
    prevPrev.splice(0, prevPrev.length, ...prev);
    prev = current;
  }
  return prev[b.length]!;
}

/** Errori di battitura tollerati: nessuno sotto le 4 lettere, uno fino a 7, due da 8. */
function allowedTypos(queryLength: number): number {
  if (queryLength < 4) return 0;
  return queryLength >= 8 ? 2 : 1;
}

/**
 * Quanto un testo corrisponde a quello scritto: 0 inizia così, 1 una parola
 * inizia così, 2 lo contiene; con un errore di battitura 3 la prima parola
 * intera somiglia ("Latna" → Latina), 4 il suo inizio somiglia, 5 un'altra
 * parola intera somiglia, 6 l'inizio di un'altra parola somiglia; `null`
 * nessuna corrispondenza. Entrambi i testi già normalizzati.
 */
export function matchTier(text: string, query: string): number | null {
  if (!query) return 0;
  if (text.startsWith(query)) return 0;
  if (text.includes(` ${query}`)) return 1;
  if (text.includes(query)) return 2;
  const max = allowedTypos(query.length);
  if (max === 0) return null;
  // Confronto con ogni parola del testo (dalla parola in poi, così "laquila"
  // trova "l aquila"): prima intera, poi solo il suo inizio lungo quanto
  // quello scritto (±max), "latn" somiglia all'inizio di "latina".
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === " ") starts.push(i + 1);
  let best: number | null = null;
  for (const start of starts) {
    const first = start === 0;
    const wordEnd = text.indexOf(" ", start);
    const word = text.slice(start, wordEnd === -1 ? undefined : wordEnd);
    let tier: number | null = null;
    if (editDistance(query, word, max) <= max) {
      tier = first ? 3 : 5;
    } else {
      for (let length = query.length - max; length <= query.length + max; length++) {
        if (length <= 0 || start + length > text.length) continue;
        if (editDistance(query, text.slice(start, start + length), max) <= max) {
          tier = first ? 4 : 6;
          break;
        }
      }
    }
    if (tier !== null && (best === null || tier < best)) best = tier;
    if (best === 3) break;
  }
  return best;
}

export type SearchIndexEntry<T> = { item: T; text: string; label: string };

/** Testi normalizzati una volta sola per elenco (i comuni sono ~7900). */
export function buildSearchIndex<T>(items: readonly T[], getText: (item: T) => string): SearchIndexEntry<T>[] {
  return items.map((item) => {
    const label = getText(item);
    return { item, label, text: normalizeSearchText(label) };
  });
}

/**
 * Elementi che corrispondono a quello scritto, nell'ordine: corrispondenza
 * (vedi `matchTier`), poi `priority` (più bassa prima, es. città con
 * professionisti prima di quelle senza), poi ordine alfabetico.
 */
export function rankSearchMatches<T>(
  index: readonly SearchIndexEntry<T>[],
  query: string,
  options: { priority?: (item: T) => number; limit?: number } = {},
): T[] {
  const normalizedQuery = normalizeSearchText(query);
  const matches: { entry: SearchIndexEntry<T>; tier: number; priority: number }[] = [];
  for (const entry of index) {
    const tier = matchTier(entry.text, normalizedQuery);
    if (tier === null) continue;
    matches.push({ entry, tier, priority: options.priority?.(entry.item) ?? 0 });
  }
  // Gli errori di battitura servono solo se non c'è niente di meglio:
  // "roma" non deve far comparire "rima" sotto Roma e i suoi simili.
  const exact = matches.filter((match) => match.tier < 3);
  const pool = exact.length > 0 ? exact : matches;
  pool.sort((a, b) => a.tier - b.tier || a.priority - b.priority || a.entry.label.localeCompare(b.entry.label, "it"));
  const ranked = pool.map((match) => match.entry.item);
  return options.limit === undefined ? ranked : ranked.slice(0, options.limit);
}
