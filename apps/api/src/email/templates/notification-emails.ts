import {
  CONTENT_REPORT_TARGET_LABEL,
  JOB_ISSUE_APPEAL_DAYS,
  JOB_ISSUE_INFO_HOURS,
  JOB_ISSUE_LABEL,
  JOB_ISSUE_PRO_REPLY_HOURS,
  JOB_ISSUE_SANCTION_LABEL,
  BAD_WORK_REPORT_DAYS,
  asScheduleChange,
  moderationActionOwnerText,
  scheduleChangeAlternative,
  scheduleChangeObject,
  type ContentReportTargetType,
  type JobIssueSanction,
  type JobIssueType,
  type ModerationAction,
} from "@professionisti/shared";
import { frontendUrl } from "../email-brand";
import type { EmailContent } from "../email-layout";
import { formatAppointment, formatDay, formatDeadline, formatEur } from "../email-format";

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
};

type Payload = Record<string, unknown>;
type Builder = (payload: Payload, ctx: NotificationEmailContext) => EmailContent | null;

/** Nota scritta dall'altra parte, riportata nell'email (docs/CHANGELOG.md §196). */
function quotedNote(payload: Payload): string[] {
  return typeof payload.note === "string" && payload.note.trim() ? [`Nota: "${payload.note.trim()}"`] : [];
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

const clientRequests = () => ({ label: "Apri la richiesta", url: `${frontendUrl()}/le-mie-richieste` });
const proRequests = (label = "Apri la richiesta") => ({ label, url: `${frontendUrl()}/dashboard/richieste` });
const subscriptionPage = () => ({ label: "Apri la pagina Abbonamento", url: `${frontendUrl()}/dashboard/abbonamento` });

const NOT_BINDING = "La nostra decisione non impedisce di rivolgersi a un organismo di mediazione o al giudice.";

const BUILDERS: Record<string, Builder> = {
  // ── Richieste ──────────────────────────────────────────────────────────
  NEW_LEAD: (payload, ctx) => {
    const category = str(payload.category) ?? ctx.category ?? "un lavoro";
    const city = str(payload.city) ?? ctx.city;
    const urgent = payload.isUrgent === true;
    return {
      kind: "notification",
      tone: urgent ? "urgent" : "default",
      subject: `${urgent ? "URGENTE — " : ""}Nuova richiesta: ${category}${city ? ` a ${city}` : ""}`,
      greeting: ctx.name,
      title: urgent ? "Nuova richiesta urgente" : "Hai una nuova richiesta",
      paragraphs: [
        `Un cliente cerca un professionista per **${category}**${city ? ` a ${city}` : ""}.`,
        ...(urgent ? ["**È una richiesta urgente:** il cliente cerca qualcuno disponibile subito."] : []),
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
  REQUEST_FORWARDED: (payload, ctx) => {
    const count = typeof payload.count === "number" ? payload.count : null;
    return {
      kind: "notification",
      subject: "Abbiamo inoltrato la tua richiesta ad altri professionisti",
      greeting: ctx.name,
      title: "Abbiamo inoltrato la tua richiesta",
      paragraphs: [
        `Il professionista che avevi scelto non ha risposto in tempo. Come avevi chiesto, abbiamo inviato la tua richiesta per **${job(ctx)}** ${count ? `ad altri ${count === 1 ? "un professionista simile" : `${count} professionisti simili`}` : "ad altri professionisti simili"} della tua zona.`,
        "Ti avviseremo appena arriva un preventivo.",
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
      `Il professionista che avevi scelto non ha risposto alla tua richiesta per **${job(ctx)}** e in zona, per ora, non ce ne sono altri disponibili a cui inoltrarla.`,
      "Puoi riprovare più avanti o cercare un altro professionista.",
    ],
    cta: { label: "Cerca un professionista", url: `${frontendUrl()}/cerca` },
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
  QUOTE_ACCEPTED: (_payload, ctx) => ({
    kind: "notification",
    subject: "Il cliente ha accettato il tuo preventivo",
    greeting: ctx.name,
    title: "Preventivo accettato!",
    paragraphs: [
      `Ottima notizia: il cliente ha accettato il tuo preventivo per **${job(ctx)}**.`,
      "Nella richiesta ora trovi i suoi contatti e l'indirizzo dell'intervento. L'appuntamento è già nella tua agenda.",
    ],
    details: proJobDetails(ctx),
    cta: proRequests("Apri il lavoro"),
  }),
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
          ...quotedNote(payload),
          "Il preventivo resta valido così com'è: il cliente può ancora accettarlo. Se vuoi rispondere, scrivigli dalla richiesta.",
        ],
        details: proJobDetails(ctx),
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
      details: proJobDetails({ ...ctx, when: null }, ctx.proposedWhen ? [{ label: "Proposta del cliente", value: formatAppointment(ctx.proposedWhen) }] : []),
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
        paragraphs: [`**${pro(ctx)}** ha aggiunto una nota al preventivo per **${job(ctx)}**, senza cambiare data e orario.`, ...quotedNote(payload)],
        details: jobDetails(ctx),
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
      details: jobDetails(ctx),
      cta: clientRequests(),
      after: ["Se non ti va bene puoi proporre un'altra data o scrivere al professionista in chat."],
    };
  },
  // Preventivo aggiornato (voci o note) senza cambio di data (docs/CHANGELOG.md §196).
  QUOTE_UPDATED: (payload, ctx) => {
    const what =
      payload.itemsChanged === true && payload.notesChanged === true
        ? "le voci e le note"
        : payload.itemsChanged === true
          ? "le voci"
          : payload.notesChanged === true
            ? "le note"
            : "il contenuto";
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
        ...quotedNote(payload),
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
  QUOTE_DATE_REJECTED: (_payload, ctx) => ({
    kind: "notification",
    subject: `${pro(ctx)} non è disponibile nella data proposta`,
    greeting: ctx.name,
    title: "Data non disponibile",
    paragraphs: [
      `**${pro(ctx)}** non è disponibile nella data che avevi proposto per **${job(ctx)}**.`,
      "Puoi accettare la data del preventivo, proporne un'altra o scrivergli in chat per trovare insieme il momento giusto.",
    ],
    cta: clientRequests(),
  }),

  // ── Lavori e appuntamenti ──────────────────────────────────────────────
  JOB_COMPLETED: (payload, ctx) => ({
    kind: "notification",
    subject: `${pro(ctx)} ha terminato il lavoro: com'è andata?`,
    greeting: ctx.name,
    title: "Com'è andata?",
    paragraphs: [
      `**${pro(ctx)}** ha segnato come terminato il lavoro per **${job(ctx)}**.`,
      "Lascia una recensione: bastano un voto e due righe. Aiuta gli altri clienti a scegliere e il professionista a farsi conoscere.",
    ],
    details: typeof payload.finalAmountEurCents === "number" ? [{ label: "Importo finale", value: formatEur(payload.finalAmountEurCents) }] : undefined,
    cta: { label: "Lascia una recensione", url: `${frontendUrl()}/le-mie-richieste` },
    after: [`Se qualcosa non è andato bene, puoi segnalarlo dalla richiesta entro ${BAD_WORK_REPORT_DAYS} giorni.`],
  }),
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
  // Recensione "doppio cieco": il voto non si anticipa mai, il professionista
  // lo vede solo dopo aver recensito anche lui il cliente.
  NEW_REVIEW: (payload, ctx) => ({
    kind: "notification",
    subject: "Hai ricevuto una nuova recensione",
    greeting: ctx.name,
    title: "Nuova recensione",
    paragraphs:
      payload.published === true
        ? [`Il cliente ha recensito il lavoro per **${job(ctx)}**. Avevi già recensito anche tu il cliente: le due recensioni ora sono visibili, e la sua compare sul tuo profilo.`]
        : payload.professionalCompleted === false
          ? [
              `Il cliente ha segnato come terminato il lavoro per **${job(ctx)}** e lo ha recensito.`,
              "Per leggere la recensione segna anche tu il lavoro come terminato e recensisci il cliente: le due diventano visibili insieme.",
            ]
          : [
              `Il cliente ha recensito il lavoro per **${job(ctx)}**.`,
              "Per leggerla lascia anche tu la tua recensione sul cliente: le due diventano visibili insieme. Se non lo fai entro 3 giorni, la sua diventa comunque pubblica sul tuo profilo.",
            ],
    cta:
      payload.published === true
        ? proRequests("Apri il lavoro")
        : proRequests(payload.professionalCompleted === false ? "Segna il lavoro come terminato" : "Recensisci il cliente"),
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
          : "Rispondigli in chat per trovare insieme una soluzione: il lavoro era pagato direttamente, quindi la questione resta tra voi due.",
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
      "Resta in custodia fino alla chiusura del lavoro e ti arriva insieme al saldo.",
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
      "Riceverai l'accredito quando il cliente conferma che è tutto a posto, o comunque entro 7 giorni.",
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
      "Teniamo i soldi in custodia: arrivano al professionista quando confermi che è tutto a posto, o comunque dopo 7 giorni.",
    ],
    details: typeof payload.amountEurCents === "number" ? [{ label: "Saldo da pagare", value: formatEur(payload.amountEurCents) }] : undefined,
    cta: { label: "Paga il saldo", url: `${frontendUrl()}/le-mie-richieste` },
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
  JOB_PAYOUT_SENT: (payload, ctx) => ({
    kind: "notification",
    subject: `Ti abbiamo accreditato ${formatEur(payload.amountEurCents) || "un pagamento"}`,
    greeting: ctx.name,
    title: "Pagamento accreditato",
    paragraphs: [
      `Abbiamo accreditato sul tuo conto Stripe il pagamento del lavoro per **${job(ctx)}**, già al netto della commissione e dei costi di pagamento.`,
    ],
    details: typeof payload.amountEurCents === "number" ? [{ label: "Accredito", value: formatEur(payload.amountEurCents) }] : undefined,
    cta: { label: "Vedi i pagamenti", url: `${frontendUrl()}/dashboard/fiscale` },
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
      `Segnalalo anche tu con l'importo finale${str(payload.deadline) ? ` **entro ${formatDeadline(str(payload.deadline))}**` : ""}: dopo quella data la recensione del cliente diventa visibile anche senza la tua.`,
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
      "Se il cliente ti ha recensito, la sua recensione diventa visibile sul tuo profilo. Puoi ancora segnare il lavoro come terminato con l'importo finale.",
    ],
    cta: proRequests("Apri il lavoro"),
  }),
  ADMIN_JOB_NOT_CLOSED: () => ({
    kind: "notification",
    tone: "urgent",
    subject: "Lavoro pagato online non chiuso dal professionista",
    title: "Lavoro non chiuso",
    paragraphs: [`Il cliente ha confermato un lavoro pagato online, ma il professionista non l'ha chiuso entro ${BAD_WORK_REPORT_DAYS} giorni: i soldi sono ancora in custodia.`],
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
  CONTENT_REPORT_DECISION: (payload, ctx) => {
    const targetType = payload.targetType as ContentReportTargetType | undefined;
    const what = targetType ? CONTENT_REPORT_TARGET_LABEL[targetType].toLowerCase() : "contenuto";
    const note = str(payload.note);
    const upheld = payload.status === "RESOLVED";
    return {
      kind: "account",
      subject: "Abbiamo esaminato la tua segnalazione",
      greeting: ctx.name,
      title: "Esito della tua segnalazione",
      paragraphs: [
        upheld
          ? `Abbiamo esaminato la tua segnalazione (${what}) e l'abbiamo accolta. Grazie per averci aiutato.`
          : `Abbiamo esaminato la tua segnalazione (${what}): non abbiamo trovato violazioni delle regole, quindi il contenuto resta com'è.`,
        ...(note ? [`**Motivazione:** ${note}`] : []),
        "La decisione è stata presa da una persona del nostro team, non da un sistema automatico.",
      ],
      cta: { label: "Vedi le tue segnalazioni", url: `${frontendUrl()}/segnalazioni` },
    };
  },
  CONTENT_REPORT_UPHELD: (payload, ctx) => {
    const targetType = payload.targetType as ContentReportTargetType | undefined;
    const what = targetType ? CONTENT_REPORT_TARGET_LABEL[targetType].toLowerCase() : "contenuto";
    const note = str(payload.note);
    const suspended = payload.action === "SUSPEND_USER";
    const site = frontendUrl();
    return {
      kind: "account",
      subject: "Decisione su una segnalazione che riguarda un tuo contenuto",
      greeting: ctx.name,
      title: "Decisione su un tuo contenuto",
      paragraphs: [
        `Abbiamo esaminato una segnalazione su un tuo contenuto (${what}).`,
        `**${moderationActionOwnerText((payload.action as ModerationAction | null) ?? null, targetType ?? "REVIEW")}**`,
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
  return builder ? builder(payload, ctx) : null;
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

