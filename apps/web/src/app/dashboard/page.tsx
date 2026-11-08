"use client";

import { Fragment, startTransition, useCallback, useEffect, useState } from "react";
import Link from "@/components/IntentLink";
import { Check, Navigation, Phone, Truck } from "lucide-react";
import { AGENDA_LOOKAHEAD_DAYS, formatAppointmentDate, formatAppointmentTime, jobOccurrences, navigateUrl, scheduleChangeBetween, wallClockNow, wallClockToday, type AgendaAttention, type DayAhead, type ExternalJob, type MySubscription, type ProfessionalBooking, type ProfessionalInsights, type ProfessionalLead } from "@professionisti/shared";
import { Badge, Button, Icon, Text, XStack, YStack, brand, type IconName } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { loadMyProfessionalProfile, loadMySubscription } from "@/lib/myProfessionalProfile";
import { useAuth } from "@/lib/AuthContext";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { classifyLeadStage } from "@/lib/requestStage";
import { formatCompetitors, leadDeadlines } from "@/lib/leadDeadline";
import { accountMenuUnreadCounts } from "@/lib/notificationSections";
import { LoadErrorNotice } from "@/components/LoadErrorNotice";
import { CardButton } from "@/components/CardButton";
import { SkeletonSummaryRow } from "@/components/Skeleton";
import { SubscriptionPauseBanner } from "@/components/SubscriptionPauseBanner";
import { IssueSanctionBanner } from "@/components/IssueSanctionBanner";
import { AwayCard } from "@/components/AwayCard";
import { BoostSection } from "@/components/BoostSection";
import { SetupJourneyCard, SetupJourneyHero, journeyNeedsHero, useSetupJourney } from "@/components/verification/SetupJourney";
import { WeatherStrip, jobsHeadline, type DayJobRow } from "@/components/DaysAhead";

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
  const { user, token, isLoading, unreadNotifications } = useAuth();
  const [leads, setLeads] = useState<ProfessionalLead[] | null>(null);
  const [bookings, setBookings] = useState<ProfessionalBooking[] | null>(null);
  // Lavori aggiunti a mano: se non arrivano, restano solo le prenotazioni.
  const [externalJobs, setExternalJobs] = useState<ExternalJob[] | null>(null);
  // Meteo dei prossimi tre giorni (§333): se non arriva, la riga sparisce.
  const [daysAhead, setDaysAhead] = useState<DayAhead[] | null | "failed">(null);
  const [insights, setInsights] = useState<ProfessionalInsights | null>(null);
  const [subscription, setSubscription] = useState<MySubscription | null>(null);
  // Pausa scelta dal professionista (collaudo C-16): in Home solo mentre dura.
  const [awayUntil, setAwayUntil] = useState<string | null>(null);
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
    apiClient.agendaDaysAhead(token).then(later(setDaysAhead)).catch(later(() => setDaysAhead("failed")));
    apiClient.getMyInsights(token).then(later(setInsights)).catch(later(() => setInsightsFailed(true)));
    loadMySubscription(token).then(later(setSubscription)).catch(later(() => setSubscription(null)));
    loadMyProfessionalProfile(token)
      .then(
        later((p: Awaited<ReturnType<typeof loadMyProfessionalProfile>>) => {
          setRestrictions(p ? { demotedUntil: p.demotedUntil, requestsBlockedUntil: p.requestsBlockedUntil } : null);
          setAwayUntil(p?.awayUntil ?? null);
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
    apiClient.agendaDaysAhead(token).then(later(setDaysAhead)).catch(() => {});
  }, [token]);
  useLiveRefresh(refreshInBackground, Boolean(token && user?.isProfessional && !noProfileYet));

  // I conti alla rovescia si aggiornano da soli ogni minuto.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (isLoading) return null;

  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="9" paddingHorizontal="4">
        <YStack width="100%" maxWidth={480} gap="4" alignItems="center">
          <Text render="h1" margin={0} fontFamily="heading" fontWeight="800" fontSize="7" color={brand.grafite} textAlign="center">
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
          <Text render="h1" margin={0} fontFamily="heading" fontWeight="800" fontSize="7" color={brand.grafite} textAlign="center">
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
  const unreadMessages = accountMenuUnreadCounts(true, unreadNotifications)["/chat"] ?? 0;

  // Appuntamenti in ora di parete UTC: oggi e domani in Italia, docs/CHANGELOG.md §287.
  const startToday = wallClockToday();
  const endTomorrow = new Date(startToday);
  endTomorrow.setUTCDate(endTomorrow.getUTCDate() + 2);
  // Un lavoro su più giorni compare oggi e domani con l'orario di quel giorno (§310).
  // `navigateTo`: indirizzo per "Naviga" (§352), solo a lavoro confermato.
  // `onTheWay`: "Sto arrivando" (§353), solo per un appuntamento confermato a domicilio.
  type UpcomingRow = { key: string; href: string; at: string; title: string; sub: string; job: DayJobRow; navigateTo: string | null; onTheWay: { bookingId: string; sentAt: string | null } | null; phone: string | null };
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
            // Telefono solo a lavoro confermato (CLAUDE.md §5 punto 9).
            phone: booking.status === "CONFIRMED" ? (booking.recipientPhone ?? booking.clientPhone) : null,
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
            title: job.clientName,
            sub: [job.address, job.description].filter(Boolean).join(" · ") || "Lavoro aggiunto da te",
            job: { start: occurrence.start.toISOString(), end: occurrence.end?.toISOString() ?? null, city: cityOfAddress(job.address), online: false },
            navigateTo: job.address,
            onTheWay: null,
            phone: job.clientPhone,
          })),
      ),
  ].sort((a, b) => a.at.localeCompare(b.at));

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
  const quietStart = Boolean(heroJourney) && !loading && !error && upcoming.length === 0 && toAnswer.length === 0 && unreadMessages === 0;
  const greetingName = user.businessName ?? user.name ?? "";
  const showToAnswerOnTop = !loading && !error && toAnswer.length > 0;
  const showDatesOnTop = !loading && !error && datesToConfirm.length > 0;

  return (
    <YStack width="100%" alignItems="center" paddingVertical="6" paddingHorizontal="4">
      <YStack width="100%" maxWidth={1180} gap="6">
        <YStack gap="1">
          <Text render="h1" margin={0} fontFamily="heading" fontWeight="800" fontSize="8" color={brand.grafite}>
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
        {showDatesOnTop ? (
          <TodaySection title="Date proposte dai clienti" count={datesToConfirm.length}>
            {datesToConfirm.map((lead) => (
              <Link key={lead.id} href={`/dashboard/richieste?open=${lead.guidedRequest.id}`} className="today-row">
                <span className="today-row-main">
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
            ))}
          </TodaySection>
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
                {error ? null : loading ? (
                  <Skeletons />
                ) : (
                <TodaySection title="Oggi e domani" action={{ href: "/dashboard/agenda", label: "Apri l'agenda" }}>
                  {daysAhead === "failed" ? null : <WeatherStrip days={daysAhead} />}
                  {upcoming.length === 0 ? (
                    <EmptyLine text={quietStart ? "Nessun appuntamento né richiesta per ora: ti avvisiamo appena ne arriva una." : "Nessun appuntamento oggi e domani."} />
                  ) : (
                    upcoming.map(({ key, href, at, title, sub, navigateTo, onTheWay, phone }, index) => (
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
                            <span className="today-time">{formatAppointmentTime(at)}</span>
                            <span className="today-row-main">
                              <strong>{title}</strong>
                              <span className="today-row-sub">{sub}</span>
                            </span>
                          </Link>
                          {/* "Naviga" e "Sto arrivando" diretti sui lavori di oggi
                              (§352-§353): prima serviva aprire l'agenda e poi l'appuntamento. */}
                          {at.slice(0, 10) === startToday.toISOString().slice(0, 10) && (navigateTo || onTheWay || phone) ? (
                            <div className="today-appt-actions">
                              {navigateTo ? (
                                <a className="today-nav" href={navigateUrl(navigateTo)} target="_blank" rel="noreferrer" aria-label={`Naviga verso ${navigateTo}`}>
                                  <Navigation size={16} aria-hidden /> Naviga
                                </a>
                              ) : null}
                              {onTheWay ? (
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
                )}
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
                        {/* Il numero delle richieste sta nel titolo qui sotto, che
                            le elenca (§352); le altre tessere solo se c'è qualcosa. */}
                        {/* "Date da confermare" non è più una tessera: le date sono
                            elencate in cima (§403). */}
                        {unreadMessages > 0 ? (
                          <div className="today-kpis today-counters">
                            <TodayCounter href="/chat" icon="message-circle" value={unreadMessages} label="Messaggi non letti" urgent loading={false} />
                          </div>
                        ) : null}

                        {toAnswer.length === 0 && !quietStart ? (
                          <TodaySection title="Da rispondere ora" action={{ href: "/dashboard/richieste", label: "Tutte le richieste" }}>
                            <EmptyLine text="Nessuna richiesta in attesa: ti avvisiamo appena ne arriva una nuova." />
                          </TodaySection>
                        ) : null}


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

function TodayCounter({ href, icon, value, label, urgent, loading }: { href: string; icon: IconName; value: number; label: string; urgent: boolean; loading: boolean }) {
  return (
    <Link href={href} className={`admin-kpi${urgent ? " is-urgent" : ""}`}>
      <Icon name={icon} size={18} color={urgent ? "#dc3545" : "#6e6459"} />
      <span className="admin-kpi-value">{loading ? "…" : value}</span>
      <span className="admin-kpi-label">{label}</span>
    </Link>
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
          <Link href={action.href} style={{ color: brand.cianografiaScuro, fontWeight: 600, fontSize: 16, textDecoration: "none" }}>
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

function LeadToAnswerRow({ lead, extra = false }: { lead: ProfessionalLead; extra?: boolean }) {
  const deadlines = leadDeadlines(lead);
  const competitors = formatCompetitors(lead.competitors);
  return (
    <Link href={`/dashboard/richieste?open=${lead.guidedRequest.id}`} className={extra ? "today-row is-phone-hidden" : "today-row"}>
      <span className="today-row-main">
        {/* Etichetta "Urgente" come in Richieste e lavori, non più l'emoji 🔴 (§352). */}
        {lead.guidedRequest.isUrgent ? <Badge variant="urgente">Urgente</Badge> : null}
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
  const cells: { label: string; value: string; compare: string | null; isText?: boolean }[] = [
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
          {cell.compare ? <span style={{ fontSize: 13, color: "#6e6459", fontWeight: 600 }}>{cell.compare}</span> : null}
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
        <CardButton>Apri l'agenda</CardButton>
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
        <CardButton>{cta}</CardButton>
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

function formatDateTime(iso: string): string {
  return `${formatAppointmentDate(iso, { weekday: "short", day: "numeric", month: "short" })}, ${formatAppointmentTime(iso)}`;
}

/** Comune di un indirizzo scritto a mano ("Via Roma 3, 04100 Latina" → "Latina"), per il riepilogo del giorno. */
function cityOfAddress(address: string | null): string | null {
  const last = address?.split(",").pop()?.replace(/\b\d{5}\b/, "").trim();
  return last && address!.includes(",") ? last : null;
}
