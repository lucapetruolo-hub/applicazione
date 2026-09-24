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
  REVIEW: ["HIDE_CONTENT", "WARN", "SUSPEND_USER"],
  CLIENT_REVIEW: ["HIDE_CONTENT", "WARN", "SUSPEND_USER"],
  PROFESSIONAL_PROFILE: ["SUSPEND_PROFILE", "REQUEST_CORRECTION", "WARN", "SUSPEND_USER"],
  GUIDED_REQUEST: ["HIDE_CONTENT", "WARN", "SUSPEND_USER"],
};

/** Etichetta del pulsante nel pannello admin, per tipo di contenuto. */
export function moderationActionAdminLabel(action: ModerationAction, targetType: ContentReportTargetType): string {
  switch (action) {
    case "WARN":
      return "Avvisa l'autore (il contenuto resta)";
    case "REQUEST_CORRECTION":
      return "Chiedi di correggere il profilo";
    case "HIDE_CONTENT":
      return targetType === "GUIDED_REQUEST" ? "Chiudi e nascondi la richiesta" : "Nascondi la recensione";
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
        : "la tua recensione";
  switch (action) {
    case "HIDE_CONTENT":
      return targetType === "GUIDED_REQUEST"
        ? "La tua richiesta è stata chiusa e non è più visibile ai professionisti."
        : "La tua recensione è stata nascosta e non è più visibile sul sito.";
    case "SUSPEND_PROFILE":
      return "Il tuo profilo è stato tolto dai risultati di ricerca e dalla pagina pubblica. Puoi ancora accedere alla dashboard.";
    case "SUSPEND_USER":
      return "Il tuo account è stato sospeso: non puoi accedere finché la decisione non viene annullata.";
    case "REQUEST_CORRECTION":
      return `Ti chiediamo di correggere ${what}. Finché resta com'è potremmo prendere altre misure.`;
    case "WARN":
      return `Ti inviamo un avvertimento: ${what} resta visibile, ma una nuova violazione potrebbe portare a misure più severe.`;
    default:
      return `La segnalazione su ${what} è stata accolta.`;
  }
}

export const CONTENT_REPORT_TARGET_LABEL: Record<ContentReportTargetType, string> = {
  PROFESSIONAL_PROFILE: "Profilo professionista",
  REVIEW: "Recensione del cliente",
  CLIENT_REVIEW: "Recensione sul cliente",
  GUIDED_REQUEST: "Richiesta di un cliente",
};

/**
 * Frasi pronte per la motivazione (l'admin può scriverla a mano o partire
 * da una di queste): i fatti e la regola violata, DSA art. 17(3)(b)-(d).
 */
export const MODERATION_REASON_TEMPLATES: { label: string; text: string }[] = [
  { label: "Contenuto offensivo", text: "Il contenuto contiene insulti o linguaggio offensivo, vietati dai Termini di Servizio." },
  { label: "Informazioni false", text: "Il contenuto riporta informazioni non veritiere o ingannevoli per gli utenti, vietate dai Termini di Servizio." },
  { label: "Dati personali", text: "Il contenuto pubblica dati personali di terzi senza il loro consenso (GDPR e Termini di Servizio)." },
  { label: "Spam o pubblicità", text: "Il contenuto è spam o pubblicità non pertinente al servizio, vietata dai Termini di Servizio." },
  { label: "Recensione non genuina", text: "La recensione non descrive un'esperienza reale con il servizio ricevuto (Codice del Consumo e Termini di Servizio)." },
  { label: "Contenuto illecito", text: "Il contenuto è illecito ai sensi della legge italiana ed è stato rimosso dopo la segnalazione." },
];
