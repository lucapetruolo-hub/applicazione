import { frontendUrl } from "../email-brand";
import { renderEmail, type RenderedEmail } from "../email-layout";
import { formatAppointment } from "../email-format";

/**
 * Email legate a una richiesta o a un appuntamento che non nascono da una
 * notifica del sito (docs/CHANGELOG.md §183).
 */

/** Conferma al cliente che la richiesta è partita. */
export function requestSentEmail(input: {
  name: string | null;
  category: string;
  city: string | null;
  isUrgent: boolean;
  /** Professionisti che l'hanno ricevuta subito; 0 se in zona per ora non c'è nessuno. */
  sentTo: number;
  /** Richiesta inviata a un professionista scelto dal suo profilo. */
  direct: boolean;
}): RenderedEmail {
  const where = input.city ? ` a ${input.city}` : "";
  const paragraphs = input.direct
    ? [
        `Abbiamo inviato la tua richiesta per **${input.category}${where}** al professionista che hai scelto.`,
        "Ti scriviamo appena ti manda un preventivo. Intanto puoi scrivergli in chat dalla richiesta.",
      ]
    : input.sentTo > 0
      ? [
          `Abbiamo inviato la tua richiesta per **${input.category}${where}** a ${input.sentTo === 1 ? "un professionista" : `${input.sentTo} professionisti`} della tua zona${input.isUrgent ? ", segnalandola come urgente" : ""}.`,
          "Ti scriviamo appena arriva un preventivo: potrai confrontarli, fare domande in chat e scegliere con calma.",
        ]
      : [
          `Abbiamo ricevuto la tua richiesta per **${input.category}${where}**.`,
          "Per ora in zona non ci sono professionisti disponibili: la teniamo aperta e la inviamo appena se ne iscrive uno. Ti scriviamo noi.",
        ];
  return renderEmail({
    kind: "notification",
    subject: `Richiesta inviata: ${input.category}${where}`,
    greeting: input.name,
    title: "Abbiamo ricevuto la tua richiesta",
    paragraphs,
    cta: { label: "Segui la richiesta", url: `${frontendUrl()}/le-mie-richieste` },
    after: ["I tuoi contatti restano riservati: il professionista vede telefono e indirizzo solo dopo che hai accettato il suo preventivo."],
  });
}

/** Promemoria del giorno prima (anti no-show), al cliente. */
export function bookingReminderClientEmail(input: { name: string | null; businessName: string; scheduledAt: Date; category: string | null }): RenderedEmail {
  return renderEmail({
    kind: "notification",
    subject: `Promemoria: domani l'appuntamento con ${input.businessName}`,
    greeting: input.name,
    title: "Domani hai un appuntamento",
    paragraphs: [`Ti ricordiamo l'appuntamento con **${input.businessName}**.`],
    details: [
      ...(input.category ? [{ label: "Lavoro", value: input.category }] : []),
      { label: "Quando", value: formatAppointment(input.scheduledAt) },
    ],
    cta: { label: "Apri la richiesta", url: `${frontendUrl()}/le-mie-richieste` },
    after: ["Se non puoi più esserci, avvisa il professionista il prima possibile scrivendogli in chat dalla richiesta."],
  });
}

/** Promemoria del giorno prima (anti no-show), al professionista. */
export function bookingReminderProfessionalEmail(input: { name: string | null; clientName: string | null; scheduledAt: Date; category: string | null; city: string | null }): RenderedEmail {
  return renderEmail({
    kind: "notification",
    subject: `Promemoria: domani hai un intervento${input.category ? ` (${input.category})` : ""}`,
    greeting: input.name,
    title: "Domani hai un intervento",
    paragraphs: [input.clientName ? `Ti ricordiamo l'appuntamento con **${input.clientName}**.` : "Ti ricordiamo l'appuntamento con il cliente."],
    details: [
      ...(input.category ? [{ label: "Lavoro", value: input.city ? `${input.category}, ${input.city}` : input.category }] : []),
      { label: "Quando", value: formatAppointment(input.scheduledAt) },
    ],
    cta: { label: "Apri l'agenda", url: `${frontendUrl()}/dashboard/agenda` },
    after: ["Indirizzo e contatti del cliente sono nella scheda dell'appuntamento."],
  });
}

/** Avviso agli admin che moderano per ogni nuova segnalazione (docs/CHANGELOG.md §145). */
export function adminNewReportEmail(input: { what: string; reason: string }): RenderedEmail {
  return renderEmail({
    kind: "account",
    tone: "urgent",
    subject: `Nuova segnalazione: ${input.what}`,
    title: "Nuova segnalazione da gestire",
    paragraphs: [`È arrivata una nuova segnalazione (${input.what.toLowerCase()}).`],
    details: [{ label: "Motivo", value: input.reason }],
    cta: { label: "Apri le segnalazioni", url: `${frontendUrl()}/admin/segnalazioni` },
  });
}
