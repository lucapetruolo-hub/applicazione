"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DEFAULT_QUOTE_PAYMENT_OPTIONS,
  MAX_DEPOSIT_PERCENT,
  MAX_JOB_DAYS,
  formatAppointmentTimeRange,
  formatJobDays,
  jobDayCount,
  MIN_DEPOSIT_PERCENT,
  ONLINE_DEPOSIT_PERCENT,
  QUOTE_PAYMENT_OPTION_LABEL,
  jobPaymentChoices,
  paymentChoiceIsOnline,
  type JobPaymentChoice,
  buildWhatsAppLink,
  formatBookingAddress,
  formatEurCents,
  quotePriceTotals,
  scheduleChangeBetween,
  scheduleChangeOf,
  type CompleteBookingInput,
  type ProfessionalAvailableSlot,
  type ProfessionalBooking,
  type ProfessionalLead,
  REQUEST_TIMING_LABEL,
} from "@professionisti/shared";
import { Avatar, Badge, Icon, Surface, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useOnlinePayments } from "@/lib/onlinePayments";
import { formatCompetitors, leadDeadlines } from "@/lib/leadDeadline";
import { ClientProfileModal } from "@/components/ClientProfileModal";
import { TimelineModal } from "@/components/TimelineModal";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { MediaPreview } from "@/components/MediaPreview";
import { CompleteJobModal } from "@/components/CompleteJobModal";
import { JobIssuePanel } from "@/components/JobIssuePanel";
import { JobPaymentStatus } from "@/components/JobPaymentStatus";
import { CancelBookingModal } from "@/components/CancelBookingModal";
import { describeClosedReason, type RequestStage } from "@/lib/requestStage";
import { UnreadDot } from "@/components/UnreadDot";
import { useDismissableUnreadCount } from "@/lib/useDismissableUnreadCount";
import { CardActionsMenu, type CardAction } from "@/components/CardActionsMenu";
import { ArchivedRestoreBar, buildPersonalStateActions, RequestStateIndicators } from "@/components/RequestCardPersonalActions";
import { ReportContentModal } from "@/components/ReportContentModal";
import { ProfessionalProblemModal } from "@/components/ProfessionalProblemModal";
import { CardButton } from "@/components/CardButton";
import { ContactButton } from "@/components/ContactButton";
import { ScheduleChangeBox } from "@/components/ScheduleChangeBox";
import { DeadlinePill, MiniTimeline, QuoteItemDraft, STAGE_STYLE, ServiceBadge, StagePill, formatDateTime, formatSlotRange, slotKey, slotLabel, smallInputStyle } from "./requestHelpers";
import { ItalianDateInput } from "@/components/ItalianDateInput";

export function RequestCard({
  lead,
  stage,
  booking,
  token,
  availableSlots,
  myProfileId,
  defaultPaymentOffer,
  stripeVerified = true,
  identityVerificationNeeded = false,
  isOpen,
  onToggle,
  onChanged,
  unreadCount,
  autoOpenChat,
  onChatAutoOpenHandled,
  onMarkedRead,
}: {
  lead: ProfessionalLead;
  stage: RequestStage;
  /** Prenotazione collegata (se il preventivo è stato accettato), per intervento/importo finale. */
  booking: ProfessionalBooking | null;
  token: string;
  availableSlots: ProfessionalAvailableSlot[];
  myProfileId: string | null;
  /** Modi di pagamento proposti di serie nei nuovi preventivi (docs/CHANGELOG.md §239); null = valori di sistema. */
  defaultPaymentOffer?: { paymentOptions: JobPaymentChoice[]; depositPercent: number } | null;
  /** Verifica su Stripe completata: senza, l'acconto online non si può offrire (docs/CHANGELOG.md §241). */
  stripeVerified?: boolean;
  /** Documento e selfie ancora da fare: il primo preventivo è bloccato (docs/CHANGELOG.md §253). */
  identityVerificationNeeded?: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onChanged: () => void;
  /** Numero di aggiornamenti non letti per questa richiesta — pallino rosso accanto a "Contatta/Cronologia", stesso significato già in uso su /dashboard e /le-mie-richieste. */
  unreadCount?: number;
  /** True se questa card arriva da una notifica di nuovo messaggio in chat (richiesta esplicita dell'utente: "quando c'è un nuovo messaggio, porta direttamente nella chat aperta") — apre subito il TimelineModal invece di aspettare un click. */
  autoOpenChat?: boolean;
  /** Richiamata subito dopo aver aperto la chat per `autoOpenChat` — il genitore azzera il proprio stato "in sospeso" così un eventuale rimontaggio successivo (es. la card esce/rientra da un filtro) non la riapre da sola (bug reale corretto). */
  onChatAutoOpenHandled?: () => void;
  /** "Segna come letta" dal menu: azzera subito i pallini locali del genitore. */
  onMarkedRead: () => void;
}) {
  const gr = lead.guidedRequest;
  const isOnline = gr.serviceMode === "ONLINE";
  const router = useRouter();
  const s = STAGE_STYLE[stage];
  const priceRange = lead.quote ? quotePriceTotals(lead.quote.items) : null;
  const deadlines = leadDeadlines(lead);
  const competitorsLabel = formatCompetitors(lead.competitors);

  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [items, setItems] = useState<QuoteItemDraft[]>([{ name: "Manodopera", priceMin: "", priceMax: "" }]);
  const modeAvailableSlots = availableSlots.filter((sl) => (isOnline ? sl.onlineAvailable : sl.homeAvailable));
  const [selectedSlotKey, setSelectedSlotKey] = useState(modeAvailableSlots[0] ? slotKey(modeAvailableSlots[0]) : "");
  // Data/orario inserita a mano (richiesta esplicita dell'utente: "dai la
  // possibilità di inserire una data orario manualmente"), non solo come
  // ripiego quando l'agenda non ha fasce — sempre disponibile tramite il
  // link "Inserisci data e orario manualmente" anche quando la tendina è
  // popolata. Nessuna validazione contro AvailabilitySlot lato server per
  // questo campo (mai stata presente, `QuotesService.createOrUpdate`
  // accetta già qualunque data/ora — solo il form obbligava a scegliere da
  // una fascia reale): a differenza della contro-proposta
  // (`counterProposeDate`, che invece rivalida contro l'agenda reale via
  // `resolveFreeExactSlot`), qui resta volutamente libero.
  const [useManualDateTime, setUseManualDateTime] = useState(false);
  const [manualDate, setManualDate] = useState("");
  const [manualStartTime, setManualStartTime] = useState("");
  const [manualEndTime, setManualEndTime] = useState("");
  // Lavoro su più giorni (docs/CHANGELOG.md §310): stesso orario ogni giorno.
  const [jobDays, setJobDays] = useState(1);
  const [quoteNotes, setQuoteNotes] = useState("");
  // Modi di pagamento offerti al cliente e acconto online (docs/CHANGELOG.md §237).
  const onlinePaymentsActive = useOnlinePayments();
  // L'acconto online lo offre solo chi ha completato la verifica su Stripe (§241).
  const onlinePayments = onlinePaymentsActive && stripeVerified;
  const [paymentOptions, setPaymentOptions] = useState<JobPaymentChoice[]>(defaultPaymentOffer?.paymentOptions ?? DEFAULT_QUOTE_PAYMENT_OPTIONS);
  const [depositPercentDraft, setDepositPercentDraft] = useState(String(defaultPaymentOffer?.depositPercent ?? ONLINE_DEPOSIT_PERCENT));
  const [rememberPaymentOffer, setRememberPaymentOffer] = useState(false);
  // Il profilo arriva dopo la scheda: si applicano i valori di serie finché il modulo non è aperto.
  const [appliedPaymentOffer, setAppliedPaymentOffer] = useState(defaultPaymentOffer);
  if (defaultPaymentOffer !== appliedPaymentOffer) {
    setAppliedPaymentOffer(defaultPaymentOffer);
    if (defaultPaymentOffer && !showQuoteForm) {
      setPaymentOptions(defaultPaymentOffer.paymentOptions);
      setDepositPercentDraft(String(defaultPaymentOffer.depositPercent));
    }
  }
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isSubmittingQuote, setIsSubmittingQuote] = useState(false);
  // Anteprima "Dal 4 al 6 novembre, ogni giorno 08:00–17:00" di un lavoro su più giorni.
  const jobDaysPreview = (() => {
    if (jobDays < 2) return null;
    const slot = modeAvailableSlots.length > 0 && !useManualDateTime ? modeAvailableSlots.find((sl) => slotKey(sl) === selectedSlotKey) : null;
    const chosen = slot
      ? { date: slot.date, start: slot.startTime, end: slot.endTime }
      : manualDate && manualStartTime && manualEndTime > manualStartTime
        ? { date: manualDate, start: manualStartTime, end: manualEndTime }
        : null;
    if (!chosen) return "Indica l'orario di ogni giorno, con l'ora di fine.";
    const start = `${chosen.date}T${chosen.start}:00.000Z`;
    const firstEnd = `${chosen.date}T${chosen.end}:00.000Z`;
    const end = new Date(Date.parse(firstEnd) + (jobDays - 1) * 86_400_000).toISOString();
    const days = formatJobDays(start, end) ?? "";
    return `${days.charAt(0).toUpperCase()}${days.slice(1)}, ogni giorno ${formatAppointmentTimeRange(start, firstEnd)}.`;
  })();

  const [showCounterForm, setShowCounterForm] = useState(false);
  const [counterSlotKey, setCounterSlotKey] = useState(modeAvailableSlots[0] ? slotKey(modeAvailableSlots[0]) : "");
  // Data/orario libera anche qui (richiesta esplicita dell'utente: "ogni
  // volta che il professionista clicca su proponi un'altra data gli si
  // deve dare la possibilità di inserire un gruppo data orario che non è
  // presente in agenda") — stesso pattern del primo invio preventivo, ma
  // qui il backend (counterProposeDate) richiede il flag esplicito
  // `isManual` per saltare la validazione contro l'agenda reale, perché
  // altrimenti questo endpoint rivalida sempre via resolveFreeExactSlot.
  const [useManualCounterDateTime, setUseManualCounterDateTime] = useState(false);
  const [manualCounterDate, setManualCounterDate] = useState("");
  const [manualCounterStartTime, setManualCounterStartTime] = useState("");
  const [manualCounterEndTime, setManualCounterEndTime] = useState("");
  const [counterNote, setCounterNote] = useState("");
  const [counterError, setCounterError] = useState<string | null>(null);
  const [isCountering, setIsCountering] = useState(false);
  const [isConfirmingDate, setIsConfirmingDate] = useState(false);
  const [isRejectingDate, setIsRejectingDate] = useState(false);

  const [confirmingDecline, setConfirmingDecline] = useState(false);
  const [declineNoteDraft, setDeclineNoteDraft] = useState("");
  const [isDeclining, setIsDeclining] = useState(false);

  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Stessi popup già in uso in /dashboard (LeadCard/AcceptedJobCard) per
  // "Lavoro terminato"/"Annulla intervento" —
  // richiesta esplicita dell'utente di implementarli qui identici.
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  const [showClientProfile, setShowClientProfile] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showProblemModal, setShowProblemModal] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);
  // "Nuovo": aggiornamenti non letti arrivati in questa pagina, o scheda
  // segnata a mano "da leggere" dal menu (docs/CHANGELOG.md §130).
  const isNew = Boolean(lead.myState.markedUnreadAt) || (unreadCount ?? 0) > 0;
  const [showTimeline, setShowTimeline] = useState(false);
  const [openPhotoIndex, setOpenPhotoIndex] = useState<number | null>(null);
  // Il pallino "Contatta/Cronologia" deve sparire non appena si apre la
  // conversazione (richiesta esplicita dell'utente) — vedi
  // useDismissableUnreadCount per il motivo del calcolo differenziale.
  // Un solo stato per l'intera card: qualunque bottone apra la cronologia
  // (Chat/Contatta/Cronologia, in stadi diversi) azzera lo stesso pallino.
  const [effectiveUnreadCount, dismissUnread] = useDismissableUnreadCount(unreadCount);
  // Apre subito la chat quando arriva da un deep link di notifica
  // (richiesta esplicita dell'utente: "quando c'è un nuovo messaggio, porta
  // direttamente nella chat aperta") — mirror lato professionista dello
  // stesso comportamento già introdotto in /le-mie-richieste, qui più
  // semplice: una RequestCard è già scoped a un solo thread (il
  // professionista stesso), nessuna disambiguazione tra più destinatari.
  const autoOpenedChatRef = useRef(false);
  useEffect(() => {
    if (autoOpenChat && !autoOpenedChatRef.current) {
      autoOpenedChatRef.current = true;
      setShowTimeline(true);
      // Il guard "già aperta" vive ora nel genitore (pendingChatOpenLeadId,
      // bug reale corretto): questo ref locale resta solo per non aprire due
      // volte se questo stesso effetto scatta più volte prima che il
      // genitore riesca ad azzerare la prop — la vera fonte di verità è il
      // genitore, avvisato subito qui.
      onChatAutoOpenHandled?.();
    }
  }, [autoOpenChat, onChatAutoOpenHandled]);
  function openTimeline() {
    setShowTimeline(true);
    dismissUnread();
  }

  const [noteDraft, setNoteDraft] = useState(lead.professionalNote ?? "");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const noteChanged = noteDraft !== (lead.professionalNote ?? "");
  // La textarea "Note personali" si espandeva solo trascinando l'angolo
  // (CSS resize:vertical) — su mobile quel trascinamento non è
  // disponibile (nessun browser touch lo supporta), quindi il campo
  // restava bloccato a 2 righe. Corretto con un auto-grow via JS
  // (altezza = scrollHeight ad ogni digitazione/cambio nota), identico
  // su desktop e mobile — richiesta esplicita dell'utente.
  const noteTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const autoGrowNote = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(() => {
    autoGrowNote(noteTextareaRef.current);
  }, [noteDraft]);

  const clientName = gr.clientAccountDeleted ? "Account eliminato" : (gr.clientName ?? "Cliente");
  // Telefono/email/indirizzo NON arrivano più su `gr` (richiesta esplicita
  // dell'utente: visibili solo ad accettazione del lavoro) — quando esiste
  // una Booking (preventivo accettato) vengono letti da lì, dove sono
  // sempre stati disponibili (recipientPhone/street/ecc.), mai prima.
  const revealedPhone = booking ? (booking.recipientPhone ?? booking.clientPhone) : null;
  const revealedEmail = booking ? booking.clientEmail : null;
  const revealedAddress = booking ? (formatBookingAddress(booking) ?? (booking.address ? `${booking.address}, ${gr.city}` : null)) : null;
  const whatsAppLink = buildWhatsAppLink(revealedPhone);
  const quoteWithdrawn = lead.quote?.status === "WITHDRAWN";
  const canResendQuote = lead.quote?.status === "REJECTED" && lead.quote.canResend;
  // "Elimina" su ogni richiesta scaduta o chiusa (docs/CHANGELOG.md §143):
  // la nasconde solo al professionista, resta visibile agli admin.
  const canDelete = stage === "scaduta" || stage === "chiusa";

  // Data/ora dell'intervento visibile già nell'anteprima non espansa
  // (richiesta esplicita dell'utente: "deve essere visualizzata già la
  // data e ora dell'intervento o la richiesta di quella specifica
  // data/intervento cosi che sia subito visibile") — priorità: la
  // prenotazione reale se esiste, altrimenti la data proposta nel
  // preventivo inviato, altrimenti la fascia richiesta dal cliente fin
  // dall'invio (se nata da una fascia generica dell'agenda pubblica,
  // stesso campo già mostrato in /le-mie-richieste).
  const collapsedDateTime = booking?.scheduledAt
    ? { label: "Intervento", text: formatSlotRange(booking.scheduledAt, booking.scheduledEndAt) }
    : lead.quote?.estimatedStartDate
      ? { label: "Preventivo per", text: formatSlotRange(lead.quote.estimatedStartDate, lead.quote.estimatedEndDate) }
      : gr.preferredDate && gr.preferredTimeSlot
        ? {
            label: "Richiesta per",
            text: `${new Date(`${gr.preferredDate}T00:00:00Z`).toLocaleDateString("it-IT", {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: "UTC",
            })} · ${gr.preferredTimeSlot.replace("-", "–")}`,
          }
        : null;

  function updateItem(index: number, field: "name" | "priceMin" | "priceMax", value: string) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }
  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSendQuote() {
    setQuoteError(null);
    const cleaned = items.map((it) => ({ ...it, name: it.name.trim() })).filter((it) => it.name.length > 0);
    if (cleaned.length === 0) {
      setQuoteError("Aggiungi almeno una voce al preventivo.");
      return;
    }
    const parsed: { name: string; priceMinEurCents?: number; priceMaxEurCents?: number }[] = [];
    for (const item of cleaned) {
      const priceMinEurCents = item.priceMin.trim() ? Math.round(Number(item.priceMin.replace(",", ".")) * 100) : undefined;
      const priceMaxEurCents = item.priceMax.trim() ? Math.round(Number(item.priceMax.replace(",", ".")) * 100) : undefined;
      if (item.priceMin.trim() && !Number.isFinite(priceMinEurCents)) return setQuoteError(`Prezzo minimo non valido per "${item.name}".`);
      if (item.priceMax.trim() && !Number.isFinite(priceMaxEurCents)) return setQuoteError(`Prezzo massimo non valido per "${item.name}".`);
      if (priceMinEurCents === undefined && priceMaxEurCents === undefined) return setQuoteError(`Indica almeno un prezzo per "${item.name}".`);
      if (priceMinEurCents !== undefined && priceMaxEurCents !== undefined && priceMaxEurCents < priceMinEurCents)
        return setQuoteError(`Il prezzo massimo di "${item.name}" dev'essere maggiore o uguale al minimo.`);
      parsed.push({ name: item.name, priceMinEurCents, priceMaxEurCents });
    }

    let estimatedStartDate: string;
    let estimatedEndDate: string | undefined;
    if (modeAvailableSlots.length > 0 && !useManualDateTime) {
      const slot = modeAvailableSlots.find((sl) => slotKey(sl) === selectedSlotKey);
      if (!slot) return setQuoteError("Scegli un orario dalla tua agenda.");
      estimatedStartDate = new Date(`${slot.date}T${slot.startTime}:00.000Z`).toISOString();
      estimatedEndDate = new Date(`${slot.date}T${slot.endTime}:00.000Z`).toISOString();
    } else {
      if (!manualDate) return setQuoteError("Indica una data di inizio stimata.");
      if (manualEndTime && !manualStartTime) return setQuoteError("Indica anche l'ora di inizio.");
      if (manualStartTime && manualEndTime && manualEndTime <= manualStartTime) return setQuoteError("L'ora di fine deve essere dopo l'ora di inizio.");
      if (manualStartTime) {
        estimatedStartDate = new Date(`${manualDate}T${manualStartTime}:00.000Z`).toISOString();
        estimatedEndDate = manualEndTime ? new Date(`${manualDate}T${manualEndTime}:00.000Z`).toISOString() : undefined;
      } else {
        estimatedStartDate = new Date(manualDate).toISOString();
      }
    }

    // Lavoro su più giorni (§310): la fine cade nell'ultimo giorno, alla stessa ora del primo.
    if (jobDays > 1) {
      if (!estimatedEndDate) return setQuoteError("Per un lavoro su più giorni indica anche l'ora di fine.");
      estimatedEndDate = new Date(new Date(estimatedEndDate).getTime() + (jobDays - 1) * 86_400_000).toISOString();
    }

    // Senza pagamenti online attivi resta solo il diretto (le altre caselle non si vedono).
    const offered = onlinePayments ? paymentOptions : (["DIRECT"] as JobPaymentChoice[]);
    if (offered.length === 0) return setQuoteError("Scegli almeno un modo di pagamento.");
    const depositPercent = Number(depositPercentDraft.trim());
    if (offered.some(paymentChoiceIsOnline) && (!Number.isInteger(depositPercent) || depositPercent < MIN_DEPOSIT_PERCENT || depositPercent > MAX_DEPOSIT_PERCENT)) {
      return setQuoteError(`L'acconto online va da ${MIN_DEPOSIT_PERCENT} a ${MAX_DEPOSIT_PERCENT}%, senza decimali.`);
    }

    setIsSubmittingQuote(true);
    try {
      await apiClient.createQuote(token, {
        requestId: gr.id,
        items: parsed,
        estimatedStartDate,
        estimatedEndDate,
        notes: quoteNotes.trim() || undefined,
        paymentOptions: offered,
        ...(offered.some(paymentChoiceIsOnline) ? { depositPercent } : {}),
        ...(rememberPaymentOffer ? { rememberPaymentOffer: true } : {}),
      });
      setRememberPaymentOffer(false);
      setShowQuoteForm(false);
      onChanged();
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmittingQuote(false);
    }
  }

  async function handleConfirmDate() {
    if (!lead.quote) return;
    setIsConfirmingDate(true);
    try {
      await apiClient.confirmProposedQuoteDate(token, lead.quote.id);
      onChanged();
    } finally {
      setIsConfirmingDate(false);
    }
  }
  async function handleRejectDate() {
    if (!lead.quote) return;
    setIsRejectingDate(true);
    try {
      await apiClient.rejectProposedQuoteDate(token, lead.quote.id);
      onChanged();
    } finally {
      setIsRejectingDate(false);
    }
  }
  async function handleCounterPropose() {
    if (!lead.quote) return;
    let payload: { date: string; startTime: string; endTime: string; isManual?: boolean };
    if (modeAvailableSlots.length > 0 && !useManualCounterDateTime) {
      const slot = modeAvailableSlots.find((sl) => slotKey(sl) === counterSlotKey);
      if (!slot) return setCounterError("Scegli un orario dalla tua agenda.");
      payload = { date: slot.date, startTime: slot.startTime, endTime: slot.endTime };
    } else {
      if (!manualCounterDate) return setCounterError("Indica una data.");
      if (!manualCounterStartTime || !manualCounterEndTime) return setCounterError("Indica sia l'ora di inizio sia l'ora di fine.");
      if (manualCounterEndTime <= manualCounterStartTime) return setCounterError("L'ora di fine deve essere dopo l'ora di inizio.");
      payload = { date: manualCounterDate, startTime: manualCounterStartTime, endTime: manualCounterEndTime, isManual: true };
    }
    setCounterError(null);
    setIsCountering(true);
    try {
      await apiClient.counterProposeQuoteDate(token, lead.quote.id, { ...payload, note: counterNote.trim() || undefined });
      setShowCounterForm(false);
      onChanged();
    } catch (err) {
      setCounterError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsCountering(false);
    }
  }

  async function handleDecline() {
    setIsDeclining(true);
    try {
      await apiClient.declineLead(token, lead.id, declineNoteDraft.trim() || undefined);
      onChanged();
    } finally {
      setIsDeclining(false);
      setConfirmingDecline(false);
    }
  }

  async function handleWithdrawQuote() {
    if (!lead.quote) return;
    setIsWithdrawing(true);
    try {
      await apiClient.withdrawQuote(token, lead.quote.id);
      onChanged();
    } finally {
      setIsWithdrawing(false);
      setConfirmingWithdraw(false);
    }
  }

  async function handleComplete(input: CompleteBookingInput) {
    if (!booking) return;
    await apiClient.completeBooking(token, booking.id, input);
    setShowCompleteModal(false);
    onChanged();
  }

  async function handleCancelBooking(note: string | undefined) {
    if (!booking) return;
    await apiClient.cancelBookingByProfessional(token, booking.id, { note });
    setShowCancelModal(false);
    onChanged();
  }

  // Riapertura di una prenotazione annullata (richiesta esplicita
  // dell'utente: "una volta annullata dai la possibilità di riaprirla") —
  // stesso endpoint condiviso già in uso in /dashboard e /le-mie-richieste.
  const [isReopening, setIsReopening] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);
  async function handleReopenBooking() {
    if (!booking) return;
    setReopenError(null);
    setIsReopening(true);
    try {
      await apiClient.reopenBooking(token, booking.id);
      onChanged();
    } catch (err) {
      setReopenError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsReopening(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await apiClient.deleteLead(token, lead.id);
      onChanged();
    } finally {
      setIsDeleting(false);
      setConfirmingDelete(false);
    }
  }

  // Precompila data e orario di un modulo con l'ultima data proposta
  // (richiesta esplicita dell'utente, docs/CHANGELOG.md §223): la fascia
  // dell'agenda se coincide, altrimenti i campi manuali già riempiti.
  function presetSchedule(
    startIso: string,
    endIso: string | null,
    set: { slot: (key: string) => void; manual: (on: boolean) => void; date: (v: string) => void; start: (v: string) => void; end: (v: string) => void },
  ) {
    const date = startIso.slice(0, 10);
    const start = startIso.slice(11, 16);
    const end = endIso ? endIso.slice(11, 16) : "";
    const matching = modeAvailableSlots.find((sl) => sl.date === date && sl.startTime === start && (!end || sl.endTime === end));
    if (matching) {
      set.slot(slotKey(matching));
      set.manual(false);
    } else {
      set.manual(true);
      set.date(date);
      set.start(start);
      set.end(end);
    }
  }

  function startEditingQuote() {
    if (!lead.quote) return;
    presetSchedule(lead.quote.estimatedStartDate, lead.quote.estimatedEndDate, {
      slot: setSelectedSlotKey,
      manual: setUseManualDateTime,
      date: setManualDate,
      start: setManualStartTime,
      end: setManualEndTime,
    });
    setItems(lead.quote.items.map((it) => ({ name: it.name, priceMin: it.priceMinEurCents != null ? (it.priceMinEurCents / 100).toString() : "", priceMax: it.priceMaxEurCents != null ? (it.priceMaxEurCents / 100).toString() : "" })));
    setQuoteNotes(lead.quote.notes ?? "");
    setPaymentOptions(lead.quote.paymentOptions);
    setDepositPercentDraft(String(lead.quote.depositPercent));
    setShowQuoteForm(true);
  }

  // Le azioni che mostrano un form inline (preventivo, rifiuto con nota)
  // vivono nella parte espansa della scheda: dal menu la si apre prima.
  function ensureOpen() {
    if (!isOpen) onToggle();
  }

  // Cosa cambia la proposta del cliente rispetto al preventivo: `null` se
  // data e orario restano uguali e ha solo aggiunto una nota
  // (docs/CHANGELOG.md §196).
  const proposalChange = lead.quote?.clientProposedDate
    ? scheduleChangeBetween(
        { start: lead.quote.estimatedStartDate, end: lead.quote.estimatedEndDate },
        { start: lead.quote.clientProposedDate, end: lead.quote.clientProposedEndDate },
      )
    : null;

  // Azioni del menu hamburger, filtrate per stadio: le stesse già
  // raggiungibili dai bottoni della scheda espansa, qui a portata di un
  // click anche a scheda chiusa.
  const menuActions: CardAction[] = [];
  if (myProfileId) menuActions.push({ icon: "message-circle", text: "Contatta/Cronologia", onPress: openTimeline });
  if (!gr.clientAccountDeleted) menuActions.push({ icon: "user-round", text: "Profilo del cliente", onPress: () => setShowClientProfile(true) });
  if (stage === "da_quotare") {
    menuActions.push({
      icon: "send",
      text: "Invia preventivo",
      onPress: () => {
        ensureOpen();
        setShowQuoteForm(true);
      },
    });
    menuActions.push({
      icon: "x",
      text: "Rifiuta richiesta",
      tone: "danger",
      onPress: () => {
        ensureOpen();
        setConfirmingDecline(true);
      },
    });
  }
  if (stage === "in_attesa" && lead.quote) {
    menuActions.push({
      icon: "pencil",
      text: "Modifica preventivo",
      onPress: () => {
        ensureOpen();
        startEditingQuote();
      },
    });
    menuActions.push({
      icon: "rotate-ccw",
      text: "Ritira preventivo",
      tone: "danger",
      onPress: handleWithdrawQuote,
      confirm: { question: "Ritirare questo preventivo? Il cliente non potrà più accettarlo.", confirmLabel: "Conferma", busyLabel: "Ritiro..." },
    });
  }
  if (canResendQuote) {
    menuActions.push({
      icon: "send",
      text: "Invia un nuovo preventivo",
      onPress: () => {
        ensureOpen();
        startEditingQuote();
      },
    });
  }
  if (stage === "modifica_richiesta" && lead.quote?.clientProposedDate) {
    menuActions.push({ icon: "check", text: proposalChange ? "Accetta nuova data" : "Conferma appuntamento", onPress: handleConfirmDate });
  }
  if (booking?.status === "CONFIRMED") {
    menuActions.push({ icon: "check", text: "Lavoro terminato", onPress: () => setShowCompleteModal(true) });
    menuActions.push({ icon: "x", text: "Annulla intervento", tone: "danger", onPress: () => setShowCancelModal(true) });
  }
  // Regola simmetrica (§197): ognuno riapre solo ciò che ha annullato lui.
  if (booking?.status === "CANCELED" && booking.canceledBy === "PROFESSIONAL") {
    menuActions.push({ icon: "rotate-ccw", text: "Riapri intervento", onPress: handleReopenBooking });
  }
  // Il professionista segnala un problema sull'intervento (§197): cliente
  // assente, mancato pagamento, ecc. Arriva al nostro team e in chat.
  if (booking && booking.status !== "PENDING") {
    menuActions.push({ icon: "flag", text: "Qualcosa è andato male", tone: "danger", onPress: () => setShowProblemModal(true) });
  }
  if (booking) {
    menuActions.push({ icon: "calendar", text: "Vedi in agenda", onPress: () => router.push(`/dashboard/agenda?booking=${booking.id}`) });
  }
  if (canDelete) {
    menuActions.push({
      icon: "trash-2",
      text: quoteWithdrawn ? "Elimina preventivo ritirato" : "Elimina richiesta",
      tone: "danger",
      onPress: handleDelete,
      confirm: { question: "Eliminare questa richiesta dalla tua lista?", confirmLabel: "Sì, elimina", busyLabel: "Eliminazione..." },
    });
  }
  menuActions.push(
    ...buildPersonalStateActions({
      token,
      guidedRequestId: gr.id,
      myState: lead.myState,
      isNew,
      onMarkedRead,
      onChanged,
      onError: setMenuError,
    }),
  );
  if (!gr.clientAccountDeleted) {
    menuActions.push({ icon: "flag", text: "Segnala richiesta", tone: "danger", onPress: () => setShowReportModal(true) });
  }

  async function handleSaveNote() {
    setIsSavingNote(true);
    try {
      await apiClient.updateLeadNote(token, lead.id, noteDraft);
    } finally {
      setIsSavingNote(false);
    }
  }

  return (
    <Surface borderLeftWidth={4} borderLeftColor={s.border} gap="$0" padding={0} overflow="hidden">
      <YStack padding="$4" gap="$2" cursor="pointer" onPress={onToggle} accessibilityRole="button">
        <XStack justifyContent="space-between" alignItems="flex-start" gap="$2" flexWrap="wrap">
          <XStack gap="$2" flexWrap="wrap" flexShrink={1} minWidth={0}>
            {/* Le richieste urgenti (costo lead maggiore, scadenza breve —
                vedi guided-requests.service) erano indistinguibili dalle
                normali: il badge rosso è la variante semantica prevista
                dal design system proprio per questo flusso. */}
            {gr.isUrgent ? <Badge variant="urgente">Urgente</Badge> : null}
            {/* Ordine invertito su richiesta esplicita dell'utente: lo stato
                della richiesta (StagePill) precede il badge di modalità
                (ServiceBadge, "A domicilio"/"Consulenza online"). */}
            <StagePill stage={stage} label={stage === "chiusa" && gr.withdrawnByClient ? "Ritirata dal cliente" : undefined} />
            <ServiceBadge online={isOnline} />
            {/* Quando serve, scelto dal cliente (§344): "Oggi" è già il badge Urgente. */}
            {gr.timing === "WEEK" || gr.timing === "CALM" ? (
              <Text fontSize={13} fontWeight="600" color={brand.grafite70} alignSelf="center">
                {REQUEST_TIMING_LABEL[gr.timing]}
              </Text>
            ) : null}
            {stage === "da_quotare" ? deadlines.map((deadline) => <DeadlinePill key={deadline.label} deadline={deadline} />) : null}
            {stage === "da_quotare" && competitorsLabel ? (
              <Text fontSize={13} fontWeight="600" color={brand.grafite70}>
                {competitorsLabel}
              </Text>
            ) : null}
          </XStack>
          <YStack alignItems="flex-end">
            <Text fontSize={16} color={brand.grafite70}>
              Ricevuta {formatDateTime(lead.createdAt)}
            </Text>
            {isNew ? <Badge variant="nuovo">Nuovo</Badge> : null}
            {/* Per una richiesta completata, l'importo finale (esatto, da
                "Lavoro terminato") sostituisce il range preventivato: è
                l'informazione rilevante a lavoro concluso — richiesta
                esplicita dell'utente. */}
            {stage === "completata" && booking?.finalAmountEurCents != null ? (
              <Text fontFamily="$body" fontWeight="800" fontSize={18} color={brand.grafite}>
                {formatEurCents(booking.finalAmountEurCents)}
              </Text>
            ) : priceRange && (priceRange.totalMinEurCents > 0 || priceRange.totalMaxEurCents > 0) ? (
              <Text fontFamily="$body" fontWeight="800" fontSize={18} color={brand.grafite}>
                {formatEurCents(priceRange.totalMinEurCents)}
                {priceRange.totalMaxEurCents !== priceRange.totalMinEurCents ? ` – ${formatEurCents(priceRange.totalMaxEurCents)}` : ""}
              </Text>
            ) : null}
          </YStack>
        </XStack>

        {/* Menu hamburger sulla riga del nome, non su quella dei badge
            (richiesta esplicita dell'utente: Urgente + stadio + modalità +
            scadenza vanno a capo e il pulsante finiva in conflitto con
            loro). */}
        <XStack alignItems="flex-start" justifyContent="space-between" gap="$2">
          {/* Foto del cliente accanto al nome (richiesta esplicita
              dell'utente: riconoscere a colpo d'occhio di chi si tratta),
              iniziali se manca; niente per un account eliminato. */}
          <XStack flex={1} minWidth={0} alignItems="center" gap="$2">
            {gr.clientAccountDeleted ? null : <Avatar name={clientName} imageUrl={gr.clientImageUrl} size={40} />}
            <Text flex={1} minWidth={0} fontFamily="$heading" fontWeight="800" fontSize={26} color={brand.grafite}>
              {clientName}
            </Text>
          </XStack>
          <CardActionsMenu accessibilityLabel="Azioni sulla richiesta" actions={menuActions} />
        </XStack>
        {gr.clientEmailVerified && !gr.clientAccountDeleted ? (
          <XStack alignItems="center" gap={4}>
            <Icon name="check" size={13} color={brand.verificato} strokeWidth={2.5} />
            <Text fontSize={13} fontWeight="700" color={brand.verificato}>
              Email confermata
            </Text>
          </XStack>
        ) : null}
        <RequestStateIndicators myState={lead.myState} />
        {menuError ? (
          <Text color={brand.urgenza} fontSize={16}>
            {menuError}
          </Text>
        ) : null}
        {/* Data/ora dell'intervento spostata subito sotto il nome
            (richiesta esplicita dell'utente, con screenshot annotato) —
            prima stava in fondo, appena sopra la freccetta di
            apertura/chiusura scheda. */}
        {collapsedDateTime ? (
          <XStack alignItems="center" gap="$1">
            <Icon name="calendar" size={14} color={brand.grafite70} />
            <Text fontSize={16} fontWeight="700" color={brand.grafite}>
              {collapsedDateTime.label}: {collapsedDateTime.text}
            </Text>
          </XStack>
        ) : null}
        <XStack alignItems="center" gap="$1">
          <Icon name="wrench" size={15} color={brand.grafite70} />
          <Text fontSize={16} color={brand.grafite70}>
            {gr.categoryLabel} · {gr.city}
          </Text>
        </XStack>
        <Text fontSize={16} color={brand.grafite} lineHeight={22}>
          {gr.description}
        </Text>
        <XStack alignItems="center" gap="$1">
          <Icon name="map-pin" size={14} color={brand.grafite70} />
          <Text fontSize={16} color={brand.grafite70}>
            {isOnline ? `Zona: ${gr.city}` : (revealedAddress ?? gr.city)}
          </Text>
        </XStack>

        <XStack justifyContent="center" paddingTop="$1">
          <Icon name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={brand.grafite70} />
        </XStack>
      </YStack>
      <ArchivedRestoreBar token={token} guidedRequestId={gr.id} myState={lead.myState} onChanged={onChanged} />

      {isOpen ? (
        <YStack paddingHorizontal="$4" paddingBottom="$4" gap="$4" borderTopWidth={1} borderTopColor={brand.filetto}>
          {stage === "modifica_richiesta" && lead.quote?.clientProposedDate ? (
            proposalChange ? (
              <ScheduleChangeBox
                marginTop="$3"
                title={`Il cliente ha richiesto una modifica ${scheduleChangeOf(proposalChange)}`}
                beforeLabel="Data originale"
                beforeText={formatSlotRange(lead.quote.estimatedStartDate, lead.quote.estimatedEndDate)}
                afterLabel="Nuova data richiesta"
                afterText={formatSlotRange(lead.quote.clientProposedDate, lead.quote.clientProposedEndDate)}
                note={lead.quote.clientProposedNote}
              />
            ) : (
              // Stessa data e stesso orario: il cliente ha solo aggiunto una
              // nota, niente "prima → ora" (docs/CHANGELOG.md §196).
              <ScheduleChangeBox
                marginTop="$3"
                title="Il cliente ha aggiunto una nota (data e orario invariati)"
                afterLabel="Appuntamento"
                afterText={formatSlotRange(lead.quote.clientProposedDate, lead.quote.clientProposedEndDate)}
                note={lead.quote.clientProposedNote}
              />
            )
          ) : lead.quote?.status === "SENT" && lead.quote.clientNote ? (
            // Nota del cliente senza cambio di data: il preventivo resta
            // accettabile, qui la si legge e basta (docs/CHANGELOG.md §196).
            <ScheduleChangeBox
              marginTop="$3"
              title="Il cliente ha aggiunto una nota (data e orario invariati)"
              afterLabel="Appuntamento"
              afterText={formatSlotRange(lead.quote.estimatedStartDate, lead.quote.estimatedEndDate)}
              note={lead.quote.clientNote}
            />
          ) : null}

          <XStack flexWrap="wrap" gap="$4" paddingTop="$3">
            {/* Sezione 1 — Dettagli cliente. Sfondo colorato (richiesta
                esplicita dell'utente: "fai visualizzare meglio la sezione
                dettagli cliente magari colorando lo sfondo") — stesso
                trattamento già in uso per "Sezione 3 — Preventivo" più
                sotto in questo file, per coerenza visiva tra le due
                sezioni "a riquadro" della card. */}
            <YStack
              flex={1}
              minWidth={260}
              gap="$2"
              padding="$3"
              borderRadius={radiusDoc}
              backgroundColor={brand.gesso}
              borderWidth={1}
              borderColor={brand.filetto}
            >
              <Text fontSize={13} fontWeight="800" color={brand.grafite70} textTransform="uppercase">
                Dettagli cliente
              </Text>
              {gr.clientAccountDeleted ? (
                <Text fontSize={16} color={brand.grafite70}>
                  L&apos;account di questo cliente è stato eliminato.
                </Text>
              ) : (
                <>
                  {/* Reso chiaramente cliccabile (richiesta esplicita
                      dell'utente: "il cliente deve avere ben visibile che
                      è cliccabile il nome del cliente per visualizzare le
                      informazioni come il rating") — prima era testo
                      grigio piatto, indistinguibile da un'etichetta
                      qualunque. Colore/sottolineatura da link + icona,
                      stesso principio "affordance visiva" già seguito
                      altrove nel sito per un controllo cliccabile senza
                      un bordo/pillola proprio. */}
                  <XStack
                    alignItems="center"
                    gap={4}
                    cursor="pointer"
                    alignSelf="flex-start"
                    accessibilityRole="button"
                    accessibilityLabel={`Vedi il profilo di ${clientName}`}
                    onPress={() => setShowClientProfile(true)}
                  >
                    <Text fontSize={16} fontWeight="700" color={brand.cianografiaScuro} textDecorationLine="underline">
                      {clientName}
                    </Text>
                    <Icon name="chevron-right" size={13} color={brand.cianografiaScuro} strokeWidth={2} />
                  </XStack>
                  {/* Data/ora dell'intervento spostata subito sotto il nome
                      cliccabile (richiesta esplicita dell'utente, con
                      screenshot annotato) — prima stava in fondo alla
                      scheda, appena sopra il tasto Chat. */}
                  {booking?.scheduledAt && (stage === "accettata" || stage === "completata" || stage === "annullata") ? (
                    <Text fontSize={13} fontWeight="700" color={brand.grafite}>
                      Intervento: {formatSlotRange(booking.scheduledAt, booking.scheduledEndAt)}
                    </Text>
                  ) : null}
                  {/* Nome e cognome del destinatario indicati sulla
                      richiesta (chi riceverà il professionista sul
                      lavoro, non necessariamente l'intestatario
                      dell'account — CLAUDE.md §16). Ordine della sezione
                      (nome → indirizzo → numero → e-mail, chat spostata
                      in fondo) e rimozione della dicitura "Riceverà il
                      professionista" (resta solo il nome): entrambe
                      richieste esplicite dell'utente. */}
                  {booking?.recipientName || booking?.recipientSurname ? (
                    <Text fontSize={16} fontWeight="700" color={brand.grafite}>
                      {[booking.recipientName, booking.recipientSurname].filter(Boolean).join(" ")}
                    </Text>
                  ) : null}
                  {/* Indirizzo cliccabile (link Google Maps, stesso
                      principio già in uso per tel:/mailto:/wa.me —
                      nessuna API a pagamento, solo un URL di apertura) —
                      spostato subito sotto il nome, richiesta esplicita
                      dell'utente. */}
                  {isOnline ? (
                    <Text fontSize={13} color={brand.grafite70}>
                      Zona: {gr.city} (indirizzo nascosto)
                    </Text>
                  ) : revealedAddress ? (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(revealedAddress)}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ textDecoration: "none" }}
                    >
                      <Text fontSize={13} fontWeight="600" color={brand.cianografiaScuro} textDecorationLine="underline">
                        {revealedAddress}
                      </Text>
                    </a>
                  ) : (
                    <Text fontSize={13} color={brand.grafite70}>
                      {gr.city}
                    </Text>
                  )}
                  {/* Numero cliccabile (tel:) con i tasti WhatsApp/Chiama
                      di fianco, non più in una riga separata più sotto —
                      richiesta esplicita dell'utente. */}
                  {revealedPhone ? (
                    <XStack alignItems="center" gap="$2" flexWrap="wrap">
                      <a href={`tel:${revealedPhone}`} style={{ textDecoration: "none" }}>
                        <Text fontSize={16} fontWeight="600" color={brand.cianografiaScuro} textDecorationLine="underline">
                          {revealedPhone}
                        </Text>
                      </a>
                      {whatsAppLink ? (
                        <a href={whatsAppLink} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                          <XStack paddingHorizontal="$2.5" paddingVertical={5} borderRadius={10} backgroundColor="#25d366">
                            <Text fontSize={13} fontWeight="700" color="white">
                              WhatsApp
                            </Text>
                          </XStack>
                        </a>
                      ) : null}
                      <a href={`tel:${revealedPhone}`} style={{ textDecoration: "none" }}>
                        <XStack paddingHorizontal="$2.5" paddingVertical={5} borderRadius={10} backgroundColor={brand.cianografia}>
                          <Text fontSize={13} fontWeight="700" color="white">
                            Chiama
                          </Text>
                        </XStack>
                      </a>
                    </XStack>
                  ) : null}
                  {revealedEmail ? (
                    <a href={`mailto:${revealedEmail}`} style={{ textDecoration: "none" }}>
                      <Text fontSize={16} fontWeight="600" color={brand.cianografiaScuro} textDecorationLine="underline">
                        {revealedEmail}
                      </Text>
                    </a>
                  ) : null}
                  {!booking ? (
                    <Text fontSize={13} color={brand.grafite70} fontStyle="italic">
                      Telefono, email e indirizzo saranno visibili qui ad accettazione del preventivo.
                    </Text>
                  ) : null}
                  {/* Tasto Chat in fondo ai "Dettagli cliente" (richiesta
                      esplicita dell'utente), solo quando le azioni in fondo
                      alla scheda non hanno già "Contatta/Cronologia", che apre
                      la stessa conversazione (docs/CHANGELOG.md §228). */}
                  {stage === "scaduta" || stage === "chiusa" ? (
                    <XStack gap="$2" flexWrap="wrap" paddingTop="$1">
                      <XStack paddingHorizontal="$3" paddingVertical={8} borderRadius={10} backgroundColor={brand.cianografiaVelo} cursor="pointer" onPress={openTimeline} gap="$1" alignItems="center">
                        <Text fontSize={13} fontWeight="700" color={brand.cianografiaScuro}>
                          Chat
                        </Text>
                        <UnreadDot count={effectiveUnreadCount} />
                      </XStack>
                    </XStack>
                  ) : null}
                </>
              )}
            </YStack>

            {/* Sezione 2 — Descrizione lavoro */}
            <YStack flex={1} minWidth={260} gap="$2">
              <Text fontSize={13} fontWeight="800" color={brand.grafite70} textTransform="uppercase">
                Descrizione lavoro
              </Text>
              <Text fontSize={16} color={brand.grafite} lineHeight={19}>
                {gr.description}
              </Text>
              {gr.photoUrls.length > 0 ? (
                <XStack gap="$2" style={{ overflowX: "auto" }}>
                  {gr.photoUrls.map((url, i) => (
                    <YStack
                      key={url}
                      width={72}
                      height={72}
                      borderRadius={10}
                      overflow="hidden"
                      borderWidth={1}
                      borderColor={brand.filetto}
                      cursor="pointer"
                      onPress={() => setOpenPhotoIndex(i)}
                      accessibilityRole="button"
                      accessibilityLabel={`Apri foto ${i + 1}`}
                    >
                      <MediaPreview url={url} />
                    </YStack>
                  ))}
                </XStack>
              ) : null}
            </YStack>
          </XStack>

          {/* Sezione 3 — Preventivo */}
          {lead.quote ? (
            <YStack gap="$2" padding="$3" borderRadius={20} backgroundColor={brand.gesso} borderWidth={1} borderColor={brand.filetto}>
              <Text fontSize={16} fontWeight="800" color={brand.grafite}>
                {stage === "accettata" || stage === "completata" || stage === "annullata" ? "Preventivo accettato" : "Il tuo preventivo"}
              </Text>
              {lead.quote.items.map((item) => (
                <XStack key={item.id} justifyContent="space-between">
                  <Text fontSize={16} color={brand.grafite}>
                    {item.name}
                  </Text>
                  <Text fontSize={16} color={brand.grafite}>
                    {item.priceMinEurCents != null ? formatEurCents(item.priceMinEurCents) : "–"}
                    {item.priceMaxEurCents != null && item.priceMaxEurCents !== item.priceMinEurCents ? ` – ${formatEurCents(item.priceMaxEurCents)}` : ""}
                  </Text>
                </XStack>
              ))}
              {stage === "completata" && booking?.finalAmountEurCents != null ? (
                <XStack justifyContent="space-between" borderTopWidth={1} borderTopColor={brand.filetto} paddingTop={6} marginTop={2}>
                  <Text fontSize={16} fontWeight="800" color={brand.grafite}>
                    Importo finale
                  </Text>
                  <Text fontSize={16} fontWeight="800" color={brand.cianografiaScuro}>
                    {formatEurCents(booking.finalAmountEurCents)}
                  </Text>
                </XStack>
              ) : priceRange && (priceRange.totalMinEurCents > 0 || priceRange.totalMaxEurCents > 0) ? (
                <XStack justifyContent="space-between" borderTopWidth={1} borderTopColor={brand.filetto} paddingTop={6} marginTop={2}>
                  <Text fontSize={16} fontWeight="800" color={brand.grafite}>
                    Totale stimato
                  </Text>
                  <Text fontSize={16} fontWeight="800" color={brand.grafite}>
                    {formatEurCents(priceRange.totalMinEurCents)}
                    {priceRange.totalMaxEurCents !== priceRange.totalMinEurCents ? ` – ${formatEurCents(priceRange.totalMaxEurCents)}` : ""}
                  </Text>
                </XStack>
              ) : null}
              {stage !== "accettata" && stage !== "completata" && stage !== "annullata" ? (
                <Text fontSize={13} color={brand.grafite70}>
                  Pagamento offerto:{" "}
                  {lead.quote.paymentOptions
                    .map((choice) => QUOTE_PAYMENT_OPTION_LABEL[choice].toLowerCase())
                    .join("; ")}
                  {lead.quote.paymentOptions.some(paymentChoiceIsOnline) ? ` (acconto online ${lead.quote.depositPercent}%)` : ""}
                </Text>
              ) : null}
            </YStack>
          ) : null}

          {/* Segnalazione del professionista sul lavoro (§197): ultima inviata e a che punto è. */}
          {booking?.professionalProblemReport ? (
            <Text fontSize={13} color={brand.grafite70}>
              Hai segnalato un problema ({formatDateTime(booking.professionalProblemReport.createdAt)}): {booking.professionalProblemReport.reason.toLowerCase()}.{" "}
              {booking.professionalProblemReport.status === "OPEN"
                ? "Il nostro team la sta verificando."
                : booking.professionalProblemReport.status === "RESOLVED"
                  ? "Il nostro team l'ha accolta."
                  : "Il nostro team l'ha esaminata e chiusa senza misure."}
            </Text>
          ) : null}
          {/* Segnalazione del cliente sul lavoro (docs/CHANGELOG.md §164). */}
          {/* Pagamento del lavoro (docs/CHANGELOG.md §168). */}
          {booking?.payment && booking.status !== "CANCELED" ? <JobPaymentStatus payment={booking.payment} audience="professional" /> : null}
          {booking?.issue ? (
            <JobIssuePanel
              issue={booking.issue}
              onOpenChat={myProfileId ? openTimeline : undefined}
              onRespond={async (response) => {
                await apiClient.respondToJobIssue(token, booking.id, { response });
                onChanged();
              }}
              onAnswerInfo={async (response) => {
                await apiClient.answerJobIssueInfo(token, booking.id, response);
                onChanged();
              }}
              onAppeal={async (text) => {
                await apiClient.appealJobIssue(token, booking.id, text);
                onChanged();
              }}
            />
          ) : null}

          {/* Sezione 4 — Note personali */}
          <YStack gap="$2">
            <Text fontSize={13} fontWeight="700" color={brand.grafite}>
              Note personali (solo per te)
            </Text>
            <textarea aria-label="Note personali"
              ref={(el) => {
                noteTextareaRef.current = el;
                autoGrowNote(el);
              }}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={() => noteChanged && handleSaveNote()}
              placeholder="Es. portare il pezzo di ricambio, citofono guasto..."
              rows={2}
              style={{ width: "100%", padding: 8, borderRadius: radiusDoc, border: `1px solid ${brand.bordoCampo}`, fontSize: 16, fontFamily: "inherit", color: brand.grafite, resize: "none", overflow: "hidden" }}
            />
            {noteChanged ? (
              <CardButton alignSelf="flex-start" disabled={isSavingNote} onPress={handleSaveNote}>
                {isSavingNote ? "Salvataggio..." : "Salva"}
              </CardButton>
            ) : null}
          </YStack>

          {/* Sezione 5 — Timeline mini */}
          {stage !== "scaduta" && stage !== "chiusa" ? (
            <YStack gap="$2">
              <Text fontSize={13} fontWeight="800" color={brand.grafite70} textTransform="uppercase">
                Andamento
              </Text>
              <MiniTimeline stage={stage} />
            </YStack>
          ) : null}

          {/* Sezione 6 — Azioni */}
          <YStack gap="$3" borderTopWidth={1} borderTopColor={brand.filetto} paddingTop="$3">
            {stage === "da_quotare" ? (
              <XStack gap="$2" flexWrap="wrap">
                <CardButton tone="primary" onPress={() => setShowQuoteForm((v) => !v)}>
                  Invia preventivo
                </CardButton>
                <ContactButton onPress={openTimeline} unreadCount={effectiveUnreadCount} />
                {!confirmingDecline ? (
                  <CardButton tone="danger" onPress={() => setConfirmingDecline(true)}>
                    Rifiuta
                  </CardButton>
                ) : null}
              </XStack>
            ) : null}

            {stage === "in_attesa" ? (
              <XStack gap="$2" flexWrap="wrap" alignItems="center">
                {/* Richiesta esplicita dell'utente: reso "più simile a un
                    pulsante" (prima variant="ghost", quasi solo testo) —
                    ottone/giallo, stesso token semantico già in uso per lo
                    stadio "modifica_richiesta"/"in attesa di modifica" in
                    tutto il resto di questa pagina. */}
                <CardButton fill={brand.ottone} onPress={startEditingQuote}>
                  Modifica preventivo
                </CardButton>
                <ContactButton onPress={openTimeline} unreadCount={effectiveUnreadCount} />
                {confirmingWithdraw ? (
                  <>
                    <Text fontSize={13} color={brand.urgenza}>
                      Ritirare questo preventivo?
                    </Text>
                    <CardButton tone="dangerSolid" disabled={isWithdrawing} onPress={handleWithdrawQuote}>
                      {isWithdrawing ? "Ritiro..." : "Conferma"}
                    </CardButton>
                    <CardButton onPress={() => setConfirmingWithdraw(false)}>Annulla</CardButton>
                  </>
                ) : (
                  <CardButton tone="danger" onPress={() => setConfirmingWithdraw(true)}>
                    Ritira preventivo
                  </CardButton>
                )}
              </XStack>
            ) : null}

            {stage === "modifica_richiesta" ? (
              <XStack gap="$2" flexWrap="wrap">
                <CardButton fill={brand.verificato} disabled={isConfirmingDate} onPress={handleConfirmDate}>
                  {isConfirmingDate ? "Conferma..." : proposalChange ? "Accetta nuova data" : "Conferma appuntamento"}
                </CardButton>
                {/* "Modifica" con sfondo, come "Modifica preventivo" e come
                    il cliente (richiesta esplicita dell'utente, prima
                    "Proponi altra data" quasi solo testo). */}
                <CardButton
                  fill={brand.ottone}
                  onPress={() => {
                    if (lead.quote?.clientProposedDate) {
                      presetSchedule(lead.quote.clientProposedDate, lead.quote.clientProposedEndDate, {
                        slot: setCounterSlotKey,
                        manual: setUseManualCounterDateTime,
                        date: setManualCounterDate,
                        start: setManualCounterStartTime,
                        end: setManualCounterEndTime,
                      });
                    }
                    setCounterNote("");
                    setCounterError(null);
                    setShowCounterForm((v) => !v);
                  }}
                >
                  Modifica
                </CardButton>
                <ContactButton onPress={openTimeline} unreadCount={effectiveUnreadCount} />
                <CardButton tone="danger" disabled={isRejectingDate} onPress={handleRejectDate}>
                  {isRejectingDate ? "..." : "Rifiuta la proposta"}
                </CardButton>
              </XStack>
            ) : null}

            {stage === "accettata" || stage === "completata" || stage === "annullata" ? (
              <XStack gap="$2" flexWrap="wrap">
                {/* Stessi bottoni già in uso in /dashboard (AcceptedJobCard) —
                    richiesta esplicita dell'utente di implementarli identici
                    qui: "Lavoro terminato"/"Annulla intervento" finché la
                    prenotazione è CONFIRMED. */}
                {booking?.status === "CONFIRMED" ? (
                  <>
                    {/* Turchese su richiesta esplicita dell'utente — stesso hex
                        già in uso per lo stato "Completata" in STAGE_STYLE
                        sopra, coerenza cromatica tra il bottone che porta a
                        quello stato e lo stato stesso. */}
                    <CardButton compactOnPhone fill="#20B2AA" onPress={() => setShowCompleteModal(true)}>
                      Lavoro terminato
                    </CardButton>
                  </>
                ) : null}
                {booking?.status === "CANCELED" && booking.canceledBy === "PROFESSIONAL" ? (
                  <CardButton compactOnPhone fill={brand.verificato} onPress={handleReopenBooking} disabled={isReopening}>
                    {isReopening ? "Riapertura..." : "Riapri intervento"}
                  </CardButton>
                ) : null}
                {/* Bug reale corretto: il link portava sempre alla data odierna
                    del calendario "Prenotazioni" invece che alla data vera
                    della prenotazione (spesso settimane avanti/indietro),
                    facendola sembrare assente dall'agenda. Il parametro
                    `?booking=` (letto da /dashboard/agenda) naviga alla data
                    esatta e apre subito il pannello di dettaglio. */}
                <Link href={booking ? `/dashboard/agenda?booking=${booking.id}` : "/dashboard/agenda"} style={{ textDecoration: "none" }}>
                  <CardButton compactOnPhone fill={brand.verificato}>Vedi in agenda</CardButton>
                </Link>
                <ContactButton compactOnPhone onPress={openTimeline} unreadCount={effectiveUnreadCount} />
                {/* Annulla sempre per ultimo (richiesta esplicita dell'utente). */}
                {booking?.status === "CONFIRMED" ? (
                  <CardButton compactOnPhone tone="danger" onPress={() => setShowCancelModal(true)}>
                    Annulla intervento
                  </CardButton>
                ) : null}
              </XStack>
            ) : null}
            {reopenError ? (
              <Text fontSize={13} color={brand.urgenza}>
                {reopenError}
              </Text>
            ) : null}

            {canDelete ? (
              <Text fontSize={13} color={brand.grafite70}>
                {stage === "chiusa" ? describeClosedReason(lead) : "Questa richiesta è scaduta: la coda di riserva è stata già inoltrata ad altri professionisti."}
              </Text>
            ) : null}
            {/* Nuovo preventivo dopo il rifiuto del cliente (docs/CHANGELOG.md
                §188): possibile fino alla scadenza della richiesta, contata
                dal suo invio, mai dal rifiuto. */}
            {canResendQuote && !showQuoteForm ? (
              <YStack gap="$2" alignItems="flex-start">
                <Text fontSize={13} color={brand.grafite70}>
                  {lead.quote?.resendUntil
                    ? `Puoi inviare un nuovo preventivo fino al ${formatDateTime(lead.quote.resendUntil)}, quando scade la richiesta.`
                    : "Puoi inviare un nuovo preventivo finché la richiesta è aperta."}
                </Text>
                <CardButton tone="primary" onPress={startEditingQuote}>
                  Invia un nuovo preventivo
                </CardButton>
              </YStack>
            ) : null}
            {canDelete ? (
              !confirmingDelete ? (
                <CardButton tone="danger" alignSelf="flex-start" onPress={() => setConfirmingDelete(true)}>
                  {quoteWithdrawn ? "Elimina preventivo ritirato" : "Elimina richiesta"}
                </CardButton>
              ) : (
                <XStack gap="$2" alignItems="center" flexWrap="wrap">
                  <Text fontSize={13} color={brand.grafite70}>
                    Confermi l&apos;eliminazione?
                  </Text>
                  <CardButton tone="dangerSolid" disabled={isDeleting} onPress={handleDelete}>
                    {isDeleting ? "..." : "Sì, elimina"}
                  </CardButton>
                  <CardButton onPress={() => setConfirmingDelete(false)}>Annulla</CardButton>
                </XStack>
              )
            ) : null}
          </YStack>

          {/* Prima del primo preventivo serve la verifica dell'identità
              (docs/CHANGELOG.md §253): al posto del modulo, cosa fare. Un
              preventivo già inviato resta modificabile. */}
          {showQuoteForm && identityVerificationNeeded && (!lead.quote || canResendQuote) ? (
            <YStack gap="$2.5" padding="$3" borderRadius={radiusDoc} backgroundColor={brand.ottoneVelo} borderWidth={1} borderColor={brand.ottone}>
              <XStack gap="$2" alignItems="center">
                <Icon name="id-card" size={20} color={brand.grafite} strokeWidth={1.8} />
                <Text fontWeight="700" color={brand.grafite} flex={1}>
                  Verifica la tua identità per inviare il preventivo
                </Text>
              </XStack>
              <Text fontSize={16} color={brand.grafite70}>
                Serve una sola volta: un documento e un selfie, circa 2 minuti. Poi torni qui e invii il preventivo.
              </Text>
              <XStack gap="$2" flexWrap="wrap">
                <CardButton tone="primary" onPress={() => router.push("/dashboard/verifica-identita")}>
                  Verifica ora
                </CardButton>
                <CardButton onPress={() => setShowQuoteForm(false)}>Più tardi</CardButton>
              </XStack>
            </YStack>
          ) : null}
          {/* Form invio/modifica preventivo */}
          {showQuoteForm && !(identityVerificationNeeded && (!lead.quote || canResendQuote)) ? (
            <YStack gap="$3" padding="$3" borderRadius={radiusDoc} backgroundColor={brand.gesso} borderWidth={1} borderColor={brand.filetto}>
              {items.map((item, index) => (
                <XStack key={index} gap="$2" alignItems="center" flexWrap="wrap">
                  <input aria-label="Voce del preventivo" value={item.name} onChange={(e) => updateItem(index, "name", e.target.value)} placeholder="Voce" style={{ ...smallInputStyle, flex: 1, minWidth: 140 }} />
                  <input aria-label="Prezzo minimo in euro" value={item.priceMin} onChange={(e) => updateItem(index, "priceMin", e.target.value)} placeholder="Da €" inputMode="decimal" style={{ ...smallInputStyle, width: 80 }} />
                  <input aria-label="Prezzo massimo in euro" value={item.priceMax} onChange={(e) => updateItem(index, "priceMax", e.target.value)} placeholder="A €" inputMode="decimal" style={{ ...smallInputStyle, width: 80 }} />
                  {items.length > 1 ? (
                    <XStack width={32} height={32} alignItems="center" justifyContent="center" borderWidth={1} borderColor={brand.urgenza} backgroundColor={brand.urgenzaVelo} borderRadius={10} cursor="pointer" onPress={() => removeItem(index)}>
                      <Icon name="x" size={14} color={brand.urgenza} />
                    </XStack>
                  ) : null}
                </XStack>
              ))}
              <CardButton alignSelf="flex-start" onPress={() => setItems((prev) => [...prev, { name: "", priceMin: "", priceMax: "" }])}>
                + Aggiungi voce
              </CardButton>

              {modeAvailableSlots.length > 0 && !useManualDateTime ? (
                <YStack gap="$2">
                  <select aria-label="Orario dall'agenda" value={selectedSlotKey} onChange={(e) => setSelectedSlotKey(e.target.value)} style={smallInputStyle}>
                    {modeAvailableSlots.map((sl) => (
                      <option key={slotKey(sl)} value={slotKey(sl)}>
                        {slotLabel(sl)}
                      </option>
                    ))}
                  </select>
                  <Text
                    fontSize={13}
                    fontWeight="600"
                    color={brand.cianografiaScuro}
                    cursor="pointer"
                    accessibilityRole="button"
                    onPress={() => setUseManualDateTime(true)}
                  >
                    Inserisci data e orario manualmente
                  </Text>
                </YStack>
              ) : (
                <YStack gap="$2">
                  <XStack gap="$2" flexWrap="wrap">
                    <ItalianDateInput ariaLabel="Data" value={manualDate} onChange={setManualDate} style={{ ...smallInputStyle, flex: 1, minWidth: 130 }} padX={10} />
                    <input aria-label="Ora di inizio" type="time" value={manualStartTime} onChange={(e) => setManualStartTime(e.target.value)} style={{ ...smallInputStyle, flex: 1, minWidth: 100 }} />
                    <input aria-label="Ora di fine"
                      type="time"
                      value={manualEndTime}
                      onChange={(e) => setManualEndTime(e.target.value)}
                      placeholder="Ora fine (facoltativa)"
                      style={{ ...smallInputStyle, flex: 1, minWidth: 100 }}
                    />
                  </XStack>
                  {/* Richiesta esplicita dell'utente: una data/orario inserita
                      a mano non fa parte delle fasce configurate in agenda —
                      comparirà comunque nel calendario "Prenotazioni" con
                      l'etichetta "In attesa" finché il cliente non accetta
                      il preventivo (vedi renderBookingDayColumn in
                      /dashboard/agenda). */}
                  <Text fontSize={13} color={brand.grafite70}>
                    Non fa parte della tua agenda — comparirà nel calendario &quot;Prenotazioni&quot; come &quot;In
                    attesa&quot; finché il cliente non accetta il preventivo.
                  </Text>
                  {modeAvailableSlots.length > 0 ? (
                    <Text
                      fontSize={13}
                      fontWeight="600"
                      color={brand.cianografiaScuro}
                      cursor="pointer"
                      accessibilityRole="button"
                      onPress={() => setUseManualDateTime(false)}
                    >
                      Usa un orario dalla mia agenda
                    </Text>
                  ) : null}
                </YStack>
              )}

              {/* Lavoro su più giorni (docs/CHANGELOG.md §310): stesso orario ogni giorno, non blocca altri lavori. */}
              <YStack gap="$1">
                <XStack gap="$2" alignItems="center">
                  <label htmlFor={`job-days-${gr.id}`} style={{ fontSize: 13, fontWeight: 600, color: brand.grafite }}>
                    Durata
                  </label>
                  <select id={`job-days-${gr.id}`} value={jobDays} onChange={(e) => setJobDays(Number(e.target.value))} style={smallInputStyle}>
                    {Array.from({ length: MAX_JOB_DAYS }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n === 1 ? "1 giorno" : `${n} giorni`}
                      </option>
                    ))}
                  </select>
                </XStack>
                {jobDaysPreview ? (
                  <Text fontSize={12} color={brand.grafite70}>
                    {jobDaysPreview}
                  </Text>
                ) : null}
              </YStack>

              {/* Come vuole essere pagato (docs/CHANGELOG.md §237): uno o più modi, il cliente sceglie tra questi. */}
              <YStack gap="$2" role="group" aria-label="Come vuoi essere pagato">
                <Text fontSize={16} fontWeight="700" color={brand.grafite}>
                  Come vuoi essere pagato?{onlinePayments ? " Puoi sceglierne più di uno: il cliente decide tra questi." : ""}
                </Text>
                {onlinePayments ? (
                  <>
                    {jobPaymentChoices.map((choice) => (
                      <label key={choice} style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", fontSize: 16 }}>
                        <input
                          type="checkbox"
                          checked={paymentOptions.includes(choice)}
                          onChange={(e) =>
                            setPaymentOptions((prev) =>
                              e.target.checked ? jobPaymentChoices.filter((c) => c === choice || prev.includes(c)) : prev.filter((c) => c !== choice),
                            )
                          }
                          style={{ accentColor: brand.verificato }}
                        />
                        {QUOTE_PAYMENT_OPTION_LABEL[choice]}
                      </label>
                    ))}
                    {paymentOptions.some(paymentChoiceIsOnline) ? (
                      <XStack gap="$2" alignItems="center" flexWrap="wrap">
                        <Text fontSize={16} color={brand.grafite}>
                          Acconto online
                        </Text>
                        <input
                          aria-label="Percentuale dell'acconto online"
                          type="number"
                          inputMode="numeric"
                          min={MIN_DEPOSIT_PERCENT}
                          max={MAX_DEPOSIT_PERCENT}
                          step={1}
                          value={depositPercentDraft}
                          onChange={(e) => setDepositPercentDraft(e.target.value)}
                          style={{ ...smallInputStyle, width: 72 }}
                        />
                        <Text fontSize={16} color={brand.grafite}>
                          % dell&apos;importo massimo
                        </Text>
                      </XStack>
                    ) : null}
                  </>
                ) : (
                  <Text fontSize={16} color={brand.grafite70}>
                    {onlinePaymentsActive ? (
                      <>
                        Il cliente ti paga direttamente. Per offrire anche l&apos;acconto online completa la verifica su Stripe in{" "}
                        <a href="/dashboard/fiscale" style={{ color: brand.verificato }}>
                          Dati fiscali e pagamenti
                        </a>
                        .
                      </>
                    ) : (
                      "Il cliente ti paga direttamente: il pagamento online arriverà a breve."
                    )}
                  </Text>
                )}
                {onlinePayments ? (
                  <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", fontSize: 16, color: brand.grafite70 }}>
                    <input type="checkbox" checked={rememberPaymentOffer} onChange={(e) => setRememberPaymentOffer(e.target.checked)} style={{ accentColor: brand.verificato }} />
                    Proponi questi modi anche nei prossimi preventivi
                  </label>
                ) : null}
              </YStack>

              <textarea aria-label="Messaggio per il cliente" value={quoteNotes} onChange={(e) => setQuoteNotes(e.target.value)} placeholder="Messaggio per il cliente (facoltativo)" rows={2} style={{ ...smallInputStyle, resize: "vertical" }} />

              {quoteError ? (
                <Text color={brand.urgenza} fontSize={16}>
                  {quoteError}
                </Text>
              ) : null}

              <XStack gap="$2" flexWrap="wrap">
                <CardButton tone="primary" arrow disabled={isSubmittingQuote} onPress={handleSendQuote}>
                  {isSubmittingQuote ? "Invio..." : "Invia preventivo"}
                </CardButton>
                <CardButton onPress={() => setShowQuoteForm(false)}>Annulla</CardButton>
              </XStack>
            </YStack>
          ) : null}

          {/* Form "proponi altra data" (contro-proposta) */}
          {showCounterForm ? (
            <YStack gap="$3" padding="$3" borderRadius={radiusDoc} backgroundColor={brand.gesso} borderWidth={1} borderColor={brand.filetto}>
              {/* Lavoro su più giorni (§310): la durata resta quella del preventivo. */}
              {lead.quote && jobDayCount(lead.quote.estimatedStartDate, lead.quote.estimatedEndDate) > 1 ? (
                <Text fontSize={12} color={brand.grafite70}>
                  Il lavoro resta di {jobDayCount(lead.quote.estimatedStartDate, lead.quote.estimatedEndDate)} giorni: scegli il primo giorno e l&apos;orario di ogni giorno.
                </Text>
              ) : null}
              {modeAvailableSlots.length > 0 && !useManualCounterDateTime ? (
                <YStack gap="$2">
                  <select aria-label="Orario dall'agenda" value={counterSlotKey} onChange={(e) => setCounterSlotKey(e.target.value)} style={smallInputStyle}>
                    {modeAvailableSlots.map((sl) => (
                      <option key={slotKey(sl)} value={slotKey(sl)}>
                        {slotLabel(sl)}
                      </option>
                    ))}
                  </select>
                  <Text
                    fontSize={13}
                    fontWeight="600"
                    color={brand.cianografiaScuro}
                    cursor="pointer"
                    accessibilityRole="button"
                    onPress={() => setUseManualCounterDateTime(true)}
                  >
                    Inserisci data e orario manualmente
                  </Text>
                </YStack>
              ) : (
                <YStack gap="$2">
                  <XStack gap="$2" flexWrap="wrap">
                    <ItalianDateInput ariaLabel="Nuova data" value={manualCounterDate} onChange={setManualCounterDate} style={{ ...smallInputStyle, flex: 1, minWidth: 130 }} padX={10} />
                    <input aria-label="Ora di inizio" type="time" value={manualCounterStartTime} onChange={(e) => setManualCounterStartTime(e.target.value)} style={{ ...smallInputStyle, flex: 1, minWidth: 100 }} />
                    <input aria-label="Ora di fine" type="time" value={manualCounterEndTime} onChange={(e) => setManualCounterEndTime(e.target.value)} style={{ ...smallInputStyle, flex: 1, minWidth: 100 }} />
                  </XStack>
                  {/* Richiesta esplicita dell'utente: la nuova data può non
                      far parte delle fasce configurate in agenda — comparirà
                      comunque sul calendario "Prenotazioni" come "In attesa"
                      finché il cliente non accetta (stesso principio già
                      seguito per la data manuale del primo preventivo). */}
                  <Text fontSize={13} color={brand.grafite70}>
                    Comparirà in agenda come &quot;In attesa&quot; finché il cliente non accetta.
                  </Text>
                  {modeAvailableSlots.length > 0 ? (
                    <Text
                      fontSize={13}
                      fontWeight="600"
                      color={brand.cianografiaScuro}
                      cursor="pointer"
                      accessibilityRole="button"
                      onPress={() => setUseManualCounterDateTime(false)}
                    >
                      Usa un orario dalla mia agenda
                    </Text>
                  ) : null}
                </YStack>
              )}
              <textarea aria-label="Nota per il cliente" value={counterNote} onChange={(e) => setCounterNote(e.target.value)} placeholder="Nota per il cliente (facoltativa)" rows={2} style={{ ...smallInputStyle, resize: "vertical" }} />
              {counterError ? (
                <Text color={brand.urgenza} fontSize={16}>
                  {counterError}
                </Text>
              ) : null}
              <XStack gap="$2" flexWrap="wrap">
                <CardButton tone="primary" disabled={isCountering} onPress={handleCounterPropose}>
                  {isCountering ? "Invio..." : "Invia nuova proposta"}
                </CardButton>
                <CardButton onPress={() => setShowCounterForm(false)}>Annulla</CardButton>
              </XStack>
            </YStack>
          ) : null}

          {/* Conferma rifiuto lead */}
          {confirmingDecline ? (
            <YStack gap="$2" padding="$3" borderRadius={radiusDoc} backgroundColor={brand.urgenzaVelo} borderWidth={1} borderColor={brand.urgenza}>
              <textarea aria-label="Nota per il cliente"
                value={declineNoteDraft}
                onChange={(e) => setDeclineNoteDraft(e.target.value)}
                placeholder="Nota per il cliente (facoltativa)"
                rows={2}
                style={{ ...smallInputStyle, resize: "vertical", backgroundColor: brand.calce }}
              />
              <XStack gap="$2" flexWrap="wrap">
                <CardButton tone="dangerSolid" disabled={isDeclining} onPress={handleDecline}>
                  {isDeclining ? "..." : "Conferma rifiuto"}
                </CardButton>
                <CardButton onPress={() => setConfirmingDecline(false)}>Annulla</CardButton>
              </XStack>
            </YStack>
          ) : null}

          {/* Freccetta per richiudere la scheda anche dal fondo — richiesta
              esplicita dell'utente: prima l'unico modo era cliccare di nuovo
              l'intestazione in alto, scomodo su una scheda espansa lunga.
              Stessa icona/interazione di quella in cima (che resta invariata,
              cliccare l'intestazione continua a funzionare). */}
          <XStack justifyContent="center" paddingTop="$2" cursor="pointer" onPress={onToggle} accessibilityRole="button" accessibilityLabel="Richiudi la scheda">
            <Icon name="chevron-up" size={18} color={brand.grafite70} />
          </XStack>
        </YStack>
      ) : null}

      {/* Fuori dal blocco espanso: si aprono anche dal menu hamburger di una
          scheda chiusa. */}
      {showCompleteModal && booking ? (
        <CompleteJobModal
          quotedItems={booking.items}
          jobName={gr.categoryLabel}
          onClose={() => setShowCompleteModal(false)}
          onComplete={handleComplete}
          uploadPhoto={(file) => apiClient.uploadBookingCompletionPhoto(token, file).then((r) => r.imageUrl)}
        />
      ) : null}
      {showCancelModal && booking ? <CancelBookingModal onClose={() => setShowCancelModal(false)} onCancel={handleCancelBooking} /> : null}
      {showReportModal ? (
        <ReportContentModal
          targetType="GUIDED_REQUEST"
          targetLabel={`la richiesta di ${clientName}`}
          onClose={() => setShowReportModal(false)}
          onSubmit={async (input) => {
            await apiClient.createContentReport(token, { targetType: "GUIDED_REQUEST", targetId: gr.id, ...input });
          }}
        />
      ) : null}
      {showProblemModal && booking ? (
        <ProfessionalProblemModal
          clientName={clientName}
          onClose={() => {
            setShowProblemModal(false);
            onChanged();
          }}
          onSubmit={async (input) => {
            await apiClient.reportProfessionalJobProblem(token, booking.id, input);
          }}
          uploadPhoto={(file) => apiClient.uploadBookingCompletionPhoto(token, file).then((r) => r.imageUrl)}
        />
      ) : null}
      {showClientProfile ? (
        <ClientProfileModal
          name={clientName}
          detailsUnlocked={gr.clientDetailsUnlocked}
          imageUrl={gr.clientImageUrl}
          onClose={() => setShowClientProfile(false)}
        />
      ) : null}
      {showTimeline && myProfileId ? (
        <TimelineModal
          token={token}
          guidedRequestId={gr.id}
          professionalProfileId={myProfileId}
          viewerRole="PROFESSIONAL"
          otherPartyName={gr.clientName}
          otherPartyImageUrl={gr.clientImageUrl}
          onOpenClientProfile={() => setShowClientProfile(true)}
          onClose={() => setShowTimeline(false)}
        />
      ) : null}
      {openPhotoIndex !== null ? <PhotoLightbox photos={gr.photoUrls} initialIndex={openPhotoIndex} onClose={() => setOpenPhotoIndex(null)} /> : null}
    </Surface>
  );
}
