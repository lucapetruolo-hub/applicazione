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

const AGENDA_BUTTON = {
  text: "Apri l'agenda",
  exampleSuffix: "dashboard/agenda",
};
const EXAMPLE_DAY = "giovedì 5 novembre";
const EXAMPLE_JOBS = [
  ["08:30", "Perdita sotto il lavandino · Latina"],
  ["11:00", "Sostituzione rubinetto · Sabaudia"],
  ["15:00", "Controllo caldaia · online"],
] as const;
const DAY_END =
  "\n\nIndirizzi e contatti dei clienti sono nella tua agenda. Buon lavoro!";

/** Righe dei lavori: "• *{{n}}* · {{n+1}}" (ora in grassetto), dalla variabile `from`. */
function jobLines(count: number, from: number): string {
  return Array.from(
    { length: count },
    (_, i) => `• *{{${from + i * 2}}}* · {{${from + i * 2 + 1}}}`,
  ).join("\n");
}

/**
 * Riepilogo della sera al professionista (Luca, 28/10/2026): "*I tuoi 3
 * lavori di giovedì 5 novembre*" e un lavoro per riga con l'ora in
 * grassetto, poi cosa e dove. Un modello per 1, 2 e 3 lavori e uno per 4 o
 * più (i primi tre e "e altri N"): Meta non accetta variabili vuote né a
 * capo dentro una variabile. Si paga a messaggio, non a caratteri.
 */
export const PROFESSIONAL_DAY_TEMPLATES: readonly WhatsAppTemplateDefinition[] =
  [
    {
      name: "riepilogo_lavori_1",
      category: "utility",
      body: `*Il tuo lavoro di {{1}}*\n\n${jobLines(1, 2)}\n\nIndirizzo e contatti del cliente sono nella tua agenda. Buon lavoro!`,
      example: [EXAMPLE_DAY, ...EXAMPLE_JOBS[0]],
      urlButton: AGENDA_BUTTON,
      stopButton: true,
      footer: WHATSAPP_FOOTER,
    },
    {
      name: "riepilogo_lavori_2",
      category: "utility",
      body: `*I tuoi 2 lavori di {{1}}*\n\n${jobLines(2, 2)}${DAY_END}`,
      example: [EXAMPLE_DAY, ...EXAMPLE_JOBS[0], ...EXAMPLE_JOBS[1]],
      urlButton: AGENDA_BUTTON,
      stopButton: true,
      footer: WHATSAPP_FOOTER,
    },
    {
      name: "riepilogo_lavori_3",
      category: "utility",
      body: `*I tuoi 3 lavori di {{1}}*\n\n${jobLines(3, 2)}${DAY_END}`,
      example: [EXAMPLE_DAY, ...EXAMPLE_JOBS.flat()],
      urlButton: AGENDA_BUTTON,
      stopButton: true,
      footer: WHATSAPP_FOOTER,
    },
    {
      name: "riepilogo_lavori_piu",
      category: "utility",
      body: `*I tuoi {{1}} lavori di {{2}}*\n\n${jobLines(3, 3)}\n…e {{9}}.${DAY_END}`,
      example: ["5", EXAMPLE_DAY, ...EXAMPLE_JOBS.flat(), "altri 2 lavori"],
      urlButton: AGENDA_BUTTON,
      stopButton: true,
      footer: WHATSAPP_FOOTER,
    },
  ];

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
  BOOKING_REMINDER_PROFESSIONAL: PROFESSIONAL_DAY_TEMPLATES[0]!,
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
  return renderTemplateText(WHATSAPP_TEMPLATES[type], params);
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

/** "giovedì 5 novembre". */
export function whatsappDay(scheduledAt: Date): string {
  return DAY_TIME.format(scheduledAt);
}

/** Un lavoro nel riepilogo della sera. */
export type ProfessionalDayJob = {
  scheduledAt: Date;
  /** La prima riga della descrizione senza contatti, o il mestiere. */
  what: string | null;
  /** Il comune del lavoro, o "online". */
  where: string | null;
};

/** Le due variabili di un lavoro: l'ora ("08:30") e "Perdita sotto il lavandino · Latina". */
export function professionalDayJobParams(
  job: ProfessionalDayJob,
): [string, string] {
  const detail = [
    job.what?.trim() ? whatsappParam(job.what, 40) : null,
    job.where?.trim() ? whatsappName(job.where) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return [whatsappTime(job.scheduledAt), detail || "dettagli nell'agenda"];
}

/** Il modello giusto per il numero di lavori e le sue variabili. */
export function professionalDayMessage(jobs: ProfessionalDayJob[]): {
  template: WhatsAppTemplateDefinition;
  bodyParams: string[];
} {
  const day = whatsappDay(jobs[0]!.scheduledAt);
  const lines = jobs.slice(0, 3).flatMap(professionalDayJobParams);
  if (jobs.length <= 3)
    return {
      template: PROFESSIONAL_DAY_TEMPLATES[jobs.length - 1]!,
      bodyParams: [day, ...lines],
    };
  const others = jobs.length - 3;
  return {
    template: PROFESSIONAL_DAY_TEMPLATES[3]!,
    bodyParams: [
      String(jobs.length),
      day,
      ...lines,
      others === 1 ? "un altro lavoro" : `altri ${others} lavori`,
    ],
  };
}

/** Testo di un modello con le sue variabili, come lo vede chi lo riceve. */
export function renderTemplateText(
  template: WhatsAppTemplateDefinition,
  params: string[],
): string {
  return template.body.replace(
    /\{\{(\d+)\}\}/g,
    (_, n: string) => params[Number(n) - 1] ?? "",
  );
}

/** "giovedì 5 novembre alle 10:30". */
export function whatsappDayTime(scheduledAt: Date): string {
  return `${DAY_TIME.format(scheduledAt)} alle ${TIME.format(scheduledAt)}`;
}
