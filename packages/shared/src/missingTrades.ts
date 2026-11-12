import { PROFESSIONAL_CATEGORIES } from "./categories";
import { findComuneByName, italianComuni } from "./data/comuni";

/**
 * Mestieri che il sito non ha ancora, scritti dall'intelligenza artificiale
 * quando nessun mestiere del sito va bene (docs/changelog/2026-11-11-mestieri-che-mancano.md,
 * richiesta di Luca): in "Mestieri richiesti" contati per nome e per zona, e
 * un consiglio in Home Admin quando un mestiere supera la soglia.
 */

/** Richieste in 30 giorni da cui un mestiere che manca diventa un consiglio in Admin. */
export const MISSING_TRADE_ADVICE_MIN = 10;
/** Mestieri mostrati nel riquadro. */
export const MISSING_TRADES_SHOWN = 20;
/** Zone mostrate per ogni mestiere. */
export const MISSING_TRADE_ZONES_SHOWN = 3;

export type MissingTrade = {
  name: string;
  count: number;
  /** Province con più richieste, la più alta prima; "Senza città" se il cliente non l'ha scritta. */
  zones: { label: string; count: number }[];
};

const tradeKey = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]+/g, " ")
    .trim();

const CATEGORY_KEYS = new Set(PROFESSIONAL_CATEGORIES.map((category) => tradeKey(category.label)));

/** Spazi, virgolette e punteggiatura che l'IA a volte mette intorno al nome. */
const EDGE_CHARS = new Set([..." \t\n\r\"'«»“”.,;:!?-"]);

/**
 * Il nome del mestiere scritto dall'IA, pulito: una-quattro parole, niente
 * numeri o simboli, prima lettera maiuscola. Null se non è un nome di
 * mestiere o se è un mestiere che il sito ha già.
 */
export function cleanMissingTrade(raw: string | null | undefined): string | null {
  // Il testo arriva anche dall'indirizzo della ricerca: mai più lungo di così,
  // e i bordi si tolgono senza espressioni regolari (nessun testo può rallentarle).
  if (!raw || raw.length > 100) return null;
  let start = 0;
  let end = raw.length;
  while (start < end && EDGE_CHARS.has(raw[start]!)) start += 1;
  while (end > start && EDGE_CHARS.has(raw[end - 1]!)) end -= 1;
  const name = raw.slice(start, end).split(/\s/).filter(Boolean).join(" ");
  if (name.length < 3 || name.length > 40) return null;
  if (/[0-9@#<>[\]{}/\\_=+*|]/.test(name)) return null;
  if (name.split(" ").length > 4) return null;
  const key = tradeKey(name);
  if (!key || CATEGORY_KEYS.has(key)) return null;
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

let capoluogoByProvince: Map<string, string> | null = null;

/** "Latina e provincia" per un comune del Lazio, "Senza città" se manca, il testo scritto se non è un comune. */
export function missingTradeZone(city: string | null | undefined): string {
  const trimmed = city?.trim();
  if (!trimmed) return "Senza città";
  const comune = findComuneByName(trimmed);
  if (!comune) return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  capoluogoByProvince ??= new Map(italianComuni().filter((c) => c.capoluogo).map((c) => [c.province, c.name]));
  return `${capoluogoByProvince.get(comune.province) ?? comune.name} e provincia`;
}

/** Raggruppa le descrizioni per mestiere che manca (stesso nome senza maiuscole e accenti), poi per zona. */
export function buildMissingTrades(rows: readonly { missingTrade: string | null; city: string | null }[]): MissingTrade[] {
  const groups = new Map<string, { names: Map<string, number>; count: number; zones: Map<string, number> }>();
  for (const row of rows) {
    const name = cleanMissingTrade(row.missingTrade);
    if (!name) continue;
    const key = tradeKey(name);
    const group = groups.get(key) ?? { names: new Map(), count: 0, zones: new Map() };
    group.count += 1;
    group.names.set(name, (group.names.get(name) ?? 0) + 1);
    const zone = missingTradeZone(row.city);
    group.zones.set(zone, (group.zones.get(zone) ?? 0) + 1);
    groups.set(key, group);
  }
  const byCount = <T extends string>(map: Map<T, number>) =>
    [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "it"));
  return [...groups.values()]
    .map((group) => ({
      // Il nome scritto più spesso.
      name: byCount(group.names)[0]![0],
      count: group.count,
      zones: byCount(group.zones)
        .slice(0, MISSING_TRADE_ZONES_SHOWN)
        .map(([label, count]) => ({ label, count })),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "it"));
}

/**
 * Parole da cercare nelle prestazioni, nei patentini e nella descrizione dei
 * professionisti per un mestiere che il sito non ha, come per i lavori fuori
 * servizio fissi (`OUT_OF_SERVICE_KEYWORDS`): la radice della parola più lunga,
 * così "Sarto" trova anche "sartoria" e "Tecnico antenne" non trova ogni tecnico.
 */
/** Parole che da sole non dicono il mestiere. */
const GENERIC_TRADE_WORDS = new Set(["tecnico", "tecnica", "addetto", "addetta", "operaio", "esperto", "esperta", "specialista", "impresa", "ditta", "servizio", "servizi", "riparatore", "riparazione"]);

export function missingTradeKeywords(name: string): string[] {
  const words = tradeKey(name)
    .split(" ")
    .filter((word) => word.length >= 4 && !GENERIC_TRADE_WORDS.has(word));
  const longest = words.sort((a, b) => b.length - a.length)[0];
  if (!longest) return [];
  return [longest.length > 4 ? longest.slice(0, -1) : longest];
}
