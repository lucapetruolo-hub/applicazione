import { createHash } from "node:crypto";
import { isProfessionalCategorySlug, normalizeProblemText, type AiAgreementMonth, type AiBankArea, type AiBankOrigin } from "@professionisti/shared";

/**
 * Regole del "sito che impara", senza database
 * (docs/changelog/2026-11-27-il-sito-impara.md). Ogni soglia è scritta qui.
 */

/** Casi al massimo in un giro del banco: tiene basso il costo dell'IA. */
export const BANK_RUN_MAX = 60;
/** Casi d'accordo con l'admin aggiunti alla prova di una regola: una regola nuova non deve rompere quelli giusti. */
export const RULE_TEST_AGREED = 15;
/** Errori dell'admin (ultimi 60 giorni) che servono per chiedere all'IA una regola nuova. */
export const RULE_MIN_DISAGREEMENTS = 2;
/** Regole proposte al massimo per settimana. */
export const RULE_MAX_PER_WEEK = 2;
/** Ricerche senza risultato con la stessa parola, negli ultimi 30 giorni, per chiedere all'IA che mestiere sia. */
export const NO_RESULT_MIN_SEARCHES = 3;
/** Parole senza risultato provate al massimo ogni notte. */
export const NO_RESULT_MAX_PER_NIGHT = 5;
/** Giorni dopo i quali un caso esce dal banco (come le descrizioni di "Mestieri richiesti"). */
export const BANK_RETENTION_DAYS = 365;

/** Un caso pronto da salvare nel banco. */
export type BankCaseDraft = {
  area: AiBankArea;
  sourceKey: string;
  origin: AiBankOrigin;
  kind: string | null;
  input: string;
  withPhoto: boolean;
  allowed: string[];
  aiAnswer: string;
  expected: string;
};

/** Il testo di una ricerca è utile al banco solo se dice qualcosa (almeno 3 parole o 15 lettere). */
function usefulText(text: string): boolean {
  const clean = text.trim();
  return clean.length >= 15 || clean.split(/\s+/).length >= 3;
}

/**
 * Richieste in cui il cliente ha cambiato il mestiere suggerito dal sito:
 * il mestiere scelto è la risposta giusta (decide una persona, non l'IA).
 */
export function changedRequestCases(rows: { id: string; description: string; suggested: string | null; chosen: string }[]): BankCaseDraft[] {
  return rows.flatMap((r) => {
    if (!r.suggested || r.suggested === r.chosen || !usefulText(r.description) || !isProfessionalCategorySlug(r.chosen)) return [];
    return [
      {
        area: "RICERCA",
        sourceKey: `gr:${r.id}`,
        origin: "CATEGORIA_CAMBIATA",
        kind: null,
        input: r.description.slice(0, 1000),
        withPhoto: false,
        allowed: [],
        aiAnswer: r.suggested,
        expected: r.chosen,
      },
    ];
  });
}

/**
 * Ricerche in cui il cliente ha toccato un altro mestiere: senza nessun
 * mestiere proposto ("il sito non trovava nessuno") o un mestiere diverso dal primo.
 */
export function searchChoiceCases(rows: { id: string; text: string; categories: string[]; chosen: string | null; withPhoto: boolean; outOfService: string | null }[]): BankCaseDraft[] {
  return rows.flatMap((r) => {
    if (!r.chosen || !isProfessionalCategorySlug(r.chosen) || r.categories[0] === r.chosen || !usefulText(r.text)) return [];
    const none = r.categories.length === 0;
    return [
      {
        area: "RICERCA",
        sourceKey: `pd:${r.id}`,
        origin: none ? "NESSUN_RISULTATO" : "SCELTO_ALTRO",
        kind: null,
        input: r.text.slice(0, 1000),
        withPhoto: r.withPhoto,
        allowed: [],
        aiAnswer: none ? (r.outOfService ? `fuori servizio: ${r.outOfService}` : "nessuno") : r.categories[0]!,
        expected: r.chosen,
      },
    ];
  });
}

/** Proposte dell'IA in Admin decise diversamente dall'admin, con il caso ancora leggibile. */
export function adminDisagreementCases(rows: { id: string; kind: string; decision: string; adminDecision: string | null; agrees: boolean | null; caseText: string | null; allowed: string[] }[]): BankCaseDraft[] {
  return rows.flatMap((r) => {
    if (r.agrees !== false || !r.adminDecision || !r.caseText) return [];
    return [
      {
        area: "ADMIN",
        sourceKey: `advice:${r.id}`,
        origin: "ADMIN_DIVERSO",
        kind: r.kind,
        input: r.caseText,
        withPhoto: false,
        allowed: r.allowed,
        aiAnswer: r.decision,
        expected: r.adminDecision,
      },
    ];
  });
}

/** Risposta giusta per un caso della ricerca: il primo mestiere è quello scelto dal cliente. */
export function searchAnswerRight(expected: string, categories: string[]): boolean {
  return categories[0] === expected;
}

/** Risposta giusta per un caso dell'Admin. "UPHELD" (pagamento diretto) vale per ogni percentuale. */
export function adminAnswerRight(expected: string, decision: string | null): boolean {
  if (!decision) return false;
  if (expected === "UPHELD") return decision.startsWith("UPHELD");
  return decision === expected;
}

/**
 * Confronto tra l'ultimo giro e quello prima. Se le istruzioni sono cambiate
 * e le giuste sono scese (in proporzione), la frase da mostrare in rosso.
 */
export function bankWorse(
  area: string,
  last: { instructionsHash: string; total: number; correct: number } | null,
  previous: { instructionsHash: string; total: number; correct: number } | null,
): string | null {
  if (!last || !previous || last.total === 0 || previous.total === 0) return null;
  if (last.instructionsHash === previous.instructionsHash) return null;
  const now = last.correct / last.total;
  const before = previous.correct / previous.total;
  // Un caso di scarto: con pochi casi una risposta che cambia da sola non è un peggioramento.
  if (now >= before - 1 / Math.max(last.total, previous.total)) return null;
  return `Le istruzioni nuove dell'IA (${area}) sbagliano di più: ${last.correct} giuste su ${last.total}, prima ${previous.correct} su ${previous.total}. Conviene tornare alle istruzioni di prima.`;
}

/** Proposte decise dall'admin mese per mese (ora di Roma), dal più recente. */
export function agreementByMonth(rows: { adminDecidedAt: Date | null; agrees: boolean | null }[], months = 6): AiAgreementMonth[] {
  const byMonth = new Map<string, AiAgreementMonth>();
  for (const r of rows) {
    if (!r.adminDecidedAt || r.agrees === null) continue;
    const month = r.adminDecidedAt.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }).slice(0, 7);
    const m = byMonth.get(month) ?? { month, decided: 0, agreed: 0 };
    m.decided += 1;
    if (r.agrees) m.agreed += 1;
    byMonth.set(month, m);
  }
  return [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month)).slice(0, months);
}

/** Il mese prima di `now`, nel formato "AAAA-MM" (ora di Roma). */
export function previousMonth(now: Date): string {
  const [y, m] = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }).slice(0, 7).split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** Parole che non dicono niente da sole: mai proposte. */
const COMMON_WORDS = new Set(
  (
    "casa bagno cucina stanza camera salone appartamento villa condominio palazzo piano terrazzo balcone giardino garage cantina ufficio " +
    "lavoro lavori intervento problema problemi urgente subito domani oggi bisogno serve servono vorrei cerco preventivo prezzo costo quanto " +
    "qualcuno nuovo nuova vecchio vecchia grande piccolo piccola tutto molto sempre ancora quando perche anche fare fatto dopo prima dentro fuori sopra sotto " +
    "rotto rotta rotti guasto funziona"
  ).split(" "),
);

/** Radice della parola, come le parole insegnate al dizionario ("serrande" → "serrand"). */
export function stemOf(word: string): string {
  return word.length >= 6 ? word.replace(/[aeiou]$/, "") : word;
}

/** Una parola delle ricerche senza risultato, con le ricerche in cui compare. */
export type NoResultWord = {
  stem: string;
  word: string;
  searches: number;
  example: string;
  /** Posizione delle ricerche (in `rows`) che contengono la parola. */
  rows: number[];
  /** Mestiere scelto poi dai clienti in queste ricerche, il più frequente, con quante volte. */
  chosen: { slug: string; count: number } | null;
};

/**
 * Parole delle ricerche senza nessun risultato (né mestiere né fuori
 * servizio), scritte in almeno NO_RESULT_MIN_SEARCHES ricerche: con la frase
 * più frequente. Mai numeri, mai parole già insegnate.
 */
export function noResultWords(rows: { text: string; chosen?: string | null }[], taughtWords: string[]): NoResultWord[] {
  const taught = taughtWords.map((w) => w.trim()).filter(Boolean);
  const stats = new Map<string, { rows: number[]; words: Map<string, number>; examples: Map<string, number>; chosen: Map<string, number> }>();
  rows.forEach((r, index) => {
    const text = r.text.trim().slice(0, 300);
    const words = new Set(normalizeProblemText(text).trim().split(" ").filter((w) => /^[a-z]{5,30}$/.test(w) && !COMMON_WORDS.has(w)));
    const stems = new Map<string, string>();
    for (const w of words) stems.set(stemOf(w), w);
    for (const [stem, word] of stems) {
      const s = stats.get(stem) ?? { rows: [] as number[], words: new Map<string, number>(), examples: new Map<string, number>(), chosen: new Map<string, number>() };
      s.rows.push(index);
      s.words.set(word, (s.words.get(word) ?? 0) + 1);
      s.examples.set(text, (s.examples.get(text) ?? 0) + 1);
      if (r.chosen) s.chosen.set(r.chosen, (s.chosen.get(r.chosen) ?? 0) + 1);
      stats.set(stem, s);
    }
  });
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return [...stats.entries()]
    .filter(([stem, s]) => s.rows.length >= NO_RESULT_MIN_SEARCHES && !taught.some((t) => stem.startsWith(t) || t.startsWith(stem)))
    .map(([stem, s]) => {
      const chosen = top(s.chosen);
      return { stem, word: top(s.words)![0], searches: s.rows.length, example: top(s.examples)![0], rows: s.rows, chosen: chosen ? { slug: chosen[0], count: chosen[1] } : null };
    })
    .sort((a, b) => b.searches - a.searches || a.stem.localeCompare(b.stem));
}

/**
 * Parole che vengono dalle stesse ricerche di una parola più forte già
 * provata ("serranda bloccata": "bloccata" segue "serranda"): almeno metà
 * delle sue ricerche è già coperta. Si prova una parola per gruppo.
 */
export function sameSearches(word: { rows: number[] }, covered: Set<number>): boolean {
  return word.rows.filter((i) => covered.has(i)).length * 2 >= word.rows.length;
}

/** Chiave stabile di una regola proposta: la stessa frase dà la stessa proposta (e un "No, mai" vale per sempre). */
export function ruleKey(text: string): string {
  return `AI_RULE:${createHash("sha256").update(text.trim().toLocaleLowerCase("it")).digest("hex").slice(0, 16)}`;
}

/**
 * Una regola proposta dall'IA si può mostrare? Corta, senza contatti né
 * nomi di persone, senza numeri di telefono o link, senza istruzioni per
 * l'IA che tolgano le regole del sito.
 */
export function cleanRule(text: string): string | null {
  const clean = text.replace(/\s+/g, " ").trim().replace(/^[-•]\s*/, "");
  if (clean.length < 20 || clean.length > 300) return null;
  if (/@|https?:|www\.|\d{6,}/i.test(clean)) return null;
  if (/ignora|dimentica|non seguire|sostituisc/i.test(clean)) return null;
  return clean.endsWith(".") ? clean : `${clean}.`;
}

/**
 * Una regola si propone solo se sul banco migliora: più risposte giuste di
 * prima e nessun caso d'accordo con l'admin che diventa sbagliato.
 */
export function ruleImproves(result: { before: number; after: number; brokenAgreed: number }): boolean {
  return result.after > result.before && result.brokenAgreed === 0;
}
