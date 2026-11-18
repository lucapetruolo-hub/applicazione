"use client";

import { Fragment, startTransition, useCallback, useEffect, useState } from "react";
import Link from "@/components/IntentLink";
import { Check, CheckCircle2, Clock, Navigation, Phone, Truck } from "lucide-react";
import { AGENDA_LOOKAHEAD_DAYS, JOB_ISSUE_LABEL, bookingToClose, formatAppointmentDate, formatAppointmentTime, formatAppointmentTimeRange, jobDayCount, invoiceToDo, issueToDoForProfessional, jobOccurrences, leadAudienceLabel, navigateUrl, scheduleChangeBetween, wallClockNow, wallClockToday, type AgendaAttention, type ChatAwaitingReply, type DayAhead, type ExternalJob, type MySubscription, type ProfessionalBooking, type ProfessionalInsights, type ProfessionalLead } from "@professionisti/shared";
import { Badge, Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { loadMyProfessionalProfile, loadMySubscription } from "@/lib/myProfessionalProfile";
import { useAuth } from "@/lib/AuthContext";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { subscribeRealtimeEvents } from "@/lib/realtimeBus";
import { classifyLeadStage } from "@/lib/requestStage";
import { formatCompetitors, leadDeadlines } from "@/lib/leadDeadline";
import { LoadErrorNotice } from "@/components/LoadErrorNotice";
import { CardButton } from "@/components/CardButton";
import { SkeletonSummaryRow } from "@/components/Skeleton";
import { SubscriptionPauseBanner } from "@/components/SubscriptionPauseBanner";
import { IssueSanctionBanner } from "@/components/IssueSanctionBanner";
import { AwayCard } from "@/components/AwayCard";
import { BoostSection } from "@/components/BoostSection";
import { SetupJourneyCard, SetupJourneyHero, journeyNeedsHero, useSetupJourney } from "@/components/verification/SetupJourney";
import { WeatherStrip, jobsHeadline, type DayJobRow } from "@/components/DaysAhead";
import { PageLoading } from "@/components/PageLoading";
import { ArrivalTimesNotice, tomorrowBandsWithoutArrival } from "@/components/ArrivalTimesNotice";

/** Applica una risposta dell'API dentro `startTransition` (vedi sotto, §345). */
function later<T>(apply: (value: T) => void): (value: T) => void {
  return (value) => startTransition(() => apply(value));
}

/**
 * Home "Oggi" del professionista (docs/CHANGELOG.md §147, decisione esplicita
 * dell'utente): una lista di cose da fare, non un secondo elenco di
 * richieste (quello vive in "Richieste e lavori"). In cima, sopra tutto, le
 * richieste da rispondere con la scadenza (§403) — in un mercato locale vince
 * chi risponde per primo (CLAUDE.md §8) — poi gli appuntamenti di oggi e domani, poi i propri
 * numeri rispetto alla zona, in fondo i pacchetti di visibilità. Modelli: Thumbtack Pro/Angi Pro per i lead,
 * Fresha/Treatwell per la giornata.
 */
export default function DashboardTodayPage() {
  const { user, token, isLoading } = useAuth();
  const [leads, setLeads] = useState<ProfessionalLead[] | null>(null);
  const [bookings, setBookings] = useState<ProfessionalBooking[] | null>(null);
  // Lavori aggiunti a mano: se non arrivano, restano solo le prenotazioni.
  const [externalJobs, setExternalJobs] = useState<ExternalJob[] | null>(null);
  // Meteo dei prossimi tre giorni (§333): se non arriva, la riga sparisce.
  const [daysAhead, setDaysAhead] = useState<DayAhead[] | null | "failed">(null);
  const [insights, setInsights] = useState<ProfessionalInsights | null>(null);
  // Chat in cui il cliente aspetta una risposta ("Ti stanno aspettando",
  // docs/changelog/2026-11-18-oggi-ti-stanno-aspettando.md): se non arrivano, nessuna riga.
  const [chatsWaiting, setChatsWaiting] = useState<ChatAwaitingReply[] | null>(null);
  const [waitingExpanded, setWaitingExpanded] = useState(false);
  // "Fatta" sulle fatture chieste: la riga resta con "Annulla" fino al prossimo caricamento.
  const [invoicesDone, setInvoicesDone] = useState<Record<string, true>>({});
  const [waitingActionError, setWaitingActionError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<MySubscription | null>(null);
  // Pausa scelta dal professionista (collaudo C-16): in Home solo mentre dura.
  const [awayUntil, setAwayUntil] = useState<string | null>(null);
  // Prestazioni nel profilo: con meno di 3, il promemoria "Aggiungi i lavori che fai".
  const [servicesCount, setServicesCount] = useState<number | null>(null);
  const [restrictions, setRestrictions] = useState<{ demotedUntil?: string | null; requestsBlockedUntil?: string | null } | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "Il tuo andamento" non caricato: la sezione si nasconde invece di
  // restare sugli scheletri (docs/CHANGELOG.md §286).
  const [insightsFailed, setInsightsFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [, setTick] = useState(0);
  // "Sto arrivando" in corso o non riuscito, per appuntamento (§353).
  const [onTheWaySending, setOnTheWaySending] = useState<string | null>(null);
  const [onTheWayError, setOnTheWayError] = useState<string | null>(null);
  // Professionista senza profilo (appena iscritto): nessuna chiamata che risponderebbe 404,
  // solo "Completa il tuo profilo" (prova da utente nuovo, docs/changelog/2026-11-05-prova-utente-nuovo.md).
  const noProfileYet = user?.professionalProfileId === null;
  const journey = useSetupJourney(user?.isProfessional && !noProfileYet ? token : null);
  // Profilo non ancora nelle ricerche (dati fiscali mancanti, profilo da confermare...).
  const profileHidden = journey.status?.publicVisible === false;

  // Le risposte dell'API aggiornano la pagina con `startTransition`, come
  // l'agenda (docs/CHANGELOG.md §345): sono una decina, e ognuna ridisegnava
  // tutta la pagina in un blocco unico che su un telefono lento la fermava
  // (TBT oltre il limite della prova Lighthouse,
  // docs/changelog/2026-11-02-oggi-piu-leggera.md). React ora disegna a
  // piccoli pezzi; l'aspetto finale e l'ordine in cui compaiono le parti non
  // cambiano. Le azioni del professionista ("Sto arrivando") restano immediate.
  useEffect(() => {
    if (!token || !user?.isProfessional) return;
    if (noProfileYet) return;
    const onError = later((err: unknown) => {
      if (err instanceof Error && err.message.includes("profilo")) setProfileMissing(true);
      else setError(err instanceof Error ? err.message : "Errore nel caricamento.");
    });
    apiClient.myLeads(token).then(later(setLeads)).catch(onError);
    apiClient.myProfessionalBookings(token).then(later(setBookings)).catch(onError);
    apiClient.myExternalJobs(token).then(later(setExternalJobs)).catch(later(() => setExternalJobs([])));
    apiClient.myChatsAwaitingReply(token).then(later(setChatsWaiting)).catch(later(() => setChatsWaiting([])));
    apiClient.agendaDaysAhead(token).then(later(setDaysAhead)).catch(later(() => setDaysAhead("failed")));
    apiClient.getMyInsights(token).then(later(setInsights)).catch(later(() => setInsightsFailed(true)));
    loadMySubscription(token).then(later(setSubscription)).catch(later(() => setSubscription(null)));
    loadMyProfessionalProfile(token)
      .then(
        later((p: Awaited<ReturnType<typeof loadMyProfessionalProfile>>) => {
          setRestrictions(p ? { demotedUntil: p.demotedUntil, requestsBlockedUntil: p.requestsBlockedUntil } : null);
          setAwayUntil(p?.awayUntil ?? null);
          setServicesCount(p ? p.services.length : null);
        }),
      )
      .catch(later(() => setRestrictions(null)));
  }, [token, user?.isProfessional, noProfileYet, loadAttempt]);

  // Aggiornamento in background (nuova richiesta, preventivo accettato, ecc.):
  // solo le liste che cambiano con una notifica, senza scheletri né messaggi
  // d'errore — se il giro fallisce restano i dati già mostrati.
  const refreshInBackground = useCallback(() => {
    if (!token) return;
    apiClient.myLeads(token).then(later(setLeads)).catch(() => {});
    apiClient.myProfessionalBookings(token).then(later(setBookings)).catch(() => {});
    apiClient.myExternalJobs(token).then(later(setExternalJobs)).catch(() => {});
    apiClient.myChatsAwaitingReply(token).then(later(setChatsWaiting)).catch(() => {});
    apiClient.agendaDaysAhead(token).then(later(setDaysAhead)).catch(() => {});
  }, [token]);
  useLiveRefresh(refreshInBackground, Boolean(token && user?.isProfessional && !noProfileYet));
  // Un messaggio in chat (del cliente o tuo da un'altra scheda) non è sempre una
  // notifica: la riga di "Ti stanno aspettando" compare o sparisce lo stesso,
  // senza ricaricare (docs/changelog/2026-11-18-oggi-ti-stanno-aspettando.md).
  useEffect(() => {
    if (!token || !user?.isProfessional || noProfileYet) return;
    return subscribeRealtimeEvents((event) => {
      if (event.kind === "chat_message") apiClient.myChatsAwaitingReply(token).then(later(setChatsWaiting)).catch(() => {});
    });
  }, [token, user?.isProfessional, noProfileYet]);

  // I conti alla rovescia si aggiornano da soli ogni minuto.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (isLoading) return <PageLoading />;

  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="9" paddingHorizontal="4">
        <YStack width="100%" maxWidth={480} gap="4" alignItems="center">
          <Text render="h1" margin={0} fontFamily="heading" fontWeight="800" fontSize="7" color={brand.inchiostro} textAlign="center">
            Accedi come professionista
          </Text>
          <Link href="/accedi?redirect=/dashboard" style={{ textDecoration: "none" }}>
            <Button tabIndex={-1} variant="primary">Accedi</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  if (!user.isProfessional) {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="9" paddingHorizontal="4">
        <Text color={brand.grafite70}>Questa sezione è riservata ai professionisti.</Text>
      </YStack>
    );
  }

  if (profileMissing || noProfileYet) {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="9" paddingHorizontal="4">
        <YStack width="100%" maxWidth={480} gap="4" alignItems="center">
          <Text render="h1" margin={0} fontFamily="heading" fontWeight="800" fontSize="7" color={brand.inchiostro} textAlign="center">
            Completa il tuo profilo per iniziare
          </Text>
          <Text color={brand.grafite70} textAlign="center">
            Serve un profilo completo (nome attività, categoria, città) per comparire in ricerca e ricevere richieste.
          </Text>
          <Link href="/dashboard/profilo" style={{ textDecoration: "none" }}>
            <Button tabIndex={-1} variant="primary">Completa profilo</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  const toAnswer = (leads ?? [])
    .filter((lead) => classifyLeadStage(lead) === "da_quotare")
    .sort((a, b) => (a.expiresAt ?? "9999").localeCompare(b.expiresAt ?? "9999"));
  const datesToConfirm = (leads ?? []).filter((lead) => lead.quote?.status === "MODIFICATION_REQUESTED" && lead.quote.clientProposedDate);
  // Appuntamenti già fissati che il cliente chiede di spostare: anche loro in
  // "Date proposte dai clienti", non solo in Agenda e Richieste
  // (docs/changelog/2026-11-18-spostamento-in-oggi.md, richiesta di Luca).
  const movesToConfirm = (bookings ?? []).filter((b) => b.status === "CONFIRMED" && b.dateChange?.proposedBy === "CLIENT");

  // "Ti stanno aspettando" (docs/changelog/2026-11-18-oggi-ti-stanno-aspettando.md):
  // tutto quello in cui un cliente aspetta il professionista, in una lista sola.
  // Prima i problemi segnalati (hanno una scadenza e un rimborso in gioco), poi
  // le date proposte, le chat (chi aspetta da più tempo per primo) e le fatture.
  const wallNow = wallClockNow();
  const issuesToDo = (bookings ?? [])
    .flatMap((booking) => {
      const todo = issueToDoForProfessional(booking.issue);
      return todo ? [{ booking, todo }] : [];
    })
    .sort((a, b) => (a.todo.dueAt ?? "9999").localeCompare(b.todo.dueAt ?? "9999"));
  const invoicesToDo = (bookings ?? []).filter((booking) => invoiceToDo(booking) || invoicesDone[booking.id]);
  // Una chat già in un'altra riga (richiesta da quotare, data proposta, problema) non si ripete.
  const coveredRequests = new Set(
    [
      ...toAnswer.map((lead) => lead.guidedRequest.id),
      ...datesToConfirm.map((lead) => lead.guidedRequest.id),
      ...movesToConfirm.map((booking) => booking.guidedRequestId),
      ...issuesToDo.map(({ booking }) => booking.guidedRequestId),
    ].filter((id): id is string => Boolean(id)),
  );
  const chatRows = (chatsWaiting ?? []).filter((chat) => !coveredRequests.has(chat.guidedRequestId));
  const waitingCount = issuesToDo.length + movesToConfirm.length + datesToConfirm.length + chatRows.length + invoicesToDo.length;
  // Appuntamenti già finiti ma non chiusi con "Lavoro terminato": il più recente per primo.
  // Quelli iniziati oggi restano in "Oggi e domani" (si chiudono da lì o dall'agenda): qui da domani, senza doppioni.
  const toClose = (bookings ?? [])
    .filter((booking) => bookingToClose(booking, wallNow) && new Date(booking.scheduledAt) < wallClockToday())
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));

  async function dismissChat(chat: ChatAwaitingReply) {
    if (!token) return;
    setWaitingActionError(null);
    setChatsWaiting((list) => list?.filter((row) => row.guidedRequestId !== chat.guidedRequestId) ?? list);
    try {
      await apiClient.dismissChatAwaitingReply(token, chat.guidedRequestId);
    } catch {
      setChatsWaiting((list) => (list ? [...list, chat].sort((a, b) => a.waitingSince.localeCompare(b.waitingSince)) : list));
      setWaitingActionError("Non siamo riusciti a toglierla, riprova.");
    }
  }

  async function markInvoice(booking: ProfessionalBooking, done: boolean) {
    if (!token) return;
    setWaitingActionError(null);
    try {
      const result = await apiClient.markClientInvoiceDone(token, booking.id, done);
      setInvoicesDone((map) => {
        const next = { ...map };
        if (done) next[booking.id] = true;
        else delete next[booking.id];
        return next;
      });
      setBookings((list) => list?.map((b) => (b.id === booking.id && b.invoiceRequest ? { ...b, invoiceRequest: { ...b.invoiceRequest, doneAt: result.doneAt } } : b)) ?? list);
    } catch {
      setWaitingActionError("Non siamo riusciti a salvarlo, riprova.");
    }
  }

  // Appuntamenti in ora di parete UTC: oggi e domani in Italia, docs/CHANGELOG.md §287.
  const startToday = wallClockToday();
  const endTomorrow = new Date(startToday);
  endTomorrow.setUTCDate(endTomorrow.getUTCDate() + 2);
  // Un lavoro su più giorni compare oggi e domani con l'orario di quel giorno (§310).
  // `navigateTo`: indirizzo per "Naviga" (§352), solo a lavoro confermato.
  // `onTheWay`: "Sto arrivando" (§353), solo per un appuntamento confermato a domicilio.
  // `end` e `arrival`: fascia completa e "Arrivo verso le" accanto al nome
  // (docs/changelog/2026-11-18-orari-oggi-e-giro.md, richiesta di Luca).
  type UpcomingRow = { key: string; href: string; at: string; end: string | null; arrival: string | null; title: string; sub: string; job: DayJobRow; navigateTo: string | null; onTheWay: { bookingId: string; sentAt: string | null } | null; phone: string | null; move: "CLIENT" | "PROFESSIONAL" | null; closeBookingId: string | null };
  const inWindow = (start: Date) => start >= startToday && start < endTomorrow;
  const upcoming: UpcomingRow[] = [
    ...(bookings ?? [])
      .filter((b) => b.status === "CONFIRMED" || b.status === "PENDING")
      .flatMap((booking) =>
        jobOccurrences(booking.scheduledAt, booking.scheduledEndAt)
          .filter((occurrence) => inWindow(occurrence.start))
          .map((occurrence) => ({
            key: `booking-${booking.id}-${occurrence.start.toISOString()}`,
            // Si apre l'appuntamento (indirizzo, Naviga, Chiama), non la richiesta (T3, §311).
            href: `/dashboard/agenda?booking=${booking.id}`,
            at: occurrence.start.toISOString(),
            end: occurrence.end?.toISOString() ?? null,
            // L'ora di arrivo vale per i lavori di un solo giorno, dentro la fascia (come in agenda).
            arrival: arrivalInBand(booking.arrivalTime, booking.scheduledAt, booking.scheduledEndAt),
            title: booking.clientName ?? "Cliente",
            sub:
              ([booking.street && booking.houseNumber ? `${booking.street} ${booking.houseNumber}` : null, booking.city ?? booking.address, booking.items[0]?.name].filter(Boolean).join(" · ") || "Intervento") +
              (booking.status === "PENDING" ? " · da confermare" : ""),
            job: { start: occurrence.start.toISOString(), end: occurrence.end?.toISOString() ?? null, city: booking.city, online: booking.serviceMode === "ONLINE" },
            navigateTo:
              booking.status === "CONFIRMED" && booking.serviceMode !== "ONLINE"
                ? booking.street && booking.houseNumber
                  ? `${booking.street} ${booking.houseNumber}, ${[booking.postalCode, booking.city].filter(Boolean).join(" ")}`
                  : booking.address
                : null,
            onTheWay: booking.status === "CONFIRMED" && booking.serviceMode !== "ONLINE" ? { bookingId: booking.id, sentAt: booking.onTheWayAt ?? null } : null,
            // Fascia già finita e lavoro non chiuso: "Lavoro terminato" al posto di Naviga e Sto arrivando
            // (docs/changelog/2026-11-18-oggi-ti-stanno-aspettando.md).
            closeBookingId: bookingToClose(booking, wallNow) ? booking.id : null,
            // Telefono solo a lavoro confermato (CLAUDE.md §5 punto 9).
            phone: booking.status === "CONFIRMED" ? (booking.recipientPhone ?? booking.clientPhone) : null,
            // Spostamento in sospeso: chiesto dal cliente o proposto da te.
            move: booking.dateChange?.proposedBy ?? null,
          })),
      ),
    // Anche i lavori aggiunti a mano in agenda (§333).
    ...(externalJobs ?? [])
      .filter((j) => j.status === "SCHEDULED")
      .flatMap((job) =>
        jobOccurrences(job.scheduledAt, job.scheduledEndAt)
          .filter((occurrence) => inWindow(occurrence.start))
          .map((occurrence) => ({
            key: `external-${job.id}-${occurrence.start.toISOString()}`,
            href: `/dashboard/agenda?esterno=${job.id}`,
            at: occurrence.start.toISOString(),
            end: occurrence.end?.toISOString() ?? null,
            arrival: null,
            title: job.clientName,
            sub: [job.address, job.description].filter(Boolean).join(" · ") || "Lavoro aggiunto da te",
            job: { start: occurrence.start.toISOString(), end: occurrence.end?.toISOString() ?? null, city: cityOfAddress(job.address), online: false },
            navigateTo: job.address,
            onTheWay: null,
            closeBookingId: null,
            phone: job.clientPhone,
            move: null,
          })),
      ),
  ].sort((a, b) => upcomingSortKey(a).localeCompare(upcomingSortKey(b)));

  /** Avvisa il cliente che stai arrivando, come dall'agenda (§353). */
  async function sendOnTheWay(bookingId: string) {
    if (!token) return;
    setOnTheWaySending(bookingId);
    setOnTheWayError(null);
    try {
      const result = await apiClient.notifyOnTheWay(token, bookingId);
      setBookings((list) => list?.map((b) => (b.id === bookingId ? { ...b, onTheWayAt: result.onTheWayAt } : b)) ?? list);
    } catch {
      setOnTheWayError(bookingId);
    } finally {
      setOnTheWaySending(null);
    }
  }

  const loading = leads === null || bookings === null || externalJobs === null;
  const arrivalBands = tomorrowBandsWithoutArrival(bookings ?? []);
  // Tutto quello che sta sotto "Oggi e domani" compare insieme, quando sono
  // arrivati richieste, appuntamenti e percorso del profilo: arrivando in
  // momenti diversi si spingevano giù a vicenda (CLS, docs/CHANGELOG.md §334).
  // Un errore si mostra subito.
  const ready = (!loading || Boolean(error)) && journey.settled;
  // In cima solo senza appuntamenti oggi e domani: il prossimo lavoro deve
  // restare in vista senza scorrere (T2, docs/CHANGELOG.md §311).
  const heroJourney = journeyNeedsHero(journey.steps) && !loading && upcoming.length === 0 ? journey.steps : null;
  // Con un appuntamento lo stesso riquadro va subito sotto "Oggi e domani"
  // (scelta di Luca del 05/11), non più il riquadro piccolo a destra.
  const journeyBelowJobs = journeyNeedsHero(journey.steps) && !loading && upcoming.length > 0 ? journey.steps : null;
  // Appena iscritto, nulla in agenda né da rispondere: una sola riga vuota
  // invece di tre sezioni vuote, così resta in vista "Completa il profilo"
  // (docs/changelog/2026-11-05-completa-profilo-in-evidenza.md).
  const quietStart = Boolean(heroJourney) && !loading && !error && upcoming.length === 0 && toAnswer.length === 0 && waitingCount === 0 && toClose.length === 0;
  const greetingName = user.businessName ?? user.name ?? "";
  const showToAnswerOnTop = !loading && !error && toAnswer.length > 0;
  const showWaitingOnTop = !loading && !error && waitingCount > 0;
  // Niente da rispondere, nessuno che aspetta e nessun lavoro da chiudere: lo si dice, in verde.
  const allDone = ready && !error && !quietStart && chatsWaiting !== null && toAnswer.length === 0 && waitingCount === 0 && toClose.length === 0;

  // Un lavoro in corso o che inizia entro 2 ore: "Oggi e domani" sale sotto le sole richieste nuove,
  // il prossimo lavoro deve vedersi senza scorrere (T2, docs/CHANGELOG.md §311;
  // docs/changelog/2026-11-18-oggi-ti-stanno-aspettando.md).
  const soonLimit = wallNow.getTime() + JOB_SOON_MS;
  const jobSoon =
    !loading &&
    !error &&
    upcoming.some((row) => {
      if (row.closeBookingId) return false;
      const start = new Date(row.arrival ? `${row.at.slice(0, 11)}${row.arrival}:00.000Z` : row.at).getTime();
      const end = row.end ? new Date(row.end).getTime() : start + 60 * 60_000;
      return start <= soonLimit && end > wallNow.getTime();
    });
  const todayAndTomorrow = (error ? null : loading ? (
                  <Skeletons />
                ) : (
                <TodaySection title="Oggi e domani" action={{ href: "/dashboard/agenda", label: "Apri l'agenda" }}>
                  {daysAhead === "failed" ? null : <WeatherStrip days={daysAhead} />}
                  {upcoming.length === 0 ? (
                    <EmptyLine text={quietStart ? "Nessun appuntamento né richiesta per ora: ti avvisiamo appena ne arriva una." : "Nessun appuntamento oggi e domani."} />
                  ) : (
                    upcoming.map(({ key, href, at, end, arrival, title, sub, navigateTo, onTheWay, phone, move, closeBookingId }, index) => (
                      <Fragment key={key}>
                        {/* I lavori raggruppati per giorno, con il riepilogo sopra (§333). */}
                        {index === 0 || upcoming[index - 1]!.at.slice(0, 10) !== at.slice(0, 10) ? (
                          <div className="today-day-head">
                            <strong>{at.slice(0, 10) === startToday.toISOString().slice(0, 10) ? "Oggi" : "Domani"}</strong>
                            <span>{jobsHeadline(upcoming.filter((row) => row.at.slice(0, 10) === at.slice(0, 10)).map((row) => row.job))}</span>
                          </div>
                        ) : null}
                        <div className="today-appt">
                          <Link href={href} className="today-row">
                            <span className="today-time">
                              <span className="today-time-band">{formatAppointmentTimeRange(at, end)}</span>
                              {arrival ? (
                                <span className="today-time-arrival" aria-label={`Arrivo verso le ${arrival}`}>
                                  <Clock size={13} aria-hidden /> Arrivo {arrival}
                                </span>
                              ) : null}
                            </span>
                            <span className="today-row-main">
                              <strong>{title}</strong>
                              <span className="today-row-sub">{sub}</span>
                              {move ? (
                                <span className={move === "CLIENT" ? "today-move is-asked" : "today-move"}>
                                  {move === "CLIENT" ? "Il cliente chiede di spostarlo" : "Nuova data proposta: in attesa del cliente"}
                                </span>
                              ) : null}
                            </span>
                          </Link>
                          {/* "Naviga" e "Sto arrivando" diretti sui lavori di oggi
                              (§352-§353): prima serviva aprire l'agenda e poi l'appuntamento. */}
                          {at.slice(0, 10) === startToday.toISOString().slice(0, 10) && (navigateTo || onTheWay || phone || closeBookingId) ? (
                            <div className="today-appt-actions">
                              {closeBookingId ? (
                                <Link className="today-nav" href={`/dashboard/agenda?booking=${closeBookingId}&termina=1`}>
                                  <Check size={16} aria-hidden /> Lavoro terminato
                                </Link>
                              ) : null}
                              {navigateTo && !closeBookingId ? (
                                <a className="today-nav" href={navigateUrl(navigateTo)} target="_blank" rel="noreferrer" aria-label={`Naviga verso ${navigateTo}`}>
                                  <Navigation size={16} aria-hidden /> Naviga
                                </a>
                              ) : null}
                              {onTheWay && !closeBookingId ? (
                                onTheWay.sentAt ? (
                                  <span className="today-nav is-done" aria-live="polite">
                                    <Check size={16} aria-hidden /> Avvisato alle {formatAppointmentTime(wallClockNow(new Date(onTheWay.sentAt)))}
                                  </span>
                                ) : (
                                  <button type="button" className="today-nav is-secondary" disabled={onTheWaySending === onTheWay.bookingId} onClick={() => void sendOnTheWay(onTheWay.bookingId)}>
                                    <Truck size={16} aria-hidden /> {onTheWaySending === onTheWay.bookingId ? "Invio..." : "Sto arrivando"}
                                  </button>
                                )
                              ) : null}
                              {/* "Chiama" come in agenda (§354); da telefono solo l'icona. */}
                              {phone ? (
                                <a className="today-nav is-secondary is-call" href={`tel:${phone.replace(/\s+/g, "")}`} aria-label={`Chiama ${phone}`}>
                                  <Phone size={16} aria-hidden /> <span className="today-nav-text">Chiama</span>
                                </a>
                              ) : null}
                              {onTheWay && onTheWayError === onTheWay.bookingId ? (
                                <span className="today-nav-error" role="alert">
                                  Avviso non inviato, riprova.
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </Fragment>
                    ))
                  )}
                </TodaySection>
                ));

  return (
    <YStack width="100%" alignItems="center" paddingVertical="6" paddingHorizontal="4">
      <YStack width="100%" maxWidth={1180} gap="6">
        <YStack gap="1">
          <Text render="h1" margin={0} fontFamily="heading" fontWeight="800" fontSize="8" color={brand.inchiostro}>
            Oggi
          </Text>
          <Text color={brand.grafite70}>
            {greetingName ? `Ciao ${greetingName}, ` : ""}
            {new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
          </Text>
        </YStack>


        {subscription ? <SubscriptionPauseBanner sub={subscription} profileStepsElsewhere /> : null}
        {restrictions ? <IssueSanctionBanner {...restrictions} /> : null}
        {token ? <AwayCard token={token} awayUntil={awayUntil} onChange={setAwayUntil} onlyWhenAway /> : null}
        {/* Preventivi da mandare e date proposte dai clienti in cima a tutto,
            sopra meteo e lavori, a tutta larghezza anche sul computer
            (docs/CHANGELOG.md §403, Luca: "è la cosa più importante"). Senza
            nulla a cui rispondere la pagina resta com'era. */}
        {showToAnswerOnTop ? (
          <TodaySection title="Da rispondere ora" count={toAnswer.length} action={{ href: "/dashboard/richieste", label: "Tutte le richieste" }}>
            {/* Da telefono le prime 3, dal computer le prime 5: sotto restano
                vicini i lavori di oggi (§403). */}
            {toAnswer.slice(0, 5).map((lead, index) => (
              <LeadToAnswerRow key={lead.id} lead={lead} extra={index >= PHONE_TO_ANSWER} />
            ))}
            {toAnswer.length > PHONE_TO_ANSWER ? (
              <Link href="/dashboard/richieste" className={`today-more${toAnswer.length > 5 ? "" : " is-phone-only"}`}>
                Vedi tutte le {toAnswer.length} richieste →
              </Link>
            ) : null}
          </TodaySection>
        ) : null}
        {/* Lavoro entro 2 ore: subito sotto le richieste nuove (che restano prime, §403)
            e sopra "Ti stanno aspettando" (docs/changelog/2026-11-18-oggi-ti-stanno-aspettando.md). */}
        {jobSoon ? todayAndTomorrow : null}
        {/* "Ti stanno aspettando" (docs/changelog/2026-11-18-oggi-ti-stanno-aspettando.md):
            tutto quello in cui un cliente aspetta te, in cima come le richieste
            (§403). Prende il posto di "Date proposte dai clienti" e della
            tessera "Messaggi non letti". Da telefono le prime 3, dal computer 5. */}
        {showWaitingOnTop ? (
          <TodaySection title="Ti stanno aspettando" count={waitingCount}>
            {[
              ...issuesToDo.map(({ booking, todo }) => (
                <Link
                  key={`issue-${booking.id}`}
                  href={booking.guidedRequestId ? `/dashboard/richieste?open=${booking.guidedRequestId}${todo.kind === "CHAT_REPLY" ? "&chat=1" : ""}` : `/dashboard/agenda?booking=${booking.id}`}
                  className="today-row"
                >
                  <span className="today-row-main">
                    <span className="today-row-kind is-issue">Problema segnalato</span>
                    <strong>
                      {booking.issue ? JOB_ISSUE_LABEL[booking.issue.type] : "Problema"} · {booking.clientName ?? "Cliente"}
                    </strong>
                    <span className="today-row-sub">{todo.label}</span>
                    {todo.dueAt ? (
                      <span className="today-row-meta">
                        <span className="today-deadline is-urgent">Entro {formatRealDateTime(todo.dueAt)}</span>
                      </span>
                    ) : null}
                  </span>
                  <span className="today-row-cta">Rispondi</span>
                </Link>
              )),
              ...movesToConfirm.map((booking) => (
              <Link
                key={booking.id}
                href={booking.guidedRequestId ? `/dashboard/richieste?open=${booking.guidedRequestId}` : `/dashboard/agenda?booking=${booking.id}`}
                className="today-row"
              >
                <span className="today-row-main">
                  <span className="today-row-kind">Nuova data</span>
                  <strong>
                    {booking.categoryLabel ?? "Appuntamento"} · {booking.clientName ?? "Cliente"}
                  </strong>
                  <span className="today-row-sub">
                    Chiede di spostarlo da {formatDateTime(booking.scheduledAt)} a {formatDateTime(booking.dateChange!.start)}
                  </span>
                </span>
                <span className="today-row-cta">Rispondi</span>
              </Link>
            )),
              ...datesToConfirm.map((lead) => (
              <Link key={lead.id} href={`/dashboard/richieste?open=${lead.guidedRequest.id}`} className="today-row">
                <span className="today-row-main">
                  <span className="today-row-kind">Nuova data</span>
                  <strong>
                    {lead.guidedRequest.categoryLabel} · {lead.guidedRequest.clientName ?? "Cliente"}
                  </strong>
                  <span className="today-row-sub">
                    {/* Stessa data e stesso orario: solo una nota (docs/CHANGELOG.md §196). */}
                    {scheduleChangeBetween(
                      { start: lead.quote!.estimatedStartDate, end: lead.quote!.estimatedEndDate },
                      { start: lead.quote!.clientProposedDate!, end: lead.quote!.clientProposedEndDate },
                    )
                      ? "Nuova data proposta"
                      : "Nota aggiunta, stessa data"}
                    : {formatDateTime(lead.quote!.clientProposedDate!)}
                  </span>
                </span>
                <span className="today-row-cta">Rispondi</span>
              </Link>
            )),
              ...chatRows.map((chat) => (
                <div key={`chat-${chat.guidedRequestId}`} className="today-appt">
                  <Link href={`/dashboard/richieste?open=${chat.guidedRequestId}&chat=1`} className="today-row">
                    <span className="today-row-main">
                      <span className="today-row-kind">{chat.messageCount > 1 ? `${chat.messageCount} messaggi` : "Messaggio"}</span>
                      <strong>
                        {chat.clientName} · {chat.categoryLabel}
                      </strong>
                      <span className="today-row-sub">{chat.lastMessage ? `«${truncate(chat.lastMessage, 90)}»` : chat.lastMessageHasMedia ? "Ti ha mandato una foto o un video" : "Ti ha scritto"}</span>
                      <span className="today-row-meta">
                        <span className={isOlderThanDay(chat.waitingSince) ? "today-deadline" : "today-competitors"}>Aspetta da {waitingFor(chat.waitingSince)}</span>
                      </span>
                    </span>
                    <span className="today-row-cta">Rispondi</span>
                  </Link>
                  {/* Per un "Grazie, a domani": la riga sparisce finché il cliente non riscrive. */}
                  <div className="today-appt-actions">
                    <button type="button" className="today-quiet" onClick={() => void dismissChat(chat)}>
                      Non serve risposta
                    </button>
                  </div>
                </div>
              )),
              ...invoicesToDo.map((booking) => {
                const receipt = booking.clientDocumentKind === "RECEIPT";
                const done = Boolean(invoicesDone[booking.id]);
                return (
                  <div key={`invoice-${booking.id}`} className="today-appt">
                    <Link
                      href={receipt ? `/dashboard/documenti/cortesia/${booking.id}` : booking.guidedRequestId ? `/dashboard/richieste?open=${booking.guidedRequestId}` : `/dashboard/agenda?booking=${booking.id}`}
                      className="today-row"
                    >
                      <span className="today-row-main">
                        <span className="today-row-kind">{receipt ? "Ricevuta chiesta" : "Fattura chiesta"}</span>
                        <strong>
                          {booking.clientName ?? "Cliente"} · {booking.categoryLabel ?? "Lavoro"}
                        </strong>
                        <span className="today-row-sub">
                          {done ? "Segnata come fatta" : receipt ? "Preparala e scarica il PDF da dare al cliente" : `Lavoro del ${formatAppointmentDate(booking.scheduledAt, { day: "numeric", month: "long" })}: i dati da copiare sono nella scheda`}
                        </span>
                      </span>
                      <span className="today-row-cta">{receipt ? "Prepara" : "Vedi i dati"}</span>
                    </Link>
                    {/* La fattura la fa col suo programma: qui la segna come fatta. La ricevuta sparisce da sola col PDF scaricato. */}
                    {receipt ? null : (
                      <div className="today-appt-actions">
                        <button type="button" className={done ? "today-quiet" : "today-nav is-secondary"} onClick={() => void markInvoice(booking, !done)}>
                          {done ? "Annulla" : (
                            <>
                              <Check size={16} aria-hidden /> Fatta
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                );
              }),
            ].map((row, index) => (
              <div key={row.key} className={index >= WAITING_SHOWN_COMPUTER && !waitingExpanded ? "today-item is-hidden" : index >= PHONE_TO_ANSWER && !waitingExpanded ? "today-item is-phone-hidden" : "today-item"}>
                {row}
              </div>
            ))}
            {waitingActionError ? (
              <span className="today-nav-error" role="alert">
                {waitingActionError}
              </span>
            ) : null}
            {!waitingExpanded && waitingCount > PHONE_TO_ANSWER ? (
              <button type="button" className={`today-more${waitingCount > WAITING_SHOWN_COMPUTER ? "" : " is-phone-only"}`} onClick={() => setWaitingExpanded(true)}>
                Vedi tutte le {waitingCount} voci
              </button>
            ) : null}
          </TodaySection>
        ) : null}
        {allDone ? (
          <div className="today-alldone" role="status">
            <CheckCircle2 size={20} aria-hidden />
            <span>
              <strong>Tutto fatto.</strong> Nessun cliente ti sta aspettando: ti avvisiamo appena arriva una richiesta.
            </span>
          </div>
        ) : null}
        {/* Manca un passo obbligatorio del percorso: "Completa il profilo" qui,
            a tutta larghezza, sotto le sole richieste da rispondere
            (docs/changelog/2026-11-05-completa-profilo-in-evidenza.md). */}
        {ready && heroJourney ? <SetupJourneyHero steps={heroJourney} /> : null}
        {/* Due colonne quando c'è spazio (docs/CHANGELOG.md §334): a sinistra il
            lavoro (appuntamenti, richieste, andamento), a destra percorso del
            profilo, avvisi e visibilità. Stretto, `today-col` non conta e `order` rimette tutto
            nell'ordine di sempre: prima il prossimo lavoro, poi il percorso. */}
        <div className="today-wrap">
          <div className="today-grid">
            <div className="today-col">
              <div className="today-slot" style={{ order: 1 }}>
                {/* Il prossimo lavoro prima di tutto il resto: mezz'ora prima deve vedersi
                    senza scorrere (T2 del test dei compiti, docs/CHANGELOG.md §311). */}
                {/* Finché richieste e lavori non arrivano solo uno scheletro senza
                    titolo: con le richieste in cima, "Oggi e domani" già disegnato
                    sarebbe poi scivolato giù (CLS, §334, §403). */}
                {jobSoon ? null : todayAndTomorrow}
                {/* Domani più lavori nella stessa fascia lunga senza ora: si chiede verso che ora passa (docs/changelog/2026-11-11-fasce-ampie.md). */}
                {!loading && !error ? (
                  <ArrivalTimesNotice
                    token={token}
                    bands={arrivalBands}
                    onSaved={(id, arrivalTime) => setBookings((list) => list?.map((b) => (b.id === id ? { ...b, arrivalTime } : b)) ?? list)}
                  />
                ) : null}
                {/* Lavori finiti ma non chiusi (docs/changelog/2026-11-18-oggi-ti-stanno-aspettando.md):
                    da "Lavoro terminato" partono saldo, recensione e conteggio dei lavori. */}
                {!loading && !error && toClose.length > 0 ? (
                  <TodaySection title="Lavori da chiudere" count={toClose.length}>
                    {toClose.slice(0, WAITING_SHOWN_COMPUTER).map((booking, index) => (
                      <Link
                        key={booking.id}
                        href={`/dashboard/agenda?booking=${booking.id}&termina=1`}
                        className={index >= PHONE_TO_ANSWER ? "today-row is-phone-hidden" : "today-row"}
                      >
                        <span className="today-row-main">
                          <strong>
                            {booking.clientName ?? "Cliente"} · {booking.categoryLabel ?? "Intervento"}
                          </strong>
                          <span className="today-row-sub">
                            {formatAppointmentDate(booking.scheduledAt, { weekday: "long", day: "numeric", month: "long" })}: segna l&apos;importo finale, così parte la richiesta di recensione
                          </span>
                        </span>
                        <span className="today-row-cta">Lavoro terminato</span>
                      </Link>
                    ))}
                    {toClose.length > PHONE_TO_ANSWER ? (
                      <Link href="/dashboard/richieste?stage=accettata" className={`today-more${toClose.length > WAITING_SHOWN_COMPUTER ? "" : " is-phone-only"}`}>
                        Vedi tutti i {toClose.length} lavori →
                      </Link>
                    ) : null}
                  </TodaySection>
                ) : null}
                {ready && journeyBelowJobs ? <SetupJourneyHero steps={journeyBelowJobs} /> : null}
              </div>
              {!ready ? null : (
                <>
                  {/* Richieste e date proposte sono salite in cima (§403): qui restano
                      i messaggi non letti e, senza richieste, la riga vuota. */}
                  <div className="today-slot" style={{ order: toAnswer.length > 0 ? 2 : 4 }}>
                    {/* Richieste e lavori non caricati: "Riprova" invece di scheletri
                        infiniti e di un messaggio tecnico (docs/CHANGELOG.md §286). */}
                    {error ? (
                      <LoadErrorNotice
                        title="Non riusciamo a caricare richieste e appuntamenti"
                        onRetry={() => {
                          setError(null);
                          setLeads(null);
                          setBookings(null);
                          setExternalJobs(null);
                          setInsightsFailed(false);
                          setLoadAttempt((n) => n + 1);
                        }}
                      />
                    ) : (
                      <>
                        {/* I messaggi da leggere sono ora le righe di "Ti stanno aspettando",
                            e la pagina senza nulla da fare dice "Tutto fatto" in cima
                            (docs/changelog/2026-11-18-oggi-ti-stanno-aspettando.md): qui
                            non resta più la riga vuota "Nessuna richiesta in attesa". */}


                </>
                )}
              </div>
              <div className="today-slot" style={{ order: 6 }}>
                {insightsFailed || (quietStart && (!insights || insightsEmpty(insights))) ? null : (
                  <TodaySection title="Il tuo andamento" subtitle={insights && !insightsEmpty(insights) ? `Rispetto agli altri professionisti di ${insights.areaLabel}` : undefined}>
                    {/* Senza dati una riga, non tre tessere con "0" e "—" (§352). */}
                    {!insights ? <Skeletons /> : insightsEmpty(insights) ? <EmptyLine text="I tuoi numeri compaiono con le prime visite al profilo e le prime risposte." /> : <InsightsGrid insights={insights} />}
                  </TodaySection>
                )}

                {/* Consigli sulle visite solo a chi compare già nelle ricerche (prova da utente nuovo, 04/11/2026). */}
                {insights && !profileHidden && !quietStart ? <Suggestion insights={insights} /> : null}
              </div>
              </>
              )}
            </div>
            <div className="today-col">
              {ready ? (
                <>
                  <div className="today-slot" style={{ order: 3 }}>
                    {heroJourney || journeyBelowJobs ? null : <SetupJourneyCard steps={journey.steps} />}
                  </div>
                  {user.agendaAttention ? (
                    <div className="today-slot" style={{ order: 5 }}>
                      <AgendaNotice attention={user.agendaAttention} />
                    </div>
                  ) : null}
                  {/* Prestazioni (docs/changelog/2026-11-17-prestazioni-veloci.md): a chi compare
                      già nelle ricerche e ne ha meno di tre, perché ognuna lo fa trovare. */}
                  {!profileHidden && servicesCount !== null && servicesCount < SERVICES_REMINDER_BELOW ? (
                    <div className="today-slot" style={{ order: 5 }}>
                      <ServicesNotice count={servicesCount} />
                    </div>
                  ) : null}
                  {/* Il canale del professionista (docs/changelog/2026-11-08-canale-del-professionista.md):
                      sempre in vista a chi compare già nelle ricerche, perché i suoi clienti sono la prima domanda al lancio. */}
                  {profileHidden ? null : (
                    <div className="today-slot" style={{ order: 6 }}>
                      <PersonalLinkNotice />
                    </div>
                  )}
                  {/* Pacchetti di visibilità in fondo alla pagina (docs/CHANGELOG.md §252), non a chi
                      non compare ancora nelle ricerche: prima i passi di "Per ricevere lavori". */}
                  {profileHidden ? null : (
                    <div className="today-slot" style={{ order: 7 }}>
                      <BoostSection />
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      </YStack>
    </YStack>
  );
}

function TodaySection({ title, subtitle, count, action, children }: { title: string; subtitle?: string; count?: number; action?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <YStack gap="3">
      <XStack justifyContent="space-between" alignItems="flex-end" gap="2" flexWrap="wrap">
        {/* flexShrink: senza, il sottotitolo lungo su una riga allargava la
            pagina a 470px su telefono (docs/CHANGELOG.md §349, bug 1). */}
        <YStack flex={1} flexShrink={1} minWidth={0}>
          <XStack alignItems="center" gap="2">
            <Text fontFamily="heading" fontWeight="800" fontSize="6" color={brand.grafite}>
              {title}
            </Text>
            {count ? <span className="today-count">{count}</span> : null}
          </XStack>
          {subtitle ? (
            <Text fontSize={13} color={brand.grafite70}>
              {subtitle}
            </Text>
          ) : null}
        </YStack>
        {action ? (
          <Link href={action.href} style={{ color: brand.cianografiaScuro, fontWeight: 600, fontSize: 16, textDecoration: "none", display: "inline-flex", alignItems: "center", minHeight: 44 }}>
            {action.label} →
          </Link>
        ) : null}
      </XStack>
      <div className="today-list">{children}</div>
    </YStack>
  );
}

/** Richieste mostrate da telefono in "Da rispondere ora"; le altre con "Vedi tutte" (§403). */
const PHONE_TO_ANSWER = 3;
/** Entro quanto un lavoro porta "Oggi e domani" in cima alla pagina. */
const JOB_SOON_MS = 2 * 60 * 60_000;
/** Voci di "Ti stanno aspettando" e "Lavori da chiudere" mostrate dal computer prima di "Vedi tutte". */
const WAITING_SHOWN_COMPUTER = 5;

function LeadToAnswerRow({ lead, extra = false }: { lead: ProfessionalLead; extra?: boolean }) {
  const deadlines = leadDeadlines(lead);
  const competitors = formatCompetitors(lead.competitors);
  // Quando il cliente ha scelto proprio te, come in Richieste e lavori
  // (docs/changelog/2026-11-10-richiesta-solo-per-te.md); le altre hanno già
  // la riga "N altri professionisti".
  const personal = lead.guidedRequest.fromProfessionalLink
    ? "Dal tuo link · fuori abbonamento"
    : lead.audience?.kind === "direct" || lead.audience?.kind === "chosen"
      ? leadAudienceLabel(lead.audience)
      : null;
  return (
    <Link href={`/dashboard/richieste?open=${lead.guidedRequest.id}`} className={extra ? "today-row is-phone-hidden" : "today-row"}>
      <span className="today-row-main">
        {/* Etichetta "Urgente" come in Richieste e lavori, non più l'emoji 🔴 (§352). */}
        {/* Etichette sulla stessa riga, non una sotto l'altra. */}
        {lead.guidedRequest.isUrgent || personal ? (
          <span className="today-row-badges">
            {lead.guidedRequest.isUrgent ? <Badge variant="urgente">Urgente</Badge> : null}
            {personal ? <Badge variant="fatto">{personal}</Badge> : null}
          </span>
        ) : null}
        <strong>
          {lead.guidedRequest.categoryLabel} · {lead.guidedRequest.city}
        </strong>
        <span className="today-row-sub">{truncate(lead.guidedRequest.description, 110)}</span>
        <span className="today-row-meta">
          {deadlines.map((deadline) => (
            <span key={deadline.label} className={deadline.urgent ? "today-deadline is-urgent" : "today-deadline"}>
              {deadline.label}
            </span>
          ))}
          {competitors ? <span className="today-competitors">{competitors}</span> : null}
        </span>
      </span>
      <span className="today-row-cta">Invia preventivo</span>
    </Link>
  );
}

function InsightsGrid({ insights }: { insights: ProfessionalInsights }) {
  const cells: { label: string; value: string; compare: string | null; isText?: boolean; extra?: string | null }[] = [
    // Niente "0" e "Media della zona: 0" finché nessuno ha visite: si legge "Nessuna ancora"
    // (docs/changelog/2026-11-08-prova-persone-simulate.md).
    insights.profileViews30d === 0 && !insights.areaAvgProfileViews30d
      ? { label: "Visite al profilo (30 giorni)", value: "Nessuna ancora", compare: null, isText: true }
      : {
          label: "Visite al profilo (30 giorni)",
          value: String(insights.profileViews30d),
          compare: insights.areaAvgProfileViews30d ? `Media della zona: ${insights.areaAvgProfileViews30d}` : null,
        },
    {
      label: "Tempo medio di risposta",
      value: insights.avgResponseTimeMinutes !== null ? formatMinutes(insights.avgResponseTimeMinutes) : "—",
      compare: insights.areaAvgResponseTimeMinutes !== null ? `Media della zona: ${formatMinutes(insights.areaAvgResponseTimeMinutes)}` : null,
      // In chat, di solito (docs/changelog/2026-11-18-oggi-ti-stanno-aspettando.md): una riga sotto, con la zona.
      extra:
        insights.chatReplyMinutes != null
          ? `In chat di solito ${formatMinutes(insights.chatReplyMinutes)}${insights.areaChatReplyMinutes != null ? ` (zona ${formatMinutes(insights.areaChatReplyMinutes)})` : ""}`
          : null,
    },
    // Senza recensioni "Nessuna ancora", non "—" e "0 recensioni" (§353).
    insights.reviewCount === 0
      ? { label: "Recensioni", value: "Nessuna ancora", compare: null, isText: true }
      : {
          label: "Recensioni",
          value: insights.rating !== null ? `${insights.rating.toLocaleString("it-IT")} ★` : "—",
          compare: `${insights.reviewCount} recension${insights.reviewCount === 1 ? "e" : "i"}`,
        },
  ];
  return (
    <div className="today-kpis today-insights">
      {cells.map((cell) => (
        <div key={cell.label} className="admin-kpi">
          <span className="admin-kpi-label">{cell.label}</span>
          <span className={cell.isText ? "admin-kpi-value is-text" : "admin-kpi-value"}>{cell.value}</span>
          {cell.compare ? <span style={{ fontSize: 13, color: "#5e5a54", fontWeight: 600 }}>{cell.compare}</span> : null}
          {cell.extra ? <span style={{ fontSize: 13, color: "#5e5a54", fontWeight: 600 }}>{cell.extra}</span> : null}
        </div>
      ))}
    </div>
  );
}

/** Profilo nuovo: nessuna visita, nessuna risposta, nessuna recensione. */
function insightsEmpty(insights: ProfessionalInsights): boolean {
  return insights.profileViews30d === 0 && insights.avgResponseTimeMinutes === null && insights.reviewCount === 0;
}

/** Agenda vuota o senza disponibilità nei prossimi giorni: una riga sola, sparisce appena se ne aggiunge una. */
function AgendaNotice({ attention }: { attention: AgendaAttention }) {
  const empty = attention === "EMPTY";
  return (
    <XStack gap="3" alignItems="center" padding="4" borderRadius={16} backgroundColor={brand.cianografiaVelo} flexWrap="wrap" role="status">
      {/* Icona e testo restano sulla stessa riga: su telefono va a capo solo il pulsante. */}
      <XStack flex={1} minWidth={240} gap="3" alignItems="center">
        <YStack width={40} height={40} borderRadius={999} alignItems="center" justifyContent="center" backgroundColor="#FFFFFF" flexShrink={0} aria-hidden>
          <Icon name="calendar" size={20} color={brand.cianografiaScuro} />
        </YStack>
        <YStack flex={1} minWidth={0} gap={2}>
          <Text fontWeight="800" color={brand.grafite}>
            {empty ? "Inserisci le tue disponibilità" : "Aggiungi disponibilità per i prossimi giorni"}
          </Text>
          <Text fontSize={16} color={brand.grafite70}>
            {empty ? "I clienti vedono quando sei libero e ti prenotano prima." : `Nei prossimi ${AGENDA_LOOKAHEAD_DAYS} giorni non hai orari liberi in agenda.`}
          </Text>
        </YStack>
      </XStack>
      <Link href="/dashboard/agenda?tab=disponibilita" style={{ textDecoration: "none" }}>
        <CardButton tabIndex={-1}>Apri l'agenda</CardButton>
      </Link>
    </XStack>
  );
}

/** Sotto questo numero di prestazioni, in Oggi il promemoria per aggiungerne. */
const SERVICES_REMINDER_BELOW = 3;

/** "Aggiungi i lavori che fai": ogni prestazione fa trovare il professionista quando un cliente descrive quel problema. */
function ServicesNotice({ count }: { count: number }) {
  return (
    <XStack gap="3" alignItems="center" padding="4" borderRadius={16} backgroundColor={brand.cianografiaVelo} flexWrap="wrap">
      <XStack flex={1} minWidth={240} gap="3" alignItems="center">
        <YStack width={40} height={40} borderRadius={999} alignItems="center" justifyContent="center" backgroundColor="#FFFFFF" flexShrink={0} aria-hidden>
          <Icon name="search" size={20} color={brand.cianografiaScuro} />
        </YStack>
        <YStack flex={1} minWidth={0} gap={2}>
          <Text fontWeight="800" color={brand.grafite}>
            Aggiungi i lavori che fai
          </Text>
          <Text fontSize={16} color={brand.grafite70}>
            {count === 0 ? "Non ne hai ancora: ognuno ti fa trovare dai clienti che descrivono quel problema." : `Ne hai ${count}: ognuno in più ti fa trovare dai clienti che descrivono quel problema.`}
          </Text>
        </YStack>
      </XStack>
      <Link href="/dashboard/profilo?campo=prestazioni" style={{ textDecoration: "none" }}>
        <CardButton tabIndex={-1}>Aggiungi lavori</CardButton>
      </Link>
    </XStack>
  );
}

/** "Il tuo link": i clienti tuoi che passano dal sito non contano nei lavori del mese. */
function PersonalLinkNotice() {
  return (
    <XStack gap="3" alignItems="center" padding="4" borderRadius={16} backgroundColor={brand.calce} borderWidth={1} borderColor={brand.filetto} flexWrap="wrap">
      <XStack flex={1} minWidth={240} gap="3" alignItems="center">
        <YStack width={40} height={40} borderRadius={999} alignItems="center" justifyContent="center" backgroundColor={brand.cianografiaVelo} flexShrink={0} aria-hidden>
          <Icon name="share-2" size={20} color={brand.cianografiaScuro} />
        </YStack>
        <YStack flex={1} minWidth={0} gap={2}>
          <Text fontWeight="800" color={brand.grafite}>
            Porta i tuoi clienti
          </Text>
          <Text fontSize={16} color={brand.grafite70}>
            I lavori dal tuo link{" "}
            <Text render="span" fontWeight="700" color={brand.verificato}>
              non contano nel tuo abbonamento
            </Text>
            .
          </Text>
        </YStack>
      </XStack>
      <Link href="/dashboard/il-tuo-link" style={{ textDecoration: "none" }}>
        <CardButton>Il tuo link</CardButton>
      </Link>
    </XStack>
  );
}

/** Un solo suggerimento alla volta, solo quando c'è un motivo concreto (nessun acquisto: l'upsell si decide a parte). */
function Suggestion({ insights }: { insights: ProfessionalInsights }) {
  let text: string | null = null;
  let href = "/dashboard/profilo";
  let cta = "Vai al profilo";
  if (insights.avgResponseTimeMinutes !== null && insights.areaAvgResponseTimeMinutes !== null && insights.avgResponseTimeMinutes > insights.areaAvgResponseTimeMinutes) {
    text = "Rispondi più in fretta della media della tua zona: chi risponde per primo vince più spesso il lavoro.";
    href = "/dashboard/richieste?stage=da_quotare";
    cta = "Vedi le richieste";
  } else if (insights.areaAvgProfileViews30d !== null && insights.profileViews30d < insights.areaAvgProfileViews30d) {
    text = "Il tuo profilo è visitato meno della media della zona: foto, prestazioni con prezzo e disponibilità aiutano a farti scegliere.";
  } else if (insights.reviewCount === 0) {
    text = "Non hai ancora recensioni: a fine lavoro ricorda al cliente di lasciarne una, il profilo diventa più credibile.";
    href = "/dashboard/richieste?stage=completata";
    cta = "Vedi i lavori terminati";
  }
  if (!text) return null;
  return (
    <XStack gap="3" alignItems="center" padding="4" borderRadius={20} backgroundColor={brand.cianografiaVelo} flexWrap="wrap">
      <Icon name="lightbulb" size={20} color={brand.cianografiaScuro} />
      <Text flex={1} minWidth={220} color={brand.grafite}>
        {text}
      </Text>
      <Link href={href} style={{ textDecoration: "none" }}>
        {/* Una sola fermata del Tab, il link (E7-13 del controllo dell'8/11). */}
        <CardButton tabIndex={-1}>{cta}</CardButton>
      </Link>
    </XStack>
  );
}

function Skeletons() {
  return (
    <YStack backgroundColor={brand.calce} borderRadius={20} overflow="hidden">
      <SkeletonSummaryRow />
      <SkeletonSummaryRow />
    </YStack>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="today-empty">{text}</div>;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function formatMinutes(minutes: number): string {
  // "Meno di 1 min", non "0 min" (docs/changelog/2026-11-08-prova-persone-simulate.md).
  if (minutes < 1) return "meno di 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** Un istante vero (scadenze di un problema), non un orario di parete: in ora italiana. */
function formatRealDateTime(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", { timeZone: "Europe/Rome", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** "3 ore", "2 giorni": da quanto il cliente aspetta una risposta in chat. */
function waitingFor(iso: string): string {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return minutes === 1 ? "1 minuto" : `${minutes} minuti`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 ora" : `${hours} ore`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 giorno" : `${days} giorni`;
}

function isOlderThanDay(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() >= 24 * 60 * 60 * 1000;
}

function formatDateTime(iso: string): string {
  return `${formatAppointmentDate(iso, { weekday: "short", day: "numeric", month: "short" })}, ${formatAppointmentTime(iso)}`;
}

/** Comune di un indirizzo scritto a mano ("Via Roma 3, 04100 Latina" → "Latina"), per il riepilogo del giorno. */
/**
 * Ora di arrivo scritta dal professionista ("Arrivo verso le"), solo per un
 * lavoro di un giorno e dentro la sua fascia: fuori non vale, come in agenda.
 */
function arrivalInBand(arrivalTime: string | null | undefined, startIso: string, endIso: string | null): string | null {
  if (!arrivalTime || !endIso || jobDayCount(startIso, endIso) !== 1) return null;
  return arrivalTime >= startIso.slice(11, 16) && arrivalTime < endIso.slice(11, 16) ? arrivalTime : null;
}

/** Con l'ora di arrivo il lavoro si mette a quell'ora, come in agenda e nel giro. */
function upcomingSortKey(row: { at: string; arrival: string | null }): string {
  return row.arrival ? `${row.at.slice(0, 11)}${row.arrival}` : row.at.slice(0, 16);
}

function cityOfAddress(address: string | null): string | null {
  const last = address?.split(",").pop()?.replace(/\b\d{5}\b/, "").trim();
  return last && address!.includes(",") ? last : null;
}
