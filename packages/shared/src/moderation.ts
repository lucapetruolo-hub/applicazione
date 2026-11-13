import type { ContentReportTargetType } from "./schemas";

/**
 * Misure applicabili risolvendo una segnalazione (docs/CHANGELOG.md §144,
 * DSA art. 17: la motivazione deve dire quale restrizione è stata presa).
 * Stesso elenco dell'enum Prisma `ModerationAction`.
 */
export const moderationActions = ["WARN", "REQUEST_CORRECTION", "HIDE_CONTENT", "SUSPEND_PROFILE", "SUSPEND_USER"] as const;
export type ModerationAction = (typeof moderationActions)[number];

/**
 * Misure compatibili con ciascun tipo di contenuto — unica fonte di verità
 * per il server (rifiuta le altre) e per il pannello admin (mostra solo
 * queste). Una recensione negativa ma vera non si nasconde (Codice del
 * Consumo art. 22 c. 4-bis): "Nascondi" resta una scelta dell'admin, mai
 * automatica.
 */
export const MODERATION_ACTIONS_BY_TARGET: Record<ContentReportTargetType, readonly ModerationAction[]> = {
  // "Chiedi all'autore di correggere": può modificare la recensione una volta (docs/changelog/2026-11-13-admin-ia-propone.md).
  REVIEW: ["HIDE_CONTENT", "REQUEST_CORRECTION", "WARN", "SUSPEND_USER"],
  PROFESSIONAL_PROFILE: ["SUSPEND_PROFILE", "REQUEST_CORRECTION", "WARN", "SUSPEND_USER"],
  GUIDED_REQUEST: ["HIDE_CONTENT", "WARN", "SUSPEND_USER"],
  CHAT_MESSAGE: ["HIDE_CONTENT", "WARN", "SUSPEND_USER"],
};

/** Etichetta del pulsante nel pannello admin, per tipo di contenuto. */
export function moderationActionAdminLabel(action: ModerationAction, targetType: ContentReportTargetType): string {
  switch (action) {
    case "WARN":
      return "Avvisa l'autore (il contenuto resta)";
    case "REQUEST_CORRECTION":
      return targetType === "REVIEW" ? "Chiedi all'autore di correggere la recensione" : "Chiedi di correggere il profilo";
    case "HIDE_CONTENT":
      return targetType === "GUIDED_REQUEST" ? "Chiudi e nascondi la richiesta" : targetType === "CHAT_MESSAGE" ? "Nascondi il messaggio" : "Nascondi la recensione";
    case "SUSPEND_PROFILE":
      return "Togli il profilo da ricerca e pagina pubblica";
    case "SUSPEND_USER":
      return "Sospendi l'account dell'autore";
  }
}

/**
 * Frase per l'autore del contenuto: cosa è successo (DSA art. 17(3)(a),
 * "tipo di restrizione").
 */
export function moderationActionOwnerText(action: ModerationAction | null, targetType: ContentReportTargetType): string {
  const what =
    targetType === "PROFESSIONAL_PROFILE"
      ? "il tuo profilo"
      : targetType === "GUIDED_REQUEST"
        ? "la tua richiesta"
        : targetType === "CHAT_MESSAGE"
          ? "il tuo messaggio in chat"
          : "la tua recensione";
  switch (action) {
    case "HIDE_CONTENT":
      return targetType === "GUIDED_REQUEST"
        ? "La tua richiesta è stata chiusa e non è più visibile ai professionisti."
        : targetType === "CHAT_MESSAGE"
          ? "Il tuo messaggio in chat è stato nascosto: al suo posto si legge \"Messaggio nascosto\"."
          : "La tua recensione è stata nascosta e non è più visibile sul sito.";
    case "SUSPEND_PROFILE":
      return "Il tuo profilo è stato tolto dai risultati di ricerca e dalla pagina pubblica. Puoi ancora accedere alla dashboard.";
    case "SUSPEND_USER":
      return "Abbiamo sospeso il tuo account: non puoi entrare finché la decisione resta.";
    case "REQUEST_CORRECTION":
      return targetType === "REVIEW"
        ? "Ti chiediamo di correggere la tua recensione. Puoi cambiarla una volta da Le mie richieste. Se resta com'è, potremmo prendere altre decisioni."
        : `Ti chiediamo di correggere ${what}. Se resta com'è, potremmo prendere altre decisioni.`;
    case "WARN":
      return `Questo è un avviso: ${what} resta visibile. Se succede di nuovo, le conseguenze saranno più gravi.`;
    default:
      return `La segnalazione su ${what} è stata accolta.`;
  }
}

export const CONTENT_REPORT_TARGET_LABEL: Record<ContentReportTargetType, string> = {
  PROFESSIONAL_PROFILE: "Profilo professionista",
  REVIEW: "Recensione del cliente",
  GUIDED_REQUEST: "Richiesta di un cliente",
  CHAT_MESSAGE: "Messaggio in chat",
};

/**
 * Frasi pronte per la motivazione (l'admin può scriverla a mano o partire
 * da una di queste): i fatti e la regola violata, DSA art. 17(3)(b)-(d).
 */
export const MODERATION_REASON_TEMPLATES: { label: string; text: string; onlyFor?: "REVIEW" | "PROFESSIONAL_PROFILE" }[] = [
  { label: "Contenuto offensivo", text: "Il contenuto ha insulti o parole offensive. I Termini di Servizio li vietano." },
  { label: "Informazioni false", text: "Il contenuto dice cose false o che possono ingannare. I Termini di Servizio lo vietano." },
  { label: "Dati personali", text: "Il contenuto mostra dati personali di altre persone senza il loro permesso. Lo vietano la legge sulla privacy (GDPR) e i Termini di Servizio." },
  { label: "Spam o pubblicità", text: "Il contenuto è pubblicità che non c'entra con il sito. I Termini di Servizio la vietano." },
  { label: "Recensione non genuina", text: "La recensione non racconta un lavoro fatto davvero. Lo vietano il Codice del Consumo e i Termini di Servizio.", onlyFor: "REVIEW" },
  { label: "Profilo doppio o copiato", text: "Il profilo copia quello di un altro professionista o ne ripete uno che c'è già. I Termini di Servizio lo vietano.", onlyFor: "PROFESSIONAL_PROFILE" },
  { label: "Contenuto illecito", text: "Il contenuto va contro la legge italiana. Lo abbiamo tolto dopo la segnalazione." },
];

/** Spiegazioni già scritte adatte al contenuto: niente "Recensione non genuina" per un profilo (misura "dopo" del riordino). */
export function moderationTemplatesFor(targetType: string) {
  return MODERATION_REASON_TEMPLATES.filter((t) => !t.onlyFor || t.onlyFor === targetType);
}

/**
 * Motivi tra cui sceglie chi segnala (docs/CHANGELOG.md §319). `illegal`
 * separa i contenuti illegali (DSA art. 16: chi segnala riceve l'esito,
 * servono spiegazione e dichiarazione di buona fede) dalle violazioni dei
 * Termini (basta la conferma di presa in carico).
 */
export const CONTENT_REPORT_REASONS = [
  { code: "insulti-minacce", label: "Insulti, minacce o diffamazione", illegal: true },
  { code: "odio-discriminazione", label: "Odio o discriminazione", illegal: true },
  { code: "dati-personali", label: "Dati personali di altre persone", illegal: true },
  { code: "recensione-falsa-truffa", label: "Recensione falsa o truffa", illegal: true },
  { code: "informazioni-false", label: "Informazioni non veritiere", illegal: false },
  { code: "spam", label: "Spam o pubblicità", illegal: false },
  { code: "fuori-tema", label: "Fuori tema o non pertinente", illegal: false },
  { code: "altro", label: "Altro motivo", illegal: false },
] as const;
export type ContentReportReasonCode = (typeof CONTENT_REPORT_REASONS)[number]["code"];
export const contentReportReasonCodes = CONTENT_REPORT_REASONS.map((r) => r.code) as [ContentReportReasonCode, ...ContentReportReasonCode[]];

export function contentReportReason(code: string) {
  return CONTENT_REPORT_REASONS.find((r) => r.code === code);
}

/**
 * Su cosa si basa la misura (DSA art. 17 c. 3 lett. d-e): una legge per i
 * contenuti illegali, un punto dei Termini per le violazioni delle regole.
 * Lo sceglie l'admin, l'autore lo legge nell'email della decisione.
 */
export const MODERATION_GROUNDS = [
  { code: "termini-contenuti", kind: "terms", label: "Termini di Servizio, punto 7 (contenuti vietati)" },
  { code: "termini-profilo", kind: "terms", label: "Termini di Servizio, punto 4 (dati del profilo non veritieri)" },
  { code: "termini-account", kind: "terms", label: "Termini di Servizio, punto 2 (uso scorretto dell'account)" },
  // Misure sull'account da Admin (controllo pre-lancio 08/11, E4-03): saldo non pagato, contestazioni senza motivo.
  { code: "termini-pagamenti", kind: "terms", label: "Termini di Servizio, punto 5 (pagamenti dei lavori non rispettati)" },
  { code: "legge-diffamazione", kind: "law", label: "Diffamazione (art. 595 del codice penale)" },
  { code: "legge-minacce", kind: "law", label: "Minacce (art. 612 del codice penale)" },
  { code: "legge-odio", kind: "law", label: "Propaganda e istigazione all'odio (art. 604-bis del codice penale)" },
  { code: "legge-dati-personali", kind: "law", label: "Dati personali pubblicati senza base legale (Regolamento UE 2016/679, GDPR)" },
  { code: "legge-truffa", kind: "law", label: "Truffa (art. 640 del codice penale)" },
  { code: "legge-recensione-falsa", kind: "law", label: "Recensione falsa o pratica ingannevole (Codice del Consumo, artt. 21-23)" },
  { code: "legge-altra", kind: "law", label: "Altra norma di legge, indicata nella motivazione" },
] as const;
export type ModerationGroundCode = (typeof MODERATION_GROUNDS)[number]["code"];
export const moderationGroundCodes = MODERATION_GROUNDS.map((g) => g.code) as [ModerationGroundCode, ...ModerationGroundCode[]];

export function moderationGround(code: string | null | undefined) {
  return code ? MODERATION_GROUNDS.find((g) => g.code === code) : undefined;
}

/**
 * Misure sull'account decise da Admin (controllo pre-lancio dell'08/11/2026,
 * E4-03, Reg. UE 2019/1150 art. 4 e DSA art. 17): "Sospendi" blocca subito
 * l'account finché la decisione non viene rivista; "Chiudi con preavviso"
 * lascia l'account attivo per ACCOUNT_CLOSURE_NOTICE_DAYS giorni e poi lo
 * chiude (Termini, punto 10 "Sospensione e chiusura"). Per una chiusura
 * immediata nei casi ammessi dai Termini (legge, violazioni ripetute,
 * sicurezza dei clienti) si usa la sospensione.
 */
export const ACCOUNT_CLOSURE_NOTICE_DAYS = 30;
export const accountMeasures = ["SUSPEND", "CLOSE_WITH_NOTICE"] as const;
export type AccountMeasure = (typeof accountMeasures)[number];
