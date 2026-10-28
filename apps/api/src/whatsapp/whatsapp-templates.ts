import {
  WHATSAPP_NAME_MAX,
  whatsappParam,
  type WhatsAppMessageType,
} from "@professionisti/shared";

/**
 * Modelli dei messaggi WhatsApp da far approvare a Meta (WhatsApp Manager →
 * Modelli di messaggio), lingua "it". I testi qui sotto sono quelli da
 * incollare: un modello approvato non si cambia senza una nuova
 * approvazione, quindi nome, categoria, testo e pulsanti devono restare
 * uguali a questo file (istruzioni in docs/whatsapp-modelli.md).
 *
 * Regole di Meta rispettate: niente variabili all'inizio o alla fine del
 * testo, nessuna promozione (categoria "utility": un aggiornamento su un
 * appuntamento già preso), piè di pagina di massimo 60 caratteri.
 *
 * Il giorno si scrive sempre per intero ("giovedì 5 novembre"), mai
 * "domani": un promemoria trattenuto dalle ore di silenzio può arrivare la
 * mattina stessa dell'appuntamento.
 */
export const WHATSAPP_FOOTER =
  "Messaggio automatico, le risposte non vengono lette";

/** Testo del pulsante di risposta rapida che spegne i promemoria. */
export const WHATSAPP_STOP_BUTTON = "Non ricevere più";

export type WhatsAppTemplateDefinition = {
  name: string;
  category: "utility" | "authentication";
  body: string;
  /** Esempio dei parametri per la richiesta di approvazione a Meta. */
  example: string[];
  /** Pulsante "Apri": testo e indirizzo (dominio del sito + parte variabile). */
  urlButton?: { text: string; exampleSuffix: string };
  stopButton: boolean;
  footer: string | null;
};

export const WHATSAPP_TEMPLATES: Record<
  WhatsAppMessageType,
  WhatsAppTemplateDefinition
> = {
  BOOKING_REMINDER_CLIENT: {
    name: "promemoria_appuntamento_cliente",
    category: "utility",
    body: "Promemoria: {{1}} hai l'appuntamento con {{2}}. Indirizzo, dettagli e chat sono nella tua richiesta. Se non puoi più esserci, avvisa il professionista dalla chat.",
    example: ["giovedì 5 novembre alle 10:30", "Rossi Idraulica"],
    urlButton: {
      text: "Apri la richiesta",
      exampleSuffix: "le-mie-richieste?open=esempio",
    },
    stopButton: true,
    footer: WHATSAPP_FOOTER,
  },
  BOOKING_REMINDER_PROFESSIONAL: {
    name: "promemoria_lavoro_professionista",
    category: "utility",
    body: "Promemoria: {{1}} hai un lavoro ({{2}}) a {{3}}. Indirizzo e contatti del cliente sono nella tua agenda.",
    example: ["giovedì 5 novembre alle 10:30", "Idraulico", "Latina"],
    urlButton: { text: "Apri l'agenda", exampleSuffix: "dashboard/agenda" },
    stopButton: true,
    footer: WHATSAPP_FOOTER,
  },
  PROFESSIONAL_ON_THE_WAY: {
    name: "professionista_in_arrivo",
    category: "utility",
    body: "Sta arrivando {{1}} per l'appuntamento di oggi alle {{2}}. A tra poco.",
    example: ["Rossi Idraulica", "10:30"],
    urlButton: {
      text: "Apri la richiesta",
      exampleSuffix: "le-mie-richieste?open=esempio",
    },
    stopButton: true,
    footer: WHATSAPP_FOOTER,
  },
  BOOKING_CANCELED: {
    name: "appuntamento_annullato",
    category: "utility",
    body: "L'appuntamento di {{1}} con {{2}} è stato annullato. Trovi i dettagli sul sito.",
    example: ["giovedì 5 novembre alle 10:30", "Rossi Idraulica"],
    urlButton: {
      text: "Vedi i dettagli",
      exampleSuffix: "le-mie-richieste?open=esempio",
    },
    stopButton: true,
    footer: WHATSAPP_FOOTER,
  },
  // Modello di autenticazione: il testo lo scrive Meta ("<codice> è il tuo
  // codice di verifica.") con l'avviso di non condividerlo, la scadenza di
  // 10 minuti e il pulsante "Copia codice". Qui solo per l'anteprima.
  PHONE_VERIFICATION_CODE: {
    name: "codice_verifica_numero",
    category: "authentication",
    body: "{{1}} è il tuo codice di verifica. Per la tua sicurezza, non condividerlo. Scade tra 10 minuti.",
    example: ["493027"],
    stopButton: false,
    footer: null,
  },
};

export const WHATSAPP_LANGUAGE = "it";

/** Il testo che leggerà chi riceve, con i parametri al loro posto (anteprima, test, registro). */
export function renderWhatsAppText(
  type: WhatsAppMessageType,
  params: string[],
): string {
  return WHATSAPP_TEMPLATES[type].body.replace(
    /\{\{(\d+)\}\}/g,
    (_, n: string) => params[Number(n) - 1] ?? "",
  );
}

/** Nome di un'attività o di una persona nei messaggi: al massimo 30 caratteri. */
export function whatsappName(value: string | null | undefined): string {
  return whatsappParam(value, WHATSAPP_NAME_MAX);
}

const TIME = new Intl.DateTimeFormat("it-IT", {
  timeZone: "UTC",
  hour: "2-digit",
  minute: "2-digit",
});
const DAY_TIME = new Intl.DateTimeFormat("it-IT", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** "10:30" da un orario di parete (CLAUDE.md, docs/CHANGELOG.md §287). */
export function whatsappTime(scheduledAt: Date): string {
  return TIME.format(scheduledAt);
}

/** "giovedì 5 novembre alle 10:30". */
export function whatsappDayTime(scheduledAt: Date): string {
  return `${DAY_TIME.format(scheduledAt)} alle ${TIME.format(scheduledAt)}`;
}
