"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import {
  buildWhatsAppLink,
  formatBookingAddress,
  formatServicePriceRange,
  quotePriceTotals,
  type CompleteBookingInput,
  type ProfessionalBooking,
  type ProfessionalLead,
} from "@professionisti/shared";
import { Badge, Button, Icon, Surface, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
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
import {
  professionalSectionCounts,
  unreadBookingCounts,
  unreadBookingIds,
  unreadGuidedRequestCounts,
  unreadGuidedRequestIds,
} from "@/lib/notificationSections";
import { UnreadDot } from "@/components/UnreadDot";
import { Pagination, sortListItems } from "@/components/ListControls";

const smallInputStyle = { padding: 10, borderRadius: 4, border: `1px solid ${brand.filetto}`, fontSize: 14, fontFamily: "inherit", color: brand.grafite };

/**
 * Riquadro etichettato (icona + testo mono maiuscolo piccolo sopra, box
 * chiaro sotto) usato nella vista espansa di "Lavori accettati" — richiesta
 * esplicita dell'utente con screenshot di riferimento ("Descrizione
 * lavoro"/"Preventivo"/"Contatti"/"Videochiamata"/"Note personali").
 */
function DetailSection({ icon, label, children }: { icon: import("@professionisti/ui").IconName; label: string; children: React.ReactNode }) {
  return (
    <YStack gap="$2" backgroundColor={brand.gesso} borderRadius={radiusDoc} padding="$3">
      <XStack alignItems="center" gap={6}>
        <Icon name={icon} size={13} color={brand.grafite70} />
        <Text fontSize={11} fontWeight="800" color={brand.grafite70} textTransform="uppercase">
          {label}
        </Text>
      </XStack>
      {children}
    </YStack>
  );
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

/**
 * Etichetta di stato breve per il riepilogo compatto (richiesta esplicita
 * dell'utente, revisione UX: "la dashboard dovrebbe essere un riepilogo...
 * e rimandare all'inbox per il dettaglio") — riusa le stesse categorie già
 * definite per il filtro completo di /dashboard/richieste, senza duplicare
 * la logica.
 */
function leadSummaryLabel(lead: ProfessionalLead): string {
  const match = LEAD_STATUS_OPTIONS.find((option) => option.value !== "all" && leadMatchesStatus(lead, option.value));
  return match?.label ?? "";
}

type BookingStatusFilter = "all" | "toDo" | "completed" | "canceled";
function bookingMatchesStatus(booking: ProfessionalBooking, filter: BookingStatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "completed") return booking.status === "COMPLETED";
  if (filter === "canceled") return booking.status === "CANCELED";
  return booking.status === "CONFIRMED";
}

/**
 * Tre pillole "In agenda"/"Completati"/"Tutti" per "Lavori accettati" —
 * richiesta esplicita dell'utente, con screenshot di riferimento: riusa lo
 * stesso `BookingStatusFilter`/`bookingMatchesStatus` già esistenti
 * ("toDo"→In agenda, mai esposto come tab a sé "Annullati": una
 * prenotazione annullata resta comunque raggiungibile sotto "Tutti", stesso
 * comportamento di `acceptedJobs()` da prima di questo redesign).
 */
const BOOKING_TABS: { value: BookingStatusFilter; label: string }[] = [
  { value: "toDo", label: "In agenda" },
  { value: "completed", label: "Completati" },
  { value: "all", label: "Tutti" },
];

/** Filtro data per "Lavori accettati" (richiesta esplicita dell'utente: "questa settimana/prossima settimana/tutto"). */
type BookingDateFilter = "all" | "thisWeek" | "nextWeek";
const BOOKING_DATE_FILTER_OPTIONS: { value: BookingDateFilter; label: string }[] = [
  { value: "all", label: "Tutto" },
  { value: "thisWeek", label: "Questa settimana" },
  { value: "nextWeek", label: "Prossima settimana" },
];
/** Lunedì 00:00 della settimana di `date` (fuso del browser, coerente con la resa a schermo di `scheduledAt`). */
function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}
function bookingMatchesDateFilter(booking: ProfessionalBooking, filter: BookingDateFilter): boolean {
  if (filter === "all") return true;
  const scheduled = new Date(booking.scheduledAt);
  const thisWeekStart = startOfWeek(new Date());
  const thisWeekEnd = new Date(thisWeekStart);
  thisWeekEnd.setDate(thisWeekEnd.getDate() + 7);
  if (filter === "thisWeek") return scheduled >= thisWeekStart && scheduled < thisWeekEnd;
  const nextWeekEnd = new Date(thisWeekEnd);
  nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
  return scheduled >= thisWeekEnd && scheduled < nextWeekEnd;
}

const ZONE_ALL = "tutte";

/** Pillola "A domicilio"/"Online" sulla card di un lavoro accettato — richiesta esplicita dell'utente. */
function ServiceModeBadge({ mode }: { mode: "HOME" | "ONLINE" | null }) {
  if (!mode) return null;
  const isOnline = mode === "ONLINE";
  return (
    <XStack alignItems="center" gap={4} paddingHorizontal={8} paddingVertical={3} borderRadius={999} backgroundColor={brand.gesso}>
      <Icon name={isOnline ? "video" : "house"} size={11} color={brand.grafite70} />
      <Text fontSize={11} fontWeight="700" color={brand.grafite70}>
        {isOnline ? "Online" : "A domicilio"}
      </Text>
    </XStack>
  );
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
  // Conteggio (non solo presenza) degli aggiornamenti non letti per
  // richiesta/prenotazione — richiesta esplicita dell'utente: un pallino
  // rosso con un numero accanto a "Contatta/Cronologia", non solo il badge
  // "Nuovo" già esistente.
  const [leadUnreadCounts, setLeadUnreadCounts] = useState<Map<string, number>>(new Map());
  const [bookingUnreadCounts, setBookingUnreadCounts] = useState<Map<string, number>>(new Map());
  const [profileMissing, setProfileMissing] = useState(false);
  const [leads, setLeads] = useState<ProfessionalLead[] | null>(null);
  const [bookings, setBookings] = useState<ProfessionalBooking[] | null>(null);
  // Id del proprio profilo professionista — serve per aprire la cronologia
  // della richiesta (TimelineModal, richiesta esplicita dell'utente),
  // nessun altro endpoint qui lo espone già essendo sempre "il proprio".
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // "In agenda" di default (richiesta esplicita dell'utente, screenshot di
  // riferimento) — non più "Tutti", coerente con le tre pillole in cima
  // alla sezione "Lavori accettati" (BOOKING_TABS).
  const [bookingsStatusFilter, setBookingsStatusFilter] = useState<BookingStatusFilter>("toDo");
  const [bookingsPageSize, setBookingsPageSize] = useState(5);
  const [bookingsPage, setBookingsPage] = useState(1);
  // Ricerca cliente/indirizzo + filtro data (Questa settimana/Prossima
  // settimana/Tutto) + zona — richiesta esplicita dell'utente per il
  // redesign "Lavori accettati", stesso principio "tutto calcolato
  // client-side" già seguito per ListControls (CLAUDE.md, scala di lancio
  // §7). Default "Tutto" per la data (non "Questa settimana" come nello
  // screenshot fornito): un professionista non deve vedere una lista vuota
  // al primo caricamento solo perché nessun lavoro cade in questa settimana.
  const [bookingsSearch, setBookingsSearch] = useState("");
  const [bookingsDateFilter, setBookingsDateFilter] = useState<BookingDateFilter>("all");
  const [bookingsZoneFilter, setBookingsZoneFilter] = useState(ZONE_ALL);

  // Cambiare filtro/ordinamento/quantità riparte sempre da pagina 1 —
  // restare su una pagina che potrebbe non esistere più nel nuovo elenco
  // filtrato sarebbe confuso (richiesta esplicita dell'utente: "se ce ne
  // sono di più andranno in altre pagine selezionabili").
  function updateBookingsStatusFilter(value: BookingStatusFilter) {
    setBookingsStatusFilter(value);
    setBookingsPage(1);
  }
  function updateBookingsDateFilter(value: BookingDateFilter) {
    setBookingsDateFilter(value);
    setBookingsPage(1);
  }
  function updateBookingsZoneFilter(value: string) {
    setBookingsZoneFilter(value);
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
  function goToBookingsPage(page: number) {
    setBookingsPage(page);
    scrollToListTop();
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
        setLeadUnreadCounts(unreadGuidedRequestCounts(notifications));
        setBookingUnreadCounts(unreadBookingCounts(notifications));
      })
      .catch(() => {})
      .finally(() => markNotificationsRead());
  }, [token, markNotificationsRead]);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      apiClient.myLeads(token),
      apiClient.myProfessionalBookings(token),
      apiClient.getMyProfessionalProfile(token),
    ])
      .then(([leadsResult, bookingsResult, profile]) => {
        setLeads(leadsResult);
        setBookings(bookingsResult);
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

  // Zone disponibili per il filtro "Lavori accettati" (richiesta esplicita
  // dell'utente), calcolate su tutti i lavori accettati indipendentemente
  // dal filtro tab/data/ricerca corrente — altrimenti la lista delle zone si
  // restringerebbe insieme ai risultati filtrati, un comportamento confuso
  // per un filtro. Bug reale corretto qui: questo hook viveva prima dopo i
  // return anticipati sotto (isLoading/utente non loggato/ruolo sbagliato/
  // profilo mancante) — un professionista autenticato con profilo completo
  // fa "saltare" quei rami al secondo render rispetto al primo, violando le
  // Rules of Hooks ("Rendered more hooks than during the previous render"),
  // mai riprodotto in sviluppo perché il fast refresh nasconde l'errore ma
  // scoperto con una sessione reale end-to-end (Playwright). Ogni hook deve
  // restare sempre prima di qualunque return anticipato.
  const bookingZones = useMemo(() => {
    const set = new Set((bookings ? acceptedJobs(bookings) : []).map((b) => b.city).filter((c): c is string => Boolean(c)));
    return [...set].sort();
  }, [bookings]);

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

  if (!user.isProfessional) {
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

  // Riepilogo compatto invece dell'elenco completo (richiesta esplicita
  // dell'utente, revisione UX: la stessa card appariva due volte tra
  // /dashboard e /dashboard/richieste) — solo le 5 richieste più
  // recentemente aggiornate, con un link all'inbox completa per il
  // dettaglio/le azioni. Filtri/ordinamento/paginazione restano solo su
  // /dashboard/richieste, unica fonte di verità per l'elenco intero.
  const RECENT_LEADS_COUNT = 5;
  const recentLeads = leads ? sortListItems(leads, "updatedAt", { createdAt: (l) => l.createdAt, updatedAt: (l) => l.updatedAt }).slice(0, RECENT_LEADS_COUNT) : null;
  const pendingLeadsCount = leads ? leads.filter((lead) => leadMatchesStatus(lead, "pending")).length : 0;

  const bookingsSearchQuery = bookingsSearch.trim().toLowerCase();
  const filteredAcceptedJobs = bookings
    ? acceptedJobs(bookings)
        .filter((b) => bookingMatchesStatus(b, bookingsStatusFilter))
        .filter((b) => bookingMatchesDateFilter(b, bookingsDateFilter))
        .filter((b) => bookingsZoneFilter === ZONE_ALL || b.city === bookingsZoneFilter)
        .filter((b) => {
          if (!bookingsSearchQuery) return true;
          const name = ([b.recipientName, b.recipientSurname].filter(Boolean).join(" ") || b.clientName || "").toLowerCase();
          const address = (formatBookingAddress(b) ?? b.address ?? "").toLowerCase();
          return name.includes(bookingsSearchQuery) || address.includes(bookingsSearchQuery);
        })
    : [];
  // Ordinamento fisso per data di intervento (prossimo prima) — nessun
  // controllo "Ordina per" per questa lista, coerente con lo screenshot di
  // riferimento fornito dall'utente, che non ne mostra uno.
  const sortedBookings = sortListItems(filteredAcceptedJobs, "scheduledAt", {
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
            {leads === null ? (
              <LoadingState />
            ) : leads.length === 0 ? (
              <Text color={brand.grafite70}>Non hai ancora ricevuto richieste. Torna a trovarci a breve!</Text>
            ) : (
              <>
                {/* Riepilogo, non l'elenco completo (segnalato in revisione
                    UX: la stessa card ripetuta identica su questa pagina e
                    su /dashboard/richieste) — i numeri e le ultime novità
                    qui, dettaglio/azioni sempre nell'inbox dedicata. */}
                <Text color={brand.grafite70} fontSize="$3">
                  {pendingLeadsCount === 0
                    ? "Nessuna richiesta in attesa di risposta al momento."
                    : `${pendingLeadsCount} richiest${pendingLeadsCount === 1 ? "a" : "e"} in attesa della tua risposta, su ${leads.length} ricevut${leads.length === 1 ? "a" : "e"} in totale.`}
                </Text>
                <YStack gap="$2">
                  {recentLeads?.map((lead) => (
                    <LeadSummaryRow
                      key={lead.id}
                      lead={lead}
                      isNew={newLeadRequestIds.has(lead.guidedRequest.id)}
                      unreadCount={leadUnreadCounts.get(lead.guidedRequest.id)}
                    />
                  ))}
                </YStack>
                <Link href="/dashboard/richieste" style={{ textDecoration: "none", alignSelf: "flex-start" }}>
                  <Button variant="secondary" size="$3" height={40}>
                    Apri tutte le richieste ricevute
                  </Button>
                </Link>
              </>
            )}
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

            {/* Tre pillole "In agenda"/"Completati"/"Tutti" con conteggio —
                richiesta esplicita dell'utente, screenshot di riferimento —
                stesso pattern a scorrimento orizzontale già in uso in
                /dashboard/richieste (una riga sola, mai andare a capo). */}
            {bookings !== null && acceptedJobs(bookings).length > 0 ? (
              <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingTop: 2, paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
                {BOOKING_TABS.map((tab) => {
                  const active = bookingsStatusFilter === tab.value;
                  const count = acceptedJobs(bookings).filter((b) => bookingMatchesStatus(b, tab.value)).length;
                  return (
                    <XStack
                      key={tab.value}
                      flexShrink={0}
                      alignItems="center"
                      gap={6}
                      paddingHorizontal="$3"
                      paddingVertical={10}
                      borderRadius={999}
                      backgroundColor={active ? brand.verificato : brand.calce}
                      borderWidth={1}
                      borderColor={active ? brand.verificato : brand.filetto}
                      cursor="pointer"
                      onPress={() => updateBookingsStatusFilter(tab.value)}
                      accessibilityRole="button"
                    >
                      <Text fontFamily="$body" fontSize={15} fontWeight="800" color={active ? "white" : brand.grafite}>
                        {tab.label}
                      </Text>
                      <YStack
                        minWidth={20}
                        height={20}
                        paddingHorizontal={4}
                        borderRadius={999}
                        alignItems="center"
                        justifyContent="center"
                        backgroundColor={active ? "rgba(255,255,255,0.28)" : brand.gesso}
                      >
                        <Text fontSize={11} fontWeight="800" color={active ? "white" : brand.grafite70}>
                          {count}
                        </Text>
                      </YStack>
                    </XStack>
                  );
                })}
              </div>
            ) : null}

            {bookings !== null && acceptedJobs(bookings).length > 0 ? (
              <XStack gap="$2" flexWrap="wrap">
                <input
                  value={bookingsSearch}
                  onChange={(e) => {
                    setBookingsSearch(e.target.value);
                    setBookingsPage(1);
                  }}
                  placeholder="Cerca cliente o indirizzo..."
                  style={{ ...smallInputStyle, flex: "1 1 220px", minWidth: 200, borderRadius: radiusDoc, padding: "10px 12px" }}
                />
                <select value={bookingsDateFilter} onChange={(e) => updateBookingsDateFilter(e.target.value as BookingDateFilter)} style={{ ...smallInputStyle, borderRadius: radiusDoc, padding: "10px 12px" }}>
                  {BOOKING_DATE_FILTER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <select value={bookingsZoneFilter} onChange={(e) => updateBookingsZoneFilter(e.target.value)} style={{ ...smallInputStyle, borderRadius: radiusDoc, padding: "10px 12px" }}>
                  <option value={ZONE_ALL}>Tutte le zone</option>
                  {bookingZones.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </select>
              </XStack>
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
                    unreadCount={bookingUnreadCounts.get(booking.id)}
                    myProfileId={myProfileId}
                  />
                ))}
              </YStack>
            )}
            <Pagination page={bookingsEffectivePage} totalPages={bookingsTotalPages} onPageChange={goToBookingsPage} />
          </YStack>
        )}

        <BoostSection />
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
  unreadCount,
  myProfileId,
}: {
  booking: ProfessionalBooking;
  token: string;
  onUpdated: () => void;
  /** True se questa prenotazione ha un aggiornamento non letto — richiesta esplicita dell'utente ("rendilo evidente anche nella lista"). */
  isNew?: boolean;
  /** Numero di aggiornamenti non letti per questa prenotazione — pallino rosso accanto a "Contatta/Cronologia" (richiesta esplicita dell'utente). */
  unreadCount?: number;
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
  // Card collassata di default, si apre al click sull'intestazione —
  // richiesta esplicita dell'utente con screenshot di riferimento (stesso
  // principio già in uso in /dashboard/richieste). Colore di stato riusato
  // sia per il filetto laterale sia per la pillola di stato: stessi 3 colori
  // già in uso per il testo di stato prima di questo redesign, nessun nuovo
  // colore introdotto.
  const [isOpen, setIsOpen] = useState(false);
  const statusColor = isCanceled ? brand.urgenza : booking.status === "COMPLETED" ? brand.grafite70 : brand.verificato;
  const statusBg = isCanceled ? brand.urgenzaVelo : booking.status === "COMPLETED" ? brand.gesso : "#E6F4EC";
  const statusLabel = isCanceled
    ? `Annullata${booking.canceledBy === "CLIENT" ? " dal cliente" : booking.canceledBy === "PROFESSIONAL" ? " da te" : ""}`
    : booking.status === "COMPLETED"
      ? "Completato"
      : "Confermato";
  const priceTotals = booking.items.length > 0 ? quotePriceTotals(booking.items) : null;
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
    <Surface
      gap="$3"
      padding={0}
      overflow="hidden"
      borderLeftWidth={4}
      borderLeftColor={statusColor}
      backgroundColor={isCanceled ? brand.urgenzaVelo : brand.calce}
    >
      {/* Intestazione, sempre visibile — click/tap apre/chiude il resto
          della card (richiesta esplicita dell'utente, screenshot di
          riferimento: card collassata di default). */}
      <YStack gap="$2" padding="$3" cursor="pointer" onPress={() => setIsOpen((v) => !v)} accessibilityRole="button">
        <XStack justifyContent="space-between" alignItems="flex-start" gap="$2" flexWrap="wrap">
          <XStack alignItems="center" gap={8} flexShrink={1}>
            <YStack width={8} height={8} borderRadius={999} backgroundColor={statusColor} />
            <Text fontFamily="$body" fontSize={13} fontWeight="800" color={statusColor} textTransform="uppercase">
              {date.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" })}
              {" · "}
              {date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
              {/* Fascia completa (richiesta esplicita dell'utente: "non
                  visualizzare solo il primo orario ma tutta la fascia
                  d'orario"), quando l'ora di fine è nota. */}
              {endDate ? ` – ${endDate.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}` : ""}
            </Text>
            {isNew ? <Badge variant="nuovo">Nuovo</Badge> : null}
          </XStack>
          <YStack alignItems="flex-end" gap={2}>
            <XStack alignItems="center" gap={6} paddingHorizontal={10} paddingVertical={4} borderRadius={999} backgroundColor={statusBg}>
              <Text fontFamily="$body" fontSize={12} fontWeight="800" color={statusColor}>
                {statusLabel}
              </Text>
            </XStack>
            {priceTotals && (priceTotals.totalMinEurCents > 0 || priceTotals.totalMaxEurCents > 0) ? (
              <Text fontFamily="$body" fontSize={17} fontWeight="800" color={brand.grafite}>
                {formatServicePriceRange(priceTotals.totalMinEurCents, priceTotals.totalMaxEurCents)}
                <Text fontSize={12} fontWeight="600" color={brand.grafite70}>
                  {" "}
                  stimato
                </Text>
              </Text>
            ) : null}
          </YStack>
        </XStack>

        <Text fontFamily="$heading" fontWeight="800" fontSize={20} color={brand.grafite}>
          {booking.categoryLabel ?? "Lavoro"}
        </Text>

        <ServiceModeBadge mode={booking.serviceMode} />

        <XStack alignItems="center" gap="$2" flexWrap="wrap">
          <XStack alignItems="center" gap={4}>
            <Icon name="phone" size={13} color={brand.grafite70} strokeWidth={1.5} />
            <Text fontWeight="700" fontSize={15} color={brand.grafite}>
              {recipientFullName ?? booking.clientName ?? "Cliente"}
            </Text>
          </XStack>
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
        {structuredAddress ?? booking.address ? (
          <XStack alignItems="center" gap={4}>
            <Icon name="map-pin" size={13} color={brand.grafite70} strokeWidth={1.5} />
            <Text fontSize="$3" color={brand.grafite70}>
              {structuredAddress ?? booking.address}
            </Text>
          </XStack>
        ) : null}

        <XStack justifyContent="center">
          <Icon name={isOpen ? "chevron-up" : "chevron-down"} size={16} color={brand.grafite70} />
        </XStack>
      </YStack>

      {isOpen ? (
        <YStack gap="$3" padding="$3" paddingTop={0}>
          {/* Descrizione del lavoro e foto scritte/caricate dal cliente
              nella richiesta guidata originale — assenti per le
              prenotazioni dirette da agenda pubblica, che non hanno una
              GuidedRequest collegata. */}
          {booking.description ? (
            <DetailSection icon="file-text" label="Descrizione lavoro">
              <Text fontSize="$3" color={brand.grafite}>
                {booking.description}
              </Text>
            </DetailSection>
          ) : null}

          {(booking.photoUrls ?? []).length > 0 ? (
            <DetailSection icon="camera" label="Foto del cliente">
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
            </DetailSection>
          ) : null}

          {booking.items.length > 0 ? (
            <DetailSection icon="receipt-text" label="Preventivo">
              <YStack gap="$1">
                {booking.items.map((item) => (
                  <XStack key={item.id} justifyContent="space-between" gap="$2">
                    <Text fontSize="$3" color={brand.grafite70}>
                      {item.name}
                    </Text>
                    <Text fontSize="$3" color={brand.grafite} fontWeight="600">
                      {formatServicePriceRange(item.priceMinEurCents, item.priceMaxEurCents)}
                    </Text>
                  </XStack>
                ))}
                {priceTotals ? (
                  <XStack justifyContent="space-between" gap="$2" borderTopWidth={1} borderTopColor={brand.filetto} paddingTop="$1" marginTop="$1">
                    <Text fontSize="$3" fontWeight="700" color={brand.grafite}>
                      Totale stimato
                    </Text>
                    <Text fontSize="$3" fontWeight="700" color={brand.grafite}>
                      {formatServicePriceRange(priceTotals.totalMinEurCents, priceTotals.totalMaxEurCents)}
                    </Text>
                  </XStack>
                ) : null}
              </YStack>
            </DetailSection>
          ) : null}

          {(booking.recipientPhone ?? booking.clientPhone) || booking.clientEmail ? (
            <DetailSection icon="phone" label="Contatti">
              <YStack gap="$2">
                {(booking.recipientPhone ?? booking.clientPhone) ? (
                  <Text fontSize="$3" color={brand.grafite}>
                    {booking.recipientPhone ?? booking.clientPhone}
                  </Text>
                ) : null}
                {booking.clientEmail ? (
                  <Text fontSize="$3" color={brand.grafite}>
                    {booking.clientEmail}
                  </Text>
                ) : null}
                {(booking.recipientPhone ?? booking.clientPhone) ? (
                  <XStack gap="$2" flexWrap="wrap">
                    {whatsAppLink ? (
                      <a href={whatsAppLink} target="_blank" rel="noreferrer" style={{ textDecoration: "none", flex: "1 1 auto" }}>
                        <XStack alignItems="center" justifyContent="center" gap={6} paddingHorizontal="$4" paddingVertical={10} borderRadius={999} backgroundColor="#E6F4EC">
                          <Icon name="message-circle" size={14} color={brand.verificato} />
                          <Text fontSize="$3" fontWeight="700" color={brand.verificato}>
                            WhatsApp
                          </Text>
                        </XStack>
                      </a>
                    ) : null}
                    <a href={`tel:${booking.recipientPhone ?? booking.clientPhone}`} style={{ textDecoration: "none", flex: "1 1 auto" }}>
                      <XStack alignItems="center" justifyContent="center" gap={6} paddingHorizontal="$4" paddingVertical={10} borderRadius={999} backgroundColor={brand.verificato}>
                        <Icon name="phone" size={14} color="white" />
                        <Text fontSize="$3" fontWeight="700" color="white">
                          Chiama
                        </Text>
                      </XStack>
                    </a>
                  </XStack>
                ) : null}
              </YStack>
            </DetailSection>
          ) : null}

          {booking.status === "COMPLETED" && booking.finalAmountEurCents !== null ? (
            <DetailSection icon="coins" label="Importo finale">
              <YStack gap="$1">
                {booking.finalItems.map((item) => (
                  <XStack key={item.id} justifyContent="space-between" gap="$2">
                    <Text fontSize="$3" color={brand.grafite70}>
                      {item.name}
                    </Text>
                    <Text fontSize="$3" color={brand.grafite}>
                      €{(item.priceEurCents / 100).toFixed(2)}
                    </Text>
                  </XStack>
                ))}
                <XStack justifyContent="space-between" gap="$2" borderTopWidth={1} borderTopColor={brand.filetto} paddingTop="$1" marginTop="$1">
                  <Text fontSize="$3" fontWeight="700" color={brand.grafite}>
                    Totale
                  </Text>
                  <Text fontSize="$3" fontWeight="700" color={brand.cianografia}>
                    €{(booking.finalAmountEurCents / 100).toFixed(2)}
                  </Text>
                </XStack>
              </YStack>
            </DetailSection>
          ) : null}

          {isCanceled && booking.cancellationNote ? (
            <DetailSection icon="x" label="Nota lasciata al cliente">
              <Text fontSize="$3" color={brand.grafite70}>
                {booking.cancellationNote}
              </Text>
            </DetailSection>
          ) : null}

          {booking.refundRequested ? (
            <YStack gap="$1" padding="$3" borderWidth={1} borderColor={brand.urgenza} backgroundColor={brand.urgenzaVelo} borderRadius={radiusDoc}>
              <Text fontSize="$3" fontWeight="700" color={brand.urgenza}>
                Il cliente ha segnalato che non ti sei presentato
              </Text>
              <Text fontSize="$3" color={brand.grafite70}>
                Ha chiesto un rimborso. Contattalo per chiarire la situazione.
              </Text>
            </YStack>
          ) : null}

          {/* Link consulenza video (Meet/Zoom/ecc.), visibile al cliente. */}
          <DetailSection icon="video" label="Videochiamata">
            <YStack gap="$2">
              <input
                value={meetingLinkDraft}
                onChange={(e) => setMeetingLinkDraft(e.target.value)}
                placeholder="https://meet.google.com/..."
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: radiusDoc,
                  border: `1px solid ${brand.filetto}`,
                  fontSize: 13,
                  fontFamily: "inherit",
                  color: brand.grafite,
                  backgroundColor: brand.calce,
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
          </DetailSection>

          {/* Nota privata del professionista (mai vista dal cliente). */}
          <DetailSection icon="pencil" label="Note personali">
            <YStack gap="$2">
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Es. portare il pezzo di ricambio, citofono guasto..."
                rows={2}
                maxLength={2000}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: radiusDoc,
                  border: `1px solid ${brand.filetto}`,
                  fontSize: 13,
                  fontFamily: "inherit",
                  color: brand.grafite,
                  backgroundColor: brand.calce,
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
          </DetailSection>

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
                <XStack alignItems="center" gap="$1">
                  <Text color={brand.cianografia} fontWeight="600" fontSize="$2">
                    Contatta/Cronologia
                  </Text>
                  <UnreadDot count={unreadCount} />
                </XStack>
              </Button>
            ) : null}
          </XStack>
        </YStack>
      ) : null}

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

function BoostSection() {
  return (
    <YStack gap="$3">
      <SectionTitle>Aumenta la tua visibilità</SectionTitle>
      <YStack gap="$3" $gtSm={{ flexDirection: "row" }}>
        {BOOST_OPTIONS.map((option) => (
          <Surface key={option.type} flex={1} gap="$2">
            <XStack alignItems="center" gap="$2" flexWrap="wrap">
              <Badge variant="pro">{option.label}</Badge>
              {/* Pagamenti non ancora attivi (Stripe escluso dal lancio):
                  il bottone "Acquista" fallirebbe sempre, quindi mostriamo
                  uno stato "In arrivo" onesto invece di un errore. */}
              <YStack backgroundColor={brand.cianografiaVelo} borderRadius="$10" paddingHorizontal="$2" paddingVertical={2}>
                <Text fontSize={11} fontWeight="700" color={brand.cianografia}>
                  In arrivo
                </Text>
              </YStack>
            </XStack>
            <Text color={brand.grafite70} fontSize="$3">
              {option.description}
            </Text>
            <Text fontWeight="700" color={brand.grafite}>
              €{option.priceEur.toFixed(2)}
            </Text>
            <Text fontSize="$2" color={brand.grafite70}>
              Ti avviseremo appena gli acquisti in piattaforma saranno attivi.
            </Text>
          </Surface>
        ))}
      </YStack>
    </YStack>
  );
}


/**
 * Riga compatta per il riepilogo "Richieste ricevute" in dashboard —
 * richiesta esplicita dell'utente, revisione UX: la card completa
 * (voci del preventivo, form di invio, cronologia inline, ecc.) appariva
 * identica sia qui sia in /dashboard/richieste, ora unica fonte di verità
 * per il dettaglio e le azioni. Qui resta solo identità + stato +
 * eventuale pallino non letto: click apre l'inbox completa.
 */
function LeadSummaryRow({
  lead,
  isNew,
  unreadCount,
}: {
  lead: ProfessionalLead;
  /** True se questa richiesta ha un aggiornamento non letto — richiesta esplicita dell'utente ("rendilo evidente anche nella lista"). */
  isNew?: boolean;
  /** Numero di aggiornamenti non letti per questa richiesta — pallino rosso, stesso significato già in uso su "Contatta/Cronologia". */
  unreadCount?: number;
}) {
  const clientName = lead.guidedRequest.clientAccountDeleted ? "Account eliminato" : lead.guidedRequest.clientName ?? "Cliente";
  return (
    <Link href="/dashboard/richieste" style={{ textDecoration: "none" }}>
      <XStack alignItems="center" gap="$2" backgroundColor={brand.gesso} borderRadius="$3" padding="$3" flexWrap="wrap">
        <YStack flex={1} minWidth={200} gap="$1">
          <XStack alignItems="center" gap="$2" flexWrap="wrap">
            <Text fontWeight="700" color={brand.grafite}>
              {clientName}
            </Text>
            <Text color={brand.grafite70} fontSize="$3">
              · {lead.guidedRequest.categoryLabel}
              {lead.guidedRequest.city ? ` · ${lead.guidedRequest.city}` : ""}
            </Text>
            {lead.guidedRequest.isUrgent ? <Badge variant="urgente">Urgente</Badge> : null}
            {isNew ? <Badge variant="nuovo">Nuovo</Badge> : null}
          </XStack>
          <Text fontSize="$2" color={brand.grafite70}>
            {leadSummaryLabel(lead)}
          </Text>
        </YStack>
        <XStack alignItems="center" gap="$2" flexShrink={0}>
          <UnreadDot count={unreadCount} />
          <Icon name="chevron-right" size={16} color={brand.grafite70} />
        </XStack>
      </XStack>
    </Link>
  );
}
