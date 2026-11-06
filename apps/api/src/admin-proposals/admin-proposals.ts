import { createHash } from "node:crypto";
import {
  PROFESSIONAL_CATEGORIES,
  SUGGESTED_PROBLEM_EXAMPLES,
  describeProblemExample,
  isProfessionalCategorySlug,
  matchProblem,
  nearlySameServiceName,
  normalizeProblemText,
  serviceNameKey,
  type ProfessionalCategorySlug,
  type ServiceNamesAdminOverview,
} from "@professionisti/shared";

/**
 * Regole delle proposte da approvare in Admin, senza database
 * (docs/changelog/2026-11-03-automazioni-admin.md). Ogni soglia è scritta qui.
 */

export const categoryLabel = (slug: string): string => PROFESSIONAL_CATEGORIES.find((c) => c.slug === slug)?.label ?? slug;

/** Chiave corta e stabile di un gruppo di persone: la stessa lista dà la stessa proposta. */
export function groupKey(ids: string[]): string {
  return createHash("sha256").update([...ids].sort().join(",")).digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------
// 1. Frase d'esempio in home
// ---------------------------------------------------------------------------

/**
 * Per ogni mestiere senza nemmeno una frase d'esempio, la prima frase pronta
 * che il dizionario riconosce e che non c'è già. Prima i mestieri più cercati.
 */
export function missingExamplePhrases(
  current: { text: string; categorySlug: string | null }[],
  popularity: { slug: string; count: number }[],
): { categorySlug: ProfessionalCategorySlug; text: string; searches: number }[] {
  const covered = new Set(current.map((e) => e.categorySlug).filter(Boolean));
  const taken = new Set(current.map((e) => e.text.toLocaleLowerCase("it")));
  const countBy = new Map(popularity.map((p) => [p.slug, p.count]));
  return PROFESSIONAL_CATEGORIES.flatMap((category) => {
    if (covered.has(category.slug)) return [];
    const text = SUGGESTED_PROBLEM_EXAMPLES[category.slug].find(
      (t) => !taken.has(t.toLocaleLowerCase("it")) && describeProblemExample(t).categorySlug === category.slug,
    );
    return text ? [{ categorySlug: category.slug, text, searches: countBy.get(category.slug) ?? 0 }] : [];
  }).sort((a, b) => b.searches - a.searches);
}

// ---------------------------------------------------------------------------
// 2. Parola nuova per il dizionario
// ---------------------------------------------------------------------------

/**
 * Volte in cui l'IA ha indicato lo stesso mestiere per la parola. Regole
 * severe da subito, sempre con l'approvazione di Luca, mai insegnate da sole
 * (decisione del 06/11/2026, docs/changelog/2026-11-06-ia-conosce-i-servizi.md).
 */
export const WORD_MIN_AI_ANSWERS = 10;
/** Quota delle descrizioni con la parola che finiscono su quel mestiere: una parola insegnata vince su tutto. */
export const WORD_MIN_SHARE = 0.9;
/** Parole troppo generiche per portare a un solo mestiere, anche se l'IA lo ha fatto. */
const GENERIC_WORDS = new Set(
  (
    "casa case bagno bagni cucina cucine stanza stanze camera camere salone salotto appartamento appartamenti villa villetta " +
    "condominio palazzo piano terrazzo balcone giardino cortile garage cantina soffitta ufficio negozio " +
    "lavoro lavori lavoretto intervento interventi problema problemi urgente urgenza subito domani oggi stasera settimana " +
    "bisogno serve servono servirebbe vorrei cerco cerchiamo chiedo preventivo preventivi prezzo costo quanto " +
    "persona qualcuno qualche nuovo nuova vecchio vecchia grande grandi piccolo piccola tutto tutta tutti tutte molto " +
    "sempre ancora quando perche anche fare fatto fatta dopo prima dentro fuori sopra sotto"
  ).split(" "),
);

/** Radice della parola: "infiltrazione" e "infiltrazioni" diventano "infiltrazion" (si insegna così al dizionario). */
export function wordStem(word: string): string {
  return word.length >= 6 ? word.replace(/[aeiou]$/, "") : word;
}

export type DescriptionRow = { text: string; categories: string[]; source: string; outOfService: string | null };

/**
 * Parole che i clienti scrivono, che il dizionario non conosce, e per cui
 * l'IA ha indicato lo stesso mestiere almeno WORD_MIN_AI_ANSWERS volte.
 * Solo parole di lettere (mai numeri: niente indirizzi o telefoni), lunghe
 * almeno 5, non generiche. Le descrizioni sono già senza contatti.
 */
export function dictionaryWordCandidates(
  rows: DescriptionRow[],
  taughtWords: string[],
): { stem: string; example: string; categorySlug: ProfessionalCategorySlug; aiAnswers: number; total: number }[] {
  type Stat = { total: number; byCategory: Map<string, number>; aiByCategory: Map<string, number>; variants: Map<string, number> };
  const stats = new Map<string, Stat>();
  for (const row of rows) {
    const words = new Set(normalizeProblemText(row.text).trim().split(" ").filter((w) => /^[a-z]{5,30}$/.test(w) && !GENERIC_WORDS.has(w)));
    const stems = new Map<string, string>();
    for (const w of words) stems.set(wordStem(w), w);
    const first = row.outOfService ? null : row.categories[0] ?? null;
    for (const [stem, variant] of stems) {
      const stat = stats.get(stem) ?? { total: 0, byCategory: new Map(), aiByCategory: new Map(), variants: new Map() };
      stat.total += 1;
      stat.variants.set(variant, (stat.variants.get(variant) ?? 0) + 1);
      if (first) {
        stat.byCategory.set(first, (stat.byCategory.get(first) ?? 0) + 1);
        if (row.source === "ia") stat.aiByCategory.set(first, (stat.aiByCategory.get(first) ?? 0) + 1);
      }
      stats.set(stem, stat);
    }
  }
  const taught = taughtWords.map((w) => w.trim()).filter(Boolean);
  const result: { stem: string; example: string; categorySlug: ProfessionalCategorySlug; aiAnswers: number; total: number }[] = [];
  for (const [stem, stat] of stats) {
    const best = [...stat.aiByCategory.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!best || best[1] < WORD_MIN_AI_ANSWERS || !isProfessionalCategorySlug(best[0])) continue;
    if ((stat.byCategory.get(best[0]) ?? 0) / stat.total < WORD_MIN_SHARE) continue;
    // Già insegnata (le parole insegnate valgono come inizio di parola).
    if (taught.some((t) => stem.startsWith(t) || t.startsWith(stem))) continue;
    const example = [...stat.variants.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
    // Il dizionario la conosce già: nessun bisogno di insegnarla.
    if (matchProblem(example).categories.length > 0) continue;
    result.push({ stem, example, categorySlug: best[0], aiAnswers: best[1], total: stat.total });
  }
  return result.sort((a, b) => b.aiAnswers - a.aiAnswers || a.stem.localeCompare(b.stem));
}

// ---------------------------------------------------------------------------
// 3. Prestazione da suggerire e 4. nomi quasi uguali
// ---------------------------------------------------------------------------

/**
 * Prestazioni scritte a mano da almeno `minProfessionals` professionisti
 * (le stesse che "Prestazioni per mestiere" segna da aggiungere), una volta
 * sola: nel mestiere dove le usano in più. Mai un nome quasi uguale a una
 * standard: quello si propone di unire.
 */
export function standardServiceCandidates(overview: ServiceNamesAdminOverview): { categorySlug: ProfessionalCategorySlug; name: string; professionals: number }[] {
  const best = new Map<string, { categorySlug: ProfessionalCategorySlug; name: string; professionals: number }>();
  for (const category of overview.categories) {
    if (!isProfessionalCategorySlug(category.slug)) continue;
    for (const row of category.handwritten) {
      if (row.professionalCount < overview.minProfessionals) continue;
      if (category.standard.some((s) => nearlySameServiceName(s.name, row.name))) continue;
      const key = serviceNameKey(row.name);
      const current = best.get(key);
      if (!current || row.professionalCount > current.professionals) best.set(key, { categorySlug: category.slug, name: row.name, professionals: row.professionalCount });
    }
  }
  return [...best.values()].sort((a, b) => b.professionals - a.professionals || a.name.localeCompare(b.name, "it"));
}

/**
 * Nomi scritti a mano quasi uguali a un altro dello stesso mestiere: prima
 * a una prestazione standard, poi a un nome scritto da più professionisti.
 * Si unisce sempre il nome meno usato a quello più usato.
 */
export function mergeCandidates(overview: ServiceNamesAdminOverview): { categorySlug: ProfessionalCategorySlug; name: string; canonical: string; professionals: number }[] {
  const aliased = new Set(overview.aliases.map((a) => a.key));
  const seen = new Set<string>();
  const result: { categorySlug: ProfessionalCategorySlug; name: string; canonical: string; professionals: number }[] = [];
  for (const category of overview.categories) {
    if (!isProfessionalCategorySlug(category.slug)) continue;
    for (const row of category.handwritten) {
      const key = serviceNameKey(row.name);
      if (seen.has(key) || aliased.has(key)) continue;
      const standard = category.standard.find((s) => nearlySameServiceName(s.name, row.name));
      const other = standard
        ? null
        : category.handwritten.find(
            (o) => o !== row && nearlySameServiceName(o.name, row.name) && (o.professionalCount > row.professionalCount || (o.professionalCount === row.professionalCount && o.name.localeCompare(row.name, "it") < 0)),
          );
      const canonical = standard?.name ?? other?.name;
      if (!canonical) continue;
      seen.add(key);
      result.push({ categorySlug: category.slug, name: row.name, canonical, professionals: row.professionalCount });
    }
  }
  return result.sort((a, b) => b.professionals - a.professionals || a.name.localeCompare(b.name, "it"));
}

// ---------------------------------------------------------------------------
// 5. Profilo incompleto e 6. consiglio di mettersi in pausa
// ---------------------------------------------------------------------------

/** Iscritti da almeno tanti giorni: dopo le due email automatiche (il giorno dopo e dopo una settimana). */
export const PROFILE_REMINDER_MIN_DAYS = 10;
/** Oltre questi giorni non si scrive più: chi non ha finito in due mesi non lo farà per un'email. */
export const PROFILE_REMINDER_MAX_DAYS = 60;
/** Una sola email "Completa il profilo" ogni tanti giorni, automatica o approvata. */
export const PROFILE_REMINDER_GAP_DAYS = 14;
/** Richieste senza nessuna risposta negli ultimi PAUSE_WINDOW_DAYS giorni. */
export const PAUSE_MIN_REQUESTS = 3;
export const PAUSE_WINDOW_DAYS = 14;
/** Lo stesso consiglio al massimo ogni tanti giorni. */
export const PAUSE_GAP_DAYS = 60;

export type LeadRow = { professionalProfileId: string; guidedRequestId: string; status: string; hidden: boolean };

/**
 * Professionisti con almeno PAUSE_MIN_REQUESTS richieste nella finestra e
 * nessuna aperta davvero: né un preventivo, né un messaggio scritto, né un
 * rifiuto, né "Elimina" dalla lista. Quante richieste per ognuno.
 */
export function silentProfessionals(leads: LeadRow[], answered: Set<string>): Map<string, number> {
  const byPro = new Map<string, { total: number; touched: boolean }>();
  for (const lead of leads) {
    const row = byPro.get(lead.professionalProfileId) ?? { total: 0, touched: false };
    row.total += 1;
    if (lead.hidden || lead.status === "DECLINED" || lead.status === "CONVERTED" || answered.has(`${lead.guidedRequestId}|${lead.professionalProfileId}`)) row.touched = true;
    byPro.set(lead.professionalProfileId, row);
  }
  return new Map([...byPro.entries()].filter(([, r]) => !r.touched && r.total >= PAUSE_MIN_REQUESTS).map(([id, r]) => [id, r.total]));
}

// ---------------------------------------------------------------------------
// 7. Account di prova
// ---------------------------------------------------------------------------

/** Si propone di eliminarli da tanti giorni prima del lancio (prima servono ancora per provare il sito). */
export const TEST_ACCOUNTS_DAYS_BEFORE_LAUNCH = 7;

export function testAccountsProposalDue(now: Date, launch: Date | null): boolean {
  return !!launch && now.getTime() >= launch.getTime() - TEST_ACCOUNTS_DAYS_BEFORE_LAUNCH * 24 * 60 * 60_000;
}
