"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import {
  buildWhatsAppLink,
  formatBookingAddress,
  formatServicePriceRange,
  type CompleteBookingInput,
  type ProfessionalAvailableSlot,
  type ProfessionalBooking,
  type ProfessionalLead,
} from "@professionisti/shared";
import { Badge, Button, Icon, Surface, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { LoadingState } from "@/components/LoadingState";
import { ClientProfileModal } from "@/components/ClientProfileModal";
import { TimelineModal } from "@/components/TimelineModal";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { MediaPreview } from "@/components/MediaPreview";
import { CompleteJobModal } from "@/components/CompleteJobModal";
import { CancelBookingModal } from "@/components/CancelBookingModal";
import { ReviewModal } from "@/components/ReviewModal";
import { RequestStepper, computeRequestStage } from "@/components/RequestStepper";
import { professionalSectionCounts, unreadBookingIds, unreadGuidedRequestIds } from "@/lib/notificationSections";
import { ListControls, Pagination, sortListItems, type ListSortKey } from "@/components/ListControls";

const smallInputStyle = { padding: 10, borderRadius: 4, border: `1px solid ${brand.filetto}`, fontSize: 14, fontFamily: "inherit", color: brand.grafite };

/**
 * Data + fascia oraria di una fascia agenda ("lunedì 5 agosto · 09:00–13:00"),
 * mostra solo l'inizio se la fine non è nota (richiesta esplicita
 * dell'utente: "non visualizzare solo il primo orario ma tutta la fascia
 * d'orario" — ma resta un fallback per i preventivi/proposte precedenti a
 * questa funzionalità, senza `endIso`).
 */
function formatDateTimeRange(startIso: string, endIso: string | null): string {
  const start = new Date(startIso);
  const dateLabel = start.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const startLabel = start.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  if (!endIso) return `${dateLabel} · ${startLabel}`;
  const endLabel = new Date(endIso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${dateLabel} · ${startLabel}–${endLabel}`;
}

/** Data+ora di invio di un preventivo (timestamp reale, fuso orario del browser — non la data pura "wall clock UTC" delle fasce agenda). */
function formatSentAt(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })} alle ${date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * Cosa è cambiato tra due date/orari (richiesta esplicita dell'utente:
 * "avverti sia se è cambiato l'orario, sia se è cambiata la data o
 * entrambe"; e "se non è stato modificato il gruppo data ora non deve
 * uscire 'ha proposto un'altra data'" — un cliente che usa "Modifica" solo
 * per scrivere una nota, senza cambiare data/ora, non ha "proposto
 * un'altra data"). Confronto su stringa "wall clock UTC" (stessa
 * convenzione già in uso in tutto il modulo agenda), mai vero fuso orario.
 */
type DateChangeKind = "none" | "date" | "time" | "both";
function describeDateChangeKind(oldStartIso: string, oldEndIso: string | null, newStartIso: string, newEndIso: string | null): DateChangeKind {
  const dateChanged = oldStartIso.slice(0, 10) !== newStartIso.slice(0, 10);
  const oldTime = `${oldStartIso.slice(11, 16)}-${oldEndIso?.slice(11, 16) ?? ""}`;
  const newTime = `${newStartIso.slice(11, 16)}-${newEndIso?.slice(11, 16) ?? ""}`;
  const timeChanged = oldTime !== newTime;
  if (dateChanged && timeChanged) return "both";
  if (dateChanged) return "date";
  if (timeChanged) return "time";
  return "none";
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text fontFamily="$heading" fontWeight="700" fontSize="$7" color={brand.grafite}>
      {children}
    </Text>
  );
}

type DashboardTab = "richieste" | "lavori";

/**
 * Filtri per stato nelle due liste (richiesta esplicita dell'utente: "in
 * richieste ricevute e lavori accettati, crea una casella con filtri, dove
 * cliccando su possono inserire i filtri come ad esempio preventivo
 * inviato, preventivo accettato... e in lavori accettati filtri come:
 * completati, annullati, da effettuare").
 */
type LeadStatusFilter = "all" | "pending" | "quoteSent" | "quoteAccepted" | "declined" | "expired";
const LEAD_STATUS_OPTIONS: { value: LeadStatusFilter; label: string }[] = [
  { value: "all", label: "Tutte" },
  { value: "pending", label: "In attesa di preventivo" },
  { value: "quoteSent", label: "Preventivo inviato" },
  { value: "quoteAccepted", label: "Preventivo accettato" },
  { value: "declined", label: "Rifiutate" },
  // Lead non scaduto per rifiuto attivo ma per timeout (CLAUDE.md §14) —
  // filtro a parte: mescolarlo con "declined" mostrerebbe al
  // professionista una nota di rifiuto che non esiste per queste.
  { value: "expired", label: "Scadute" },
];
function leadMatchesStatus(lead: ProfessionalLead, filter: LeadStatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "declined") return lead.status === "DECLINED";
  if (filter === "expired") return lead.status === "EXPIRED";
  if (filter === "quoteAccepted") return lead.quote?.status === "ACCEPTED";
  if (filter === "quoteSent") return lead.quote !== null && lead.status !== "DECLINED" && lead.status !== "EXPIRED";
  // "In attesa di preventivo": bug reale corretto (CLAUDE.md §14) — un
  // Lead scaduto per timeout (nessuna risposta entro expiresAt) finiva qui
  // insieme a quelli davvero ancora aperti, perché il controllo escludeva
  // solo DECLINED. Un lead EXPIRED non è più azionabile, non deve
  // comparire come "in attesa".
  return lead.quote === null && lead.status !== "DECLINED" && lead.status !== "EXPIRED";
}

type BookingStatusFilter = "all" | "toDo" | "completed" | "canceled";
const BOOKING_STATUS_OPTIONS: { value: BookingStatusFilter; label: string }[] = [
  { value: "all", label: "Tutti" },
  { value: "toDo", label: "Da effettuare" },
  { value: "completed", label: "Completati" },
  { value: "canceled", label: "Annullati" },
];
function bookingMatchesStatus(booking: ProfessionalBooking, filter: BookingStatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "completed") return booking.status === "COMPLETED";
  if (filter === "canceled") return booking.status === "CANCELED";
  return booking.status === "CONFIRMED";
}

/**
 * Caselle "Richieste ricevute"/"Lavori accettati" (richiesta esplicita
 * dell'utente, "il piu facile e ordinata la visualizzazione"): stesso
 * pattern a pillola attiva/inattiva già in uso altrove nel sito (es. tab
 * "A domicilio"/"Online" di SearchBar) invece di introdurre un nuovo
 * componente Tab condiviso solo per questa pagina.
 */
function DashboardTabButton({
  active,
  onPress,
  badgeCount,
  children,
}: {
  active: boolean;
  onPress: () => void;
  /** Numeretto degli aggiornamenti non letti di questa sezione (richiesta esplicita dell'utente). */
  badgeCount?: number;
  children: React.ReactNode;
}) {
  return (
    <XStack
      alignItems="center"
      gap="$2"
      paddingHorizontal="$4"
      paddingVertical="$3"
      borderRadius="$3"
      backgroundColor={active ? brand.cianografiaVelo : "transparent"}
      cursor="pointer"
      onPress={onPress}
      accessibilityRole="button"
    >
      <Text fontWeight="700" color={active ? brand.cianografia : brand.grafite70}>
        {children}
      </Text>
      {badgeCount ? (
        <YStack backgroundColor={brand.urgenza} borderRadius={999} minWidth={18} height={18} paddingHorizontal={4} alignItems="center" justifyContent="center">
          <Text fontSize={11} fontWeight="700" color="white" lineHeight={14}>
            {badgeCount > 9 ? "9+" : badgeCount}
          </Text>
        </YStack>
      ) : null}
    </XStack>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const { user, token, isLoading, markNotificationsRead } = useAuth();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<DashboardTab>("richieste");
  // Un toast cliccato (ToastStack, richiesta esplicita dell'utente: "fagli
  // aprire l'aggiornamento relativo a quel banner") naviga qui con
  // `?tab=richieste|lavori` — reattivo a `searchParams` (non solo al primo
  // mount) perché un click sul toast mentre si è già su questa pagina è una
  // navigazione superficiale (stessa route, solo la query cambia), che non
  // rimonta il componente.
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "richieste" || tab === "lavori") setActiveTab(tab);
  }, [searchParams]);
  // Fotografia delle notifiche non lette al momento dell'arrivo sulla
  // pagina, presa PRIMA di segnarle come lette — evita una race condition
  // reale: se si usasse invece il conteggio "live" di AuthContext
  // (aggiornato dallo stesso poll usato per il badge/toast), la richiesta
  // GET qui e la PATCH di markNotificationsRead partono nello stesso
  // istante e l'ordine di arrivo delle risposte non è garantito — se la
  // PATCH vince, la GET successiva del poll trova già tutto letto e il
  // numeretto per sezione non compare mai, anche se un attimo prima
  // c'era davvero un aggiornamento. Recuperata qui esplicitamente PRIMA
  // di segnare come letto, la sequenza è sempre corretta.
  const [sectionSnapshot, setSectionSnapshot] = useState<{ richieste: number; lavori: number }>({ richieste: 0, lavori: 0 });
  // ID delle richieste/prenotazioni con un aggiornamento non letto (stesso
  // snapshot di sectionSnapshot, recuperato una sola volta) — richiesta
  // esplicita dell'utente: "rendilo evidente anche nella lista", non solo
  // il numeretto sul tab. LeadCard/AcceptedJobCard mostrano un badge
  // "Nuovo" quando il proprio id è tra questi.
  const [newLeadRequestIds, setNewLeadRequestIds] = useState<Set<string>>(new Set());
  const [newBookingIds, setNewBookingIds] = useState<Set<string>>(new Set());
  const [profileMissing, setProfileMissing] = useState(false);
  const [leads, setLeads] = useState<ProfessionalLead[] | null>(null);
  const [bookings, setBookings] = useState<ProfessionalBooking[] | null>(null);
  // Fasce libere della propria agenda (prossimi 14gg): usate nel form
  // preventivo per far scegliere la data di inizio dentro la disponibilità
  // reale invece di una data libera scollegata — richiesta esplicita
  // dell'utente. Caricate una sola volta qui e passate a tutte le
  // LeadCard, non una chiamata per card.
  const [availableSlots, setAvailableSlots] = useState<ProfessionalAvailableSlot[]>([]);
  // Id del proprio profilo professionista — serve per aprire la cronologia
  // della richiesta (TimelineModal, richiesta esplicita dell'utente),
  // nessun altro endpoint qui lo espone già essendo sempre "il proprio".
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filtri/ordinamento/quantità visualizzata per le due liste (richiesta
  // esplicita dell'utente): tutto calcolato client-side, le liste sono già
  // interamente scaricate a questa scala (vedi ListControls.tsx).
  const [leadsStatusFilter, setLeadsStatusFilter] = useState<LeadStatusFilter>("all");
  const [leadsSort, setLeadsSort] = useState<ListSortKey>("createdAt");
  const [leadsPageSize, setLeadsPageSize] = useState(5);
  const [leadsPage, setLeadsPage] = useState(1);
  const [bookingsStatusFilter, setBookingsStatusFilter] = useState<BookingStatusFilter>("all");
  const [bookingsSort, setBookingsSort] = useState<ListSortKey>("scheduledAt");
  const [bookingsPageSize, setBookingsPageSize] = useState(5);
  const [bookingsPage, setBookingsPage] = useState(1);

  // Cambiare filtro/ordinamento/quantità riparte sempre da pagina 1 —
  // restare su una pagina che potrebbe non esistere più nel nuovo elenco
  // filtrato sarebbe confuso (richiesta esplicita dell'utente: "se ce ne
  // sono di più andranno in altre pagine selezionabili").
  function updateLeadsStatusFilter(value: LeadStatusFilter) {
    setLeadsStatusFilter(value);
    setLeadsPage(1);
  }
  function updateLeadsSort(value: ListSortKey) {
    setLeadsSort(value);
    setLeadsPage(1);
  }
  function updateLeadsPageSize(value: number) {
    setLeadsPageSize(value);
    setLeadsPage(1);
  }
  function updateBookingsStatusFilter(value: BookingStatusFilter) {
    setBookingsStatusFilter(value);
    setBookingsPage(1);
  }
  function updateBookingsSort(value: ListSortKey) {
    setBookingsSort(value);
    setBookingsPage(1);
  }
  function updateBookingsPageSize(value: number) {
    setBookingsPageSize(value);
    setBookingsPage(1);
  }

  // Cambiare pagina deve riportare la vista in cima alla lista (richiesta
  // esplicita dell'utente, stesso trattamento di /le-mie-richieste): senza,
  // si resta scrollati in fondo sul controllo appena cliccato e la nuova
  // pagina parte fuori dallo schermo. Un solo ref condiviso dalle due tab:
  // solo una è montata alla volta.
  const listTopRef = useRef<HTMLDivElement>(null);
  function scrollToListTop() {
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function goToLeadsPage(page: number) {
    setLeadsPage(page);
    scrollToListTop();
  }
  function goToBookingsPage(page: number) {
    setBookingsPage(page);
    scrollToListTop();
  }

  function reloadLeads() {
    if (!token) return;
    apiClient.myLeads(token).then(setLeads);
  }

  function reloadBookings() {
    if (!token) return;
    apiClient.myProfessionalBookings(token).then(setBookings);
  }

  // Aprire la dashboard segna come lette le notifiche in attesa (nuovo lead,
  // risposta del cliente su una data proposta): il badge nell'header si
  // azzera qui, non con un click separato — coerente con la richiesta
  // dell'utente di vedere "un numeretto con le novità da visualizzare".
  // L'elenco va recuperato ESPLICITAMENTE prima di segnarle come lette
  // (vedi commento su sectionSnapshot) — mai affidarsi al conteggio "live"
  // già in corso di poll altrove per questo calcolo one-shot.
  useEffect(() => {
    if (!token) return;
    apiClient
      .unreadNotifications(token)
      .then((notifications) => {
        setSectionSnapshot(professionalSectionCounts(notifications));
        setNewLeadRequestIds(unreadGuidedRequestIds(notifications));
        setNewBookingIds(unreadBookingIds(notifications));
      })
      .catch(() => {})
      .finally(() => markNotificationsRead());
  }, [token, markNotificationsRead]);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      apiClient.myLeads(token),
      apiClient.myProfessionalBookings(token),
      apiClient.myAvailableSlots(token),
      apiClient.getMyProfessionalProfile(token),
    ])
      .then(([leadsResult, bookingsResult, slotsResult, profile]) => {
        setLeads(leadsResult);
        setBookings(bookingsResult);
        setAvailableSlots(slotsResult);
        setMyProfileId(profile?.id ?? null);
      })
      .catch((err) => {
        if (err instanceof Error && err.message.includes("profilo")) {
          setProfileMissing(true);
        } else {
          setError(err instanceof Error ? err.message : "Errore nel caricamento della dashboard.");
        }
      });
  }, [token]);

  if (isLoading) return null;

  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
            Accedi come professionista
          </Text>
          <Link href="/accedi?redirect=/dashboard" style={{ textDecoration: "none" }}>
            <Button variant="primary">Accedi</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  if (user.role !== "PROFESSIONAL") {
    return (
      <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
        <Text color={brand.grafite70}>Questa sezione è riservata ai professionisti.</Text>
      </YStack>
    );
  }

  if (profileMissing) {
    return (
      <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
            Completa il tuo profilo per iniziare
          </Text>
          <Text color={brand.grafite70} textAlign="center">
            Serve un profilo completo (nome attività, categoria, città) per comparire in ricerca e ricevere
            richieste.
          </Text>
          <Link href="/dashboard/profilo" style={{ textDecoration: "none" }}>
            <Button variant="primary">Completa profilo</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  const sortedLeads = leads
    ? sortListItems(leads.filter((lead) => leadMatchesStatus(lead, leadsStatusFilter)), leadsSort, {
        createdAt: (l) => l.createdAt,
        updatedAt: (l) => l.updatedAt,
      })
    : null;
  const leadsTotalPages = sortedLeads ? Math.max(1, Math.ceil(sortedLeads.length / leadsPageSize)) : 1;
  const leadsEffectivePage = Math.min(leadsPage, leadsTotalPages);
  const visibleLeads = sortedLeads?.slice((leadsEffectivePage - 1) * leadsPageSize, leadsEffectivePage * leadsPageSize) ?? null;

  const filteredAcceptedJobs = bookings ? acceptedJobs(bookings).filter((b) => bookingMatchesStatus(b, bookingsStatusFilter)) : [];
  const sortedBookings = sortListItems(filteredAcceptedJobs, bookingsSort, {
    createdAt: (b) => b.createdAt,
    updatedAt: (b) => b.updatedAt,
    scheduledAt: (b) => b.scheduledAt,
  });
  const bookingsTotalPages = Math.max(1, Math.ceil(sortedBookings.length / bookingsPageSize));
  const bookingsEffectivePage = Math.min(bookingsPage, bookingsTotalPages);
  const visibleBookings = sortedBookings.slice((bookingsEffectivePage - 1) * bookingsPageSize, bookingsEffectivePage * bookingsPageSize);

  return (
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$8" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={780} gap="$6">
        <YStack flexDirection="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
            Dashboard
          </Text>
          <Link href="/dashboard/profilo" style={{ textDecoration: "none" }}>
            <Text color={brand.cianografia} fontWeight="600">
              Modifica profilo
            </Text>
          </Link>
        </YStack>

        {error ? <Text color={brand.urgenza}>{error}</Text> : null}

        <XStack gap="$2" flexWrap="wrap" borderBottomWidth={1} borderBottomColor={brand.filetto}>
          <DashboardTabButton active={activeTab === "richieste"} onPress={() => setActiveTab("richieste")} badgeCount={sectionSnapshot.richieste}>
            Richieste ricevute{leads ? ` (${leads.length})` : ""}
          </DashboardTabButton>
          <DashboardTabButton active={activeTab === "lavori"} onPress={() => setActiveTab("lavori")} badgeCount={sectionSnapshot.lavori}>
            Lavori accettati{bookings ? ` (${acceptedJobs(bookings).length})` : ""}
          </DashboardTabButton>
        </XStack>

        {activeTab === "richieste" ? (
          <YStack ref={listTopRef} gap="$3">
            {leads !== null && leads.length > 0 ? (
              <ListControls
                statusValue={leadsStatusFilter}
                statusOptions={LEAD_STATUS_OPTIONS}
                onStatusChange={updateLeadsStatusFilter}
                sortValue={leadsSort}
                sortOptions={["createdAt", "updatedAt"]}
                onSortChange={updateLeadsSort}
                pageSize={leadsPageSize}
                onPageSizeChange={updateLeadsPageSize}
              />
            ) : null}
            <Pagination page={leadsEffectivePage} totalPages={leadsTotalPages} onPageChange={goToLeadsPage} />
            {leads === null ? (
              <LoadingState />
            ) : leads.length === 0 ? (
              <Text color={brand.grafite70}>Non hai ancora ricevuto richieste. Torna a trovarci a breve!</Text>
            ) : visibleLeads && visibleLeads.length === 0 ? (
              <Text color={brand.grafite70}>Nessuna richiesta corrisponde al filtro selezionato.</Text>
            ) : (
              visibleLeads?.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  token={token}
                  availableSlots={availableSlots}
                  onChanged={reloadLeads}
                  isNew={newLeadRequestIds.has(lead.guidedRequest.id)}
                  myProfileId={myProfileId}
                />
              ))
            )}
            <Pagination page={leadsEffectivePage} totalPages={leadsTotalPages} onPageChange={goToLeadsPage} />
          </YStack>
        ) : (
          <YStack ref={listTopRef} gap="$3">
            <YStack flexDirection="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
              <Link href="/dashboard/agenda" style={{ textDecoration: "none" }}>
                <Text color={brand.cianografia} fontWeight="600" fontSize="$3">
                  Apri il calendario completo
                </Text>
              </Link>
            </YStack>
            <Text fontSize="$2" color={brand.grafite70}>
              Preventivi accettati e lavori in agenda, con i dati del cliente per andare a svolgere l&apos;intervento.
            </Text>
            {bookings !== null && acceptedJobs(bookings).length > 0 ? (
              <ListControls
                statusValue={bookingsStatusFilter}
                statusOptions={BOOKING_STATUS_OPTIONS}
                onStatusChange={updateBookingsStatusFilter}
                sortValue={bookingsSort}
                sortOptions={["scheduledAt", "createdAt", "updatedAt"]}
                onSortChange={updateBookingsSort}
                pageSize={bookingsPageSize}
                onPageSizeChange={updateBookingsPageSize}
              />
            ) : null}
            <Pagination page={bookingsEffectivePage} totalPages={bookingsTotalPages} onPageChange={goToBookingsPage} />
            {bookings === null ? (
              <LoadingState />
            ) : acceptedJobs(bookings).length === 0 ? (
              <Text color={brand.grafite70}>Nessun lavoro accettato per ora.</Text>
            ) : visibleBookings.length === 0 ? (
              <Text color={brand.grafite70}>Nessun lavoro corrisponde al filtro selezionato.</Text>
            ) : (
              <YStack gap="$3">
                {visibleBookings.map((booking) => (
                  <AcceptedJobCard
                    key={booking.id}
                    booking={booking}
                    token={token}
                    onUpdated={reloadBookings}
                    isNew={newBookingIds.has(booking.id)}
                    myProfileId={myProfileId}
                  />
                ))}
              </YStack>
            )}
            <Pagination page={bookingsEffectivePage} totalPages={bookingsTotalPages} onPageChange={goToBookingsPage} />
          </YStack>
        )}

        <BoostSection token={token} />
      </YStack>
    </YStack>
  );
}

/**
 * "Lavori accettati" (richiesta esplicita dell'utente): prenotazioni
 * CONFIRMED (preventivo accettato dal cliente, o fascia diretta già
 * confermata dal professionista), COMPLETED (lavori passati) o CANCELED —
 * quest'ultima inclusa apposta (a differenza di PENDING/NO_SHOW, ancora
 * escluse) per richiesta esplicita dell'utente: se un cliente annulla una
 * prenotazione già confermata, il professionista deve accorgersene invece
 * di vederla sparire silenziosamente dall'elenco.
 */
function acceptedJobs(bookings: ProfessionalBooking[]): ProfessionalBooking[] {
  return bookings.filter((b) => b.status === "CONFIRMED" || b.status === "COMPLETED" || b.status === "CANCELED");
}

function AcceptedJobCard({
  booking,
  token,
  onUpdated,
  isNew,
  myProfileId,
}: {
  booking: ProfessionalBooking;
  token: string;
  onUpdated: () => void;
  /** True se questa prenotazione ha un aggiornamento non letto — richiesta esplicita dell'utente ("rendilo evidente anche nella lista"). */
  isNew?: boolean;
  /** Proprio profilo, per aprire la cronologia della richiesta (richiesta esplicita dell'utente) — null finché non ancora caricato. */
  myProfileId: string | null;
}) {
  const date = new Date(booking.scheduledAt);
  const endDate = booking.scheduledEndAt ? new Date(booking.scheduledEndAt) : null;
  // Indirizzo strutturato (raccolto all'accettazione preventivo) ha
  // priorità su quello libero, quando presente — vedi formatBookingAddress.
  const structuredAddress = formatBookingAddress(booking);
  const recipientFullName = [booking.recipientName, booking.recipientSurname].filter(Boolean).join(" ") || null;
  const isCanceled = booking.status === "CANCELED";
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  // Recensione del professionista sul cliente (richiesta esplicita
  // dell'utente): si apre da sola subito dopo aver segnalato il lavoro
  // come terminato, resta comunque raggiungibile manualmente se chiusa
  // senza recensire (link sotto, visibile finché non esiste già).
  const [showClientReviewModal, setShowClientReviewModal] = useState(false);
  // Cronologia completa della richiesta (richiesta esplicita dell'utente:
  // "in lavori accettati, inserisci un pulsante con scritto vai alla
  // richiesta preventivo, e quindi visualizza tutti gli aggiornamenti").
  const [showTimeline, setShowTimeline] = useState(false);
  // Descrizione/foto della richiesta originale e nota privata del
  // professionista, richiesta esplicita dell'utente: già mostrate nel
  // pannello di dettaglio del calendario "Prenotazioni", ora anche qui —
  // stessi campi già esposti da ProfessionalBooking, nessuna chiamata API
  // aggiuntiva.
  const [openPhotoIndex, setOpenPhotoIndex] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState(booking.professionalNote ?? "");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const noteChanged = noteDraft !== (booking.professionalNote ?? "");
  const [meetingLinkDraft, setMeetingLinkDraft] = useState(booking.meetingLink ?? "");
  const [isSavingMeetingLink, setIsSavingMeetingLink] = useState(false);
  const meetingLinkChanged = meetingLinkDraft !== (booking.meetingLink ?? "");
  const whatsAppLink = buildWhatsAppLink(booking.recipientPhone ?? booking.clientPhone);

  async function handleComplete(input: CompleteBookingInput) {
    await apiClient.completeBooking(token, booking.id, input);
    setShowCompleteModal(false);
    // Subito dopo aver segnalato il lavoro terminato si apre il popup per
    // recensire il cliente (richiesta esplicita dell'utente) — prima di
    // ricaricare, altrimenti il modal si perderebbe nel re-render della
    // lista.
    setShowClientReviewModal(true);
    onUpdated();
  }

  async function handleSubmitClientReview(input: { rating: number; comment?: string; mediaUrls: string[] }) {
    await apiClient.createClientReview(token, { bookingId: booking.id, ...input });
    setShowClientReviewModal(false);
    onUpdated();
  }

  async function handleCancel(note: string | undefined) {
    await apiClient.cancelBookingByProfessional(token, booking.id, { note });
    setShowCancelModal(false);
    onUpdated();
  }

  async function handleSaveNote() {
    setIsSavingNote(true);
    try {
      await apiClient.updateBookingNote(token, booking.id, { note: noteDraft });
      onUpdated();
    } finally {
      setIsSavingNote(false);
    }
  }

  async function handleSaveMeetingLink() {
    setIsSavingMeetingLink(true);
    try {
      await apiClient.updateBookingMeetingLink(token, booking.id, { meetingLink: meetingLinkDraft });
      onUpdated();
    } finally {
      setIsSavingMeetingLink(false);
    }
  }

  return (
    <Surface gap="$2" borderColor={isCanceled ? brand.urgenza : undefined} borderWidth={isCanceled ? 1.5 : undefined} backgroundColor={isCanceled ? brand.urgenzaVelo : undefined}>
      <YStack flexDirection="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap="$2">
        <YStack gap="$1">
          <Text fontWeight="700" color={brand.grafite}>
            {date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            {" · "}
            {date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
            {/* Fascia completa (richiesta esplicita dell'utente: "non
                visualizzare solo il primo orario ma tutta la fascia
                d'orario"), quando l'ora di fine è nota — null per date
                indicate a mano o prenotazioni precedenti a questa
                funzionalità, in quel caso resta solo l'inizio come prima. */}
            {endDate ? `–${endDate.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}` : ""}
          </Text>
          <XStack alignItems="center" gap="$2">
            <Text
              fontFamily="$body"
              fontSize={13}
              fontWeight="700"
              color={isCanceled ? brand.urgenza : booking.status === "COMPLETED" ? brand.grafite70 : brand.verificato}
            >
              {isCanceled
                ? `Annullata${
                    // Da questa vista (dashboard professionista) "PROFESSIONAL" è "tu" —
                    // richiesta esplicita dell'utente: far capire chi ha annullato, non
                    // solo che è stata annullata. `null` per righe da prima di questo campo.
                    booking.canceledBy === "CLIENT" ? " dal cliente" : booking.canceledBy === "PROFESSIONAL" ? " da te" : ""
                  }`
                : booking.status === "COMPLETED"
                  ? "Completato"
                  : "Confermato"}
            </Text>
            {isNew ? <Badge variant="nuovo">Nuovo</Badge> : null}
          </XStack>
        </YStack>
        {/* `flex={1}`/`minWidth={200}`: senza questi, questa riga (una
            volta finita sulla propria riga per via del `flexWrap` del
            genitore) resta larga solo quanto il contenuto dei bottoni
            invece di adattarsi allo spazio disponibile — il proprio
            `flexWrap="wrap"` non ha nulla contro cui scattare e i tre
            bottoni restano tutti su una riga, sforando lo schermo su
            mobile (stesso principio già documentato altrove in questo
            file per lo stesso tipo di bug, CLAUDE.md §12). */}
        <XStack gap="$2" flexWrap="wrap" flex={1} minWidth={200}>
          {booking.status === "CONFIRMED" ? (
            <>
              <Button variant="secondary" size="$2" height={36} onPress={() => setShowCompleteModal(true)}>
                Lavoro terminato
              </Button>
              <Button variant="ghost" size="$2" height={36} onPress={() => setShowCancelModal(true)}>
                <Text color={brand.urgenza} fontWeight="600" fontSize="$2">
                  Annulla intervento
                </Text>
              </Button>
            </>
          ) : null}
          {booking.status === "COMPLETED" && !booking.hasClientReview ? (
            <Button variant="ghost" size="$2" height={36} onPress={() => setShowClientReviewModal(true)}>
              <Text color={brand.cianografia} fontWeight="600" fontSize="$2">
                Recensisci il cliente
              </Text>
            </Button>
          ) : null}
          {booking.guidedRequestId && myProfileId ? (
            <Button variant="ghost" size="$2" height={36} onPress={() => setShowTimeline(true)}>
              <Text color={brand.cianografia} fontWeight="600" fontSize="$2">
                Contatta/Cronologia
              </Text>
            </Button>
          ) : null}
        </XStack>
      </YStack>

      <YStack gap="$1" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto} marginTop="$1">
        <XStack alignItems="center" gap="$2" flexWrap="wrap">
          <Text fontWeight="600" color={brand.grafite}>
            {recipientFullName ?? booking.clientName ?? "Cliente"}
          </Text>
          {booking.clientAccountDeleted ? (
            // Richiesta esplicita dell'utente: il lavoro resta con traccia
            // completa (nome del destinatario/contatti raccolti
            // all'accettazione, indirizzo, voci, note — nessuno di questi
            // viene dall'account cliente in sé) — solo un'indicazione che
            // l'account che l'ha originata non esiste più.
            <Text fontSize="$2" fontWeight="600" color={brand.grafite70}>
              · Account eliminato
            </Text>
          ) : null}
        </XStack>
        {(booking.recipientPhone ?? booking.clientPhone) ? (
          <XStack alignItems="center" gap="$3" flexWrap="wrap">
            <a href={`tel:${booking.recipientPhone ?? booking.clientPhone}`} style={{ textDecoration: "none" }}>
              <XStack alignItems="center" gap="$1">
                <Icon name="phone" size={12} color={brand.cianografia} strokeWidth={1.5} />
                <Text fontSize="$2" color={brand.cianografia} fontWeight="600">
                  {booking.recipientPhone ?? booking.clientPhone}
                </Text>
              </XStack>
            </a>
            {whatsAppLink ? (
              <a href={whatsAppLink} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                <XStack alignItems="center" gap="$1">
                  <Icon name="message-circle" size={12} color={brand.verificato} strokeWidth={1.5} />
                  <Text fontSize="$2" color={brand.verificato} fontWeight="600">
                    WhatsApp
                  </Text>
                </XStack>
              </a>
            ) : null}
          </XStack>
        ) : null}
        {booking.clientEmail ? (
          <a href={`mailto:${booking.clientEmail}`} style={{ textDecoration: "none" }}>
            <XStack alignItems="center" gap="$1">
              <Icon name="mail" size={12} color={brand.cianografia} strokeWidth={1.5} />
              <Text fontSize="$2" color={brand.cianografia} fontWeight="600">
                {booking.clientEmail}
              </Text>
            </XStack>
          </a>
        ) : null}
        {structuredAddress ?? booking.address ? (
          <XStack alignItems="center" gap="$1">
            <Icon name="map-pin" size={12} color={brand.grafite70} strokeWidth={1.5} />
            <Text fontSize="$2" color={brand.grafite70}>
              {structuredAddress ?? booking.address}
            </Text>
          </XStack>
        ) : null}
      </YStack>

      {/* Descrizione del lavoro e foto scritte/caricate dal cliente nella
          richiesta guidata originale — richiesta esplicita dell'utente,
          visibili anche qui (non solo nel pannello di dettaglio del
          calendario "Prenotazioni"). Assenti per le prenotazioni dirette da
          agenda pubblica, che non hanno una GuidedRequest collegata. */}
      {booking.description ? (
        <YStack gap="$1" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto} marginTop="$1">
          <Text fontSize="$2" fontWeight="600" color={brand.grafite}>
            Descrizione del lavoro
          </Text>
          <Text fontSize="$2" color={brand.grafite70}>
            {booking.description}
          </Text>
        </YStack>
      ) : null}

      {(booking.photoUrls ?? []).length > 0 ? (
        <YStack gap="$1" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto} marginTop="$1">
          <Text fontSize="$2" fontWeight="600" color={brand.grafite}>
            Foto del cliente
          </Text>
          <XStack gap="$2" flexWrap="wrap">
            {booking.photoUrls.map((url, index) => (
              <MediaPreview
                key={url}
                url={url}
                onClick={() => setOpenPhotoIndex(index)}
                style={{ width: 56, height: 56, borderRadius: 4, cursor: "pointer", border: `1px solid ${brand.filetto}` }}
              />
            ))}
          </XStack>
        </YStack>
      ) : null}

      {booking.items.length > 0 ? (
        <YStack gap="$1" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto} marginTop="$1">
          {booking.items.map((item) => (
            <XStack key={item.id} justifyContent="space-between" gap="$2">
              <Text fontSize="$2" color={brand.grafite70}>
                {item.name}
              </Text>
              <Text fontSize="$2" color={brand.grafite} fontWeight="600">
                {formatServicePriceRange(item.priceMinEurCents, item.priceMaxEurCents)}
              </Text>
            </XStack>
          ))}
        </YStack>
      ) : null}

      {booking.status === "COMPLETED" && booking.finalAmountEurCents !== null ? (
        <YStack gap="$1" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto} marginTop="$1">
          <Text fontSize="$2" fontWeight="600" color={brand.grafite}>
            Importo finale
          </Text>
          {booking.finalItems.map((item) => (
            <XStack key={item.id} justifyContent="space-between" gap="$2">
              <Text fontSize="$2" color={brand.grafite70}>
                {item.name}
              </Text>
              <Text fontSize="$2" color={brand.grafite}>
                €{(item.priceEurCents / 100).toFixed(2)}
              </Text>
            </XStack>
          ))}
          <XStack justifyContent="space-between" gap="$2">
            <Text fontSize="$2" fontWeight="700" color={brand.grafite}>
              Totale
            </Text>
            <Text fontSize="$2" fontWeight="700" color={brand.cianografia}>
              €{(booking.finalAmountEurCents / 100).toFixed(2)}
            </Text>
          </XStack>
        </YStack>
      ) : null}

      {isCanceled && booking.cancellationNote ? (
        <YStack gap="$1" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto} marginTop="$1">
          <Text fontSize="$2" fontWeight="600" color={brand.grafite}>
            Nota lasciata al cliente
          </Text>
          <Text fontSize="$2" color={brand.grafite70}>
            {booking.cancellationNote}
          </Text>
        </YStack>
      ) : null}

      {booking.refundRequested ? (
        <YStack
          gap="$1"
          paddingTop="$1"
          paddingHorizontal="$2"
          paddingBottom="$2"
          borderWidth={1}
          borderColor={brand.urgenza}
          backgroundColor={brand.urgenzaVelo}
          borderRadius="$2"
          marginTop="$1"
        >
          <Text fontSize="$2" fontWeight="700" color={brand.urgenza}>
            Il cliente ha segnalato che non ti sei presentato
          </Text>
          <Text fontSize="$2" color={brand.grafite70}>
            Ha chiesto un rimborso. Contattalo per chiarire la situazione.
          </Text>
        </YStack>
      ) : null}

      {/* Link consulenza video (Meet/Zoom/ecc.), visibile al cliente —
          richiesta esplicita dell'utente, stesso campo di
          BookingDetailPanel. */}
      <YStack gap="$1" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto} marginTop="$1">
        <Text fontSize="$2" fontWeight="600" color={brand.grafite}>
          Link videochiamata (visibile al cliente)
        </Text>
        <input
          value={meetingLinkDraft}
          onChange={(e) => setMeetingLinkDraft(e.target.value)}
          placeholder="https://meet.google.com/..."
          style={{
            width: "100%",
            padding: 8,
            borderRadius: 4,
            border: `1px solid ${brand.filetto}`,
            fontSize: 13,
            fontFamily: "inherit",
            color: brand.grafite,
          }}
        />
        {meetingLinkChanged ? (
          <Button
            variant="secondary"
            size="$2"
            height={32}
            alignSelf="flex-start"
            disabled={isSavingMeetingLink}
            opacity={isSavingMeetingLink ? 0.6 : 1}
            onPress={handleSaveMeetingLink}
          >
            {isSavingMeetingLink ? "Salvataggio..." : "Salva link"}
          </Button>
        ) : null}
      </YStack>

      {/* Nota privata del professionista (mai vista dal cliente) — stesso
          campo/pattern già in uso in BookingDetailPanel (calendario
          "Prenotazioni"), richiesta esplicita dell'utente di vederla anche
          qui. */}
      <YStack gap="$1" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto} marginTop="$1">
        <Text fontSize="$2" fontWeight="600" color={brand.grafite}>
          Note personali (solo per te)
        </Text>
        <textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          placeholder="Es. portare il pezzo di ricambio, citofono guasto..."
          rows={2}
          maxLength={2000}
          style={{
            width: "100%",
            padding: 8,
            borderRadius: 4,
            border: `1px solid ${brand.filetto}`,
            fontSize: 13,
            fontFamily: "inherit",
            color: brand.grafite,
            resize: "vertical",
          }}
        />
        {noteChanged ? (
          <Button
            variant="secondary"
            size="$2"
            height={32}
            alignSelf="flex-start"
            disabled={isSavingNote}
            opacity={isSavingNote ? 0.6 : 1}
            onPress={handleSaveNote}
          >
            {isSavingNote ? "Salvataggio..." : "Salva nota"}
          </Button>
        ) : null}
      </YStack>

      {showCompleteModal ? (
        <CompleteJobModal
          quotedItems={booking.items}
          onClose={() => setShowCompleteModal(false)}
          onComplete={handleComplete}
          uploadPhoto={(file) => apiClient.uploadBookingCompletionPhoto(token, file).then((r) => r.imageUrl)}
        />
      ) : null}
      {showClientReviewModal ? (
        <ReviewModal
          title="Recensisci il cliente"
          subtitle="Com'è andato il lavoro con questo cliente? La tua recensione sarà visibile solo nella sua scheda."
          uploadPhoto={(file) => apiClient.uploadClientReviewPhoto(token, file).then((r) => r.imageUrl)}
          onSubmit={handleSubmitClientReview}
          onClose={() => setShowClientReviewModal(false)}
        />
      ) : null}
      {showCancelModal ? <CancelBookingModal onClose={() => setShowCancelModal(false)} onCancel={handleCancel} /> : null}
      {openPhotoIndex !== null ? (
        <PhotoLightbox photos={booking.photoUrls} initialIndex={openPhotoIndex} onClose={() => setOpenPhotoIndex(null)} />
      ) : null}
      {showTimeline && booking.guidedRequestId && myProfileId ? (
        <TimelineModal
          token={token}
          guidedRequestId={booking.guidedRequestId}
          professionalProfileId={myProfileId}
          viewerRole="PROFESSIONAL"
          onClose={() => setShowTimeline(false)}
        />
      ) : null}
    </Surface>
  );
}

const BOOST_OPTIONS: { type: "BOOST_LOCALE" | "BADGE_REPUTAZIONE" | "STORIA_SUCCESSO"; label: string; description: string; priceEur: number }[] = [
  { type: "BOOST_LOCALE", label: "Boost locale", description: "Prime posizioni nei risultati per 30 giorni.", priceEur: 19.9 },
  { type: "BADGE_REPUTAZIONE", label: "Badge reputazione", description: "Evidenza per rating alto e risposta rapida.", priceEur: 9.9 },
  { type: "STORIA_SUCCESSO", label: "Storia di successo", description: "Contenuto editoriale in evidenza sulla piattaforma.", priceEur: 49.9 },
];

function BoostSection({ token }: { token: string }) {
  const [loadingType, setLoadingType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleBuy(type: (typeof BOOST_OPTIONS)[number]["type"]) {
    setError(null);
    setLoadingType(type);
    try {
      const { url } = await apiClient.createBoostCheckout(token, type);
      if (url) {
        window.location.href = url;
      } else {
        setError("Checkout non disponibile al momento.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setLoadingType(null);
    }
  }

  return (
    <YStack gap="$3">
      <SectionTitle>Aumenta la tua visibilità</SectionTitle>
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      <YStack gap="$3" $gtSm={{ flexDirection: "row" }}>
        {BOOST_OPTIONS.map((option) => (
          <Surface key={option.type} flex={1} gap="$2">
            <Badge variant="pro">{option.label}</Badge>
            <Text color={brand.grafite70} fontSize="$3">
              {option.description}
            </Text>
            <Text fontWeight="700" color={brand.grafite}>
              €{option.priceEur.toFixed(2)}
            </Text>
            <Button
              variant="secondary"
              size="$3"
              height={40}
              alignSelf="flex-start"
              onPress={() => handleBuy(option.type)}
              disabled={loadingType === option.type}
              opacity={loadingType === option.type ? 0.6 : 1}
            >
              {loadingType === option.type ? "Attendi..." : "Acquista"}
            </Button>
          </Surface>
        ))}
      </YStack>
    </YStack>
  );
}

type QuoteItemDraft = { name: string; priceMin: string; priceMax: string };

/** Codifica una fascia come chiave selezionabile in un <select>, decodificata al momento dell'invio. */
function slotKey(slot: ProfessionalAvailableSlot): string {
  return `${slot.date}|${slot.startTime}|${slot.endTime}`;
}

function slotLabel(slot: ProfessionalAvailableSlot): string {
  const date = new Date(`${slot.date}T00:00:00Z`);
  const dateLabel = date.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return `${dateLabel} · ${slot.startTime}–${slot.endTime}`;
}

function LeadCard({
  lead,
  token,
  availableSlots,
  onChanged,
  isNew,
  myProfileId,
}: {
  lead: ProfessionalLead;
  token: string;
  /** Fasce esatte libere della propria agenda (prossimi 14gg): usate per scegliere la data di inizio invece di una data libera. */
  availableSlots: ProfessionalAvailableSlot[];
  onChanged: () => void;
  /** True se questa richiesta ha un aggiornamento non letto — richiesta esplicita dell'utente ("rendilo evidente anche nella lista"). */
  isNew?: boolean;
  /** Proprio profilo, per aprire la cronologia della richiesta (richiesta esplicita dell'utente) — null finché non ancora caricato. */
  myProfileId: string | null;
}) {
  const [showForm, setShowForm] = useState(false);
  // Una voce di default ("Manodopera") già pronta, il professionista può
  // rinominarla/rimuoverla e aggiungerne altre (es. "Materiali", "Trasporto")
  // — ogni voce ha il proprio range di prezzo, non più due campi fissi
  // manodopera/materiali — richiesta esplicita dell'utente.
  const [items, setItems] = useState<QuoteItemDraft[]>([{ name: "Manodopera", priceMin: "", priceMax: "" }]);
  // Solo le fasce che offrono la stessa modalità della richiesta originale
  // (richiesta esplicita dell'utente: "differenzia sempre se si è partiti
  // con una consulenza online... devono uscire solo le date e fasce orarie
  // disponibili online") — capienze home/online indipendenti, null (richieste
  // precedenti a questa funzionalità) ricade su "a domicilio".
  const modeAvailableSlots = availableSlots.filter((s) => (lead.guidedRequest.serviceMode === "ONLINE" ? s.onlineAvailable : s.homeAvailable));
  // Se la richiesta è nata da una fascia generica dell'agenda pubblica
  // (preferredDate/preferredTimeSlot), preseleziona quella stessa fascia
  // invece della prima disponibile qualsiasi — richiesta esplicita
  // dell'utente: il professionista deve proporre l'orario che il cliente
  // ha effettivamente richiesto, non uno scelto a caso dalla propria
  // agenda. Ricade sulla prima fascia libera se quella richiesta non è
  // (più) tra le fasce esatte libere (es. slot esatto già preso da un
  // altro impegno nel frattempo).
  const requestedSlotKey =
    lead.guidedRequest.preferredDate && lead.guidedRequest.preferredTimeSlot
      ? modeAvailableSlots.find(
          (s) => s.date === lead.guidedRequest.preferredDate && `${s.startTime}-${s.endTime}` === lead.guidedRequest.preferredTimeSlot,
        )
      : undefined;
  const [selectedSlotKey, setSelectedSlotKey] = useState(
    requestedSlotKey ? slotKey(requestedSlotKey) : modeAvailableSlots[0] ? slotKey(modeAvailableSlots[0]) : "",
  );
  // Ripiego se l'agenda non ha fasce esatte libere nei prossimi 14gg (es.
  // professionista che non l'ha ancora impostata): una data libera come
  // prima, per non bloccare comunque l'invio del preventivo.
  const [fallbackDate, setFallbackDate] = useState("");
  const [notes, setNotes] = useState("");
  const sent = lead.quote !== null;
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmingDate, setIsConfirmingDate] = useState(false);
  const [isRejectingDate, setIsRejectingDate] = useState(false);
  const [showCounterForm, setShowCounterForm] = useState(false);
  const [counterSlotKey, setCounterSlotKey] = useState("");
  const [counterNote, setCounterNote] = useState("");
  const [isCountering, setIsCountering] = useState(false);
  const [showClientProfile, setShowClientProfile] = useState(false);
  const [openPhotoIndex, setOpenPhotoIndex] = useState<number | null>(null);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  // Cronologia completa della richiesta (richiesta esplicita dell'utente:
  // "ognuno cliccando ad esempio sul preventivo possa vedere la cronologia
  // completa").
  const [showTimeline, setShowTimeline] = useState(false);
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [confirmingDeleteLead, setConfirmingDeleteLead] = useState(false);
  const [isDeletingLead, setIsDeletingLead] = useState(false);
  const clientName = lead.guidedRequest.clientName ?? "Cliente";
  const clientAccountDeleted = lead.guidedRequest.clientAccountDeleted;
  // Un preventivo ritirato da questo stesso professionista non porterà mai
  // a nulla — richiesta esplicita dell'utente di poter eliminare anche
  // questi dalla lista, stesso meccanismo già in uso per l'account cliente
  // eliminato (`canDeleteLead`, condivide lo stesso blocco UI sotto).
  const quoteWithdrawn = lead.quote?.status === "WITHDRAWN";
  const canDeleteLead = clientAccountDeleted || quoteWithdrawn;

  function updateItem(index: number, field: "name" | "priceMin" | "priceMax", value: string) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSendQuote() {
    setError(null);

    const cleanedItems = items.map((item) => ({ ...item, name: item.name.trim() })).filter((item) => item.name.length > 0);
    if (cleanedItems.length === 0) {
      setError("Aggiungi almeno una voce al preventivo.");
      return;
    }

    const parsedItems: { name: string; priceMinEurCents?: number; priceMaxEurCents?: number }[] = [];
    for (const item of cleanedItems) {
      const priceMinEurCents = item.priceMin.trim() ? Math.round(Number(item.priceMin.replace(",", ".")) * 100) : undefined;
      const priceMaxEurCents = item.priceMax.trim() ? Math.round(Number(item.priceMax.replace(",", ".")) * 100) : undefined;
      if (item.priceMin.trim() && !Number.isFinite(priceMinEurCents)) {
        setError(`Prezzo minimo non valido per "${item.name}".`);
        return;
      }
      if (item.priceMax.trim() && !Number.isFinite(priceMaxEurCents)) {
        setError(`Prezzo massimo non valido per "${item.name}".`);
        return;
      }
      if (priceMinEurCents === undefined && priceMaxEurCents === undefined) {
        setError(`Indica almeno un prezzo per "${item.name}".`);
        return;
      }
      if (priceMinEurCents !== undefined && priceMaxEurCents !== undefined && priceMaxEurCents < priceMinEurCents) {
        setError(`Il prezzo massimo di "${item.name}" dev'essere maggiore o uguale al minimo.`);
        return;
      }
      parsedItems.push({ name: item.name, priceMinEurCents, priceMaxEurCents });
    }

    let estimatedStartDate: string;
    // Fine della fascia scelta (richiesta esplicita dell'utente: mostrare
    // tutta la fascia oraria, non solo l'inizio) — nota solo quando la data
    // viene da una fascia reale dell'agenda, non dall'input libero di
    // fallback (nessun concetto di "fine" per una data indicata a mano).
    let estimatedEndDate: string | undefined;
    if (modeAvailableSlots.length > 0) {
      const slot = modeAvailableSlots.find((s) => slotKey(s) === selectedSlotKey);
      if (!slot) {
        setError("Scegli un orario dalla tua agenda.");
        return;
      }
      estimatedStartDate = new Date(`${slot.date}T${slot.startTime}:00.000Z`).toISOString();
      estimatedEndDate = new Date(`${slot.date}T${slot.endTime}:00.000Z`).toISOString();
    } else {
      if (!fallbackDate) {
        setError("Indica una data di inizio stimata.");
        return;
      }
      estimatedStartDate = new Date(fallbackDate).toISOString();
    }

    setIsSubmitting(true);
    try {
      await apiClient.createQuote(token, {
        requestId: lead.guidedRequest.id,
        items: parsedItems,
        estimatedStartDate,
        estimatedEndDate,
        notes: notes.trim() || undefined,
      });
      setShowForm(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirmDate() {
    if (!lead.quote) return;
    setError(null);
    setIsConfirmingDate(true);
    try {
      await apiClient.confirmProposedQuoteDate(token, lead.quote.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsConfirmingDate(false);
    }
  }

  async function handleRejectDate() {
    if (!lead.quote) return;
    setError(null);
    setIsRejectingDate(true);
    try {
      await apiClient.rejectProposedQuoteDate(token, lead.quote.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsRejectingDate(false);
    }
  }

  // "Modifica" (richiesta esplicita dell'utente): invece di limitarsi a
  // confermare o rifiutare la data proposta dal cliente, il professionista
  // può modificarla direttamente — precompilata sull'ultima data/orario
  // proposti, editabile tra le fasce libere della propria agenda, con una
  // nota facoltativa.
  function startCounterProposing() {
    if (!lead.quote) return;
    const proposedDate = lead.quote.clientProposedDate?.slice(0, 10);
    const proposedTime = lead.quote.clientProposedDate?.slice(11, 16);
    const matchingSlot = modeAvailableSlots.find((s) => s.date === proposedDate && s.startTime === proposedTime);
    setCounterSlotKey(matchingSlot ? slotKey(matchingSlot) : modeAvailableSlots[0] ? slotKey(modeAvailableSlots[0]) : "");
    setCounterNote("");
    setError(null);
    setShowCounterForm(true);
  }

  async function handleCounterPropose() {
    if (!lead.quote) return;
    const slot = modeAvailableSlots.find((s) => slotKey(s) === counterSlotKey);
    if (!slot) {
      setError("Scegli un orario dalla tua agenda.");
      return;
    }
    setError(null);
    setIsCountering(true);
    try {
      await apiClient.counterProposeQuoteDate(token, lead.quote.id, {
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        note: counterNote.trim() || undefined,
      });
      setShowCounterForm(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsCountering(false);
    }
  }

  // Riapre il modulo precompilato con il preventivo già inviato (richiesta
  // esplicita dell'utente: "dai la possibilità di modificare un
  // preventivo") — consentito solo mentre lo stato è SENT, stessa guardia
  // applicata lato server in QuotesService.createOrUpdate.
  function startEditingQuote() {
    if (!lead.quote) return;
    setItems(
      lead.quote.items.map((item) => ({
        name: item.name,
        priceMin: item.priceMinEurCents != null ? (item.priceMinEurCents / 100).toString() : "",
        priceMax: item.priceMaxEurCents != null ? (item.priceMaxEurCents / 100).toString() : "",
      })),
    );
    setNotes(lead.quote.notes ?? "");
    const quoteDate = lead.quote.estimatedStartDate.slice(0, 10);
    const quoteTime = lead.quote.estimatedStartDate.slice(11, 16);
    const matchingSlot = modeAvailableSlots.find((s) => s.date === quoteDate && s.startTime === quoteTime);
    if (matchingSlot) {
      setSelectedSlotKey(slotKey(matchingSlot));
    } else {
      setFallbackDate(quoteDate);
    }
    setError(null);
    setShowForm(true);
  }

  async function handleDeclineLead(note: string | undefined) {
    await apiClient.declineLead(token, lead.id, note);
    setShowDeclineModal(false);
    onChanged();
  }

  async function handleWithdrawQuote() {
    if (!lead.quote) return;
    setError(null);
    setIsWithdrawing(true);
    try {
      await apiClient.withdrawQuote(token, lead.quote.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
      setConfirmingWithdraw(false);
    } finally {
      setIsWithdrawing(false);
    }
  }

  // Richiesta esplicita dell'utente: quando l'account cliente è stato
  // eliminato, la richiesta non è più azionabile (nessun preventivo
  // inviabile) e resterebbe altrimenti a ingombrare la lista per sempre —
  // il professionista può eliminarla dalla propria vista. `onChanged()`
  // ricarica la lista intera, che quindi non conterrà più questa card.
  async function handleDeleteLead() {
    setError(null);
    setIsDeletingLead(true);
    try {
      await apiClient.deleteLead(token, lead.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
      setConfirmingDeleteLead(false);
    } finally {
      setIsDeletingLead(false);
    }
  }

  return (
    <Surface gap="$2">
      <YStack flexDirection="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap="$2">
        {/* `flexBasis={0}`/`minWidth={0}` insieme a `flex={1}`: senza
            questi, il blocco si dimensiona sulla larghezza "a contenuto
            pieno" (non spezzata) del testo interno invece di rispettare lo
            spazio disponibile — stesso bug già corretto altrove per lo
            stesso motivo (CLAUDE.md §12, ProfessionalCard). */}
        <YStack gap="$1" flex={1} flexBasis={0} minWidth={0}>
          <XStack alignItems="center" gap="$2" flexWrap="wrap">
            {/* Nome del cliente, cliccabile: apre la scheda profilo minimale
                (richiesta esplicita dell'utente). Nessuna pagina pubblica
                per i clienti in questo marketplace (a differenza dei
                professionisti, /professionista/[id]): la scheda è un
                overlay, non una navigazione. */}
            {clientAccountDeleted ? (
              // Stesso stile neutro già in uso per un altro stato "non più
              // azionabile" (Richiesta scaduta, sotto): niente Badge
              // colorato, non è né un successo né un'urgenza.
              <Text fontSize="$3" fontWeight="700" color={brand.grafite70}>
                Account eliminato
              </Text>
            ) : (
              <Text
                fontWeight="700"
                color={brand.cianografia}
                cursor="pointer"
                accessibilityRole="button"
                onPress={() => setShowClientProfile(true)}
              >
                {clientName}
              </Text>
            )}
            <Text fontWeight="700" color={brand.grafite}>
              · {lead.guidedRequest.categoryLabel}
              {lead.guidedRequest.city ? ` · ${lead.guidedRequest.city}` : ""}
            </Text>
            {lead.guidedRequest.isUrgent ? <Badge variant="urgente">Urgente</Badge> : null}
            {isNew ? <Badge variant="nuovo">Nuovo</Badge> : null}
            {myProfileId ? (
              <Text
                fontSize="$2"
                fontWeight="600"
                color={brand.cianografia}
                cursor="pointer"
                accessibilityRole="button"
                onPress={() => setShowTimeline(true)}
              >
                Contatta/Cronologia
              </Text>
            ) : null}
          </XStack>
          {lead.guidedRequest.serviceMode ? (
            <XStack alignItems="center" gap="$1">
              <Icon name={lead.guidedRequest.serviceMode === "ONLINE" ? "video" : "house"} size={12} color={brand.cianografia} strokeWidth={1.5} />
              <Text fontSize="$2" color={brand.cianografia} fontWeight="600">
                {lead.guidedRequest.serviceMode === "ONLINE" ? "Online" : "A domicilio"}
              </Text>
            </XStack>
          ) : null}
          <Text color={brand.grafite70}>{lead.guidedRequest.description}</Text>
          {lead.guidedRequest.address ? (
            <XStack alignItems="center" gap="$1">
              <Icon name="map-pin" size={12} color={brand.grafite70} strokeWidth={1.5} />
              <Text fontSize="$2" color={brand.grafite70}>
                {lead.guidedRequest.address}
              </Text>
            </XStack>
          ) : null}
          {/*
            Data/fascia oraria richiesta dal cliente (solo se la richiesta
            parte da una fascia "generica" dell'agenda pubblica) — bug reale
            segnalato dall'utente: il backend la esponeva già
            (guidedRequest.preferredDate/preferredTimeSlot) ma la card non la
            mostrava mai, quindi il professionista non sapeva quale
            orario riproporre nel proprio preventivo.
          */}
          {lead.guidedRequest.preferredDate && lead.guidedRequest.preferredTimeSlot ? (
            <XStack alignItems="center" gap="$1">
              <Icon name="calendar" size={12} color={brand.grafite70} strokeWidth={1.5} />
              <Text fontSize="$2" color={brand.grafite70} fontWeight="600">
                Orario richiesto:{" "}
                {new Date(`${lead.guidedRequest.preferredDate}T00:00:00Z`).toLocaleDateString("it-IT", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  timeZone: "UTC",
                })}
                {" · "}
                {lead.guidedRequest.preferredTimeSlot.replace("-", "–")}
              </Text>
            </XStack>
          ) : null}
        </YStack>
        {lead.status === "DECLINED" ? (
          <Text fontSize="$2" color={brand.urgenza} fontWeight="600">
            Richiesta rifiutata
          </Text>
        ) : lead.status === "EXPIRED" ? (
          <Text fontSize="$2" color={brand.grafite70} fontWeight="600">
            Richiesta scaduta
          </Text>
        ) : sent && lead.quote?.status !== "MODIFICATION_REQUESTED" ? (
          <Text
            fontSize="$2"
            fontWeight="600"
            color={
              lead.quote?.status === "REJECTED" || lead.quote?.status === "WITHDRAWN" ? brand.urgenza : brand.verificato
            }
          >
            {lead.quote?.status === "ACCEPTED"
              ? "Preventivo accettato"
              : lead.quote?.status === "REJECTED"
                ? "Preventivo rifiutato"
                : lead.quote?.status === "WITHDRAWN"
                  ? "Preventivo ritirato"
                  : "Preventivo inviato"}
          </Text>
        ) : null}
      </YStack>

      {/* Stepper di stato in stile Deliveroo, stesso componente già in uso
          lato cliente (`/le-mie-richieste`) — richiesta esplicita
          dell'utente: visibile anche dall'account professionista, non solo
          dal cliente. `lead.quote` è al più uno (un professionista invia un
          solo preventivo per richiesta), adattato all'array atteso da
          computeRequestStage. */}
      <RequestStepper
        stage={computeRequestStage(lead.quote ? [{ status: lead.quote.status, bookingStatus: lead.quote.bookingStatus }] : [])}
      />

      {lead.status === "DECLINED" && lead.declineNote ? (
        <YStack gap="$1" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto} marginTop="$1">
          <Text fontSize="$2" fontWeight="600" color={brand.grafite}>
            Nota lasciata al cliente
          </Text>
          <Text fontSize="$2" color={brand.grafite70}>
            {lead.declineNote}
          </Text>
        </YStack>
      ) : null}

      {/* Il preventivo già inviato, visibile al professionista che lo ha
          mandato (richiesta esplicita dell'utente) — prima solo lo stato
          era mostrato, non il contenuto effettivo. */}
      {sent && lead.quote ? (
        <YStack gap="$1" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto} marginTop="$1">
          <XStack alignItems="center" gap="$2">
            <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.grafite70}>
              Il tuo preventivo
            </Text>
            {/* Simbolo sul preventivo (richiesta esplicita dell'utente):
                qui il lead ha al più un solo preventivo proprio, quindi lo
                stesso isNew della card basta a indicare che è questo. */}
            {isNew ? <Badge variant="nuovo">Nuovo</Badge> : null}
          </XStack>
          {lead.quote.items.map((item) => (
            <XStack key={item.id} justifyContent="space-between" gap="$2">
              <Text fontSize="$3" color={brand.grafite}>
                {item.name}
              </Text>
              <Text fontSize="$3" color={brand.grafite} fontWeight="600">
                {formatServicePriceRange(item.priceMinEurCents, item.priceMaxEurCents)}
              </Text>
            </XStack>
          ))}
          <Text fontSize="$3" color={brand.grafite70}>
            Data di inizio: {formatDateTimeRange(lead.quote.estimatedStartDate, lead.quote.estimatedEndDate)}
          </Text>
          <Text fontSize="$2" color={brand.grafite70}>
            Inviato il {formatSentAt(lead.quote.sentAt)}
          </Text>
          {lead.quote.notes ? (
            <Text fontSize="$3" color={brand.grafite70}>
              {lead.quote.notes}
            </Text>
          ) : null}

          {lead.quote.status === "SENT" && !showForm ? (
            <XStack gap="$2" flexWrap="wrap" paddingTop="$1" alignItems="center">
              {!clientAccountDeleted ? (
                <Button variant="secondary" size="$2" height={36} onPress={startEditingQuote}>
                  Modifica preventivo
                </Button>
              ) : null}
              {confirmingWithdraw ? (
                <>
                  <Text fontSize="$2" color={brand.urgenza}>
                    Ritirare questo preventivo?
                  </Text>
                  <Button variant="urgent" size="$2" height={36} onPress={handleWithdrawQuote} disabled={isWithdrawing} opacity={isWithdrawing ? 0.6 : 1}>
                    {isWithdrawing ? "Ritiro..." : "Conferma"}
                  </Button>
                  <Button variant="ghost" size="$2" height={36} onPress={() => setConfirmingWithdraw(false)}>
                    Annulla
                  </Button>
                </>
              ) : (
                <Text
                  color={brand.urgenza}
                  fontWeight="600"
                  fontSize="$2"
                  cursor="pointer"
                  accessibilityRole="button"
                  onPress={() => setConfirmingWithdraw(true)}
                >
                  Ritira preventivo
                </Text>
              )}
            </XStack>
          ) : null}
        </YStack>
      ) : null}

      {lead.quote?.status === "MODIFICATION_REQUESTED" && lead.quote.clientProposedDate ? (
        <YStack
          gap="$2"
          borderWidth={1}
          borderColor={brand.ottone}
          backgroundColor={brand.calce}
          borderRadius="$3"
          padding="$3"
        >
          <Text fontSize="$3" fontWeight="600" color={brand.grafite}>
            {(() => {
              const kind = describeDateChangeKind(
                lead.quote.estimatedStartDate,
                lead.quote.estimatedEndDate,
                lead.quote.clientProposedDate,
                lead.quote.clientProposedEndDate,
              );
              const range = formatDateTimeRange(lead.quote.clientProposedDate, lead.quote.clientProposedEndDate);
              if (kind === "none") return `Il cliente ti ha scritto (stessa data: ${range}):`;
              if (kind === "time") return `Il cliente ha proposto un altro orario: ${range}`;
              if (kind === "date") return `Il cliente ha proposto un'altra data: ${range}`;
              return `Il cliente ha proposto un'altra data e orario: ${range}`;
            })()}
          </Text>
          {lead.quote.clientProposedNote ? (
            <Text fontSize="$3" color={brand.grafite70}>
              {lead.quote.clientProposedNote}
            </Text>
          ) : null}
          {!showCounterForm ? (
            <XStack gap="$2" flexWrap="wrap">
              <Button
                backgroundColor={brand.verificato}
                borderWidth={0}
                color="white"
                size="$3"
                height={40}
                onPress={handleConfirmDate}
                disabled={isConfirmingDate || isRejectingDate}
                opacity={isConfirmingDate ? 0.6 : 1}
              >
                {isConfirmingDate ? "Conferma..." : "Conferma"}
              </Button>
              <Button
                backgroundColor={brand.ottone}
                borderWidth={0}
                color="white"
                size="$3"
                height={40}
                onPress={startCounterProposing}
                disabled={isConfirmingDate || isRejectingDate}
              >
                Modifica
              </Button>
              <Button
                variant="urgent"
                size="$3"
                height={40}
                onPress={handleRejectDate}
                disabled={isConfirmingDate || isRejectingDate}
                opacity={isRejectingDate ? 0.6 : 1}
              >
                {isRejectingDate ? "Rifiuto..." : "Rifiuta"}
              </Button>
            </XStack>
          ) : (
            <YStack gap="$2" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto}>
              {modeAvailableSlots.length > 0 ? (
                <select value={counterSlotKey} onChange={(e) => setCounterSlotKey(e.target.value)} style={smallInputStyle}>
                  {modeAvailableSlots.map((slot) => {
                    const key = slotKey(slot);
                    const label = `${new Date(`${slot.date}T00:00:00Z`).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} · ${slot.startTime}–${slot.endTime}`;
                    return (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              ) : (
                <Text fontSize="$2" color={brand.grafite70}>
                  Nessun orario libero nella tua agenda al momento.
                </Text>
              )}
              <textarea
                value={counterNote}
                onChange={(e) => setCounterNote(e.target.value)}
                placeholder="Scrivi qualcosa al cliente (opzionale)"
                rows={2}
                style={{ ...smallInputStyle, width: "100%", resize: "vertical" as const }}
              />
              <XStack gap="$2">
                <Button
                  backgroundColor={brand.ottone}
                  borderWidth={0}
                  color="white"
                  size="$3"
                  height={40}
                  onPress={handleCounterPropose}
                  disabled={isCountering}
                  opacity={isCountering ? 0.6 : 1}
                >
                  {isCountering ? "Invio..." : "Invia"}
                </Button>
                <Button variant="ghost" size="$3" height={40} onPress={() => setShowCounterForm(false)} disabled={isCountering}>
                  Annulla
                </Button>
              </XStack>
            </YStack>
          )}
        </YStack>
      ) : null}

      {lead.guidedRequest.photoUrls.length > 0 ? (
        <XStack gap="$2" flexWrap="wrap">
          {lead.guidedRequest.photoUrls.map((url, index) => (
            // Cliccabile per aprirla a schermo intero (richiesta esplicita
            // dell'utente, "vederla meglio"): stesso PhotoLightbox già usato
            // per le foto delle recensioni, nessun nuovo componente.
            <MediaPreview
              key={url}
              url={url}
              onClick={() => setOpenPhotoIndex(index)}
              style={{ width: 72, height: 72, borderRadius: 6, border: `1px solid ${brand.filetto}`, cursor: "pointer" }}
            />
          ))}
        </XStack>
      ) : null}

      {openPhotoIndex !== null ? (
        <PhotoLightbox photos={lead.guidedRequest.photoUrls} initialIndex={openPhotoIndex} onClose={() => setOpenPhotoIndex(null)} />
      ) : null}

      {!sent && !showForm && lead.status !== "DECLINED" && lead.status !== "EXPIRED" ? (
        clientAccountDeleted ? (
          // Richiesta esplicita dell'utente: nessuna nuova operazione su un
          // preventivo il cui cliente ha eliminato l'account — non
          // riceverebbe mai risposta. La richiesta resta comunque visibile
          // ("traccia completa"), solo l'invio è bloccato.
          <Text fontSize="$2" color={brand.grafite70}>
            Il cliente ha eliminato il proprio account: non puoi più inviare un preventivo per questa richiesta.
          </Text>
        ) : (
          <XStack gap="$3" alignItems="center" flexWrap="wrap">
            <Button variant="secondary" size="$3" height={40} alignSelf="flex-start" onPress={() => setShowForm(true)}>
              Invia preventivo
            </Button>
            <Text
              color={brand.urgenza}
              fontWeight="600"
              fontSize="$3"
              cursor="pointer"
              accessibilityRole="button"
              onPress={() => setShowDeclineModal(true)}
            >
              Rifiuta richiesta
            </Text>
          </XStack>
        )
      ) : null}

      {/* Eliminazione dalla lista, richiesta esplicita dell'utente — mostrata
          a prescindere dallo stato del lead (preventivo inviato o no, anche
          rifiutato/scaduto): un account eliminato, o un preventivo che il
          professionista stesso ha ritirato, non tornano mai più azionabili,
          la richiesta resterebbe altrimenti a ingombrare la lista per
          sempre. Doppia conferma, stesso pattern già in uso per "Ritira
          preventivo" sopra. */}
      {canDeleteLead ? (
        <XStack gap="$2" alignItems="center" flexWrap="wrap" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto} marginTop="$1">
          {confirmingDeleteLead ? (
            <>
              <Text fontSize="$2" color={brand.urgenza}>
                {quoteWithdrawn && !clientAccountDeleted ? "Eliminare questo preventivo ritirato dalla lista?" : "Eliminare questa richiesta dalla lista?"}
              </Text>
              <Button variant="urgent" size="$2" height={36} onPress={handleDeleteLead} disabled={isDeletingLead} opacity={isDeletingLead ? 0.6 : 1}>
                {isDeletingLead ? "Eliminazione..." : "Conferma"}
              </Button>
              <Button variant="ghost" size="$2" height={36} onPress={() => setConfirmingDeleteLead(false)}>
                Annulla
              </Button>
            </>
          ) : (
            <Text
              color={brand.urgenza}
              fontWeight="600"
              fontSize="$2"
              cursor="pointer"
              accessibilityRole="button"
              onPress={() => setConfirmingDeleteLead(true)}
            >
              {quoteWithdrawn && !clientAccountDeleted ? "Elimina preventivo ritirato" : "Elimina richiesta"}
            </Text>
          )}
        </XStack>
      ) : null}

      {showDeclineModal ? (
        <CancelBookingModal
          onClose={() => setShowDeclineModal(false)}
          onCancel={handleDeclineLead}
          title="Rifiuta richiesta"
          description="Il cliente verrà avvisato che hai rifiutato la richiesta. Puoi lasciare una nota facoltativa per spiegargli il motivo."
          notePlaceholder="Es. Non copro quella zona."
          confirmLabel="Conferma rifiuto"
          confirmingLabel="Rifiuto..."
        />
      ) : null}

      {showForm ? (
        <YStack gap="$2" paddingTop="$2" borderTopWidth={1} borderTopColor={brand.filetto}>
          <YStack gap="$2">
            <Text fontSize="$3" fontWeight="600" color={brand.grafite}>
              Voci del preventivo
            </Text>
            {items.map((item, index) => (
              <YStack key={index} flexDirection="row" gap="$2" alignItems="center" flexWrap="wrap">
                <input
                  value={item.name}
                  onChange={(e) => updateItem(index, "name", e.target.value)}
                  placeholder="Es. Manodopera"
                  style={{ ...smallInputStyle, flex: 1, minWidth: 140 }}
                />
                <input
                  value={item.priceMin}
                  onChange={(e) => updateItem(index, "priceMin", e.target.value)}
                  placeholder="Da €"
                  inputMode="decimal"
                  style={{ ...smallInputStyle, width: 90 }}
                />
                <Text fontSize="$2" color={brand.grafite70}>
                  a
                </Text>
                <input
                  value={item.priceMax}
                  onChange={(e) => updateItem(index, "priceMax", e.target.value)}
                  placeholder="A €"
                  inputMode="decimal"
                  style={{ ...smallInputStyle, width: 90 }}
                />
                {items.length > 1 ? (
                  <Button variant="ghost" size="$2" height={36} onPress={() => removeItem(index)} accessibilityLabel="Rimuovi voce">
                    <X size={14} strokeWidth={1.5} color={brand.grafite} />
                  </Button>
                ) : null}
              </YStack>
            ))}
            <Button
              variant="ghost"
              size="$2"
              height={36}
              alignSelf="flex-start"
              onPress={() => setItems((prev) => [...prev, { name: "", priceMin: "", priceMax: "" }])}
            >
              + Aggiungi voce
            </Button>
          </YStack>
          <YStack gap="$1">
            <Text fontSize="$2" fontWeight="600" color={brand.grafite}>
              Data di inizio
            </Text>
            {modeAvailableSlots.length > 0 ? (
              <select
                value={selectedSlotKey}
                onChange={(e) => setSelectedSlotKey(e.target.value)}
                style={{ ...smallInputStyle, alignSelf: "flex-start" }}
              >
                {modeAvailableSlots.map((slot) => (
                  <option key={slotKey(slot)} value={slotKey(slot)}>
                    {slotLabel(slot)}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input
                  type="date"
                  value={fallbackDate}
                  onChange={(e) => setFallbackDate(e.target.value)}
                  style={{ ...smallInputStyle, alignSelf: "flex-start" }}
                />
                <Text fontSize="$1" color={brand.grafite70}>
                  Nessun orario libero nei prossimi 14 giorni nella tua agenda — imposta le tue fasce in{" "}
                  <Link href="/dashboard/agenda" style={{ color: brand.cianografia }}>
                    Agenda
                  </Link>{" "}
                  per scegliere direttamente da lì.
                </Text>
              </>
            )}
          </YStack>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Note per il cliente"
            rows={2}
            style={{ ...smallInputStyle, resize: "vertical" }}
          />
          {error ? (
            <Text color={brand.urgenza} fontSize="$3">
              {error}
            </Text>
          ) : null}
          <Button variant="primary" size="$3" height={40} alignSelf="flex-start" onPress={handleSendQuote} disabled={isSubmitting} opacity={isSubmitting ? 0.6 : 1}>
            {isSubmitting ? "Invio..." : "Conferma preventivo"}
          </Button>
        </YStack>
      ) : null}

      {showClientProfile ? (
        <ClientProfileModal
          name={clientName}
          phone={lead.guidedRequest.clientPhone}
          email={lead.guidedRequest.clientEmail}
          imageUrl={lead.guidedRequest.clientImageUrl}
          reviews={lead.guidedRequest.clientReviews}
          onClose={() => setShowClientProfile(false)}
        />
      ) : null}

      {showTimeline && myProfileId ? (
        <TimelineModal
          token={token}
          guidedRequestId={lead.guidedRequest.id}
          professionalProfileId={myProfileId}
          viewerRole="PROFESSIONAL"
          onClose={() => setShowTimeline(false)}
        />
      ) : null}
    </Surface>
  );
}
