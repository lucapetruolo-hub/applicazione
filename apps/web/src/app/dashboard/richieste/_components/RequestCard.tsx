"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buildWhatsAppLink, formatBookingAddress, formatEurCents, quotePriceTotals, scheduleChangeBetween, scheduleChangeOf, PROFESSIONAL_JOB_PROBLEM_REASONS, type CompleteBookingInput, type ProfessionalJobProblemReason, type ProfessionalAvailableSlot, type ProfessionalBooking, type ProfessionalLead } from "@professionisti/shared";
import { Avatar, Badge, Icon, Surface, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { formatCompetitors, formatLeadDeadline } from "@/lib/leadDeadline";
import { ClientProfileModal } from "@/components/ClientProfileModal";
import { TimelineModal } from "@/components/TimelineModal";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { MediaPreview } from "@/components/MediaPreview";
import { CompleteJobModal } from "@/components/CompleteJobModal";
import { JobIssuePanel } from "@/components/JobIssuePanel";
import { JobPaymentStatus } from "@/components/JobPaymentStatus";
import { CancelBookingModal } from "@/components/CancelBookingModal";
import { ReviewModal } from "@/components/ReviewModal";
import { describeClosedReason, type RequestStage } from "@/lib/requestStage";
import { UnreadDot } from "@/components/UnreadDot";
import { useDismissableUnreadCount } from "@/lib/useDismissableUnreadCount";
import { CardActionsMenu, type CardAction } from "@/components/CardActionsMenu";
import { buildPersonalStateActions, RequestStateIndicators } from "@/components/RequestCardPersonalActions";
import { ReportContentModal } from "@/components/ReportContentModal";
import { CardButton } from "@/components/CardButton";
import { ContactButton } from "@/components/ContactButton";
import { ScheduleChangeBox } from "@/components/ScheduleChangeBox";
import { DeadlinePill, MiniTimeline, QuoteItemDraft, STAGE_STYLE, ServiceBadge, StagePill, formatDateTime, formatSlotRange, slotKey, slotLabel, smallInputStyle } from "./requestHelpers";

export function RequestCard({
  lead,
  stage,
  booking,
  token,
  availableSlots,
  myProfileId,
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
  const leadDeadline = formatLeadDeadline(lead.expiresAt);
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
  const [quoteNotes, setQuoteNotes] = useState("");
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isSubmittingQuote, setIsSubmittingQuote] = useState(false);

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
  // "Lavoro terminato"/"Annulla intervento"/"Recensisci il cliente" —
  // richiesta esplicita dell'utente di implementarli qui identici.
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showClientReviewModal, setShowClientReviewModal] = useState(false);

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

    setIsSubmittingQuote(true);
    try {
      await apiClient.createQuote(token, { requestId: gr.id, items: parsed, estimatedStartDate, estimatedEndDate, notes: quoteNotes.trim() || undefined });
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
    // Subito dopo aver segnalato il lavoro terminato si apre il popup per
    // recensire il cliente (stesso comportamento già in uso in /dashboard).
    // Bug reale corretto: `onChanged()` non va chiamato qui — se il tab
    // attivo è "Accettate", ricaricare subito filtra via questa card (lo
    // stadio passa a "completata") chiudendo il popup di recensione un
    // istante dopo averlo aperto. Il reload va rimandato alla chiusura del
    // popup (submit o annulla, sotto).
    setShowClientReviewModal(true);
  }

  async function handleSubmitClientReview(input: { rating: number; comment?: string; mediaUrls: string[] }) {
    if (!booking) return;
    await apiClient.createClientReview(token, { bookingId: booking.id, ...input });
    setShowClientReviewModal(false);
    onChanged();
  }

  function closeClientReviewModal() {
    setShowClientReviewModal(false);
    // Il lavoro è comunque già stato segnalato come terminato — la lista va
    // aggiornata anche se il popup viene chiuso senza recensire, altrimenti
    // resterebbe visibile come "Accettata" finché non arriva il prossimo
    // poll periodico.
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

  function startEditingQuote() {
    if (!lead.quote) return;
    setItems(lead.quote.items.map((it) => ({ name: it.name, priceMin: it.priceMinEurCents != null ? (it.priceMinEurCents / 100).toString() : "", priceMax: it.priceMaxEurCents != null ? (it.priceMaxEurCents / 100).toString() : "" })));
    setQuoteNotes(lead.quote.notes ?? "");
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
  if (booking?.status === "COMPLETED" && !booking.hasClientReview) {
    menuActions.push({ icon: "star", text: "Recensisci il cliente", onPress: () => setShowClientReviewModal(true) });
  }
  if (booking?.status === "CANCELED") {
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
            <StagePill stage={stage} />
            <ServiceBadge online={isOnline} />
            {stage === "da_quotare" && leadDeadline ? <DeadlinePill deadline={leadDeadline} /> : null}
            {stage === "da_quotare" && competitorsLabel ? (
              <Text fontSize="$2" fontWeight="600" color={brand.grafite70}>
                {competitorsLabel}
              </Text>
            ) : null}
          </XStack>
          <YStack alignItems="flex-end">
            <Text fontSize={14} color={brand.grafite70}>
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
            <Text fontSize="$2" fontWeight="700" color={brand.verificato}>
              Email confermata
            </Text>
          </XStack>
        ) : null}
        <RequestStateIndicators myState={lead.myState} />
        {menuError ? (
          <Text color={brand.urgenza} fontSize="$3">
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
            <Text fontSize={15} fontWeight="700" color={brand.grafite}>
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
          <Text fontSize={15} color={brand.grafite70}>
            {isOnline ? `Zona: ${gr.city}` : (revealedAddress ?? gr.city)}
          </Text>
        </XStack>

        <XStack justifyContent="center" paddingTop="$1">
          <Icon name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={brand.grafite70} />
        </XStack>
      </YStack>

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
              <Text fontSize={11} fontWeight="800" color={brand.grafite70} textTransform="uppercase">
                Dettagli cliente
              </Text>
              {gr.clientAccountDeleted ? (
                <Text fontSize={13} color={brand.grafite70}>
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
                    <Text fontSize={14} fontWeight="700" color={brand.cianografiaScuro} textDecorationLine="underline">
                      {clientName}
                    </Text>
                    <Icon name="chevron-right" size={13} color={brand.cianografiaScuro} strokeWidth={2} />
                  </XStack>
                  {/* Data/ora dell'intervento spostata subito sotto il nome
                      cliccabile (richiesta esplicita dell'utente, con
                      screenshot annotato) — prima stava in fondo alla
                      scheda, appena sopra il tasto Chat. */}
                  {booking?.scheduledAt && (stage === "accettata" || stage === "completata" || stage === "annullata") ? (
                    <Text fontSize={12.5} fontWeight="700" color={brand.grafite}>
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
                    <Text fontSize={13.5} fontWeight="700" color={brand.grafite}>
                      {[booking.recipientName, booking.recipientSurname].filter(Boolean).join(" ")}
                    </Text>
                  ) : null}
                  {/* Indirizzo cliccabile (link Google Maps, stesso
                      principio già in uso per tel:/mailto:/wa.me —
                      nessuna API a pagamento, solo un URL di apertura) —
                      spostato subito sotto il nome, richiesta esplicita
                      dell'utente. */}
                  {isOnline ? (
                    <Text fontSize={12.5} color={brand.grafite70}>
                      Zona: {gr.city} (indirizzo nascosto)
                    </Text>
                  ) : revealedAddress ? (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(revealedAddress)}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ textDecoration: "none" }}
                    >
                      <Text fontSize={12.5} fontWeight="600" color={brand.cianografiaScuro} textDecorationLine="underline">
                        {revealedAddress}
                      </Text>
                    </a>
                  ) : (
                    <Text fontSize={12.5} color={brand.grafite70}>
                      {gr.city}
                    </Text>
                  )}
                  {/* Numero cliccabile (tel:) con i tasti WhatsApp/Chiama
                      di fianco, non più in una riga separata più sotto —
                      richiesta esplicita dell'utente. */}
                  {revealedPhone ? (
                    <XStack alignItems="center" gap="$2" flexWrap="wrap">
                      <a href={`tel:${revealedPhone}`} style={{ textDecoration: "none" }}>
                        <Text fontSize={13} fontWeight="600" color={brand.cianografiaScuro} textDecorationLine="underline">
                          {revealedPhone}
                        </Text>
                      </a>
                      {whatsAppLink ? (
                        <a href={whatsAppLink} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                          <XStack paddingHorizontal="$2.5" paddingVertical={5} borderRadius={8} backgroundColor="#25d366">
                            <Text fontSize={11.5} fontWeight="700" color="white">
                              WhatsApp
                            </Text>
                          </XStack>
                        </a>
                      ) : null}
                      <a href={`tel:${revealedPhone}`} style={{ textDecoration: "none" }}>
                        <XStack paddingHorizontal="$2.5" paddingVertical={5} borderRadius={8} backgroundColor={brand.cianografia}>
                          <Text fontSize={11.5} fontWeight="700" color="white">
                            Chiama
                          </Text>
                        </XStack>
                      </a>
                    </XStack>
                  ) : null}
                  {revealedEmail ? (
                    <a href={`mailto:${revealedEmail}`} style={{ textDecoration: "none" }}>
                      <Text fontSize={13} fontWeight="600" color={brand.cianografiaScuro} textDecorationLine="underline">
                        {revealedEmail}
                      </Text>
                    </a>
                  ) : null}
                  {!booking ? (
                    <Text fontSize={12.5} color={brand.grafite70} fontStyle="italic">
                      Telefono, email e indirizzo saranno visibili qui ad accettazione del preventivo.
                    </Text>
                  ) : null}
                  {/* Tasto Chat spostato in fondo alla scheda "Dettagli
                      cliente" — richiesta esplicita dell'utente. */}
                  <XStack gap="$2" flexWrap="wrap" paddingTop="$1">
                    <XStack paddingHorizontal="$3" paddingVertical={8} borderRadius={8} backgroundColor={brand.cianografiaVelo} cursor="pointer" onPress={openTimeline} gap="$1" alignItems="center">
                      <Text fontSize={12.5} fontWeight="700" color={brand.cianografiaScuro}>
                        Chat
                      </Text>
                      <UnreadDot count={effectiveUnreadCount} />
                    </XStack>
                  </XStack>
                </>
              )}
            </YStack>

            {/* Sezione 2 — Descrizione lavoro */}
            <YStack flex={1} minWidth={260} gap="$2">
              <Text fontSize={11} fontWeight="800" color={brand.grafite70} textTransform="uppercase">
                Descrizione lavoro
              </Text>
              <Text fontSize={13.5} color={brand.grafite} lineHeight={19}>
                {gr.description}
              </Text>
              {gr.photoUrls.length > 0 ? (
                <XStack gap="$2" style={{ overflowX: "auto" }}>
                  {gr.photoUrls.map((url, i) => (
                    <YStack
                      key={url}
                      width={72}
                      height={72}
                      borderRadius={8}
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
            <YStack gap="$2" padding="$3" borderRadius={12} backgroundColor={brand.gesso} borderWidth={1} borderColor={brand.filetto}>
              <Text fontSize={13} fontWeight="800" color={brand.grafite}>
                {stage === "accettata" || stage === "completata" || stage === "annullata" ? "Preventivo accettato" : "Il tuo preventivo"}
              </Text>
              {lead.quote.items.map((item) => (
                <XStack key={item.id} justifyContent="space-between">
                  <Text fontSize={13} color={brand.grafite}>
                    {item.name}
                  </Text>
                  <Text fontSize={13} color={brand.grafite}>
                    {item.priceMinEurCents != null ? formatEurCents(item.priceMinEurCents) : "–"}
                    {item.priceMaxEurCents != null && item.priceMaxEurCents !== item.priceMinEurCents ? ` – ${formatEurCents(item.priceMaxEurCents)}` : ""}
                  </Text>
                </XStack>
              ))}
              {stage === "completata" && booking?.finalAmountEurCents != null ? (
                <XStack justifyContent="space-between" borderTopWidth={1} borderTopColor={brand.filetto} paddingTop={6} marginTop={2}>
                  <Text fontSize={13.5} fontWeight="800" color={brand.grafite}>
                    Importo finale
                  </Text>
                  <Text fontSize={13.5} fontWeight="800" color={brand.cianografiaScuro}>
                    {formatEurCents(booking.finalAmountEurCents)}
                  </Text>
                </XStack>
              ) : priceRange && (priceRange.totalMinEurCents > 0 || priceRange.totalMaxEurCents > 0) ? (
                <XStack justifyContent="space-between" borderTopWidth={1} borderTopColor={brand.filetto} paddingTop={6} marginTop={2}>
                  <Text fontSize={13.5} fontWeight="800" color={brand.grafite}>
                    Totale stimato
                  </Text>
                  <Text fontSize={13.5} fontWeight="800" color={brand.grafite}>
                    {formatEurCents(priceRange.totalMinEurCents)}
                    {priceRange.totalMaxEurCents !== priceRange.totalMinEurCents ? ` – ${formatEurCents(priceRange.totalMaxEurCents)}` : ""}
                  </Text>
                </XStack>
              ) : null}
            </YStack>
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
            <Text fontSize={12} fontWeight="700" color={brand.grafite}>
              Note personali (solo per te)
            </Text>
            <textarea
              ref={(el) => {
                noteTextareaRef.current = el;
                autoGrowNote(el);
              }}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={() => noteChanged && handleSaveNote()}
              placeholder="Es. portare il pezzo di ricambio, citofono guasto..."
              rows={2}
              style={{ width: "100%", padding: 8, borderRadius: radiusDoc, border: `1px solid ${brand.filetto}`, fontSize: 13, fontFamily: "inherit", color: brand.grafite, resize: "none", overflow: "hidden" }}
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
              <Text fontSize={11} fontWeight="800" color={brand.grafite70} textTransform="uppercase">
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
                    <Text fontSize="$2" color={brand.urgenza}>
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
                    const proposedDate = lead.quote?.clientProposedDate?.slice(0, 10);
                    const proposedTime = lead.quote?.clientProposedDate?.slice(11, 16);
                    const matching = modeAvailableSlots.find((sl) => sl.date === proposedDate && sl.startTime === proposedTime);
                    setCounterSlotKey(matching ? slotKey(matching) : modeAvailableSlots[0] ? slotKey(modeAvailableSlots[0]) : "");
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
                    prenotazione è CONFIRMED, "Recensisci il cliente" dopo il
                    completamento se non già recensito. */}
                {booking?.status === "CONFIRMED" ? (
                  <>
                    {/* Turchese su richiesta esplicita dell'utente — stesso hex
                        già in uso per lo stato "Completata" in STAGE_STYLE
                        sopra, coerenza cromatica tra il bottone che porta a
                        quello stato e lo stato stesso. */}
                    <CardButton fill="#20B2AA" onPress={() => setShowCompleteModal(true)}>
                      Lavoro terminato
                    </CardButton>
                  </>
                ) : null}
                {booking?.status === "COMPLETED" && !booking.hasClientReview ? (
                  <CardButton onPress={() => setShowClientReviewModal(true)}>Recensisci il cliente</CardButton>
                ) : null}
                {booking?.status === "CANCELED" ? (
                  <CardButton fill={brand.verificato} onPress={handleReopenBooking} disabled={isReopening}>
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
                  <CardButton fill={brand.verificato}>Vedi in agenda</CardButton>
                </Link>
                <ContactButton onPress={openTimeline} unreadCount={effectiveUnreadCount} />
                {/* Annulla sempre per ultimo (richiesta esplicita dell'utente). */}
                {booking?.status === "CONFIRMED" ? (
                  <CardButton tone="danger" onPress={() => setShowCancelModal(true)}>
                    Annulla intervento
                  </CardButton>
                ) : null}
              </XStack>
            ) : null}
            {reopenError ? (
              <Text fontSize="$2" color={brand.urgenza}>
                {reopenError}
              </Text>
            ) : null}

            {canDelete ? (
              <Text fontSize={12.5} color={brand.grafite70}>
                {stage === "chiusa" ? describeClosedReason(lead) : "Questa richiesta è scaduta: la coda di riserva è stata già inoltrata ad altri professionisti."}
              </Text>
            ) : null}
            {/* Nuovo preventivo dopo il rifiuto del cliente (docs/CHANGELOG.md
                §188): possibile fino alla scadenza della richiesta, contata
                dal suo invio, mai dal rifiuto. */}
            {canResendQuote && !showQuoteForm ? (
              <YStack gap="$2" alignItems="flex-start">
                <Text fontSize={12.5} color={brand.grafite70}>
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
                  <Text fontSize={12.5} color={brand.grafite70}>
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

          {/* Form invio/modifica preventivo */}
          {showQuoteForm ? (
            <YStack gap="$3" padding="$3" borderRadius={radiusDoc} backgroundColor={brand.gesso} borderWidth={1} borderColor={brand.filetto}>
              {items.map((item, index) => (
                <XStack key={index} gap="$2" alignItems="center" flexWrap="wrap">
                  <input value={item.name} onChange={(e) => updateItem(index, "name", e.target.value)} placeholder="Voce" style={{ ...smallInputStyle, flex: 1, minWidth: 140 }} />
                  <input value={item.priceMin} onChange={(e) => updateItem(index, "priceMin", e.target.value)} placeholder="Da €" inputMode="decimal" style={{ ...smallInputStyle, width: 80 }} />
                  <input value={item.priceMax} onChange={(e) => updateItem(index, "priceMax", e.target.value)} placeholder="A €" inputMode="decimal" style={{ ...smallInputStyle, width: 80 }} />
                  {items.length > 1 ? (
                    <XStack width={32} height={32} alignItems="center" justifyContent="center" borderWidth={1} borderColor={brand.urgenza} backgroundColor={brand.urgenzaVelo} borderRadius={8} cursor="pointer" onPress={() => removeItem(index)}>
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
                  <select value={selectedSlotKey} onChange={(e) => setSelectedSlotKey(e.target.value)} style={smallInputStyle}>
                    {modeAvailableSlots.map((sl) => (
                      <option key={slotKey(sl)} value={slotKey(sl)}>
                        {slotLabel(sl)}
                      </option>
                    ))}
                  </select>
                  <Text
                    fontSize={12}
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
                    <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} style={{ ...smallInputStyle, flex: 1, minWidth: 130 }} />
                    <input type="time" value={manualStartTime} onChange={(e) => setManualStartTime(e.target.value)} style={{ ...smallInputStyle, flex: 1, minWidth: 100 }} />
                    <input
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
                  <Text fontSize={11} color={brand.grafite70}>
                    Non fa parte della tua agenda — comparirà nel calendario &quot;Prenotazioni&quot; come &quot;In
                    attesa&quot; finché il cliente non accetta il preventivo.
                  </Text>
                  {modeAvailableSlots.length > 0 ? (
                    <Text
                      fontSize={12}
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

              <textarea value={quoteNotes} onChange={(e) => setQuoteNotes(e.target.value)} placeholder="Messaggio per il cliente (facoltativo)" rows={2} style={{ ...smallInputStyle, resize: "vertical" }} />

              {quoteError ? (
                <Text color={brand.urgenza} fontSize={13}>
                  {quoteError}
                </Text>
              ) : null}

              <XStack gap="$2" flexWrap="wrap">
                <CardButton tone="primary" disabled={isSubmittingQuote} onPress={handleSendQuote}>
                  {isSubmittingQuote ? "Invio..." : "Invia preventivo"}
                </CardButton>
                <CardButton onPress={() => setShowQuoteForm(false)}>Annulla</CardButton>
              </XStack>
            </YStack>
          ) : null}

          {/* Form "proponi altra data" (contro-proposta) */}
          {showCounterForm ? (
            <YStack gap="$3" padding="$3" borderRadius={radiusDoc} backgroundColor={brand.gesso} borderWidth={1} borderColor={brand.filetto}>
              {modeAvailableSlots.length > 0 && !useManualCounterDateTime ? (
                <YStack gap="$2">
                  <select value={counterSlotKey} onChange={(e) => setCounterSlotKey(e.target.value)} style={smallInputStyle}>
                    {modeAvailableSlots.map((sl) => (
                      <option key={slotKey(sl)} value={slotKey(sl)}>
                        {slotLabel(sl)}
                      </option>
                    ))}
                  </select>
                  <Text
                    fontSize={12}
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
                    <input type="date" value={manualCounterDate} onChange={(e) => setManualCounterDate(e.target.value)} style={{ ...smallInputStyle, flex: 1, minWidth: 130 }} />
                    <input type="time" value={manualCounterStartTime} onChange={(e) => setManualCounterStartTime(e.target.value)} style={{ ...smallInputStyle, flex: 1, minWidth: 100 }} />
                    <input type="time" value={manualCounterEndTime} onChange={(e) => setManualCounterEndTime(e.target.value)} style={{ ...smallInputStyle, flex: 1, minWidth: 100 }} />
                  </XStack>
                  {/* Richiesta esplicita dell'utente: la nuova data può non
                      far parte delle fasce configurate in agenda — comparirà
                      comunque sul calendario "Prenotazioni" come "In attesa"
                      finché il cliente non accetta (stesso principio già
                      seguito per la data manuale del primo preventivo). */}
                  <Text fontSize={11} color={brand.grafite70}>
                    Comparirà in agenda come &quot;In attesa&quot; finché il cliente non accetta.
                  </Text>
                  {modeAvailableSlots.length > 0 ? (
                    <Text
                      fontSize={12}
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
              <textarea value={counterNote} onChange={(e) => setCounterNote(e.target.value)} placeholder="Nota per il cliente (facoltativa)" rows={2} style={{ ...smallInputStyle, resize: "vertical" }} />
              {counterError ? (
                <Text color={brand.urgenza} fontSize={13}>
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
              <textarea
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
          onClose={() => setShowCompleteModal(false)}
          onComplete={handleComplete}
          uploadPhoto={(file) => apiClient.uploadBookingCompletionPhoto(token, file).then((r) => r.imageUrl)}
        />
      ) : null}
      {showClientReviewModal && booking ? (
        <ReviewModal
          title="Recensisci il cliente"
          subtitle="Com'è andato il lavoro con questo cliente? La tua recensione sarà visibile solo nella sua scheda."
          uploadPhoto={(file) => apiClient.uploadClientReviewPhoto(token, file).then((r) => r.imageUrl)}
          onSubmit={handleSubmitClientReview}
          onClose={closeClientReviewModal}
        />
      ) : null}
      {showCancelModal && booking ? <CancelBookingModal onClose={() => setShowCancelModal(false)} onCancel={handleCancelBooking} /> : null}
      {showReportModal ? (
        <ReportContentModal
          targetType="GUIDED_REQUEST"
          targetLabel={`la richiesta di ${clientName}`}
          onClose={() => setShowReportModal(false)}
          onSubmit={async (reason, details) => {
            await apiClient.createContentReport(token, { targetType: "GUIDED_REQUEST", targetId: gr.id, reason, details });
          }}
        />
      ) : null}
      {showProblemModal && booking ? (
        <ReportContentModal
          targetLabel={`il lavoro di ${clientName}`}
          title="Qualcosa è andato male?"
          subtitle={`Raccontaci cosa è successo con ${clientName}. Lo scriviamo anche in chat al cliente e lo legge il nostro team.`}
          reasonOptions={PROFESSIONAL_JOB_PROBLEM_REASONS}
          detailsRequired
          doneText="Segnalazione inviata. L'abbiamo scritta in chat al cliente e la verificheremo il prima possibile."
          onClose={() => setShowProblemModal(false)}
          onSubmit={async (_label, details, reasonValue) => {
            await apiClient.reportProfessionalJobProblem(token, booking.id, {
              reason: reasonValue as ProfessionalJobProblemReason,
              description: details ?? "",
            });
            onChanged();
          }}
        />
      ) : null}
      {showClientProfile ? (
        <ClientProfileModal
          name={clientName}
          birthDate={gr.clientBirthDate}
          imageUrl={gr.clientImageUrl}
          reviews={gr.clientReviews}
          token={token}
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
          onOpenClientProfile={() => setShowClientProfile(true)}
          onClose={() => setShowTimeline(false)}
        />
      ) : null}
      {openPhotoIndex !== null ? <PhotoLightbox photos={gr.photoUrls} initialIndex={openPhotoIndex} onClose={() => setOpenPhotoIndex(null)} /> : null}
    </Surface>
  );
}
