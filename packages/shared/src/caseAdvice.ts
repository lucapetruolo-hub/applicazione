/**
 * L'IA propone la decisione nei casi di Da fare
 * (docs/changelog/2026-11-13-admin-ia-propone.md, PR 2 dell'Admin automatico
 * approvata da Luca il 13/11/2026 dopo il banco dei 40 casi).
 *
 * In ogni caso l'admin vede subito la proposta con il motivo (decisione di
 * Luca del 13/11/2026): "Approva" decide come propone l'IA passando dallo
 * stesso servizio del pulsante a mano, "Modifica" apre il modulo di sempre
 * già compilato. Si conta per tipo quante proposte sono approvate così come
 * sono e quante cambiate, con gli ultimi casi cambiati per migliorare le
 * istruzioni. I messaggi dal sito hanno solo una bozza di risposta, mai
 * inviata da sola. Anche nei casi di soldi l'IA dà la sua valutazione con le
 * nostre regole (decisione di Luca del 13/11/2026): decide sempre l'admin.
 * Niente "approva tutti".
 */

import type { AdminScope } from "./adminRoles";

export type CaseAdviceKind = "CONTENT_REPORT" | "HELD_REVIEW" | "REPORT_APPEAL" | "CONTACT_MESSAGE" | "JOB_ISSUE" | "JOB_ISSUE_APPEAL" | "REFUND" | "DISPUTE";

/** I tipi con una decisione da misurare (i messaggi hanno solo la bozza). */
export const MEASURED_ADVICE_KINDS = ["CONTENT_REPORT", "HELD_REVIEW", "REPORT_APPEAL", "JOB_ISSUE", "JOB_ISSUE_APPEAL", "REFUND", "DISPUTE"] as const satisfies readonly CaseAdviceKind[];
export type MeasuredAdviceKind = (typeof MEASURED_ADVICE_KINDS)[number];

export const CASE_ADVICE_KIND_LABEL: Record<CaseAdviceKind, string> = {
  CONTENT_REPORT: "Segnalazioni",
  HELD_REVIEW: "Recensioni da controllare",
  REPORT_APPEAL: "Richieste di rivedere una segnalazione",
  CONTACT_MESSAGE: "Messaggi dal sito",
  JOB_ISSUE: "Problemi sul lavoro",
  JOB_ISSUE_APPEAL: "Richieste di rivedere un problema sul lavoro",
  REFUND: "Rimborsi chiesti",
  DISPUTE: "Contestazioni di un pagamento",
};

/** Chi vede e approva le proposte di ogni tipo: gli stessi ruoli delle pagine dei casi. */
export const CASE_ADVICE_KIND_SCOPE: Record<CaseAdviceKind, AdminScope> = {
  CONTENT_REPORT: "MODERATION",
  HELD_REVIEW: "MODERATION",
  REPORT_APPEAL: "MODERATION",
  CONTACT_MESSAGE: "MODERATION",
  JOB_ISSUE: "ANY",
  JOB_ISSUE_APPEAL: "ANY",
  REFUND: "FINANCE",
  DISPUTE: "FINANCE",
};

/**
 * Le decisioni che l'IA può proporre. Per le segnalazioni "DISMISS" è
 * "Lascia" (nessuna conseguenza), le altre sono le conseguenze di
 * `moderationActions`.
 */
export const CASE_ADVICE_DECISIONS = {
  CONTENT_REPORT: ["DISMISS", "WARN", "REQUEST_CORRECTION", "HIDE_CONTENT", "SUSPEND_PROFILE", "SUSPEND_USER"],
  HELD_REVIEW: ["PUBLISH", "HIDE"],
  REPORT_APPEAL: ["REVERT", "KEEP"],
  CONTACT_MESSAGE: ["REPLY", "NO_REPLY"],
  // UPHELD_100/50/20: accolta con il rimborso di quella parte del pagato online; UPHELD: accolta senza rimborso (pagamento diretto).
  JOB_ISSUE: ["UPHELD_100", "UPHELD_50", "UPHELD_20", "UPHELD", "REJECTED", "ASK_INFO"],
  JOB_ISSUE_APPEAL: ["APPEAL_ACCEPTED", "APPEAL_REJECTED"],
  REFUND: ["REFUND_APPROVED", "REFUND_REJECTED"],
  DISPUTE: ["RESOLVED_CLIENT", "RESOLVED_PROFESSIONAL", "CLOSED"],
} as const satisfies Record<CaseAdviceKind, readonly string[]>;
export type CaseAdviceDecision = (typeof CASE_ADVICE_DECISIONS)[CaseAdviceKind][number];

export const CASE_ADVICE_DECISION_LABEL: Record<CaseAdviceDecision, string> = {
  DISMISS: "Lascia",
  WARN: "Avviso all'autore",
  REQUEST_CORRECTION: "Chiedi all'autore di correggere",
  HIDE_CONTENT: "Nascondi",
  SUSPEND_PROFILE: "Togli dalla ricerca",
  SUSPEND_USER: "Sospendi l'account",
  PUBLISH: "Pubblica",
  HIDE: "Non pubblicare",
  REVERT: "Ha ragione: annulla la decisione",
  KEEP: "La decisione resta",
  REPLY: "Rispondi",
  NO_REPLY: "Non rispondere",
  UPHELD_100: "Accogli: rimborso di tutto (100%)",
  UPHELD_50: "Accogli: rimborso di metà (50%)",
  UPHELD_20: "Accogli: rimborso di una parte (20%)",
  UPHELD: "Accogli, senza rimborso",
  REJECTED: "Respingi",
  ASK_INFO: "Chiedi altre informazioni",
  APPEAL_ACCEPTED: "Ha ragione: cambia la decisione",
  APPEAL_REJECTED: "La decisione resta",
  REFUND_APPROVED: "Approva il rimborso",
  REFUND_REJECTED: "Rifiuta il rimborso",
  RESOLVED_CLIENT: "Ha ragione il cliente",
  RESOLVED_PROFESSIONAL: "Ha ragione il professionista",
  CLOSED: "Chiudi senza decidere",
};

/** Si guardano solo le ultime decisioni: le istruzioni migliorano, i vecchi errori pesano meno. */
export const CASE_ADVICE_WINDOW = 100;

/** La proposta dell'IA per un caso, come la vede l'admin. */
export type CaseAdvice = {
  kind: CaseAdviceKind;
  caseId: string;
  decision: CaseAdviceDecision;
  /** Perché, in una frase, per l'admin. */
  reason: string;
  /** Regola o legge (codice di `MODERATION_GROUNDS`) e spiegazione per l'autore, quando la decisione ha una conseguenza. */
  ground: string | null;
  note: string | null;
  /** Solo per i messaggi: la bozza della risposta. */
  draft: string | null;
  createdAt: string;
};

export type CaseAdviceKindStats = {
  kind: MeasuredAdviceKind;
  /** Decisioni dell'admin contate (le ultime `CASE_ADVICE_WINDOW`). */
  decided: number;
  /** Decise come proponeva l'IA. */
  agreed: number;
  /** Le ultime volte in cui l'admin ha deciso diversamente, per migliorare le istruzioni. */
  disagreements: { caseId: string; advice: CaseAdviceDecision; admin: string; reason: string; decidedAt: string }[];
};

export type CaseAdviceOverview = {
  /** False senza chiave dell'IA: niente proposte. */
  active: boolean;
  kinds: CaseAdviceKindStats[];
  /** Proposte per i casi ancora aperti. */
  open: CaseAdvice[];
};
