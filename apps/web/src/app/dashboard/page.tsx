"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import {
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
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { CompleteJobModal } from "@/components/CompleteJobModal";
import { CancelBookingModal } from "@/components/CancelBookingModal";
import { professionalSectionCounts, unreadBookingIds, unreadGuidedRequestIds } from "@/lib/notificationSections";
import { ListControls, Pagination, sortListItems, type ListSortKey } from "@/components/ListControls";

const smallInputStyle = { padding: 10, borderRadius: 4, border: `1px solid ${brand.filetto}`, fontSize: 14, fontFamily: "inherit", color: brand.grafite };

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
        <YStack backgroundColor="$red10" borderRadius={999} minWidth={18} height={18} paddingHorizontal={4} alignItems="center" justifyContent="center">
          <Text fontSize={11} fontWeight="700" color="white" lineHeight={14}>
            {badgeCount > 9 ? "9+" : badgeCount}
          </Text>
        </YStack>
      ) : null}
    </XStack>
  );
}

export default function DashboardPage() {
  const { user, token, isLoading, markNotificationsRead } = useAuth();
  const [activeTab, setActiveTab] = useState<DashboardTab>("richieste");
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
    Promise.all([apiClient.myLeads(token), apiClient.myProfessionalBookings(token), apiClient.myAvailableSlots(token)])
      .then(([leadsResult, bookingsResult, slotsResult]) => {
        setLeads(leadsResult);
        setBookings(bookingsResult);
        setAvailableSlots(slotsResult);
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

        <XStack gap="$2" borderBottomWidth={1} borderBottomColor={brand.filetto}>
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
                  <AcceptedJobCard key={booking.id} booking={booking} token={token} onUpdated={reloadBookings} isNew={newBookingIds.has(booking.id)} />
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
}: {
  booking: ProfessionalBooking;
  token: string;
  onUpdated: () => void;
  /** True se questa prenotazione ha un aggiornamento non letto — richiesta esplicita dell'utente ("rendilo evidente anche nella lista"). */
  isNew?: boolean;
}) {
  const date = new Date(booking.scheduledAt);
  // Indirizzo strutturato (raccolto all'accettazione preventivo) ha
  // priorità su quello libero, quando presente — vedi formatBookingAddress.
  const structuredAddress = formatBookingAddress(booking);
  const recipientFullName = [booking.recipientName, booking.recipientSurname].filter(Boolean).join(" ") || null;
  const isCanceled = booking.status === "CANCELED";
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  // Descrizione/foto della richiesta originale e nota privata del
  // professionista, richiesta esplicita dell'utente: già mostrate nel
  // pannello di dettaglio del calendario "Prenotazioni", ora anche qui —
  // stessi campi già esposti da ProfessionalBooking, nessuna chiamata API
  // aggiuntiva.
  const [openPhotoIndex, setOpenPhotoIndex] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState(booking.professionalNote ?? "");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const noteChanged = noteDraft !== (booking.professionalNote ?? "");

  async function handleComplete(input: CompleteBookingInput) {
    await apiClient.completeBooking(token, booking.id, input);
    setShowCompleteModal(false);
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

  return (
    <Surface gap="$2" borderColor={isCanceled ? brand.urgenza : undefined} borderWidth={isCanceled ? 1.5 : undefined} backgroundColor={isCanceled ? brand.urgenzaVelo : undefined}>
      <YStack flexDirection="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap="$2">
        <YStack gap="$1">
          <Text fontWeight="700" color={brand.grafite}>
            {date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            {" · "}
            {date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
          </Text>
          <XStack alignItems="center" gap="$2">
            <Text
              fontFamily="$mono"
              fontSize={11}
              fontWeight="700"
              letterSpacing={0.5}
              textTransform="uppercase"
              color={isCanceled ? brand.urgenza : booking.status === "COMPLETED" ? brand.grafite70 : brand.verificato}
            >
              {isCanceled ? "Annullata" : booking.status === "COMPLETED" ? "Completato" : "Confermato"}
            </Text>
            {isNew ? <Badge variant="nuovo">Nuovo</Badge> : null}
          </XStack>
        </YStack>
        {booking.status === "CONFIRMED" ? (
          <XStack gap="$2" flexWrap="wrap">
            <Button variant="secondary" size="$2" height={36} onPress={() => setShowCompleteModal(true)}>
              Lavoro terminato
            </Button>
            <Button variant="ghost" size="$2" height={36} onPress={() => setShowCancelModal(true)}>
              <Text color={brand.urgenza} fontWeight="600" fontSize="$2">
                Annulla intervento
              </Text>
            </Button>
          </XStack>
        ) : null}
      </YStack>

      <YStack gap="$1" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto} marginTop="$1">
        <Text fontWeight="600" color={brand.grafite}>
          {recipientFullName ?? booking.clientName ?? "Cliente"}
        </Text>
        {(booking.recipientPhone ?? booking.clientPhone) ? (
          <a href={`tel:${booking.recipientPhone ?? booking.clientPhone}`} style={{ textDecoration: "none" }}>
            <XStack alignItems="center" gap="$1">
              <Icon name="phone" size={12} color={brand.cianografia} strokeWidth={1.5} />
              <Text fontSize="$2" color={brand.cianografia} fontWeight="600">
                {booking.recipientPhone ?? booking.clientPhone}
              </Text>
            </XStack>
          </a>
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
              <img
                key={url}
                src={url}
                alt=""
                onClick={() => setOpenPhotoIndex(index)}
                style={{ width: 56, height: 56, borderRadius: 4, objectFit: "cover", cursor: "pointer", border: `1px solid ${brand.filetto}` }}
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
        <CompleteJobModal quotedItems={booking.items} onClose={() => setShowCompleteModal(false)} onComplete={handleComplete} />
      ) : null}
      {showCancelModal ? <CancelBookingModal onClose={() => setShowCancelModal(false)} onCancel={handleCancel} /> : null}
      {openPhotoIndex !== null ? (
        <PhotoLightbox photos={booking.photoUrls} initialIndex={openPhotoIndex} onClose={() => setOpenPhotoIndex(null)} />
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
}: {
  lead: ProfessionalLead;
  token: string;
  /** Fasce esatte libere della propria agenda (prossimi 14gg): usate per scegliere la data di inizio invece di una data libera. */
  availableSlots: ProfessionalAvailableSlot[];
  onChanged: () => void;
  /** True se questa richiesta ha un aggiornamento non letto — richiesta esplicita dell'utente ("rendilo evidente anche nella lista"). */
  isNew?: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  // Una voce di default ("Manodopera") già pronta, il professionista può
  // rinominarla/rimuoverla e aggiungerne altre (es. "Materiali", "Trasporto")
  // — ogni voce ha il proprio range di prezzo, non più due campi fissi
  // manodopera/materiali — richiesta esplicita dell'utente.
  const [items, setItems] = useState<QuoteItemDraft[]>([{ name: "Manodopera", priceMin: "", priceMax: "" }]);
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
      ? availableSlots.find(
          (s) => s.date === lead.guidedRequest.preferredDate && `${s.startTime}-${s.endTime}` === lead.guidedRequest.preferredTimeSlot,
        )
      : undefined;
  const [selectedSlotKey, setSelectedSlotKey] = useState(
    requestedSlotKey ? slotKey(requestedSlotKey) : availableSlots[0] ? slotKey(availableSlots[0]) : "",
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
  const [showClientProfile, setShowClientProfile] = useState(false);
  const [openPhotoIndex, setOpenPhotoIndex] = useState<number | null>(null);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const clientName = lead.guidedRequest.clientName ?? "Cliente";

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
    if (availableSlots.length > 0) {
      const slot = availableSlots.find((s) => slotKey(s) === selectedSlotKey);
      if (!slot) {
        setError("Scegli un orario dalla tua agenda.");
        return;
      }
      estimatedStartDate = new Date(`${slot.date}T${slot.startTime}:00.000Z`).toISOString();
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
    const matchingSlot = availableSlots.find((s) => s.date === quoteDate && s.startTime === quoteTime);
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

  return (
    <Surface gap="$2">
      <YStack flexDirection="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap="$2">
        <YStack gap="$1" flex={1}>
          <XStack alignItems="center" gap="$2" flexWrap="wrap">
            {/* Nome del cliente, cliccabile: apre la scheda profilo minimale
                (richiesta esplicita dell'utente). Nessuna pagina pubblica
                per i clienti in questo marketplace (a differenza dei
                professionisti, /professionista/[id]): la scheda è un
                overlay, non una navigazione. */}
            <Text
              fontWeight="700"
              color={brand.cianografia}
              cursor="pointer"
              accessibilityRole="button"
              onPress={() => setShowClientProfile(true)}
            >
              {clientName}
            </Text>
            <Text fontWeight="700" color={brand.grafite}>
              · {lead.guidedRequest.categoryLabel} · {lead.guidedRequest.city}
            </Text>
            {lead.guidedRequest.isUrgent ? <Badge variant="urgente">Urgente</Badge> : null}
            {isNew ? <Badge variant="nuovo">Nuovo</Badge> : null}
          </XStack>
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
          <Text fontFamily="$mono" fontSize={11} fontWeight="600" textTransform="uppercase" color={brand.grafite70}>
            Il tuo preventivo
          </Text>
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
            Data di inizio:{" "}
            {new Date(lead.quote.estimatedStartDate).toLocaleDateString("it-IT", {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: "UTC",
            })}
            {" · "}
            {new Date(lead.quote.estimatedStartDate).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}
          </Text>
          {lead.quote.notes ? (
            <Text fontSize="$3" color={brand.grafite70}>
              {lead.quote.notes}
            </Text>
          ) : null}

          {lead.quote.status === "SENT" && !showForm ? (
            <XStack gap="$2" flexWrap="wrap" paddingTop="$1" alignItems="center">
              <Button variant="secondary" size="$2" height={36} onPress={startEditingQuote}>
                Modifica preventivo
              </Button>
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
            Il cliente ha proposto un&apos;altra data:{" "}
            {new Date(lead.quote.clientProposedDate).toLocaleDateString("it-IT", {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: "UTC",
            })}
            {" · "}
            {new Date(lead.quote.clientProposedDate).toLocaleTimeString("it-IT", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "UTC",
            })}
          </Text>
          {lead.quote.clientProposedNote ? (
            <Text fontSize="$3" color={brand.grafite70}>
              {lead.quote.clientProposedNote}
            </Text>
          ) : null}
          <XStack gap="$2">
            <Button
              variant="secondary"
              size="$3"
              height={40}
              onPress={handleConfirmDate}
              disabled={isConfirmingDate || isRejectingDate}
              opacity={isConfirmingDate ? 0.6 : 1}
            >
              {isConfirmingDate ? "Conferma..." : "Conferma questa data"}
            </Button>
            <Button
              variant="ghost"
              size="$3"
              height={40}
              onPress={handleRejectDate}
              disabled={isConfirmingDate || isRejectingDate}
              opacity={isRejectingDate ? 0.6 : 1}
            >
              {isRejectingDate ? "Rifiuto..." : "Rifiuta"}
            </Button>
          </XStack>
        </YStack>
      ) : null}

      {lead.guidedRequest.photoUrls.length > 0 ? (
        <XStack gap="$2" flexWrap="wrap">
          {lead.guidedRequest.photoUrls.map((url, index) => (
            // Cliccabile per aprirla a schermo intero (richiesta esplicita
            // dell'utente, "vederla meglio"): stesso PhotoLightbox già usato
            // per le foto delle recensioni, nessun nuovo componente.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt=""
              onClick={() => setOpenPhotoIndex(index)}
              style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 6, border: `1px solid ${brand.filetto}`, cursor: "pointer" }}
            />
          ))}
        </XStack>
      ) : null}

      {openPhotoIndex !== null ? (
        <PhotoLightbox photos={lead.guidedRequest.photoUrls} initialIndex={openPhotoIndex} onClose={() => setOpenPhotoIndex(null)} />
      ) : null}

      {!sent && !showForm && lead.status !== "DECLINED" && lead.status !== "EXPIRED" ? (
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
            {availableSlots.length > 0 ? (
              <select
                value={selectedSlotKey}
                onChange={(e) => setSelectedSlotKey(e.target.value)}
                style={{ ...smallInputStyle, alignSelf: "flex-start" }}
              >
                {availableSlots.map((slot) => (
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
          onClose={() => setShowClientProfile(false)}
        />
      ) : null}
    </Surface>
  );
}
