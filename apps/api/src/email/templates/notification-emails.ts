import {
  AGENDA_LOOKAHEAD_DAYS,
  CONTENT_REPORT_TARGET_LABEL,
  JOB_ISSUE_APPEAL_DAYS,
  JOB_ISSUE_INFO_HOURS,
  JOB_ISSUE_LABEL,
  JOB_ISSUE_PRO_REPLY_HOURS,
  JOB_ISSUE_SANCTION_LABEL,
  BAD_WORK_REPORT_DAYS,
  ONLINE_LONG_HOLD_ALERT_DAYS,
  ONLINE_MAX_HOLD_DAYS,
  asScheduleChange,
  formatItalianUntil,
  moderationActionOwnerText,
  moderationGround,
  quoteChangeWhat,
  scheduleChangeAlternative,
  scheduleChangeObject,
  type ContentReportTargetType,
  type JobIssueSanction,
  type JobIssueType,
  type ModerationAction,
} from "@professionisti/shared";
import { EMAIL_BRAND, frontendUrl } from "../email-brand";
import type { EmailContent } from "../email-layout";
import { descriptionDetail, formatAppointment, formatAppointmentSpan, formatDay, formatDeadline, formatEur } from "../email-format";

/**
 * Testi delle email che accompagnano le notifiche del sito
 * (docs/CHANGELOG.md §185). Una voce per ogni tipo di notifica che parte
 * anche via email; i tipi assenti restano solo sul sito (chat, promemoria
 * "ricordamelo", rifiuto di un singolo professionista: arrivano spesso e
 * riempirebbero la casella).
 *
 * Il payload delle notifiche è volutamente piccolo (id e poco altro): i dati
 * da mostrare (categoria, nome dell'attività, data) li carica
 * `NotificationsService` e arrivano qui come contesto.
 *
 * Mai un dato di contatto del cliente prima dell'accettazione del
 * preventivo (CLAUDE.md §5 punto 9): al professionista si scrivono solo
 * categoria e città.
 */
export type NotificationEmailContext = {
  /** Nome del destinatario, per il saluto. */
  name: string | null;
  category: string | null;
  city: string | null;
  /** Nome dell'attività del professionista coinvolto. */
  businessName: string | null;
  /** Appuntamento: data del preventivo o della prenotazione. */
  when: Date | null;
  /** Data proposta dal cliente (QUOTE_DATE_PROPOSED). */
  proposedWhen: Date | null;
  /** Descrizione della richiesta, per capire di quale lavoro si tratta (docs/CHANGELOG.md §228). */
  description?: string | null;
};

type Payload = Record<string, unknown>;
type Builder = (payload: Payload, ctx: NotificationEmailContext) => EmailContent | null;

/** Nota scritta dall'altra parte, riportata nell'email (docs/CHANGELOG.md §196). */
function quotedNote(payload: Payload): string[] {
  return typeof payload.note === "string" && payload.note.trim() ? [`Nota: "${payload.note.trim()}"`] : [];
}

/** Nota di prima e nota nuova, per le modifiche che cambiano solo la nota (docs/CHANGELOG.md §228). */
function noteChange(payload: Payload, previousLabel = "Nota di prima", newLabel = "Nota nuova"): string[] {
  const previous = typeof payload.previousNote === "string" ? payload.previousNote.trim() : "";
  const current = typeof payload.note === "string" ? payload.note.trim() : "";
  if (!previous || previous === current) return quotedNote(payload);
  return [`${previousLabel}: "${previous}"`, current ? `${newLabel}: "${current}"` : "La nota è stata tolta."];
}

/** Appuntamento invariato dal payload, per le modifiche che cambiano solo la nota (§228). */
function unchangedSlot(payload: Payload): { label: string; value: string }[] {
  const slot = slotText(payload.to);
  return slot ? [{ label: "Appuntamento (invariato)", value: slot }] : [];
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function pro(ctx: NotificationEmailContext): string {
  return ctx.businessName ?? "Il professionista";
}

function job(ctx: NotificationEmailContext): string {
  return ctx.category ? `${ctx.category}${ctx.city ? ` a ${ctx.city}` : ""}` : "il tuo lavoro";
}

function jobDetails(ctx: NotificationEmailContext, extra: { label: string; value: string }[] = []): { label: string; value: string }[] {
  return [
    ...(ctx.category ? [{ label: "Lavoro", value: ctx.city ? `${ctx.category}, ${ctx.city}` : ctx.category }] : []),
    ...(ctx.businessName ? [{ label: "Professionista", value: ctx.businessName }] : []),
    ...(ctx.when ? [{ label: "Appuntamento", value: formatAppointment(ctx.when) }] : []),
    ...extra,
  ];
}

/** Il professionista non vede il proprio nome nel riquadro. */
function proJobDetails(ctx: NotificationEmailContext, extra: { label: string; value: string }[] = []) {
  return jobDetails({ ...ctx, businessName: null }, extra);
}

/** Appuntamento "prima"/"dopo" dal payload: "martedì 14 ottobre, 09:00–13:00" (docs/CHANGELOG.md §228). */
function slotText(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const slot = value as { start?: unknown; end?: unknown };
  const start = str(slot.start);
  if (!start) return null;
  return formatAppointmentSpan(start, str(slot.end));
}

/** Lavoro, descrizione e appuntamento prima → dopo, per le email di modifica (richiesta esplicita dell'utente, §228). */
function changeDetails(ctx: NotificationEmailContext, payload: Payload, fromLabel: string, toLabel: string, withPro: boolean) {
  const from = slotText(payload.from);
  const to = slotText(payload.to);
  // La descrizione la aggiunge notificationEmail, come in tutte le email di una richiesta.
  return [
    ...(ctx.category ? [{ label: "Lavoro", value: ctx.city ? `${ctx.category}, ${ctx.city}` : ctx.category }] : []),
    ...(withPro && ctx.businessName ? [{ label: "Professionista", value: ctx.businessName }] : []),
    ...(from ? [{ label: fromLabel, value: from }] : []),
    ...(to ? [{ label: toLabel, value: to }] : []),
  ];
}

const clientRequests = () => ({ label: "Apri la richiesta", url: `${frontendUrl()}/le-mie-richieste` });
// Stati di una contestazione in banca (Stripe Dispute.status), docs/CHANGELOG.md §236.
const DISPUTE_STATUS_LABEL: Record<string, string> = {
  needs_response: "aperta, serve la nostra risposta",
  warning_needs_response: "richiesta di informazioni, serve la nostra risposta",
  under_review: "in esame dalla banca",
  warning_under_review: "in esame dalla banca",
  won: "vinta",
  warning_closed: "chiusa senza contestazione",
  prevented: "evitata",
  lost: "persa",
};

const proRequests = (label = "Apri la richiesta") => ({ label, url: `${frontendUrl()}/dashboard/richieste` });
const subscriptionPage = () => ({ label: "Apri la pagina Abbonamento", url: `${frontendUrl()}/dashboard/abbonamento` });

const NOT_BINDING = "La nostra decisione non impedisce di rivolgersi a un organismo di mediazione o al giudice.";

const BUILDERS: Record<string, Builder> = {
  // ── Richieste ──────────────────────────────────────────────────────────
  NEW_LEAD: (payload, ctx) => {
    const category = str(payload.category) ?? ctx.category ?? "un lavoro";
    const city = str(payload.city) ?? ctx.city;
    const urgent = payload.isUrgent === true;
    const respondUntil = urgent ? null : str(payload.respondUntil);
    return {
      kind: "notification",
      tone: urgent ? "urgent" : "default",
      subject: `${urgent ? "URGENTE — " : ""}Nuova richiesta: ${category}${city ? ` a ${city}` : ""}`,
      greeting: ctx.name,
      title: urgent ? "Nuova richiesta urgente" : "Hai una nuova richiesta",
      paragraphs: [
        `Un cliente cerca un professionista per **${category}**${city ? ` a ${city}` : ""}.`,
        ...(urgent ? ["**È una richiesta urgente:** il cliente cerca qualcuno disponibile subito."] : []),
        ...(respondUntil ? [`**Puoi rispondere fino ${formatItalianUntil(respondUntil)}.**`] : []),
        "Chi risponde per primo ha più probabilità di aggiudicarsi il lavoro: apri la richiesta, guarda le foto e invia il tuo preventivo.",
      ],
      cta: proRequests("Rispondi alla richiesta"),
    };
  },
  GUIDED_REQUEST_EXPIRED: (_payload, ctx) => ({
    kind: "notification",
    subject: "La tua richiesta è scaduta",
    greeting: ctx.name,
    title: "La tua richiesta è scaduta",
    paragraphs: [
      `La tua richiesta per **${job(ctx)}** è scaduta senza ricevere preventivi.`,
      "Può succedere quando in zona i professionisti sono tutti impegnati. Prova a inviarla di nuovo, magari con una data più flessibile.",
    ],
    cta: { label: "Invia una nuova richiesta", url: `${frontendUrl()}/preventivo` },
  }),
  REQUEST_FORWARDED: (_payload, ctx) => {
    // Senza il numero dei professionisti (docs/CHANGELOG.md §211).
    return {
      kind: "notification",
      subject: "Abbiamo inoltrato la tua richiesta ad altri professionisti",
      greeting: ctx.name,
      title: "Abbiamo inoltrato la tua richiesta",
      paragraphs: [
        `Il professionista che avevi scelto non ha ancora risposto. Come avevi chiesto, abbiamo inviato la tua richiesta per **${job(ctx)}** anche agli altri professionisti simili della zona.`,
        "Anche il professionista che avevi scelto può ancora risponderti. Ti avviseremo appena arriva un preventivo.",
      ],
      cta: clientRequests(),
    };
  },
  REQUEST_FORWARD_NO_MATCH: (_payload, ctx) => ({
    kind: "notification",
    subject: "Il professionista scelto non ha risposto",
    greeting: ctx.name,
    title: "Il professionista non ha risposto",
    paragraphs: [
      `Il professionista che avevi scelto non ha ancora risposto alla tua richiesta per **${job(ctx)}** e in zona, per ora, non ce ne sono altri disponibili a cui inoltrarla.`,
      "La richiesta resta aperta e lui può ancora risponderti. Intanto puoi cercare un altro professionista.",
    ],
    cta: { label: "Cerca un professionista", url: `${frontendUrl()}/cerca` },
  }),

  // Richiesta inviata quando in zona non c'era nessuno: si è iscritto un
  // professionista compatibile e l'ha ricevuta (docs/CHANGELOG.md §271).
  REQUEST_MATCHED_LATER: (_payload, ctx) => ({
    kind: "notification",
    subject: "Un professionista ha ricevuto la tua richiesta",
    greeting: ctx.name,
    title: "Abbiamo trovato un professionista",
    paragraphs: [
      `Si è iscritto un professionista compatibile con la tua richiesta per **${job(ctx)}** e gliel'abbiamo inviata.`,
      "Ti scriviamo appena ti manda un preventivo.",
    ],
    cta: clientRequests(),
  }),

  // ── Preventivi e date ──────────────────────────────────────────────────
  NEW_QUOTE: (payload, ctx) => {
    // Nuovo preventivo dopo un rifiuto (docs/CHANGELOG.md §188).
    const resent = payload.resent === true;
    return {
      kind: "notification",
      subject: resent ? `${pro(ctx)} ti ha inviato un nuovo preventivo` : `Nuovo preventivo da ${pro(ctx)}`,
      greeting: ctx.name,
      title: resent ? "Hai ricevuto un nuovo preventivo" : "Hai ricevuto un preventivo",
      paragraphs: [
        resent
          ? `**${pro(ctx)}** ti ha inviato un nuovo preventivo per ${ctx.category ? `la tua richiesta di **${job(ctx)}**` : "la tua richiesta"}, al posto di quello che avevi rifiutato.`
          : `**${pro(ctx)}** ti ha inviato un preventivo per ${ctx.category ? `la tua richiesta di **${job(ctx)}**` : "la tua richiesta"}.`,
        "Aprilo per vedere le voci, il prezzo e la data proposta. Puoi accettarlo, proporre un'altra data o scrivere al professionista in chat prima di decidere.",
      ],
      details: jobDetails(ctx),
      cta: { label: "Vedi il preventivo", url: `${frontendUrl()}/le-mie-richieste` },
    };
  },
  QUOTE_ACCEPTED: (payload, ctx) => {
    // Dati del cliente subito nell'email: a preventivo accettato si sbloccano
    // (richiesta esplicita dell'utente, docs/CHANGELOG.md §228).
    const clientName = str(payload.clientName);
    const clientPhone = str(payload.clientPhone);
    const clientAddress = str(payload.clientAddress);
    const details = [
      ...(ctx.category ? [{ label: "Lavoro", value: ctx.city ? `${ctx.category}, ${ctx.city}` : ctx.category }] : []),
      ...(ctx.when ? [{ label: "Appuntamento", value: formatAppointmentSpan(ctx.when, str(payload.scheduledEndAt)) }] : []),
      ...(clientName ? [{ label: "Cliente", value: clientName }] : []),
      ...(clientPhone ? [{ label: "Telefono", value: clientPhone }] : []),
      ...(clientAddress ? [{ label: "Indirizzo", value: clientAddress }] : []),
    ];
    return {
      kind: "notification",
      subject: "Il cliente ha accettato il tuo preventivo",
      greeting: ctx.name,
      title: "Preventivo accettato!",
      paragraphs: [
        `Ottima notizia: il cliente ha accettato il tuo preventivo per **${job(ctx)}**.`,
        clientName || clientPhone || clientAddress
          ? "Qui sotto trovi i dati del cliente e dell'appuntamento, già nella tua agenda."
          : "Nella richiesta ora trovi i suoi contatti e l'indirizzo dell'intervento. L'appuntamento è già nella tua agenda.",
      ],
      details: details.length > 0 ? details : undefined,
      cta: proRequests("Apri il lavoro"),
    };
  },
  QUOTE_REJECTED: (payload, ctx) => {
    // Nota del cliente e nuovo preventivo (docs/CHANGELOG.md §188): la nota
    // va nel riquadro, mai nel testo, così non passa la formattazione.
    const note = str(payload.note);
    const canResend = payload.canResend === true;
    const resendUntil = str(payload.resendUntil);
    return {
      kind: "notification",
      subject: "Il cliente ha rifiutato il tuo preventivo",
      greeting: ctx.name,
      title: "Preventivo non accettato",
      paragraphs: [
        `Il cliente ha rifiutato il tuo preventivo per **${job(ctx)}**${note ? " e ti ha lasciato una nota" : ""}.`,
        canResend
          ? `Se vuoi, puoi inviargli un nuovo preventivo${resendUntil ? ` entro **${formatDeadline(resendUntil)}**, quando scade la richiesta` : ""}: aprilo dalla richiesta e correggi le voci, il prezzo o la data.`
          : "Succede. I preventivi con le voci ben separate e una data vicina vengono scelti più spesso: tienilo a mente per le prossime richieste.",
      ],
      details: note ? [{ label: "Nota del cliente", value: note }] : undefined,
      cta: proRequests(canResend ? "Invia un nuovo preventivo" : "Apri la richiesta"),
    };
  },
  QUOTE_WITHDRAWN: (_payload, ctx) => ({
    kind: "notification",
    subject: `${pro(ctx)} ha ritirato il preventivo`,
    greeting: ctx.name,
    title: "Preventivo ritirato",
    paragraphs: [
      `**${pro(ctx)}** ha ritirato il preventivo che ti aveva inviato per **${job(ctx)}**.`,
      "Gli eventuali altri preventivi ricevuti li trovi sempre nella tua richiesta.",
    ],
    cta: clientRequests(),
  }),
  // Acconto pagato su un preventivo non più disponibile (docs/CHANGELOG.md §240).
  QUOTE_DEPOSIT_REFUNDED: (payload, ctx) => ({
    kind: "notification",
    subject: "Ti abbiamo rimborsato l'acconto",
    greeting: ctx.name,
    title: "Acconto rimborsato",
    paragraphs: [
      `Il preventivo di **${pro(ctx)}** per **${job(ctx)}** non si poteva più confermare quando è arrivato il tuo pagamento: per esempio era cambiato o era stato ritirato.`,
      payload.refundPending === true
        ? "Il rimborso di tutto l'acconto è in arrivo: ti scriviamo appena parte verso la carta. Se il preventivo è ancora disponibile puoi accettarlo di nuovo."
        : "Ti abbiamo rimborsato tutto l'acconto: lo rivedi sulla carta in pochi giorni. Se il preventivo è ancora disponibile puoi accettarlo di nuovo.",
    ],
    details: typeof payload.amountEurCents === "number" ? [{ label: "Rimborso", value: formatEur(payload.amountEurCents) }] : undefined,
    cta: clientRequests(),
  }),
  QUOTE_DATE_PROPOSED: (payload, ctx) => {
    // Stessa data e stesso orario: il cliente ha solo aggiunto una nota
    // (docs/CHANGELOG.md §196).
    if (payload.noteOnly === true) {
      return {
        kind: "notification",
        subject: "Il cliente ha aggiunto una nota al preventivo",
        greeting: ctx.name,
        title: "Il cliente ha aggiunto una nota",
        paragraphs: [
          `Per il tuo preventivo per **${job(ctx)}** il cliente ha aggiunto una nota, senza cambiare data e orario.`,
          ...noteChange(payload),
          "Il preventivo resta valido così com'è: il cliente può ancora accettarlo. Se vuoi rispondere, scrivigli dalla richiesta.",
        ],
        details: unchangedSlot(payload).length ? proJobDetails({ ...ctx, when: null }, unchangedSlot(payload)) : proJobDetails(ctx),
        cta: proRequests("Apri la richiesta"),
      };
    }
    const change = asScheduleChange(payload.change) ?? "both";
    return {
      kind: "notification",
      subject: `Il cliente propone ${scheduleChangeAlternative(change)}`,
      greeting: ctx.name,
      title: `Il cliente propone ${scheduleChangeAlternative(change)}`,
      paragraphs: [
        `Per il tuo preventivo per **${job(ctx)}** il cliente ha proposto ${scheduleChangeAlternative(change)}.`,
        ...quotedNote(payload),
        "Confermala se ti va bene, oppure rispondi con un'alternativa.",
      ],
      details: slotText(payload.to)
        ? changeDetails(ctx, payload, "Appuntamento del preventivo", "Nuova proposta del cliente", false)
        : proJobDetails({ ...ctx, when: null }, ctx.proposedWhen ? [{ label: "Proposta del cliente", value: formatAppointment(ctx.proposedWhen) }] : []),
      cta: proRequests("Rispondi alla proposta"),
    };
  },
  QUOTE_DATE_CHANGED: (payload, ctx) => {
    // Stessa data e stesso orario: il professionista ha solo aggiunto una
    // nota (docs/CHANGELOG.md §196).
    if (payload.noteOnly === true) {
      return {
        kind: "notification",
        subject: `${pro(ctx)} ha aggiunto una nota al preventivo`,
        greeting: ctx.name,
        title: "Nuova nota sul preventivo",
        paragraphs: [`**${pro(ctx)}** ha aggiunto una nota al preventivo per **${job(ctx)}**, senza cambiare data e orario.`, ...noteChange(payload)],
        details: unchangedSlot(payload).length ? jobDetails({ ...ctx, when: null }, unchangedSlot(payload)) : jobDetails(ctx),
        cta: clientRequests(),
      };
    }
    const change = asScheduleChange(payload.change) ?? "both";
    return {
      kind: "notification",
      subject: `${pro(ctx)} ha modificato ${scheduleChangeObject(change)} dell'appuntamento`,
      greeting: ctx.name,
      title: `Cambia ${scheduleChangeObject(change)} dell'appuntamento`,
      paragraphs: [`**${pro(ctx)}** ha modificato ${scheduleChangeObject(change)} del preventivo per **${job(ctx)}**. Ecco come è ora:`, ...quotedNote(payload)],
      details: slotText(payload.to) ? changeDetails(ctx, payload, "Prima", "Nuova proposta", true) : jobDetails(ctx),
      cta: clientRequests(),
      after: ["Se non ti va bene puoi proporre un'altra data o scrivere al professionista in chat."],
    };
  },
  // Preventivo aggiornato (voci o note) senza cambio di data (docs/CHANGELOG.md §196).
  QUOTE_UPDATED: (payload, ctx) => {
    const what =
      quoteChangeWhat({ itemsChanged: payload.itemsChanged === true, notesChanged: payload.notesChanged === true, paymentChanged: payload.paymentChanged === true }) ??
      "il contenuto";
    return {
      kind: "notification",
      subject: `${pro(ctx)} ha aggiornato il preventivo`,
      greeting: ctx.name,
      title: "Preventivo aggiornato",
      paragraphs: [
        `**${pro(ctx)}** ha aggiornato ${what} del preventivo per **${job(ctx)}**, senza cambiare data e orario.`,
        ...(typeof payload.priceBefore === "string" && typeof payload.priceAfter === "string"
          ? [`Il totale indicativo passa da ${payload.priceBefore} a **${payload.priceAfter}**.`]
          : []),
        // Modi di pagamento offerti (docs/CHANGELOG.md §239).
        ...(typeof payload.paymentOffer === "string" ? [`Come puoi pagare: ${payload.paymentOffer}.`] : []),
        ...noteChange(payload, "Note di prima", "Note nuove"),
        "Rileggilo prima di accettarlo.",
      ],
      details: jobDetails(ctx),
      cta: clientRequests(),
    };
  },
  QUOTE_DATE_CONFIRMED: (_payload, ctx) => ({
    kind: "notification",
    subject: `${pro(ctx)} ha confermato la data che hai proposto`,
    greeting: ctx.name,
    title: "Data confermata",
    paragraphs: [`**${pro(ctx)}** ha confermato la data che avevi proposto per **${job(ctx)}**.`],
    details: jobDetails(ctx),
    cta: clientRequests(),
  }),
  QUOTE_DATE_REJECTED: (payload, ctx) => {
    const details = changeDetails(ctx, payload, "Data che avevi proposto", "Resta valida", true);
    return {
      kind: "notification",
      subject: `${pro(ctx)} non è disponibile nella data proposta`,
      greeting: ctx.name,
      title: "Data non disponibile",
      paragraphs: [
        `**${pro(ctx)}** non è disponibile nella data che avevi proposto per **${job(ctx)}**.`,
        "Puoi accettare la data del preventivo, proporne un'altra o scrivergli in chat per trovare insieme il momento giusto.",
      ],
      details: details.length > 0 ? details : undefined,
      cta: clientRequests(),
    };
  },

  // ── Lavori e appuntamenti ──────────────────────────────────────────────
  JOB_COMPLETED: (payload, ctx) => {
    // Importo diverso dal preventivo: il motivo scritto dal professionista (docs/CHANGELOG.md §228).
    const reason = str(payload.changeReason);
    const details = [
      ...(typeof payload.finalAmountEurCents === "number" ? [{ label: "Importo finale", value: formatEur(payload.finalAmountEurCents) }] : []),
      ...(reason ? [{ label: "Diverso dal preventivo perché", value: reason }] : []),
    ];
    return {
      kind: "notification",
      subject: `${pro(ctx)} ha terminato il lavoro: com'è andata?`,
      greeting: ctx.name,
      title: "Com'è andata?",
      paragraphs: [
        `**${pro(ctx)}** ha segnato come terminato il lavoro per **${job(ctx)}**.`,
        "Lascia una recensione: bastano un voto e due righe. Aiuta gli altri clienti a scegliere e il professionista a farsi conoscere.",
      ],
      details: details.length > 0 ? details : undefined,
      cta: { label: "Lascia una recensione", url: `${frontendUrl()}/le-mie-richieste` },
      after: [`Se qualcosa non è andato bene, puoi segnalarlo dalla richiesta entro ${BAD_WORK_REPORT_DAYS} giorni.`],
    };
  },
  BOOKING_CANCELED_BY_PROFESSIONAL: (payload, ctx) => {
    const note = str(payload.cancellationNote);
    return {
      kind: "notification",
      tone: "urgent",
      subject: `${pro(ctx)} ha annullato l'intervento`,
      greeting: ctx.name,
      title: "Intervento annullato",
      paragraphs: [`Ci dispiace: **${pro(ctx)}** ha annullato l'intervento per **${job(ctx)}**.`],
      details: jobDetails(ctx, note ? [{ label: "Motivo", value: note }] : []),
      cta: { label: "Chiedi un nuovo preventivo", url: `${frontendUrl()}/preventivo` },
      after: ["Puoi chiedere un preventivo ad altri professionisti della zona, o scrivere a questo in chat dalla richiesta."],
    };
  },
  // Il cliente annulla (docs/CHANGELOG.md §235): solo lui può riaprirla.
  BOOKING_CANCELED_BY_CLIENT: (_payload, ctx) => ({
    kind: "notification",
    tone: "urgent",
    subject: "Il cliente ha annullato l'intervento",
    greeting: ctx.name,
    title: "Intervento annullato",
    paragraphs: [`Il cliente ha annullato l'intervento per **${job(ctx)}**: l'appuntamento non è più nella tua agenda.`],
    details: proJobDetails(ctx),
    cta: { label: "Apri l'agenda", url: `${frontendUrl()}/dashboard/agenda` },
    after: ["Se il cliente la riapre ti avvisiamo noi."],
  }),
  BOOKING_REOPENED_BY_PROFESSIONAL: (_payload, ctx) => ({
    kind: "notification",
    subject: `${pro(ctx)} ha riaperto la prenotazione`,
    greeting: ctx.name,
    title: "Prenotazione riaperta",
    paragraphs: [`**${pro(ctx)}** ha riaperto la prenotazione annullata per **${job(ctx)}**: l'appuntamento torna valido.`],
    details: jobDetails(ctx),
    cta: clientRequests(),
  }),
  BOOKING_REOPENED_BY_CLIENT: (_payload, ctx) => ({
    kind: "notification",
    subject: "Il cliente ha riaperto una prenotazione",
    greeting: ctx.name,
    title: "Prenotazione riaperta",
    paragraphs: [`Il cliente ha riaperto la prenotazione annullata per **${job(ctx)}**: l'appuntamento torna nella tua agenda.`],
    details: proJobDetails(ctx),
    cta: { label: "Apri l'agenda", url: `${frontendUrl()}/dashboard/agenda` },
  }),
  // Recensione del cliente: pubblica subito sul profilo (docs/CHANGELOG.md
  // §215). Il voto non si anticipa nell'email.
  NEW_REVIEW: (payload, ctx) => ({
    kind: "notification",
    subject: "Hai ricevuto una nuova recensione",
    greeting: ctx.name,
    title: "Nuova recensione",
    paragraphs:
      payload.professionalCompleted === false
        ? [
            `Il cliente ha segnato come terminato il lavoro per **${job(ctx)}** e lo ha recensito: la recensione è già visibile sul tuo profilo.`,
            "Ricordati di segnare anche tu il lavoro come terminato.",
          ]
        : [`Il cliente ha recensito il lavoro per **${job(ctx)}**: la recensione è già visibile sul tuo profilo.`],
    cta: proRequests(payload.professionalCompleted === false ? "Segna il lavoro come terminato" : "Apri il lavoro"),
  }),

  // Segnalazioni di un problema sul lavoro (docs/CHANGELOG.md §164, §167).
  JOB_ISSUE_REPORTED: (payload, ctx) => {
    const type = payload.issueType as JobIssueType | undefined;
    const assisted = payload.assisted !== false;
    return {
      kind: "notification",
      tone: "urgent",
      subject: "Un cliente ha segnalato un problema su un lavoro",
      greeting: ctx.name,
      title: "Un cliente ha segnalato un problema",
      paragraphs: [
        `Il cliente ha segnalato un problema sul lavoro per **${job(ctx)}**${type ? `: "${JOB_ISSUE_LABEL[type].toLowerCase()}"` : ""}.`,
        assisted
          ? `Rispondigli in chat **entro ${JOB_ISSUE_PRO_REPLY_HOURS} ore** per trovare insieme una soluzione. Se non rispondi, la segnalazione passa al nostro team.`
          : "Rispondigli in chat per trovare insieme una soluzione.",
      ],
      cta: proRequests("Rispondi in chat"),
    };
  },
  JOB_ISSUE_SETTLED: (_payload, ctx) => ({
    kind: "notification",
    subject: "Segnalazione risolta",
    greeting: ctx.name,
    title: "Segnalazione risolta",
    paragraphs: [`Il cliente ha indicato che il problema sul lavoro per **${job(ctx)}** è stato risolto con te. Grazie per averlo seguito.`],
    cta: proRequests(),
  }),
  JOB_ISSUE_UNRESOLVED: (_payload, ctx) => ({
    kind: "notification",
    subject: "Nessun accordo sulla segnalazione",
    greeting: ctx.name,
    title: "Nessun accordo sulla segnalazione",
    paragraphs: [
      `Il cliente ha indicato che non avete trovato un accordo sul problema del lavoro per **${job(ctx)}**.`,
      "Il lavoro era pagato direttamente: la questione resta tra te e il cliente, il nostro team non interviene.",
    ],
    cta: proRequests(),
  }),
  JOB_ISSUE_ESCALATED: (payload, ctx) => ({
    kind: "notification",
    tone: "urgent",
    subject: "Il cliente ha chiesto al nostro team di decidere",
    greeting: ctx.name,
    title: "La segnalazione passa al nostro team",
    paragraphs: [
      `Il cliente ha chiesto al nostro team di decidere sulla segnalazione del lavoro per **${job(ctx)}**.`,
      `Invia la tua versione${str(payload.evidenceDueAt) ? ` **entro ${formatDeadline(str(payload.evidenceDueAt))}**` : " entro 72 ore"}, con foto o documenti se li hai: una persona del nostro team la leggerà prima di decidere.`,
    ],
    cta: proRequests("Invia la tua versione"),
  }),
  JOB_ISSUE_AUTO_ESCALATED: (payload, ctx) => ({
    kind: "notification",
    tone: "urgent",
    subject: "La segnalazione è passata al nostro team",
    greeting: ctx.name,
    title: "La segnalazione passa al nostro team",
    paragraphs: [
      `Non hai risposto in chat entro ${JOB_ISSUE_PRO_REPLY_HOURS} ore alla segnalazione sul lavoro per **${job(ctx)}**: ora la esamina il nostro team.`,
      `Invia la tua versione${str(payload.evidenceDueAt) ? ` **entro ${formatDeadline(str(payload.evidenceDueAt))}**` : " entro 72 ore"}, con foto o documenti se li hai.`,
    ],
    cta: proRequests("Invia la tua versione"),
  }),
  JOB_ISSUE_TEAM_REVIEW: (_payload, ctx) => ({
    kind: "notification",
    subject: "La tua segnalazione passa al nostro team",
    greeting: ctx.name,
    title: "Ora se ne occupa il nostro team",
    paragraphs: [
      `${pro(ctx)} non ti ha risposto in chat entro ${JOB_ISSUE_PRO_REPLY_HOURS} ore: la tua segnalazione sul lavoro per **${job(ctx)}** ora la esamina una persona del nostro team.`,
      "Ti scriveremo appena c'è una decisione.",
    ],
    cta: clientRequests(),
  }),
  JOB_ISSUE_INFO_REQUESTED: (_payload, ctx) => ({
    kind: "notification",
    tone: "urgent",
    subject: "Il nostro team ti chiede altre informazioni",
    greeting: ctx.name,
    title: "Ci servono altre informazioni",
    paragraphs: [
      `Per decidere sulla segnalazione del lavoro per **${job(ctx)}** il nostro team ti chiede qualche informazione in più.`,
      `Rispondi **entro ${JOB_ISSUE_INFO_HOURS} ore** dalla richiesta: trovi la domanda nella scheda del lavoro.`,
    ],
    cta: proRequests("Rispondi"),
  }),
  JOB_ISSUE_RESOLVED: (payload, ctx) => {
    const client = payload.audience === "CLIENT";
    return {
      kind: "notification",
      subject: "Decisione sulla segnalazione",
      greeting: ctx.name,
      title: "Decisione sulla segnalazione",
      paragraphs: [str(payload.text) ?? `Il nostro team ha deciso sulla segnalazione del lavoro per ${job(ctx)}. ${NOT_BINDING}`],
      cta: client ? clientRequests() : proRequests(),
    };
  },
  JOB_ISSUE_APPEAL_DECIDED: (payload, ctx) => {
    const client = payload.audience === "CLIENT";
    const accepted = payload.decision === "ACCEPTED";
    const note = str(payload.note);
    return {
      kind: "notification",
      subject: "Decisione sul ricorso",
      greeting: ctx.name,
      title: "Decisione sul ricorso",
      paragraphs: [
        client
          ? `Il professionista ha fatto ricorso contro la decisione sulla tua segnalazione per **${job(ctx)}** e una persona diversa del nostro team l'ha accolto: la segnalazione ora risulta respinta.`
          : accepted
            ? `Abbiamo accolto il tuo ricorso sulla segnalazione del lavoro per **${job(ctx)}**: la segnalazione ora risulta respinta e la misura sul tuo profilo è annullata.`
            : `Abbiamo esaminato il tuo ricorso sulla segnalazione del lavoro per **${job(ctx)}**: la decisione resta valida.`,
        ...(note ? [`**Motivazione:** ${note}`] : []),
        NOT_BINDING,
      ],
      cta: client ? clientRequests() : proRequests(),
    };
  },
  JOB_ISSUE_SANCTION: (payload, ctx) => {
    const sanction = payload.sanction as JobIssueSanction | undefined;
    const until = str(payload.until);
    return {
      kind: "account",
      tone: "urgent",
      subject: "Una segnalazione accolta comporta una misura sul tuo profilo",
      greeting: ctx.name,
      title: "Misura sul tuo profilo",
      paragraphs: [
        "Una segnalazione su un tuo lavoro è stata accolta e comporta questa misura sul tuo profilo:",
      ],
      details: [
        ...(sanction ? [{ label: "Misura", value: JOB_ISSUE_SANCTION_LABEL[sanction] }] : []),
        ...(until ? [{ label: "Fino al", value: formatDay(until) }] : []),
      ],
      cta: proRequests("Vedi i dettagli"),
      after: [`Puoi fare ricorso entro ${JOB_ISSUE_APPEAL_DAYS} giorni: lo esaminerà una persona diversa del nostro team.`],
    };
  },

  // Pagamenti online dei lavori (docs/CHANGELOG.md §168).
  JOB_DEPOSIT_PAID: (payload, ctx) => ({
    kind: "notification",
    subject: "Il cliente ha pagato l'acconto",
    greeting: ctx.name,
    title: "Acconto pagato",
    paragraphs: [
      `Il cliente ha pagato online l'acconto per il lavoro **${job(ctx)}**.`,
      "Lo ricevi in banca quando il cliente conferma il lavoro.",
    ],
    details: proJobDetails(ctx, typeof payload.amountEurCents === "number" ? [{ label: "Acconto", value: formatEur(payload.amountEurCents) }] : []),
    cta: proRequests("Apri il lavoro"),
  }),
  JOB_BALANCE_PAID: (payload, ctx) => ({
    kind: "notification",
    subject: "Il cliente ha pagato il saldo",
    greeting: ctx.name,
    title: "Saldo pagato",
    paragraphs: [
      `Il cliente ha pagato online il saldo per il lavoro **${job(ctx)}**.`,
      "Lo ricevi in banca quando il cliente conferma il lavoro.",
    ],
    details: typeof payload.amountEurCents === "number" ? [{ label: "Saldo", value: formatEur(payload.amountEurCents) }] : undefined,
    cta: proRequests("Apri il lavoro"),
  }),
  JOB_BALANCE_DUE: (payload, ctx) => ({
    kind: "notification",
    subject: "Paga il saldo del lavoro",
    greeting: ctx.name,
    title: "Paga il saldo",
    paragraphs: [
      `**${pro(ctx)}** ha chiuso il lavoro per **${job(ctx)}**. Paga il saldo online per completare il pagamento.`,
      "Il professionista riceve i soldi quando confermi il lavoro.",
    ],
    details: typeof payload.amountEurCents === "number" ? [{ label: "Saldo da pagare", value: formatEur(payload.amountEurCents) }] : undefined,
    cta: { label: "Paga il saldo", url: `${frontendUrl()}/le-mie-richieste` },
  }),
  // Saldo addebitato da solo sulla carta dell'acconto (§267).
  JOB_BALANCE_AUTO_CHARGED: (payload, ctx) => ({
    kind: "notification",
    subject: "Saldo del lavoro pagato",
    greeting: ctx.name,
    title: "Saldo pagato",
    paragraphs: [
      `**${pro(ctx)}** ha chiuso il lavoro per **${job(ctx)}**: abbiamo addebitato il saldo sulla carta usata per l'acconto.`,
      "Il professionista riceve i soldi quando confermi il lavoro. Se c'è un problema, segnalalo dalla richiesta.",
    ],
    details: typeof payload.amountEurCents === "number" ? [{ label: "Saldo pagato", value: formatEur(payload.amountEurCents) }] : undefined,
    cta: { label: "Conferma il lavoro", url: `${frontendUrl()}/le-mie-richieste` },
  }),
  JOB_BALANCE_UNPAID: (_payload, ctx) => ({
    kind: "notification",
    tone: "urgent",
    subject: "Il saldo di un lavoro non risulta pagato",
    greeting: ctx.name,
    title: "Saldo non pagato",
    paragraphs: [
      `Il saldo del lavoro per **${job(ctx)}** con ${pro(ctx)} non risulta ancora pagato.`,
      "Puoi pagarlo ora dalla richiesta. Se c'è un problema, scrivici: ti aiutiamo a sistemarlo.",
    ],
    cta: { label: "Paga il saldo", url: `${frontendUrl()}/le-mie-richieste` },
  }),
  // Soldi sbloccati sul conto Stripe del professionista (§249): parte il bonifico.
  JOB_PAYOUT_SENT: (payload, ctx) => ({
    kind: "notification",
    subject: `Pagamento sbloccato: ${formatEur(payload.amountEurCents) || "un bonifico"} in arrivo`,
    greeting: ctx.name,
    title: "Pagamento sbloccato",
    paragraphs: [
      `Abbiamo sbloccato il pagamento del lavoro per **${job(ctx)}**, già al netto della commissione, del costo della carta e del costo del bonifico.`,
      ...(typeof payload.debtRecoveredEurCents === "number" && payload.debtRecoveredEurCents > 0
        ? [`Abbiamo trattenuto ${formatEur(payload.debtRecoveredEurCents)} che dovevi restituire per un lavoro precedente.`]
        : []),
      "Il bonifico arriva in banca in pochi giorni lavorativi.",
    ],
    details: typeof payload.amountEurCents === "number" ? [{ label: "Bonifico", value: formatEur(payload.amountEurCents) }] : undefined,
    cta: proRequests("Apri il lavoro"),
  }),
  JOB_PAYOUT_FAILED: (payload, ctx) => ({
    kind: "notification",
    tone: "urgent",
    subject: "Il bonifico verso la tua banca non è riuscito",
    greeting: ctx.name,
    title: "Bonifico non riuscito",
    paragraphs: [
      `Il bonifico${typeof payload.amountEurCents === "number" ? ` di ${formatEur(payload.amountEurCents)}` : ""} per il lavoro **${job(ctx)}** non è arrivato alla tua banca. I soldi sono al sicuro sul tuo conto Stripe.`,
      "Controlla il conto bancario: il bonifico riparte da solo.",
    ],
    cta: { label: "Controlla i dati bancari", url: `${frontendUrl()}/dashboard/fiscale` },
  }),
  JOB_PAYOUT_ACCOUNT_NEEDED: (_payload, ctx) => ({
    kind: "notification",
    tone: "urgent",
    subject: "Attiva i pagamenti per ricevere i tuoi soldi",
    greeting: ctx.name,
    title: "Hai un pagamento da ricevere",
    paragraphs: [
      `Hai un pagamento online da ricevere per il lavoro **${job(ctx)}**, ma non hai ancora attivato i pagamenti.`,
      "Attivali in Dati fiscali e pagamenti: bastano pochi minuti e poi l'accredito parte da solo.",
    ],
    cta: { label: "Attiva i pagamenti", url: `${frontendUrl()}/dashboard/fiscale` },
  }),
  // Solo una parte ha chiuso il lavoro (docs/CHANGELOG.md §190).
  JOB_CONFIRM_REMINDER: (payload, ctx) => ({
    kind: "notification",
    subject: `Confermi che il lavoro con ${pro(ctx)} è terminato?`,
    greeting: ctx.name,
    title: "Il lavoro è terminato?",
    paragraphs: [
      `**${pro(ctx)}** ha segnato come terminato il lavoro per **${job(ctx)}**.`,
      `Confermalo e lascia una recensione, oppure segnala un problema${str(payload.deadline) ? ` **entro ${formatDeadline(str(payload.deadline))}**` : ""}. Dopo quella data il lavoro sarà considerato terminato e non potrai più segnalare problemi.`,
    ],
    cta: { label: "Apri il lavoro", url: `${frontendUrl()}/le-mie-richieste` },
  }),
  JOB_AUTO_CONFIRMED: (_payload, ctx) => ({
    kind: "notification",
    subject: "Il lavoro è stato considerato terminato",
    greeting: ctx.name,
    title: "Lavoro terminato",
    paragraphs: [
      `Non ci hai confermato né segnalato problemi sul lavoro per **${job(ctx)}** entro ${BAD_WORK_REPORT_DAYS} giorni: lo consideriamo terminato.`,
      "Puoi ancora lasciare una recensione al professionista.",
    ],
    cta: { label: "Lascia una recensione", url: `${frontendUrl()}/le-mie-richieste` },
  }),
  JOB_CLOSE_REMINDER: (payload, ctx) => ({
    kind: "notification",
    subject: "Il cliente ha confermato il lavoro terminato",
    greeting: ctx.name,
    title: "Segna il lavoro come terminato",
    paragraphs: [
      `Il cliente ha confermato che il lavoro per **${job(ctx)}** è terminato.`,
      `Segnalalo anche tu con l'importo finale${str(payload.deadline) ? ` **entro ${formatDeadline(str(payload.deadline))}**` : ""}.`,
    ],
    cta: proRequests("Segna il lavoro come terminato"),
  }),
  JOB_CLOSE_EXPIRED: (_payload, ctx) => ({
    kind: "notification",
    tone: "urgent",
    subject: "Non hai segnato il lavoro come terminato",
    greeting: ctx.name,
    title: "Termine scaduto",
    paragraphs: [
      `Non hai segnato come terminato il lavoro per **${job(ctx)}** entro ${BAD_WORK_REPORT_DAYS} giorni dalla conferma del cliente.`,
      "Puoi ancora segnare il lavoro come terminato con l'importo finale.",
    ],
    cta: proRequests("Apri il lavoro"),
  }),
  ADMIN_JOB_NOT_CLOSED: () => ({
    kind: "notification",
    tone: "urgent",
    subject: "Lavoro pagato online non chiuso dal professionista",
    title: "Lavoro non chiuso",
    paragraphs: [`Il cliente ha confermato un lavoro pagato online, ma il professionista non l'ha chiuso entro ${BAD_WORK_REPORT_DAYS} giorni: i soldi sono ancora bloccati.`],
    cta: { label: "Apri l'area admin", url: `${frontendUrl()}/admin` },
  }),
  JOB_STRIPE_DISPUTE: (payload, ctx) => ({
    kind: "notification",
    tone: "urgent",
    subject: payload.status && ["won", "lost", "warning_closed", "prevented"].includes(String(payload.status)) ? "Contestazione in banca chiusa" : "Un cliente ha contestato un pagamento in banca",
    greeting: ctx.name,
    title: "Contestazione in banca",
    paragraphs: [
      `Il cliente del lavoro **${job(ctx)}** ha contestato un pagamento online presso la sua banca.`,
      "Decide la banca: finché la contestazione è aperta la cifra contestata resta sospesa. Il nostro team risponde con le prove (preventivo accettato, chat, foto): se hai altro materiale utile, scrivilo nella chat del lavoro.",
      "Se la banca dà ragione a te la cifra torna sul tuo conto; se dà ragione al cliente resta a lui.",
    ],
    cta: proRequests("Apri il lavoro"),
  }),
  // Cifra da restituire (§267): rimborso o contestazione persa quando i soldi non erano più sul conto.
  JOB_PAYMENT_DEBT: (payload, ctx) => ({
    kind: "notification",
    subject: "Un importo da restituire su un lavoro",
    greeting: ctx.name,
    title: "Importo da restituire",
    paragraphs: [
      `Per il lavoro **${job(ctx)}** devi restituire ${formatEur(payload.amountEurCents) || "un importo"} (rimborso al cliente o contestazione in banca).`,
      "Lo tratteniamo dai tuoi prossimi pagamenti online, prima del bonifico. Non devi fare nulla.",
    ],
    cta: proRequests("Apri il lavoro"),
  }),
  // Rimborso in attesa di fondi sul conto Stripe del professionista (§269).
  JOB_REFUND_PENDING: (payload, ctx) => ({
    kind: "notification",
    subject: "Il tuo rimborso è in arrivo",
    greeting: ctx.name,
    title: "Rimborso in arrivo",
    paragraphs: [
      `Il rimborso per **${job(ctx)}** è stato chiesto, ma serve qualche giorno in più per completarlo.`,
      "Non devi fare nulla: ti scriviamo appena parte verso la tua carta.",
    ],
    details: typeof payload.amountEurCents === "number" ? [{ label: "Rimborso", value: formatEur(payload.amountEurCents) }] : undefined,
    cta: clientRequests(),
  }),
  JOB_REFUND_COMPLETED: (payload, ctx) => ({
    kind: "notification",
    subject: "Rimborso completato",
    greeting: ctx.name,
    title: "Rimborso completato",
    paragraphs: [`Il rimborso per **${job(ctx)}** è partito: lo rivedi sulla carta in pochi giorni.`],
    details: typeof payload.amountEurCents === "number" ? [{ label: "Rimborso", value: formatEur(payload.amountEurCents) }] : undefined,
    cta: clientRequests(),
  }),
  JOB_REFUND_WAITING_FUNDS: (payload, ctx) => ({
    kind: "notification",
    subject: "Un rimborso aspetta fondi sul tuo conto Stripe",
    greeting: ctx.name,
    title: "Rimborso in attesa",
    paragraphs: [
      `Il rimborso al cliente per **${job(ctx)}** aspetta fondi sul tuo conto Stripe: il saldo disponibile non basta.`,
      "Parte da solo appena arrivano i prossimi pagamenti. Non devi fare nulla.",
    ],
    details: typeof payload.amountEurCents === "number" ? [{ label: "Rimborso", value: formatEur(payload.amountEurCents) }] : undefined,
    cta: proRequests("Apri il lavoro"),
  }),
  ADMIN_JOB_REFUND_FAILED: (payload) => ({
    kind: "notification",
    tone: "urgent",
    subject: "Rimborso al cliente non riuscito",
    title: "Rimborso non riuscito",
    paragraphs: [
      `Un rimborso di ${formatEur(payload.amountEurCents) || "un importo"} rimasto in attesa sul conto del professionista non è riuscito.`,
      "Controllalo dalla Dashboard Stripe e decidi come rimborsare il cliente.",
    ],
    cta: { label: "Apri l'area admin", url: `${frontendUrl()}/admin/pagamenti` },
  }),
  ADMIN_STRIPE_DISPUTE: (payload) => ({
    kind: "notification",
    tone: "urgent",
    subject: "Contestazione in banca su un pagamento",
    title: "Contestazione in banca",
    paragraphs: [
      `Stato della contestazione: ${DISPUTE_STATUS_LABEL[str(payload.status) ?? ""] ?? "aperta"}. Se serve una risposta, manda le prove dalla Dashboard Stripe prima della scadenza.`,
      payload.alreadyReleased
        ? "I soldi erano già passati al professionista: quello che non si riprende dal suo conto si trattiene dai suoi prossimi pagamenti."
        : "Se riguarda un lavoro, la cifra si riprende subito dai soldi bloccati del professionista e l'accredito resta sospeso finché la banca non decide.",
    ],
    cta: { label: "Apri l'area admin", url: `${frontendUrl()}/admin/pagamenti` },
  }),
  ADMIN_JOB_PAYMENT_LONG_HOLD: (payload) => ({
    kind: "notification",
    tone: "urgent",
    subject: "Pagamento online bloccato da quasi 90 giorni",
    title: "Pagamento bloccato da troppo tempo",
    paragraphs: [
      `Un pagamento online è bloccato da ${typeof payload.days === "number" ? payload.days : ONLINE_LONG_HOLD_ALERT_DAYS} giorni. Dopo ${ONLINE_MAX_HOLD_DAYS} giorni Stripe lo manda comunque in banca al professionista.`,
      "Decidi prima se sbloccarlo o rimborsare il cliente.",
    ],
    cta: { label: "Apri l'area admin", url: `${frontendUrl()}/admin/pagamenti` },
  }),
  ADMIN_DAC7_NEEDS_CORRECTION: (payload) => ({
    kind: "notification",
    tone: "urgent",
    subject: `DAC7 ${typeof payload.year === "number" ? payload.year : ""}: importi cambiati dopo l'invio`,
    title: "DAC7 da correggere",
    paragraphs: ["Dopo l'invio all'Agenzia delle Entrate alcuni importi sono cambiati (rimborso o lavoro riaperto). Usa \"Correggi\" sull'anno, poi esporta e invia la correzione."],
    cta: { label: "Apri Finanza e DAC7", url: `${frontendUrl()}/admin/finanza` },
  }),
  ADMIN_URGENCY_ALERT: (payload) => ({
    kind: "notification",
    tone: "urgent",
    subject: "Richieste urgenti da controllare",
    title: "Richieste urgenti fuori soglia",
    paragraphs: [
      ...(Array.isArray(payload.alerts) ? payload.alerts.filter((a): a is string => typeof a === "string") : []),
      "Numeri degli ultimi 7 giorni, nella Home dell'area admin.",
    ],
    cta: { label: "Apri l'area admin", url: `${frontendUrl()}/admin` },
  }),
  ADMIN_JOB_BALANCE_UNPAID: () => ({
    kind: "notification",
    tone: "urgent",
    subject: "Saldo non pagato entro 7 giorni",
    title: "Saldo non pagato",
    paragraphs: ["Un cliente non ha pagato il saldo di un lavoro entro 7 giorni dalla chiusura."],
    cta: { label: "Apri l'area admin", url: `${frontendUrl()}/admin` },
  }),

  // ── Account e sicurezza (non si spengono) ──────────────────────────────
  // Segnalazioni (DSA art. 16 c. 4-5, docs/CHANGELOG.md §319): chi segnala
  // riceve la presa in carico e, solo per un contenuto illegale, l'esito in
  // una riga, mai la motivazione.
  CONTENT_REPORT_RECEIVED: (payload, ctx) => {
    const targetType = payload.targetType as ContentReportTargetType | undefined;
    const what = targetType ? CONTENT_REPORT_TARGET_LABEL[targetType].toLowerCase() : "contenuto";
    return {
      kind: "account",
      subject: "Abbiamo preso in carico la tua segnalazione",
      greeting: ctx.name,
      title: "Segnalazione presa in carico",
      paragraphs: [`Grazie, abbiamo preso in carico la tua segnalazione (${what}). La esaminerà una persona del nostro team.`],
    };
  },
  CONTENT_REPORT_DECISION: (payload, ctx) => {
    const targetType = payload.targetType as ContentReportTargetType | undefined;
    const what = targetType ? CONTENT_REPORT_TARGET_LABEL[targetType].toLowerCase() : "contenuto";
    const upheld = payload.status === "RESOLVED";
    return {
      kind: "account",
      subject: "Esito della tua segnalazione",
      greeting: ctx.name,
      title: "Esito della tua segnalazione",
      paragraphs: [
        upheld
          ? `Abbiamo esaminato la tua segnalazione (${what}) e preso provvedimenti sul contenuto.`
          : `Abbiamo esaminato la tua segnalazione (${what}): non abbiamo preso provvedimenti.`,
      ],
      after: ["Se non sei d'accordo puoi rivolgerti all'autorità giudiziaria."],
    };
  },
  CONTENT_REPORT_UPHELD: (payload, ctx) => {
    const targetType = payload.targetType as ContentReportTargetType | undefined;
    const what = targetType ? CONTENT_REPORT_TARGET_LABEL[targetType].toLowerCase() : "contenuto";
    const note = str(payload.note);
    const suspended = payload.action === "SUSPEND_USER";
    const ground = moderationGround(str(payload.ground));
    const site = frontendUrl();
    return {
      kind: "account",
      subject: "Decisione su una segnalazione che riguarda un tuo contenuto",
      greeting: ctx.name,
      title: "Decisione su un tuo contenuto",
      paragraphs: [
        `Abbiamo esaminato una segnalazione su un tuo contenuto (${what}).`,
        `**${moderationActionOwnerText((payload.action as ModerationAction | null) ?? null, targetType ?? "REVIEW")}**`,
        ...(ground ? [`**${ground.kind === "law" ? "Legge violata" : "Regola violata"}:** ${ground.label}`] : []),
        ...(note ? [`**Motivazione:** ${note}`] : []),
        "La decisione è stata presa da una persona del nostro team, non da un sistema automatico.",
      ],
      cta: suspended
        ? { label: "Scrivici dal modulo Contatti", url: `${site}/contatti` }
        : { label: "Contesta la decisione", url: `${site}/segnalazioni` },
      after: [
        suspended ? "Se ritieni che sia un errore, rispondi a questa email o scrivici dal modulo Contatti." : "Se ritieni che sia un errore puoi contestare la decisione.",
        "Puoi anche rivolgerti a un organismo di risoluzione extragiudiziale delle controversie o all'autorità giudiziaria.",
      ],
    };
  },
  ACCOUNT_SUSPENDED: (payload, ctx) => {
    const note = str(payload.note);
    return {
      kind: "account",
      tone: "urgent",
      subject: "Il tuo account è stato sospeso",
      greeting: ctx.name,
      title: "Account sospeso",
      paragraphs: [
        "Il tuo account è stato sospeso: non puoi accedere finché la decisione non viene annullata.",
        ...(note ? [`**Motivazione:** ${note}`] : []),
        "La decisione è stata presa da una persona del nostro team, non da un sistema automatico.",
      ],
      cta: { label: "Scrivici dal modulo Contatti", url: `${frontendUrl()}/contatti` },
      after: [
        "Se ritieni che sia un errore, rispondi a questa email o scrivici dal modulo Contatti.",
        "Puoi anche rivolgerti a un organismo di risoluzione extragiudiziale delle controversie o all'autorità giudiziaria.",
      ],
    };
  },
  ACCOUNT_REACTIVATED: (payload, ctx) => {
    const note = str(payload.note);
    return {
      kind: "account",
      subject: "Il tuo account è di nuovo attivo",
      greeting: ctx.name,
      title: "Account di nuovo attivo",
      paragraphs: ["La sospensione del tuo account è stata annullata: puoi di nuovo accedere.", ...(note ? [`**Motivazione:** ${note}`] : [])],
      cta: { label: "Accedi", url: `${frontendUrl()}/accedi` },
    };
  },
  PROFILE_VERIFIED: (_payload, ctx) => ({
    kind: "account",
    subject: "La tua identità è verificata",
    greeting: ctx.name,
    title: "Identità verificata",
    paragraphs: [
      "La verifica con documento e selfie è riuscita: il tuo profilo ora mostra il badge **Verificato** nella ricerca e nella tua pagina pubblica.",
      "Da adesso puoi anche inviare preventivi ai clienti.",
    ],
    cta: { label: "Vedi il tuo profilo", url: `${frontendUrl()}/dashboard/profilo` },
  }),
  STRIPE_ACCOUNT_ACTIVE: (_payload, ctx) => ({
    kind: "account",
    subject: "Stripe ha verificato la tua identità",
    greeting: ctx.name,
    title: "Pagamenti online attivi",
    paragraphs: [
      "Stripe ha completato la verifica della tua identità: ora puoi offrire nei preventivi l'acconto online, e il tuo profilo mostra il badge **Identità verificata da Stripe**.",
      "I soldi dei pagamenti online ti arrivano sul conto che hai indicato a Stripe.",
    ],
    cta: { label: "Vai ai dati fiscali e pagamenti", url: `${frontendUrl()}/dashboard/fiscale` },
  }),
  // Avviso annuale DAC7 (docs/CHANGELOG.md §246): obbligatorio per legge.
  DAC7_ANNUAL_NOTICE: (payload, ctx) => {
    const year = typeof payload.year === "number" ? payload.year : null;
    const corrected = payload.corrected === true;
    return {
      kind: "account",
      subject: corrected ? `Abbiamo corretto i dati DAC7 ${year ?? ""} comunicati al fisco` : `I tuoi dati DAC7 ${year ?? ""} comunicati al fisco`,
      greeting: ctx.name,
      title: corrected ? "Dati DAC7 corretti" : "Comunicazione DAC7 inviata",
      paragraphs: [
        `${corrected ? "Abbiamo corretto" : "Abbiamo inviato"} al fisco i compensi${year ? ` del ${year}` : ""} che hai ricevuto su ${EMAIL_BRAND.name}, come chiede la legge (DAC7). Il dettaglio è nel Riepilogo DAC7.`,
      ],
      details: typeof payload.totalEurCents === "number" ? [{ label: "Compensi comunicati", value: formatEur(payload.totalEurCents) }] : undefined,
      cta: { label: "Apri il Riepilogo DAC7", url: `${frontendUrl()}/dashboard/fiscale/dac7` },
    };
  },
  // Promemoria di novembre (docs/CHANGELOG.md §247).
  DAC7_DATA_REMINDER: (payload, ctx) => {
    const year = typeof payload.year === "number" ? payload.year : null;
    const missing = [payload.missingFiscalData === true ? "i dati fiscali" : null, payload.missingIban === true ? "l'IBAN dei pagamenti online" : null].filter(Boolean).join(" e ");
    return {
      kind: "account",
      subject: `Completa ${missing || "i tuoi dati"} entro dicembre`,
      greeting: ctx.name,
      title: "Mancano dei dati per il fisco",
      paragraphs: [`A gennaio comunichiamo al fisco i compensi${year ? ` del ${year}` : ""} (DAC7): completa ${missing || "i tuoi dati"} entro dicembre.`],
      cta: { label: "Completa i dati", url: `${frontendUrl()}/dashboard/fiscale` },
    };
  },
  PAYOUT_IBAN_MISMATCH: (_payload, ctx) => ({
    kind: "account",
    subject: "L'IBAN non corrisponde al conto su Stripe",
    greeting: ctx.name,
    title: "Controlla l'IBAN",
    paragraphs: ["Le ultime 4 cifre dell'IBAN che ci hai dato non sono quelle del conto indicato a Stripe. Correggilo in Dati fiscali e pagamenti."],
    cta: { label: "Controlla l'IBAN", url: `${frontendUrl()}/dashboard/fiscale` },
  }),
  STRIPE_ACCOUNT_RESTRICTED: (_payload, ctx) => ({
    kind: "account",
    subject: "Stripe ha sospeso i pagamenti online sul tuo account",
    greeting: ctx.name,
    title: "Pagamenti online sospesi",
    paragraphs: [
      "Stripe ci ha comunicato che il tuo account non può più ricevere pagamenti, di solito perché mancano dei dati o un documento da aggiornare.",
      "Finché non lo sistemi non puoi offrire l'acconto online nei nuovi preventivi e il badge **Identità verificata da Stripe** non compare. Il tuo profilo resta visibile e puoi continuare a farti pagare direttamente. I soldi già pagati online restano al sicuro e ti arrivano appena l'account torna attivo.",
    ],
    cta: { label: "Completa i dati su Stripe", url: `${frontendUrl()}/dashboard/fiscale` },
  }),
  PROFILE_VERIFICATION_REMOVED: (payload, ctx) => {
    const note = str(payload.note);
    return {
      kind: "account",
      subject: "Badge Verificato tolto dal tuo profilo",
      greeting: ctx.name,
      title: "Badge Verificato tolto",
      paragraphs: [
        "Il tuo profilo non mostra più il badge Verificato.",
        ...(note ? [`**Motivazione:** ${note}`] : []),
        "Per riaverlo rifai la verifica dell'identità con documento e selfie: servono circa 2 minuti. Se pensi che sia un errore, scrivici dal modulo Contatti.",
      ],
      cta: { label: "Rifai la verifica", url: `${frontendUrl()}/dashboard/verifica-identita` },
    };
  },
  // Verifica fiscale e d'identità (docs/CHANGELOG.md §253).
  IDENTITY_VERIFICATION_DECLINED: (payload, ctx) => {
    const reason = str(payload.reason);
    return {
      kind: "account",
      subject: "Verifica dell'identità da rifare",
      greeting: ctx.name,
      title: "La verifica dell'identità non è andata a buon fine",
      paragraphs: [
        ...(reason ? [reason] : ["Il documento o il selfie non sono stati accettati."]),
        "Puoi riprovare subito: tieni a portata di mano un documento valido (carta d'identità, patente o passaporto) e mettiti in un posto con buona luce.",
      ],
      cta: { label: "Riprova la verifica", url: `${frontendUrl()}/dashboard/verifica-identita` },
    };
  },
  // Verifica in attesa ripresa e promemoria (§256).
  IDENTITY_VERIFICATION_READY: (_payload, ctx) => ({
    kind: "account",
    subject: "Puoi continuare la verifica dell'identità",
    greeting: ctx.name,
    title: "La verifica è di nuovo disponibile",
    paragraphs: ["Prima il servizio di verifica non rispondeva, ora funziona: riprendi da dove eri, servono circa 2 minuti."],
    cta: { label: "Continua la verifica", url: `${frontendUrl()}/dashboard/verifica-identita` },
  }),
  IDENTITY_VERIFICATION_REMINDER: (_payload, ctx) => ({
    kind: "account",
    subject: "Ti manca solo la verifica dell'identità",
    greeting: ctx.name,
    title: "Completa la verifica per inviare preventivi",
    paragraphs: [
      "Per inviare il tuo primo preventivo serve una verifica veloce con documento e selfie: circa 2 minuti.",
      "Così i clienti vedono il badge **Verificato** sul tuo profilo.",
    ],
    cta: { label: "Fai la verifica", url: `${frontendUrl()}/dashboard/verifica-identita` },
  }),
  // Documento della verifica in scadenza (§338): 30 giorni prima, una volta.
  IDENTITY_VERIFICATION_EXPIRING: (payload, ctx) => {
    const expiresOn = str(payload.expiresOn);
    const day = expiresOn ? new Date(expiresOn).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" }) : null;
    return {
      kind: "account",
      subject: "Il documento della tua verifica sta per scadere",
      greeting: ctx.name,
      title: "Rinnova la verifica dell'identità",
      paragraphs: [
        `Il documento che hai usato per la verifica scade${day ? ` il ${day}` : " tra poco"}. Da quel giorno il tuo profilo non mostra più il badge **Verificato**.`,
        "Per tenerlo rifai la verifica con un documento valido: circa 2 minuti. Puoi continuare a inviare preventivi.",
      ],
      cta: { label: "Rinnova la verifica", url: `${frontendUrl()}/dashboard/verifica-identita` },
    };
  },
  // "Completa il profilo" il giorno dopo l'iscrizione, solo se manca qualcosa (§261).
  PROFILE_SETUP_REMINDER: (payload, ctx) => {
    const missing = Array.isArray(payload.missing) ? payload.missing : [];
    const lines: string[] = [];
    if (missing.includes("SEARCH")) lines.push("**Non compari ancora nelle ricerche**: completa i dati fiscali.");
    if (missing.includes("QUOTES")) lines.push("**Non puoi ancora rispondere alle richieste di preventivo**: verifica la tua identità con documento e selfie, circa 2 minuti.");
    if (missing.includes("ONLINE_PAYMENTS")) lines.push("**Non puoi ancora ricevere pagamenti online**: attivali da Dati fiscali e pagamenti.");
    if (lines.length === 0) lines.push("Ti mancano ancora alcuni passi per comparire nelle ricerche e rispondere ai clienti.");
    return {
      kind: "account",
      subject: "Completa il tuo profilo",
      greeting: ctx.name,
      title: "Ti manca poco per iniziare",
      paragraphs: [...lines, "Trovi tutto in Oggi, con il prossimo passo da fare."],
      cta: { label: "Completa il profilo", url: `${frontendUrl()}/dashboard` },
    };
  },
  // Agenda vuota o senza disponibilità nei prossimi giorni (§274).
  AGENDA_REMINDER: (payload, ctx) => {
    const empty = payload.attention !== "RUNNING_LOW";
    return {
      kind: "notification",
      subject: empty ? "Inserisci le tue disponibilità" : "La tua agenda è vuota nei prossimi giorni",
      greeting: ctx.name,
      title: empty ? "Fatti trovare libero" : "Aggiungi disponibilità",
      paragraphs: [
        empty
          ? "Non hai ancora orari liberi in agenda. Aggiungili: i clienti vedono quando sei disponibile e ti prenotano prima."
          : `Nei prossimi ${AGENDA_LOOKAHEAD_DAYS} giorni non hai orari liberi in agenda: aggiungili per farti prenotare.`,
      ],
      cta: { label: "Apri l'agenda", url: `${frontendUrl()}/dashboard/agenda?tab=disponibilita` },
    };
  },
  // "Sto arrivando" dall'agenda (§288).
  PROFESSIONAL_ON_THE_WAY: (_payload, ctx) => ({
    kind: "notification",
    subject: `${pro(ctx)} sta arrivando`,
    greeting: ctx.name,
    title: "Il professionista è in viaggio",
    paragraphs: [`**${pro(ctx)}** sta arrivando per **${job(ctx)}**.`],
    details: jobDetails(ctx),
    cta: { label: "Apri la richiesta", url: `${frontendUrl()}/le-mie-richieste` },
    after: ["Se serve, scrivigli in chat dalla richiesta."],
  }),
  // Riepilogo della sera prima, senza orario di partenza (§288).
  AGENDA_TOMORROW_SUMMARY: (payload, ctx) => {
    const items = Array.isArray(payload.items) ? payload.items.filter(isSummaryItem) : [];
    const count = items.length;
    return {
      kind: "notification",
      subject: count === 1 ? "Domani hai 1 lavoro" : `Domani hai ${count || "dei"} lavori`,
      greeting: ctx.name,
      title: "Il tuo domani",
      paragraphs: count > 0 ? items.map((item) => `**${item.time}** · ${[item.name, item.place].filter(Boolean).join(", ")}`) : ["Domani hai lavori in agenda."],
      cta: { label: "Apri l'agenda", url: `${frontendUrl()}/dashboard/agenda` },
    };
  },
  TAX_ID_INVALID: (payload, ctx) => {
    const isVat = payload.kind === "PARTITA_IVA";
    return {
      kind: "account",
      subject: isVat ? "Controlla la tua partita IVA" : "Controlla il tuo codice fiscale",
      greeting: ctx.name,
      title: isVat ? "La partita IVA non risulta attiva" : "Non riusciamo a verificare il codice fiscale",
      paragraphs: [
        isVat
          ? "Abbiamo verificato la partita IVA che hai inserito nei dati fiscali e non risulta attiva."
          : "Il codice fiscale che hai inserito nei dati fiscali non risulta valido: forse c'è un errore di battitura.",
        "Finché non lo correggi il tuo profilo non compare nelle ricerche. Se il dato è giusto, scrivici dal modulo Contatti e lo controlliamo insieme.",
      ],
      cta: { label: "Correggi i dati fiscali", url: `${frontendUrl()}/dashboard/fiscale` },
    };
  },
  CONTENT_REPORT_REVERTED: (payload, ctx) => {
    const targetType = payload.targetType as ContentReportTargetType | undefined;
    const what = targetType ? CONTENT_REPORT_TARGET_LABEL[targetType].toLowerCase() : "contenuto";
    const note = str(payload.note);
    return {
      kind: "account",
      subject: "La misura su un tuo contenuto è stata annullata",
      greeting: ctx.name,
      title: "Misura annullata",
      paragraphs: [`Abbiamo annullato la misura presa su un tuo contenuto (${what}): è di nuovo come prima.`, ...(note ? [`**Motivazione:** ${note}`] : [])],
    };
  },
  CONTENT_REPORT_APPEAL_REJECTED: (payload, ctx) => {
    const note = str(payload.note);
    return {
      kind: "account",
      subject: "Esito della tua contestazione",
      greeting: ctx.name,
      title: "Esito della tua contestazione",
      paragraphs: [
        "Abbiamo esaminato la tua contestazione: la decisione resta valida.",
        ...(note ? [`**Motivazione:** ${note}`] : []),
        "Puoi rivolgerti a un organismo di risoluzione extragiudiziale delle controversie o all'autorità giudiziaria.",
      ],
    };
  },

  // Abbonamento (docs/CHANGELOG.md §161-§162): addebiti e visibilità.
  SUBSCRIPTION_BONUS_MONTH: (payload, ctx) => ({
    kind: "account",
    subject: "Sorpresa: ti regaliamo un altro mese gratis",
    greeting: ctx.name,
    title: "Un altro mese gratis, offerto da noi",
    paragraphs: [
      "Sappiamo che all'inizio i lavori possono tardare ad arrivare. Per questo ti regaliamo un altro mese gratuito: il tuo profilo resta visibile e continui a ricevere richieste senza pagare nulla.",
    ],
    details: str(payload.date) ? [{ label: "Gratis fino al", value: formatDay(str(payload.date)) }] : undefined,
    cta: subscriptionPage(),
  }),
  SUBSCRIPTION_TRIAL_ENDING: (payload, ctx) => ({
    kind: "account",
    subject: "Il tuo mese gratuito sta per finire",
    greeting: ctx.name,
    title: "Il mese gratuito sta per finire",
    paragraphs: [
      `Il tuo mese gratuito finisce il **${formatDay(str(payload.date))}**.`,
      "Scegli un livello per restare visibile nelle ricerche e continuare a ricevere richieste.",
    ],
    cta: { label: "Scegli un livello", url: `${frontendUrl()}/dashboard/abbonamento` },
  }),
  SUBSCRIPTION_LIMIT_NEAR: (payload, ctx) => {
    const used = typeof payload.used === "number" ? payload.used : null;
    const limit = typeof payload.limit === "number" ? payload.limit : null;
    return {
      kind: "account",
      subject: "Ti stai avvicinando ai lavori compresi nel tuo livello",
      greeting: ctx.name,
      title: "Quasi al limite del mese",
      paragraphs: [
        used !== null && limit !== null
          ? `Questo mese hai già **${used} lavori accettati su ${limit}** compresi nel tuo livello.`
          : "Ti stai avvicinando ai lavori accettati compresi nel tuo livello per questo mese.",
        "Al limite il profilo esce dalle ricerche fino al mese prossimo. Se pensi di averne bisogno, puoi passare al livello superiore pagando solo la differenza.",
      ],
      cta: subscriptionPage(),
    };
  },
  SUBSCRIPTION_LIMIT_REACHED: (_payload, ctx) => ({
    kind: "account",
    tone: "urgent",
    subject: "Hai raggiunto i lavori compresi nel tuo livello",
    greeting: ctx.name,
    title: "Hai raggiunto il limite del mese",
    paragraphs: [
      "Hai raggiunto i lavori accettati compresi nel tuo livello per questo mese: il tuo profilo non compare più nelle ricerche e non ricevi nuove richieste.",
      "Passa al livello superiore pagando solo la differenza, oppure riparti dal primo del mese prossimo.",
    ],
    cta: subscriptionPage(),
  }),
  SUBSCRIPTION_PAUSED: (payload, ctx) => ({
    kind: "account",
    tone: "urgent",
    subject: "Il tuo account è in pausa",
    greeting: ctx.name,
    title: "Account in pausa",
    paragraphs: [
      payload.reason === "SUBSCRIPTION_ENDED"
        ? "Il tuo abbonamento è concluso: il tuo profilo non compare più nelle ricerche e non ricevi nuove richieste."
        : "Il tuo mese gratuito è finito: il tuo profilo non compare più nelle ricerche e non ricevi nuove richieste.",
      "Scegli un livello per renderlo di nuovo visibile e operativo.",
    ],
    cta: { label: "Scegli un livello", url: `${frontendUrl()}/dashboard/abbonamento` },
  }),
  SUBSCRIPTION_RENEWING: (payload, ctx) => {
    const tier = str(payload.tierLabel) ?? "";
    const date = formatDay(str(payload.date));
    return {
      kind: "account",
      subject: `Il tuo abbonamento ${tier} si rinnova il ${date}`.replace(/\s+/g, " "),
      greeting: ctx.name,
      title: "Rinnovo in arrivo",
      paragraphs: [
        `Il tuo abbonamento ${tier} si rinnova automaticamente il **${date}**.`.replace(/\s+/g, " "),
        "Se non vuoi rinnovarlo puoi annullarlo dalla pagina Abbonamento: resta attivo fino a quella data.",
      ],
      details: typeof payload.amountEurCents === "number" ? [{ label: "Importo", value: `${formatEur(payload.amountEurCents)} al mese` }] : undefined,
      cta: subscriptionPage(),
    };
  },
  SUBSCRIPTION_RENEWED: (payload, ctx) => {
    const tier = str(payload.tierLabel) ?? "";
    return {
      kind: "account",
      subject: `Abbonamento ${tier} rinnovato`.replace(/\s+/g, " "),
      greeting: ctx.name,
      title: "Abbonamento rinnovato",
      paragraphs: [`Abbiamo rinnovato il tuo abbonamento ${tier}. Grazie per continuare con noi!`.replace(/\s+/g, " ")],
      details: [
        ...(typeof payload.amountEurCents === "number" ? [{ label: "Addebito", value: formatEur(payload.amountEurCents) }] : []),
        ...(str(payload.date) ? [{ label: "Prossimo rinnovo", value: formatDay(str(payload.date)) }] : []),
      ],
      cta: subscriptionPage(),
    };
  },
  SUBSCRIPTION_ENDING: (payload, ctx) => {
    const tier = str(payload.tierLabel) ?? "";
    const date = formatDay(str(payload.date));
    return {
      kind: "account",
      subject: `Il tuo abbonamento finisce il ${date}`,
      greeting: ctx.name,
      title: "Il tuo abbonamento sta per finire",
      paragraphs: [
        `Hai annullato l'abbonamento ${tier}: resta attivo fino al **${date}**, poi il tuo profilo non comparirà più nelle ricerche.`.replace(/\s+/g, " "),
        "Puoi riattivarlo in qualsiasi momento dalla pagina Abbonamento.",
      ],
      cta: subscriptionPage(),
    };
  },
  SUBSCRIPTION_PAYMENT_FAILED: (_payload, ctx) => ({
    kind: "account",
    tone: "urgent",
    subject: "Pagamento dell'abbonamento non riuscito",
    greeting: ctx.name,
    title: "Pagamento non riuscito",
    paragraphs: [
      "Non siamo riusciti ad addebitare il rinnovo del tuo abbonamento. Riproveremo nei prossimi giorni.",
      "Controlla il metodo di pagamento per non andare in pausa.",
    ],
    cta: subscriptionPage(),
  }),
};

/** Tipi di notifica che partono anche via email. */
export const NOTIFICATION_EMAIL_TYPES: ReadonlySet<string> = new Set(Object.keys(BUILDERS));

export function notificationEmail(type: string, payload: Payload, ctx: NotificationEmailContext): EmailContent | null {
  const builder = BUILDERS[type];
  const content = builder ? builder(payload, ctx) : null;
  return content ? withDescription(content, ctx) : null;
}

/**
 * Descrizione dell'intervento in ogni email che riguarda una richiesta, per
 * capire subito di quale si tratta (richiesta esplicita dell'utente,
 * docs/CHANGELOG.md §228): nel riquadro, dopo "Lavoro" se c'è. Il
 * professionista la vede già prima dell'accettazione, quindi non è un dato
 * di contatto (CLAUDE.md §5 punto 9).
 */
function withDescription(content: EmailContent, ctx: NotificationEmailContext): EmailContent {
  const row = descriptionDetail(ctx.description)[0];
  if (!row) return content;
  const details = content.details ?? [];
  const jobIndex = details.findIndex((d) => d.label === "Lavoro");
  return {
    ...content,
    details: jobIndex >= 0 ? [...details.slice(0, jobIndex + 1), row, ...details.slice(jobIndex + 1)] : [row, ...details],
  };
}

/** Contesto vuoto, per i tipi che non riguardano un lavoro. */
export const EMPTY_EMAIL_CONTEXT: NotificationEmailContext = {
  name: null,
  category: null,
  city: null,
  businessName: null,
  when: null,
  proposedWhen: null,
};

type SummaryItem = { time: string; name: string | null; place: string | null };

function isSummaryItem(value: unknown): value is SummaryItem {
  return !!value && typeof value === "object" && typeof (value as Record<string, unknown>).time === "string";
}

/**
 * Messaggi in chat non letti (docs/CHANGELOG.md §332): un'email sola per
 * conversazione, mandata da `ChatMessageEmailsService` solo se dopo qualche
 * minuto chi riceve non li ha ancora visti sul sito. Fuori da `BUILDERS`,
 * che partono subito con la notifica. Mai il testo del messaggio: si legge
 * sul sito, dove valgono le regole sui dati di contatto (CLAUDE.md §5 punto 9).
 */
export function chatMessageEmail(
  type: "TIMELINE_MESSAGE_FROM_CLIENT" | "TIMELINE_MESSAGE_FROM_PROFESSIONAL",
  count: number,
  ctx: NotificationEmailContext,
  url: string,
): EmailContent {
  const fromClient = type === "TIMELINE_MESSAGE_FROM_CLIENT";
  const who = fromClient ? "Il cliente" : pro(ctx);
  const messages = count > 1 ? `${count} messaggi` : "un messaggio";
  return withDescription(
    {
      kind: "notification",
      subject: fromClient ? `${count > 1 ? "Nuovi messaggi" : "Nuovo messaggio"} dal cliente per ${job(ctx)}` : `${pro(ctx)} ti ha scritto`,
      greeting: ctx.name,
      title: count > 1 ? "Nuovi messaggi in chat" : "Nuovo messaggio in chat",
      paragraphs: [`**${who}** ti ha scritto ${messages} per **${job(ctx)}**.`],
      details: fromClient ? jobDetails({ ...ctx, businessName: null }) : jobDetails(ctx),
      cta: { label: count > 1 ? "Leggi i messaggi" : "Leggi il messaggio", url },
    },
    ctx,
  );
}
