import { calendarDetail } from "../booking-calendar";
import { frontendUrl } from "../email-brand";
import { renderEmail, type RenderedEmail } from "../email-layout";
import { descriptionDetail, formatAppointmentDay, formatAppointmentTime } from "../email-format";
import { formatJobDays } from "@professionisti/shared";

/**
 * Email legate a una richiesta o a un appuntamento che non nascono da una
 * notifica del sito (docs/CHANGELOG.md §185).
 */

/** Conferma al cliente che la richiesta è partita. */
export function requestSentEmail(input: {
  name: string | null;
  /** Una o più categorie già unite ("Idraulico ed Elettricista"). */
  category: string;
  /** Richieste nate dallo stesso invio, una per categoria (docs/CHANGELOG.md §259). */
  requestsCount?: number;
  city: string | null;
  isUrgent: boolean;
  /** Professionisti che l'hanno ricevuta subito; 0 se in zona per ora non c'è nessuno. */
  sentTo: number;
  /** Richiesta inviata a un professionista scelto dal suo profilo. */
  direct: boolean;
  description?: string | null;
}): RenderedEmail {
  const where = input.city ? ` a ${input.city}` : "";
  const count = input.requestsCount ?? 1;
  const paragraphs = count > 1
    ? [
        input.sentTo > 0
          ? `Abbiamo inviato le tue ${count} richieste per **${input.category}${where}**, una per categoria, ai professionisti della tua zona${input.isUrgent ? ", segnalandole come urgenti" : ""}.`
          : `Abbiamo ricevuto le tue ${count} richieste per **${input.category}${where}**, una per categoria. Dove in zona non c'è ancora nessuno le teniamo aperte e le inviamo appena se ne iscrive uno.`,
        "Ti scriviamo appena arriva un preventivo: le trovi separate in Le mie richieste.",
      ]
    : input.direct
    ? [
        `Abbiamo inviato la tua richiesta per **${input.category}${where}** al professionista che hai scelto.`,
        "Ti scriviamo appena ti manda un preventivo. Intanto puoi scrivergli in chat dalla richiesta.",
      ]
    : input.sentTo > 0
      ? [
          `Abbiamo inviato la tua richiesta per **${input.category}${where}** ai professionisti della tua zona${input.isUrgent ? ", segnalandola come urgente" : ""}.`,
          "Ti scriviamo appena arriva un preventivo: potrai confrontarli, fare domande in chat e scegliere con calma.",
        ]
      : [
          `Abbiamo ricevuto la tua richiesta per **${input.category}${where}**.`,
          "Per ora in zona non ci sono professionisti disponibili: la teniamo aperta e la inviamo appena se ne iscrive uno. Ti scriviamo noi.",
        ];
  return renderEmail({
    kind: "notification",
    subject: `${count > 1 ? "Richieste inviate" : "Richiesta inviata"}: ${input.category}${where}`,
    greeting: input.name,
    title: count > 1 ? "Abbiamo ricevuto le tue richieste" : "Abbiamo ricevuto la tua richiesta",
    paragraphs,
    details: input.description?.trim() ? descriptionDetail(input.description) : undefined,
    cta: { label: count > 1 ? "Segui le richieste" : "Segui la richiesta", url: `${frontendUrl()}/le-mie-richieste` },
    after: ["I tuoi contatti restano riservati: il professionista vede telefono e indirizzo solo dopo che hai accettato il suo preventivo."],
  });
}

/** Promemoria del giorno prima (anti no-show), al cliente. */
export function bookingReminderClientEmail(input: {
  name: string | null;
  businessName: string;
  /** Nome e cognome di chi viene a fare il lavoro (docs/CHANGELOG.md §234). */
  professionalFullName: string | null;
  scheduledAt: Date;
  scheduledEndAt?: Date | null;
  /** Indirizzo completo dell'intervento; se manca si mostra almeno la città. */
  address?: string | null;
  city?: string | null;
  category: string | null;
  description?: string | null;
  /** Link "Aggiungi a Google Calendar" (docs/CHANGELOG.md §235). */
  calendarUrl?: string | null;
}): RenderedEmail {
  const who = input.professionalFullName?.trim() || null;
  const showBusiness = who !== null && who.toLowerCase() !== input.businessName.trim().toLowerCase();
  return renderEmail({
    kind: "notification",
    subject: `Promemoria: domani l'appuntamento con ${input.businessName}`,
    greeting: input.name,
    title: "Domani hai un appuntamento",
    paragraphs: [`Ti ricordiamo l'appuntamento con **${who ?? input.businessName}**.`],
    details: [
      { label: "Professionista", value: who ? (showBusiness ? `${who} (${input.businessName})` : who) : input.businessName },
      ...appointmentDetails(input.scheduledAt, input.scheduledEndAt),
      ...placeDetail(input.address, input.city),
      ...(input.category ? [{ label: "Lavoro", value: input.category }] : []),
      ...descriptionDetail(input.description),
      ...calendarDetail(input.calendarUrl),
    ],
    cta: { label: "Apri la richiesta", url: `${frontendUrl()}/le-mie-richieste` },
    after: ["Se non puoi più esserci, avvisa il professionista il prima possibile scrivendogli in chat dalla richiesta."],
  });
}

/**
 * Promemoria del giorno prima (anti no-show), al professionista: con luogo e
 * tutti i contatti del cliente, già sbloccati perché il lavoro è confermato
 * (CLAUDE.md §5 punto 9).
 */
export function bookingReminderProfessionalEmail(input: {
  name: string | null;
  clientName: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  /** Indirizzo completo dell'intervento; se manca si mostra almeno la città. */
  address?: string | null;
  scheduledAt: Date;
  scheduledEndAt?: Date | null;
  category: string | null;
  city: string | null;
  description?: string | null;
  /** Link "Aggiungi a Google Calendar" (docs/CHANGELOG.md §235). */
  calendarUrl?: string | null;
}): RenderedEmail {
  return renderEmail({
    kind: "notification",
    subject: `Promemoria: domani hai un intervento${input.category ? ` (${input.category})` : ""}`,
    greeting: input.name,
    title: "Domani hai un intervento",
    paragraphs: [input.clientName ? `Ti ricordiamo l'appuntamento con **${input.clientName}**.` : "Ti ricordiamo l'appuntamento con il cliente."],
    details: [
      ...appointmentDetails(input.scheduledAt, input.scheduledEndAt),
      ...placeDetail(input.address, input.city),
      ...(input.category ? [{ label: "Lavoro", value: input.category }] : []),
      ...descriptionDetail(input.description),
      ...(input.clientName ? [{ label: "Cliente", value: input.clientName }] : []),
      ...(input.clientPhone ? [{ label: "Telefono", value: input.clientPhone, url: `tel:${input.clientPhone.replace(/[^\d+]/g, "")}` }] : []),
      ...(input.clientEmail ? [{ label: "Email", value: input.clientEmail, url: `mailto:${input.clientEmail}` }] : []),
      ...calendarDetail(input.calendarUrl),
    ],
    cta: { label: "Apri l'agenda", url: `${frontendUrl()}/dashboard/agenda` },
    after: ["Trovi gli stessi dati anche nella scheda dell'appuntamento."],
  });
}

/** Riga "Luogo" con il link a Google Maps (indirizzo completo, o almeno la città). */
function placeDetail(address: string | null | undefined, city: string | null | undefined): { label: string; value: string; url: string }[] {
  const place = address?.trim() || city?.trim();
  if (!place) return [];
  return [{ label: "Luogo", value: place, url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}` }];
}

/** Righe "Data" e "Ora" (con la fine della fascia, se c'è). */
function appointmentDetails(scheduledAt: Date, scheduledEndAt?: Date | null): { label: string; value: string }[] {
  const end = scheduledEndAt ? formatAppointmentTime(scheduledEndAt) : "";
  const days = formatJobDays(scheduledAt, scheduledEndAt);
  if (days) return [{ label: "Data", value: days }, { label: "Ora", value: `${formatAppointmentTime(scheduledAt)}–${end} ogni giorno` }];
  return [
    { label: "Data", value: formatAppointmentDay(scheduledAt) },
    { label: "Ora", value: `${formatAppointmentTime(scheduledAt)}${end ? `–${end}` : ""}` },
  ];
}

/** Avviso agli admin che moderano per ogni nuova segnalazione (docs/CHANGELOG.md §145). */
/** Agli admin di moderazione: zone dove le richieste generali si sono chiuse da sole (docs/CHANGELOG.md §212). */
export function adminGeneralRequestsClosedEmail(zones: { category: string; city: string; reason: string }[]): RenderedEmail {
  const first = zones[0];
  return renderEmail({
    kind: "account",
    tone: "urgent",
    subject:
      zones.length === 1 && first
        ? `Richieste generali chiuse: ${first.category} a ${first.city}`
        : `Richieste generali chiuse in ${zones.length} zone`,
    title: "Richieste generali chiuse in automatico",
    paragraphs: [
      "In queste zone i clienti ora devono scegliere un professionista dalla ricerca. Puoi riaprirle o cambiare le soglie dalla pagina Richieste generali.",
    ],
    details: zones.map((z) => ({ label: `${z.category} a ${z.city}`, value: z.reason })),
    cta: { label: "Apri Richieste generali", url: `${frontendUrl()}/admin/richieste-generali` },
  });
}

export function adminNewReportEmail(input: { what: string; reason: string; fromContactForm?: boolean }): RenderedEmail {
  return renderEmail({
    kind: "account",
    tone: "urgent",
    subject: `Nuova segnalazione: ${input.what}`,
    title: "Nuova segnalazione da gestire",
    paragraphs: [`È arrivata una nuova segnalazione (${input.what.toLowerCase()}).`],
    details: [{ label: "Motivo", value: input.reason }],
    cta: input.fromContactForm
      ? { label: "Apri i messaggi", url: `${frontendUrl()}/admin/messaggi` }
      : { label: "Apri le segnalazioni", url: `${frontendUrl()}/admin/segnalazioni` },
  });
}

/**
 * Presa in carico di una segnalazione di contenuto illegale arrivata dal
 * modulo Contatti, da chi non ha un account (DSA art. 16 c. 1 e 4,
 * docs/CHANGELOG.md §318). L'esito lo manda poi l'admin rispondendo via email.
 */
export function contactReportReceivedEmail(): RenderedEmail {
  return renderEmail({
    kind: "account",
    subject: "Abbiamo preso in carico la tua segnalazione",
    title: "Segnalazione presa in carico",
    paragraphs: ["Grazie, abbiamo preso in carico la tua segnalazione. La esaminerà una persona del nostro team e ti scriveremo l'esito a questo indirizzo."],
  });
}
