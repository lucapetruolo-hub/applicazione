/**
 * Il sito impara da quello che succede, ma decide sempre l'admin
 * (docs/changelog/2026-11-27-il-sito-impara.md, migliorie 1-2-3 scelte da
 * Luca il 27/11/2026). Tre parti:
 * 1. ricerche senza risultato e categorie cambiate diventano proposte per il dizionario;
 * 2. ogni errore vero dell'IA entra nel banco di prova, che si rifà quando cambiano le istruzioni;
 * 3. quando l'admin decide diversamente dall'IA, l'IA propone una regola nuova,
 *    provata prima sul banco: si propone solo se migliora.
 * Niente cambia da solo: dizionario e regole cambiano solo con "Approva".
 */

/** Le parti del sito in cui risponde l'IA, ognuna col suo banco. */
export const AI_BANK_AREAS = ["RICERCA", "ADMIN"] as const;
export type AiBankArea = (typeof AI_BANK_AREAS)[number];

export const AI_BANK_AREA_LABEL: Record<AiBankArea, string> = {
  RICERCA: "Ricerca dal problema",
  ADMIN: "Proposte in Admin",
};

/** Da dove viene un caso del banco. */
export const AI_BANK_ORIGINS = ["CATEGORIA_CAMBIATA", "NESSUN_RISULTATO", "SCELTO_ALTRO", "ADMIN_DIVERSO"] as const;
export type AiBankOrigin = (typeof AI_BANK_ORIGINS)[number];

export const AI_BANK_ORIGIN_LABEL: Record<AiBankOrigin, string> = {
  CATEGORIA_CAMBIATA: "Il cliente ha cambiato il mestiere",
  NESSUN_RISULTATO: "Il sito non trovava nessuno",
  SCELTO_ALTRO: "Il cliente ha scelto un altro mestiere",
  ADMIN_DIVERSO: "Hai deciso diversamente",
};

/** Un caso del banco: cosa ha risposto l'IA e cosa era giusto. */
export type AiBankCaseView = {
  id: string;
  area: AiBankArea;
  origin: AiBankOrigin;
  /** Testo del caso, già senza contatti, accorciato per la tabella. */
  input: string;
  /** Con foto: la foto non si tiene, il banco la rifà solo a parole. */
  withPhoto: boolean;
  aiAnswer: string;
  expected: string;
  createdAt: string;
};

/** Un giro del banco: quanti casi giusti con le istruzioni di quel momento. */
export type AiBankRunView = {
  area: AiBankArea;
  ranAt: string;
  total: number;
  correct: number;
  /** Le istruzioni sono cambiate dal giro prima. */
  newInstructions: boolean;
};

export type AiRuleView = {
  id: string;
  text: string;
  createdAt: string;
  /** Prova sul banco prima di approvarla: giuste senza e con la regola. */
  before: number;
  after: number;
  total: number;
};

/** Quante proposte dell'IA in Admin sono state approvate così com'erano, mese per mese. */
export type AiAgreementMonth = { month: string; decided: number; agreed: number };

export type AiLearningOverview = {
  /** Casi nel banco per parte, e quanti entrati negli ultimi 7 giorni. */
  bank: { area: AiBankArea; total: number; lastWeek: number }[];
  /** Ultimi casi entrati (i più nuovi prima). */
  recentCases: AiBankCaseView[];
  /** Ultimi due giri per parte: il primo è il più recente. */
  runs: AiBankRunView[];
  /** Le istruzioni nuove sbagliano più di prima: frase da mostrare in rosso. */
  worse: string | null;
  rules: AiRuleView[];
  agreement: AiAgreementMonth[];
};

/** Il riquadro "Il sito impara" dell'email del lunedì. */
export type AiLearningWeekly = {
  /** Proposte per il dizionario in attesa (ricerche senza risultato e categorie cambiate). */
  dictionary: number;
  /** Casi entrati nel banco negli ultimi 7 giorni. */
  bankNew: number;
  /** Ultimo giro del banco della ricerca. */
  bankRun: { correct: number; total: number } | null;
  /** Regole nuove per l'IA in attesa. */
  rules: number;
  /** Mese scorso: proposte dell'IA approvate così com'erano. */
  agreement: AiAgreementMonth | null;
  worse: string | null;
};

/** Quota in percentuale, arrotondata; null senza decisioni. */
export function agreementPercent(month: AiAgreementMonth | null | undefined): number | null {
  if (!month || month.decided === 0) return null;
  return Math.round((month.agreed / month.decided) * 100);
}

/** Etichetta del mese: "2026-11" → "novembre 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("it-IT", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Le righe del riquadro del lunedì, vuoto se non c'è niente da dire. */
export function aiLearningWeeklyLines(w: AiLearningWeekly | null | undefined): string[] {
  if (!w) return [];
  const lines: string[] = [];
  if (w.worse) lines.push(w.worse);
  if (w.dictionary > 0) lines.push(`${w.dictionary === 1 ? "Una parola nuova" : `${w.dictionary} parole nuove`} per il dizionario, da ricerche senza risultato o con il mestiere cambiato dal cliente.`);
  if (w.rules > 0) lines.push(w.rules === 1 ? "Una regola nuova per l'IA dell'Admin, già provata sul banco." : `${w.rules} regole nuove per l'IA dell'Admin, già provate sul banco.`);
  if (w.bankNew > 0) lines.push(`${w.bankNew === 1 ? "Un errore vero dell'IA è entrato" : `${w.bankNew} errori veri dell'IA sono entrati`} nel banco di prova.`);
  if (w.bankRun && w.bankRun.total > 0) lines.push(`Banco della ricerca: ${w.bankRun.correct} giuste su ${w.bankRun.total}.`);
  const pct = agreementPercent(w.agreement);
  if (w.agreement && pct !== null) lines.push(`A ${monthLabel(w.agreement.month)} hai approvato così com'erano ${pct}% delle proposte dell'IA (${w.agreement.agreed} su ${w.agreement.decided}).`);
  return lines;
}
