"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import type { ClientBooking, ClientGuidedRequest } from "@professionisti/api-client";
import {
  ALL_ITALIAN_CITY_NAMES,
  averageQuoteTotalEurCents,
  formatEurCents,
  formatServicePriceRange,
  quotePriceTotals,
  type GuidedRequestStatusSummary,
} from "@professionisti/shared";
import { Autocomplete, Badge, Button, EmptyState, Icon, Surface, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { ProfessionalAvatar } from "@/components/ProfessionalAvatar";
import { LoadingState } from "@/components/LoadingState";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { MediaPreview } from "@/components/MediaPreview";
import { ReportNoShowModal } from "@/components/ReportNoShowModal";
import { RequestStepper, computeRequestStage } from "@/components/RequestStepper";
import { TimelineModal } from "@/components/TimelineModal";
import { ClientCompleteModal } from "@/components/ClientCompleteModal";
import { ReviewModal } from "@/components/ReviewModal";
import {
  clientSectionCounts,
  combineUnreadCounts,
  mergeCounts,
  mergeIds,
  unreadBookingCounts,
  unreadBookingIds,
  unreadGuidedRequestIds,
  unreadQuoteCounts,
  unreadQuoteIds,
  unreadThreadCounts,
} from "@/lib/notificationSections";
import { UnreadDot } from "@/components/UnreadDot";
import { useDismissableUnreadCount } from "@/lib/useDismissableUnreadCount";
import { ListControls, Pagination, sortListItems, type ListSortKey } from "@/components/ListControls";

// Stesso intervallo/motivo già documentato in apps/web/src/app/dashboard/page.tsx.
const UNREAD_BADGE_POLL_MS = 15000;

const STATUS_LABEL: Record<ClientGuidedRequest["status"], string> = {
  OPEN: "In attesa di risposte",
  MATCHED: "Inviata ai professionisti",
  CLOSED: "Chiusa",
};

// Foto E video (richiesta esplicita dell'utente), fino a 5 elementi
// (aumentato da 3, stessa richiesta).
const MAX_REVIEW_PHOTOS = 5;
const MAX_REQUEST_PHOTOS = 5;

const BOOKING_STATUS_LABEL: Record<ClientBooking["status"], string> = {
  PENDING: "In attesa",
  CONFIRMED: "Confermata",
  COMPLETED: "Completata",
  CANCELED: "Annullata",
  NO_SHOW: "Non presentato",
};

const textareaStyle = {
  padding: 10,
  borderRadius: 4,
  border: `1px solid ${brand.filetto}`,
  fontSize: 14,
  fontFamily: "inherit",
  color: brand.grafite,
  resize: "vertical" as const,
};

type ClientTab = "richieste" | "lavori";

/** Filtri per stato (richiesta esplicita dell'utente, stesso trattamento di /dashboard). */
type RequestStatusFilter = "all" | ClientGuidedRequest["status"];
const REQUEST_STATUS_OPTIONS: { value: RequestStatusFilter; label: string }[] = [
  { value: "all", label: "Tutte" },
  { value: "OPEN", label: STATUS_LABEL.OPEN },
  { value: "MATCHED", label: STATUS_LABEL.MATCHED },
  { value: "CLOSED", label: STATUS_LABEL.CLOSED },
];

type ClientBookingStatusFilter = "all" | ClientBooking["status"];
const CLIENT_BOOKING_STATUS_OPTIONS: { value: ClientBookingStatusFilter; label: string }[] = [
  { value: "all", label: "Tutti" },
  { value: "PENDING", label: BOOKING_STATUS_LABEL.PENDING },
  { value: "CONFIRMED", label: BOOKING_STATUS_LABEL.CONFIRMED },
  { value: "COMPLETED", label: BOOKING_STATUS_LABEL.COMPLETED },
  { value: "CANCELED", label: BOOKING_STATUS_LABEL.CANCELED },
  { value: "NO_SHOW", label: BOOKING_STATUS_LABEL.NO_SHOW },
];

/**
 * Caselle "Le mie richieste"/"Lavori accettati" (richiesta esplicita
 * dell'utente, stesso trattamento già applicato lato professionista in
 * /dashboard per la stessa ragione — visualizzazione più facile e ordinata).
 */
function ClientTabButton({
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

export default function LeMieRichiestePage() {
  return (
    <Suspense fallback={null}>
      <LeMieRichiesteContent />
    </Suspense>
  );
}

function LeMieRichiesteContent() {
  const { user, token, isLoading, markNotificationsRead } = useAuth();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<ClientTab>("richieste");
  // Un toast cliccato (ToastStack, richiesta esplicita dell'utente: "fagli
  // aprire l'aggiornamento relativo a quel banner") naviga qui con
  // `?tab=richieste|lavori` — stesso meccanismo di /dashboard, reattivo a
  // `searchParams` per coprire anche il caso in cui si è già su questa
  // pagina (navigazione superficiale, nessun rimontaggio del componente).
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "richieste" || tab === "lavori") setActiveTab(tab);
  }, [searchParams]);
  // Fotografia delle notifiche non lette al momento dell'arrivo, presa
  // PRIMA di segnarle come lette — stessa race condition già documentata
  // e corretta in /dashboard (vedi commento lì): non affidarsi al
  // conteggio "live" di AuthContext per questo calcolo one-shot.
  const [sectionSnapshot, setSectionSnapshot] = useState<{ richieste: number; lavori: number }>({ richieste: 0, lavori: 0 });
  // Stesso snapshot di sectionSnapshot, per evidenziare la singola card/riga
  // con l'aggiornamento (richiesta esplicita dell'utente: "rendilo evidente
  // anche nella lista"), non solo il numeretto sul tab.
  const [newRequestIds, setNewRequestIds] = useState<Set<string>>(new Set());
  const [newClientBookingIds, setNewClientBookingIds] = useState<Set<string>>(new Set());
  // Simbolo sul preventivo specifico che ha ricevuto un aggiornamento
  // (richiesta esplicita dell'utente) — una richiesta generica può avere
  // preventivi da più professionisti, il badge sulla card da solo non basta
  // a distinguere quale.
  const [newQuoteIds, setNewQuoteIds] = useState<Set<string>>(new Set());
  // Conteggio (non solo presenza) degli aggiornamenti non letti — richiesta
  // esplicita dell'utente: un pallino rosso con un numero accanto a
  // "Contatta/Cronologia", sia sul singolo preventivo/lavoro sia sulla
  // riga di un professionista in "Inviata a" (prima che esista un
  // preventivo, identificata dalla chiave composita richiesta+professionista).
  const [threadUnreadCounts, setThreadUnreadCounts] = useState<Map<string, number>>(new Map());
  const [quoteUnreadCounts, setQuoteUnreadCounts] = useState<Map<string, number>>(new Map());
  const [bookingUnreadCounts, setBookingUnreadCounts] = useState<Map<string, number>>(new Map());
  const [requests, setRequests] = useState<ClientGuidedRequest[] | null>(null);
  const [bookings, setBookings] = useState<ClientBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filtri/ordinamento/quantità visualizzata (richiesta esplicita
  // dell'utente), stesso pattern client-side di /dashboard.
  const [requestsStatusFilter, setRequestsStatusFilter] = useState<RequestStatusFilter>("all");
  const [requestsSort, setRequestsSort] = useState<ListSortKey>("createdAt");
  const [requestsPageSize, setRequestsPageSize] = useState(5);
  const [requestsPage, setRequestsPage] = useState(1);
  const [clientBookingsStatusFilter, setClientBookingsStatusFilter] = useState<ClientBookingStatusFilter>("all");
  const [clientBookingsSort, setClientBookingsSort] = useState<ListSortKey>("scheduledAt");
  const [clientBookingsPageSize, setClientBookingsPageSize] = useState(5);
  const [clientBookingsPage, setClientBookingsPage] = useState(1);

  // Deep link da /chat (richiesta esplicita dell'utente: "dai la
  // possibilità di andare alla pagina del preventivo/informazioni di
  // quella determinata chat") — `?open=<guidedRequestId>` porta sul tab
  // "richieste", azzera il filtro per stato (potrebbe nascondere la
  // richiesta target) e calcola la pagina corretta, poi scrolla alla card
  // giusta. Calcolato qui a mano da `requests` (non da `sortedRequests`,
  // derivato più sotto dopo i guard di autenticazione: un useEffect non
  // può dipendere da un valore calcolato dopo un return condizionale).
  useEffect(() => {
    const targetId = searchParams.get("open");
    if (!targetId || !requests) return;
    if (!requests.some((r) => r.id === targetId)) return;
    setActiveTab("richieste");
    if (requestsStatusFilter !== "all") {
      setRequestsStatusFilter("all");
      return; // richiamato di nuovo dopo il re-render con il filtro azzerato
    }
    const sorted = sortListItems(requests, requestsSort, { createdAt: (r) => r.createdAt, updatedAt: (r) => r.updatedAt });
    const index = sorted.findIndex((r) => r.id === targetId);
    if (index === -1) return;
    setRequestsPage(Math.floor(index / requestsPageSize) + 1);
    setTimeout(() => {
      document.getElementById(`request-${targetId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, requestsStatusFilter, requestsSort, requestsPageSize, searchParams]);

  // Stesso principio di /dashboard: cambiare filtro/ordinamento/quantità
  // riparte sempre da pagina 1.
  function updateRequestsStatusFilter(value: RequestStatusFilter) {
    setRequestsStatusFilter(value);
    setRequestsPage(1);
  }
  function updateRequestsSort(value: ListSortKey) {
    setRequestsSort(value);
    setRequestsPage(1);
  }
  function updateRequestsPageSize(value: number) {
    setRequestsPageSize(value);
    setRequestsPage(1);
  }
  function updateClientBookingsStatusFilter(value: ClientBookingStatusFilter) {
    setClientBookingsStatusFilter(value);
    setClientBookingsPage(1);
  }
  function updateClientBookingsSort(value: ListSortKey) {
    setClientBookingsSort(value);
    setClientBookingsPage(1);
  }
  function updateClientBookingsPageSize(value: number) {
    setClientBookingsPageSize(value);
    setClientBookingsPage(1);
  }

  // Cambiare pagina deve riportare la vista in cima alla lista (richiesta
  // esplicita dell'utente): senza, si resta scrollati in fondo sul
  // controllo appena cliccato e la nuova pagina di richieste/prenotazioni
  // parte fuori dallo schermo, invisibile finché non si scrolla a mano.
  // Un solo ref condiviso dalle due tab: solo una è montata alla volta.
  const listTopRef = useRef<HTMLDivElement>(null);
  function scrollToListTop() {
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function goToRequestsPage(page: number) {
    setRequestsPage(page);
    scrollToListTop();
  }
  function goToClientBookingsPage(page: number) {
    setClientBookingsPage(page);
    scrollToListTop();
  }

  function reload() {
    if (!token) return;
    apiClient
      .myGuidedRequests(token)
      .then(setRequests)
      .catch((err) => setError(err instanceof Error ? err.message : "Errore nel caricamento delle richieste."));
    apiClient.myClientBookings(token).then(setBookings).catch(() => setBookings([]));
  }

  useEffect(reload, [token]);

  // Stesso principio della dashboard professionista: aprire questa pagina
  // segna come lette le notifiche in attesa (nuovo preventivo, conferma/
  // rifiuto della data proposta) e azzera il badge nell'header. Ripetuto
  // ogni UNREAD_BADGE_POLL_MS finché la pagina resta aperta (richiesta
  // esplicita dell'utente: "controlla anche lato cliente" per lo stesso
  // problema segnalato lato professionista — un nuovo messaggio in chat
  // deve comparire da solo, non solo al prossimo caricamento). Ogni tick
  // trova solo le notifiche arrivate dopo il markNotificationsRead del tick
  // precedente, quindi i conteggi si sommano (mergeCounts/mergeIds) invece
  // di sostituire lo stato.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    function poll() {
      apiClient
        .unreadNotifications(token!)
        .then((notifications) => {
          if (cancelled || notifications.length === 0) return;
          const delta = clientSectionCounts(notifications);
          setSectionSnapshot((prev) => ({ richieste: prev.richieste + delta.richieste, lavori: prev.lavori + delta.lavori }));
          setNewRequestIds((prev) => mergeIds(prev, unreadGuidedRequestIds(notifications)));
          setNewClientBookingIds((prev) => mergeIds(prev, unreadBookingIds(notifications)));
          setNewQuoteIds((prev) => mergeIds(prev, unreadQuoteIds(notifications)));
          setThreadUnreadCounts((prev) => mergeCounts(prev, unreadThreadCounts(notifications)));
          setQuoteUnreadCounts((prev) => mergeCounts(prev, unreadQuoteCounts(notifications)));
          setBookingUnreadCounts((prev) => mergeCounts(prev, unreadBookingCounts(notifications)));
          // Bug reale corretto (richiesta esplicita dell'utente: "anche dalla
          // parte del cliente deve poter cliccare su lavoro terminato come il
          // professionista"): `reload()` girava solo al primo montaggio —
          // quando il professionista segna un lavoro completato (notifica
          // JOB_COMPLETED) mentre il cliente ha già questa pagina aperta,
          // `booking.status` restava CONFIRMED in memoria e il bottone
          // "Lavoro terminato" del cliente non compariva mai senza un
          // ricaricamento manuale. Stesso poll da 15s già in uso per i
          // pallini di notifica, riusato per tenere aggiornate anche le due
          // liste stesse quando c'è qualcosa di nuovo da vedere.
          reload();
        })
        .catch(() => {})
        .finally(() => markNotificationsRead());
    }
    poll();
    const interval = setInterval(poll, UNREAD_BADGE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token, markNotificationsRead]);

  // L'indirizzo di lavoro è già stato raccolto all'invio della richiesta
  // (GuidedRequestForm) — accettare un preventivo non chiede più nulla,
  // crea subito la prenotazione. QuoteCard gestisce da sé stato di
  // caricamento ed errore; qui basta propagare la chiamata reale e
  // ricaricare l'elenco al successo.
  async function handleAcceptQuote(quoteId: string) {
    if (!token) throw new Error("Devi accedere per accettare un preventivo.");
    await apiClient.acceptQuote(token, quoteId);
    reload();
  }

  if (isLoading) return null;

  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
            Accedi per vedere le tue richieste
          </Text>
          <Link href="/accedi?redirect=/le-mie-richieste" style={{ textDecoration: "none" }}>
            <Button variant="primary">Accedi</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  const sortedRequests = requests
    ? sortListItems(
        requests.filter((request) => requestsStatusFilter === "all" || request.status === requestsStatusFilter),
        requestsSort,
        { createdAt: (r) => r.createdAt, updatedAt: (r) => r.updatedAt },
      )
    : null;
  const requestsTotalPages = sortedRequests ? Math.max(1, Math.ceil(sortedRequests.length / requestsPageSize)) : 1;
  const requestsEffectivePage = Math.min(requestsPage, requestsTotalPages);
  const visibleRequests = sortedRequests?.slice((requestsEffectivePage - 1) * requestsPageSize, requestsEffectivePage * requestsPageSize) ?? null;

  const filteredClientBookings = bookings
    ? bookings.filter((booking) => clientBookingsStatusFilter === "all" || booking.status === clientBookingsStatusFilter)
    : [];
  const sortedClientBookings = sortListItems(filteredClientBookings, clientBookingsSort, {
    createdAt: (b) => b.createdAt,
    updatedAt: (b) => b.updatedAt,
    scheduledAt: (b) => b.scheduledAt,
  });
  const clientBookingsTotalPages = Math.max(1, Math.ceil(sortedClientBookings.length / clientBookingsPageSize));
  const clientBookingsEffectivePage = Math.min(clientBookingsPage, clientBookingsTotalPages);
  const visibleClientBookings = sortedClientBookings.slice(
    (clientBookingsEffectivePage - 1) * clientBookingsPageSize,
    clientBookingsEffectivePage * clientBookingsPageSize,
  );

  return (
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$8" paddingHorizontal="$4">
      {/* Sidebar "Il tuo account" rimossa (richiesta esplicita dell'utente:
          "non far vedere quel menu sempre lì fisso") — navigazione tra le
          voci disponibile dal menu a tendina dell'header (AccountMenu). */}
      <XStack width="100%" maxWidth={760} gap="$8" alignItems="flex-start" flexWrap="wrap">
        <YStack flex={1} minWidth={280} gap="$5">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
            Le mie richieste
          </Text>

          {error ? <Text color={brand.urgenza}>{error}</Text> : null}

          <XStack gap="$2" flexWrap="wrap" borderBottomWidth={1} borderBottomColor={brand.filetto}>
            <ClientTabButton active={activeTab === "richieste"} onPress={() => setActiveTab("richieste")} badgeCount={sectionSnapshot.richieste}>
              Le mie richieste{requests ? ` (${requests.length})` : ""}
            </ClientTabButton>
            <ClientTabButton active={activeTab === "lavori"} onPress={() => setActiveTab("lavori")} badgeCount={sectionSnapshot.lavori}>
              Lavori accettati{bookings ? ` (${bookings.length})` : ""}
            </ClientTabButton>
          </XStack>

          {activeTab === "richieste" ? (
            <YStack ref={listTopRef} gap="$4">
              {requests !== null && requests.length > 0 ? (
                <ListControls
                  statusValue={requestsStatusFilter}
                  statusOptions={REQUEST_STATUS_OPTIONS}
                  onStatusChange={updateRequestsStatusFilter}
                  sortValue={requestsSort}
                  sortOptions={["createdAt", "updatedAt"]}
                  onSortChange={updateRequestsSort}
                  pageSize={requestsPageSize}
                  onPageSizeChange={updateRequestsPageSize}
                />
              ) : null}
              <Pagination page={requestsEffectivePage} totalPages={requestsTotalPages} onPageChange={goToRequestsPage} />
              {requests === null ? (
                <LoadingState />
              ) : requests.length === 0 ? (
                <EmptyState
                  icon="file-text"
                  title="Nessuna richiesta inviata"
                  description="Non hai ancora inviato nessuna richiesta di preventivo."
                  action={
                    <Link href="/preventivo" style={{ textDecoration: "none" }}>
                      <Text color={brand.cianografia} fontWeight="600">
                        Richiedi il tuo primo preventivo
                      </Text>
                    </Link>
                  }
                />
              ) : visibleRequests && visibleRequests.length === 0 ? (
                <Text color={brand.grafite70}>Nessuna richiesta corrisponde al filtro selezionato.</Text>
              ) : (
                visibleRequests?.map((request) => (
                  <div key={request.id} id={`request-${request.id}`}>
                    <GuidedRequestCard
                      request={request}
                      token={token}
                      onChanged={reload}
                      onAcceptQuote={handleAcceptQuote}
                      isNew={newRequestIds.has(request.id)}
                      newQuoteIds={newQuoteIds}
                      threadUnreadCounts={threadUnreadCounts}
                      quoteUnreadCounts={quoteUnreadCounts}
                    />
                  </div>
                ))
              )}
              <Pagination page={requestsEffectivePage} totalPages={requestsTotalPages} onPageChange={goToRequestsPage} />
            </YStack>
          ) : (
            <YStack ref={listTopRef} gap="$4">
              {bookings !== null && bookings.length > 0 ? (
                <ListControls
                  statusValue={clientBookingsStatusFilter}
                  statusOptions={CLIENT_BOOKING_STATUS_OPTIONS}
                  onStatusChange={updateClientBookingsStatusFilter}
                  sortValue={clientBookingsSort}
                  sortOptions={["scheduledAt", "createdAt", "updatedAt"]}
                  onSortChange={updateClientBookingsSort}
                  pageSize={clientBookingsPageSize}
                  onPageSizeChange={updateClientBookingsPageSize}
                />
              ) : null}
              <Pagination page={clientBookingsEffectivePage} totalPages={clientBookingsTotalPages} onPageChange={goToClientBookingsPage} />
              {bookings === null ? (
                <LoadingState />
              ) : bookings.length === 0 ? (
                <EmptyState icon="receipt-text" title="Nessuna prenotazione" description="Accetta un preventivo per crearne una." />
              ) : visibleClientBookings.length === 0 ? (
                <Text color={brand.grafite70}>Nessuna prenotazione corrisponde al filtro selezionato.</Text>
              ) : (
                visibleClientBookings.map((booking) => (
                  <BookingRow
                    key={booking.id}
                    booking={booking}
                    token={token}
                    onReviewed={reload}
                    isNew={newClientBookingIds.has(booking.id)}
                    unreadCount={combineUnreadCounts(
                      bookingUnreadCounts.get(booking.id),
                      booking.guidedRequestId ? threadUnreadCounts.get(`${booking.guidedRequestId}:${booking.professionalProfileId}`) : undefined,
                    )}
                  />
                ))
              )}
              <Pagination page={clientBookingsEffectivePage} totalPages={clientBookingsTotalPages} onPageChange={goToClientBookingsPage} />
            </YStack>
          )}
        </YStack>
      </XStack>
    </YStack>
  );
}

function GuidedRequestCard({
  request,
  token,
  onChanged,
  onAcceptQuote,
  isNew,
  newQuoteIds,
  threadUnreadCounts,
  quoteUnreadCounts,
}: {
  request: ClientGuidedRequest;
  token: string;
  onChanged: () => void;
  onAcceptQuote: (quoteId: string) => Promise<void>;
  /** True se questa richiesta ha un aggiornamento non letto — richiesta esplicita dell'utente ("rendilo evidente anche nella lista"). */
  isNew?: boolean;
  /** ID dei preventivi con un aggiornamento non letto — disambigua QUALE preventivo tra più ricevuti per questa richiesta. */
  newQuoteIds?: Set<string>;
  /** Conteggio aggiornamenti non letti per thread (chiave `guidedRequestId:professionalProfileId`) — pallino su "Contatta/Cronologia" nella sezione "Inviata a", prima che esista un preventivo. */
  threadUnreadCounts?: Map<string, number>;
  /** Conteggio aggiornamenti non letti per singolo preventivo — pallino su "Contatta/Cronologia" di ogni QuoteCard. */
  quoteUnreadCounts?: Map<string, number>;
}) {
  // Professionista il cui thread è aperto nella cronologia (sezione "Inviata
  // a", prima che esista un preventivo) — richiesta esplicita dell'utente:
  // "nelle mie richieste del cliente, non compare il pulsante
  // contatta/cronologia" (mancava del tutto in questo punto della card,
  // esisteva solo dentro QuoteCard/BookingRow una volta ricevuto un
  // preventivo).
  const [openTimelineProfessionalId, setOpenTimelineProfessionalId] = useState<string | null>(null);
  // Il pallino "Contatta/Cronologia" per riga professionista deve sparire
  // non appena si apre quel thread specifico (richiesta esplicita
  // dell'utente) — più righe condividono questo stesso componente (un
  // professionista per riga in `request.sentTo`), quindi non si può usare
  // `useDismissableUnreadCount` (un hook per componente, non per elemento di
  // un `.map()`): stessa logica differenziale, ma tenuta in una mappa
  // "conteggio al momento dell'apertura" per chiave composita.
  const [dismissedThreadCounts, setDismissedThreadCounts] = useState<Map<string, number>>(new Map());
  function effectiveThreadUnread(key: string): number | undefined {
    const count = threadUnreadCounts?.get(key);
    if (count === undefined) return undefined;
    return Math.max(0, count - (dismissedThreadCounts.get(key) ?? 0));
  }
  function openTimelineForProfessional(professionalId: string) {
    setOpenTimelineProfessionalId(professionalId);
    const key = `${request.id}:${professionalId}`;
    setDismissedThreadCounts((prev) => new Map(prev).set(key, threadUnreadCounts?.get(key) ?? 0));
  }
  const [isEditing, setIsEditing] = useState(false);
  const [description, setDescription] = useState(request.description);
  const [city, setCity] = useState(request.city);
  const [address, setAddress] = useState(request.address ?? "");
  const [recipientName, setRecipientName] = useState(request.recipientName ?? "");
  const [recipientSurname, setRecipientSurname] = useState(request.recipientSurname ?? "");
  const [recipientPhone, setRecipientPhone] = useState(request.recipientPhone ?? "");
  const [houseNumber, setHouseNumber] = useState(request.houseNumber ?? "");
  const [addressExtra, setAddressExtra] = useState(request.addressExtra ?? "");
  const [postalCode, setPostalCode] = useState(request.postalCode ?? "");
  const [province, setProvince] = useState(request.province ?? "");
  const [photoUrls, setPhotoUrls] = useState<string[]>(request.photoUrls);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openPhotoIndex, setOpenPhotoIndex] = useState<number | null>(null);
  // Stato aggregato del fan-out (CLAUDE.md §14) — quanti professionisti
  // sono stati contattati in totale (inclusi quelli da un'eventuale
  // espansione), quanti hanno risposto, quanti sono ancora in attesa. Mai
  // l'identità dei professionisti contattati: quella resta "Inviata a"
  // sotto, calcolata lato client dai Lead effettivi.
  const [statusSummary, setStatusSummary] = useState<GuidedRequestStatusSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .guidedRequestStatus(token, request.id)
      .then((summary) => {
        if (!cancelled) setStatusSummary(summary);
      })
      .catch(() => {
        // Un fallimento qui non deve rompere il resto della card — la
        // sezione "Inviata a" più sotto mostra comunque i dettagli.
      });
    return () => {
      cancelled = true;
    };
  }, [token, request.id]);

  // Una richiesta CLOSED ha già portato a una prenotazione: non ha senso
  // modificarla o eliminarla a quel punto (stesso confine applicato lato
  // API in GuidedRequestsService).
  const canDelete = request.status !== "CLOSED";
  // Non modificabile appena arriva un preventivo: cambiare descrizione/
  // città/indirizzo/foto dopo che un professionista ha già risposto
  // invaliderebbe silenziosamente il suo lavoro — richiesta esplicita
  // dell'utente, stesso vincolo applicato lato API in GuidedRequestsService.
  const hasQuote = request.quotes.length > 0;
  const canEditDetails = canDelete && !hasQuote;
  // "Prezzo totale medio" (richiesta esplicita dell'utente): solo su una
  // richiesta generica (fan-out categoria+città, non diretta al profilo di
  // un professionista specifico) con almeno 1 preventivo ricevuto.
  const averagePriceEurCents = useMemo(
    () => averageQuoteTotalEurCents(request.quotes.map((quote) => quote.items)),
    [request.quotes],
  );

  function startEditing() {
    setDescription(request.description);
    setCity(request.city);
    setAddress(request.address ?? "");
    setRecipientName(request.recipientName ?? "");
    setRecipientSurname(request.recipientSurname ?? "");
    setRecipientPhone(request.recipientPhone ?? "");
    setHouseNumber(request.houseNumber ?? "");
    setAddressExtra(request.addressExtra ?? "");
    setPostalCode(request.postalCode ?? "");
    setProvince(request.province ?? "");
    setPhotoUrls(request.photoUrls);
    setPhotoError(null);
    setError(null);
    setIsEditing(true);
  }

  async function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setPhotoError(null);
    setIsUploadingPhoto(true);
    try {
      // Stesso upload (Cloudinary, resize+compressione automatica) già
      // usato in fase di creazione della richiesta (GuidedRequestForm).
      const result = await apiClient.uploadGuidedRequestPhoto(token, file);
      setPhotoUrls((prev) => [...prev, result.imageUrl].slice(0, MAX_REQUEST_PHOTOS));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Errore durante il caricamento della foto.");
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  function removePhoto(url: string) {
    setPhotoUrls((prev) => prev.filter((u) => u !== url));
  }

  async function handleSaveEdit() {
    setError(null);
    if (description.trim().length < 10) {
      setError("Descrivi il lavoro con almeno 10 caratteri.");
      return;
    }
    // Città obbligatoria solo per un intervento a domicilio (stesso
    // principio già applicato in GuidedRequestForm/handleSubmit) — per una
    // richiesta online resta facoltativa.
    if (request.serviceMode !== "ONLINE" && !city.trim()) {
      setError("Indica la città.");
      return;
    }
    setIsSaving(true);
    try {
      await apiClient.updateGuidedRequest(token, request.id, {
        description: description.trim(),
        city: city.trim() || undefined,
        address: address.trim() || undefined,
        recipientName: recipientName.trim() || undefined,
        recipientSurname: recipientSurname.trim() || undefined,
        recipientPhone: recipientPhone.trim() || undefined,
        houseNumber: houseNumber.trim() || undefined,
        addressExtra: addressExtra.trim() || undefined,
        postalCode: postalCode.trim() || undefined,
        province: province.trim() || undefined,
        photoUrls,
      });
      setIsEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    setError(null);
    setIsDeleting(true);
    try {
      await apiClient.deleteGuidedRequest(token, request.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
      setConfirmingDelete(false);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Surface gap="$3">
      {isEditing ? (
        <YStack gap="$2">
          <Text fontFamily="$heading" fontWeight="700" fontSize="$5" color={brand.grafite}>
            {request.categoryLabel}
          </Text>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={textareaStyle} />
          <YStack borderWidth={1} borderColor={brand.filetto} borderRadius="$4" backgroundColor={brand.calce}>
            <Autocomplete
              items={ALL_ITALIAN_CITY_NAMES}
              getKey={(item) => item}
              getLabel={(item) => item}
              onSelect={setCity}
              value={city}
              onChangeText={setCity}
              placeholder="Città"
              minChars={3}
            />
          </YStack>
          {request.serviceMode === "ONLINE" ? (
            // Stesso principio/testo già in uso in GuidedRequestForm (creazione
            // richiesta): per un intervento online la città resta facoltativa.
            <Text fontSize="$2" color={brand.grafite70}>
              Per una consulenza online non è obbligatorio indicare la città.
            </Text>
          ) : null}
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Via/piazza" style={textareaStyle} />

          <XStack gap="$2" flexWrap="wrap">
            <YStack flex={1} minWidth={160}>
              <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Nome" style={textareaStyle} />
            </YStack>
            <YStack flex={1} minWidth={160}>
              <input value={recipientSurname} onChange={(e) => setRecipientSurname(e.target.value)} placeholder="Cognome" style={textareaStyle} />
            </YStack>
          </XStack>
          <input
            value={recipientPhone}
            onChange={(e) => setRecipientPhone(e.target.value)}
            placeholder="Numero di telefono"
            style={textareaStyle}
          />
          <XStack gap="$2" flexWrap="wrap">
            <YStack flex={1} minWidth={120}>
              <input value={houseNumber} onChange={(e) => setHouseNumber(e.target.value)} placeholder="Numero civico" style={textareaStyle} />
            </YStack>
            <YStack flex={1} minWidth={120}>
              <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="CAP" style={textareaStyle} />
            </YStack>
            <YStack flex={1} minWidth={120}>
              <input value={province} onChange={(e) => setProvince(e.target.value)} placeholder="Provincia" style={textareaStyle} />
            </YStack>
          </XStack>
          <input
            value={addressExtra}
            onChange={(e) => setAddressExtra(e.target.value)}
            placeholder="Scala, piano, interno (facoltativo)"
            style={textareaStyle}
          />

          <YStack gap="$1">
            <Text fontSize="$2" color={brand.grafite70}>
              Foto o video (opzionale, fino a {MAX_REQUEST_PHOTOS})
            </Text>
            <YStack flexDirection="row" flexWrap="wrap" gap="$2">
              {photoUrls.map((url) => (
                <YStack key={url} width={72} height={72} borderRadius="$3" overflow="hidden" position="relative" borderWidth={1} borderColor={brand.filetto}>
                  <MediaPreview url={url} />
                  <YStack
                    position="absolute"
                    top={2}
                    right={2}
                    width={18}
                    height={18}
                    borderRadius={9}
                    backgroundColor="rgba(20,24,30,0.7)"
                    alignItems="center"
                    justifyContent="center"
                    cursor="pointer"
                    onPress={() => removePhoto(url)}
                    accessibilityRole="button"
                    accessibilityLabel="Rimuovi foto"
                  >
                    <X size={11} strokeWidth={2} color="white" />
                  </YStack>
                </YStack>
              ))}
              {photoUrls.length < MAX_REQUEST_PHOTOS ? (
                <YStack
                  width={72}
                  height={72}
                  borderRadius="$3"
                  borderWidth={1}
                  borderColor={brand.filetto}
                  borderStyle="dashed"
                  alignItems="center"
                  justifyContent="center"
                  cursor="pointer"
                  opacity={isUploadingPhoto ? 0.6 : 1}
                  onPress={() => !isUploadingPhoto && photoInputRef.current?.click()}
                  accessibilityRole="button"
                  accessibilityLabel="Aggiungi foto"
                >
                  <Text fontSize="$6" color={brand.grafite70}>
                    {isUploadingPhoto ? "…" : "+"}
                  </Text>
                </YStack>
              ) : null}
            </YStack>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={handlePhotoChange}
              disabled={isUploadingPhoto}
              style={{ display: "none" }}
            />
            {photoError ? (
              <Text color={brand.urgenza} fontSize="$2">
                {photoError}
              </Text>
            ) : null}
          </YStack>

          {error ? (
            <Text color={brand.urgenza} fontSize="$3">
              {error}
            </Text>
          ) : null}
          <XStack gap="$2">
            <Button variant="primary" size="$3" height={40} onPress={handleSaveEdit} disabled={isSaving || isUploadingPhoto} opacity={isSaving ? 0.6 : 1}>
              {isSaving ? "Salvataggio..." : "Salva modifiche"}
            </Button>
            <Button variant="secondary" size="$3" height={40} onPress={() => setIsEditing(false)} disabled={isSaving}>
              Annulla
            </Button>
          </XStack>
        </YStack>
      ) : (
        <>
          <YStack flexDirection="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap="$2">
            {/* `flex={1}`/`flexBasis={0}`/`minWidth={0}`: senza questi, il
                blocco si dimensiona sulla larghezza "a contenuto pieno" (non
                spezzata) della descrizione invece di rispettare lo spazio
                disponibile nella riga — stesso bug già corretto altrove per
                lo stesso motivo (CLAUDE.md §12, ProfessionalCard). */}
            <YStack gap="$1" flex={1} flexBasis={0} minWidth={0}>
              <Text fontFamily="$heading" fontWeight="700" fontSize="$5" color={brand.grafite}>
                {request.city ? `${request.categoryLabel} · ${request.city}` : request.categoryLabel}
              </Text>
              <XStack alignItems="center" gap="$2" flexWrap="wrap">
                {request.serviceMode ? (
                  <XStack alignItems="center" gap="$1">
                    <Icon name={request.serviceMode === "ONLINE" ? "video" : "house"} size={12} color={brand.cianografia} strokeWidth={1.5} />
                    <Text fontSize="$2" color={brand.cianografia} fontWeight="600">
                      {request.serviceMode === "ONLINE" ? "Online" : "A domicilio"}
                    </Text>
                  </XStack>
                ) : null}
                {/* Il cliente deve riconoscere a colpo d'occhio le proprie
                    richieste urgenti (priorita' e scadenza diverse — vedi
                    /urgente): stessa variante semantica rossa gia' usata
                    nella inbox del professionista. */}
                {request.isUrgent ? <Badge variant="urgente">Urgente</Badge> : null}
              </XStack>
              <Text color={brand.grafite70}>{request.description}</Text>
              {request.address ? (
                <XStack alignItems="center" gap="$1">
                  <Icon name="map-pin" size={12} color={brand.grafite70} strokeWidth={1.5} />
                  <Text fontSize="$2" color={brand.grafite70}>
                    {request.address}
                  </Text>
                </XStack>
              ) : null}
              {/*
                Data/fascia oraria richiesta (solo se la richiesta parte da
                una fascia "generica" dell'agenda pubblica del
                professionista, vedi GuidedRequestForm) — prima visibile
                solo nel form al momento dell'invio, mai più dopo: richiesta
                esplicita dell'utente di vederla anche qui, a richiesta già
                inviata.
              */}
              {request.preferredDate && request.preferredTimeSlot ? (
                <XStack alignItems="center" gap="$1">
                  <Icon name="calendar" size={12} color={brand.grafite70} strokeWidth={1.5} />
                  <Text fontSize="$2" color={brand.grafite70}>
                    {new Date(`${request.preferredDate}T00:00:00Z`).toLocaleDateString("it-IT", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      timeZone: "UTC",
                    })}
                    {" · "}
                    {request.preferredTimeSlot.replace("-", "–")}
                  </Text>
                </XStack>
              ) : null}
            </YStack>
            <YStack alignItems="flex-end" gap="$1" flexShrink={0}>
              <Text fontFamily="$body" fontSize={11} color={brand.cianografia} fontWeight="700">
                {STATUS_LABEL[request.status]}
              </Text>
              {isNew ? <Badge variant="nuovo">Nuovo</Badge> : null}
            </YStack>
          </YStack>

          {/* Stepper di stato in stile Deliveroo (richiesta esplicita
              dell'utente): "Richiesta → Preventivo inviato → Preventivo
              accettato → Completato", per trasparenza totale su a che
              punto è la richiesta. */}
          <RequestStepper stage={computeRequestStage(request.quotes)} />

          {statusSummary ? (
            <YStack gap="$1" backgroundColor={brand.gesso} borderRadius="$3" padding="$3">
              {statusSummary.statusMessage ? (
                <Text fontSize="$2" color={brand.grafite70}>
                  {statusSummary.statusMessage}
                </Text>
              ) : (
                <Text fontSize="$2" color={brand.grafite70}>
                  {/* Una frase sola invece di tre numeri affiancati (segnalato in
                      revisione UX: "Contattati 2 · Risposto 1 · In attesa 2"
                      sembrava non tornare) — la stessa informazione (quanti
                      preventivi sono già arrivati su quanti professionisti
                      contattati) in una forma che si legge senza fare i conti. */}
                  {statusSummary.responded === 0
                    ? `Nessun preventivo ricevuto ancora, su ${statusSummary.totalContacted} professionist${statusSummary.totalContacted === 1 ? "a" : "i"} contattat${statusSummary.totalContacted === 1 ? "o" : "i"}.`
                    : `${statusSummary.responded} preventiv${statusSummary.responded === 1 ? "o" : "i"} ricevut${statusSummary.responded === 1 ? "o" : "i"} su ${statusSummary.totalContacted} professionist${statusSummary.totalContacted === 1 ? "a" : "i"} contattat${statusSummary.totalContacted === 1 ? "o" : "i"}.`}
                </Text>
              )}
            </YStack>
          ) : null}

          {/* "Prezzo totale medio" — richiesta esplicita dell'utente, solo
              per una richiesta generica (fan-out categoria+città, non diretta
              al profilo di un professionista specifico) con almeno 1
              risposta: media tra i preventivi ricevuti, `null` se nessuno
              indica ancora un prezzo (tutte le voci "Su richiesta"). */}
          {!request.professionalProfileId && averagePriceEurCents !== null ? (
            <XStack alignItems="center" gap="$2" backgroundColor={brand.cianografiaVelo} borderRadius="$3" padding="$3">
              <Icon name="coins" size={16} color={brand.cianografia} strokeWidth={1.5} />
              <Text fontSize="$3" fontWeight="700" color={brand.cianografia}>
                Prezzo totale medio: {formatEurCents(averagePriceEurCents)}
              </Text>
            </XStack>
          ) : null}

          {/* Foto già allegate alla richiesta, visibili subito nell'anteprima
              (richiesta esplicita dell'utente) invece di essere nascoste
              finché non si entra in modifica. Cliccabili per ingrandirle,
              stesso PhotoLightbox già usato lato professionista in LeadCard. */}
          {request.photoUrls.length > 0 ? (
            <XStack gap="$2" flexWrap="wrap">
              {request.photoUrls.map((url, index) => (
                <MediaPreview
                  key={url}
                  url={url}
                  onClick={() => setOpenPhotoIndex(index)}
                  style={{ width: 72, height: 72, borderRadius: 6, border: `1px solid ${brand.filetto}`, cursor: "pointer" }}
                />
              ))}
            </XStack>
          ) : null}

          {/* Scorciatoia "stesso problema di prima": apre il form di
              nuova richiesta già precompilato con categoria, città,
              descrizione e indirizzo di questa — le foto vanno ricaricate
              (devono ritrarre il problema attuale). Fuori dal blocco
              canDelete: serve soprattutto sulle richieste CHIUSE (lavoro
              concluso, problema che si ripresenta), che non sono più
              né modificabili né eliminabili. */}
          <XStack>
            <Link
              href={`/preventivo?${new URLSearchParams({
                categoria: request.categorySlug,
                ...(request.city ? { citta: request.city } : {}),
                descrizione: request.description,
                ...(request.address ? { via: request.address } : {}),
                ...(request.houseNumber ? { civico: request.houseNumber } : {}),
                ...(request.addressExtra ? { interno: request.addressExtra } : {}),
                ...(request.postalCode ? { cap: request.postalCode } : {}),
                ...(request.province ? { provincia: request.province } : {}),
                ...(request.recipientName ? { nome: request.recipientName } : {}),
                ...(request.recipientSurname ? { cognome: request.recipientSurname } : {}),
                ...(request.recipientPhone ? { telefono: request.recipientPhone } : {}),
                ...(request.serviceMode ? { modalita: request.serviceMode } : {}),
              }).toString()}`}
              style={{ textDecoration: "none" }}
            >
              <Text color={brand.cianografia} fontWeight="600" fontSize="$3">
                Ripeti la richiesta
              </Text>
            </Link>
          </XStack>

          {canDelete ? (
            <XStack gap="$2" flexWrap="wrap" alignItems="center">
              {canEditDetails ? (
                <Button variant="secondary" size="$2" height={36} onPress={startEditing}>
                  Modifica
                </Button>
              ) : (
                <Text fontSize="$2" color={brand.grafite70}>
                  Non modificabile: hai già ricevuto un preventivo.
                </Text>
              )}
              {confirmingDelete ? (
                <>
                  <Text fontSize="$2" color={brand.urgenza}>
                    Eliminare questa richiesta?
                  </Text>
                  <Button variant="urgent" size="$2" height={36} onPress={handleDelete} disabled={isDeleting} opacity={isDeleting ? 0.6 : 1}>
                    {isDeleting ? "Eliminazione..." : "Conferma"}
                  </Button>
                  <Button variant="ghost" size="$2" height={36} onPress={() => setConfirmingDelete(false)}>
                    Annulla
                  </Button>
                </>
              ) : (
                <Text
                  color={brand.urgenza}
                  fontWeight="600"
                  fontSize="$3"
                  cursor="pointer"
                  accessibilityRole="button"
                  onPress={() => setConfirmingDelete(true)}
                >
                  Elimina
                </Text>
              )}
            </XStack>
          ) : null}
          {error ? (
            <Text color={brand.urgenza} fontSize="$3">
              {error}
            </Text>
          ) : null}
        </>
      )}

      {request.sentTo.length > 0 ? (
        <YStack gap="$2" borderTopWidth={1} borderTopColor={brand.filetto} paddingTop="$3">
          <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.grafite70}>
            Inviata a
          </Text>
          {request.sentTo.map((professional) => (
            <XStack
              key={professional.id}
              gap="$3"
              alignItems="center"
              backgroundColor={brand.gesso}
              borderRadius="$3"
              padding="$3"
              opacity={professional.declined ? 0.7 : 1}
            >
              <Link href={`/professionista/${professional.id}`} style={{ textDecoration: "none", color: "inherit", flex: 1 }}>
                <XStack gap="$3" alignItems="center">
                  <ProfessionalAvatar imageUrl={professional.imageUrl} categorySlug={professional.categorySlug} size={44} />
                  <YStack gap="$1" flex={1}>
                    <XStack gap="$2" alignItems="center" flexWrap="wrap">
                      <Text fontWeight="600" color={brand.grafite}>
                        {professional.businessName}
                      </Text>
                      {professional.verified ? <Badge variant="verificato">Verificato</Badge> : null}
                      {/*
                        Un professionista che ha rifiutato la richiesta prima
                        di inviare un preventivo (richiesta esplicita
                        dell'utente): il cliente prima non aveva modo di
                        sapere perché quel professionista non rispondeva mai.
                      */}
                      {professional.declined ? (
                        <Text fontFamily="$body" fontSize={10} fontWeight="700" color={brand.urgenza}>
                          Ha rifiutato
                        </Text>
                      ) : null}
                    </XStack>
                    <Text color={brand.grafite70} fontSize="$3">
                      {professional.categoryLabel} · {professional.city}
                    </Text>
                    {professional.declined && professional.declineNote ? (
                      <Text color={brand.grafite70} fontSize="$2">
                        {professional.declineNote}
                      </Text>
                    ) : null}
                  </YStack>
                </XStack>
              </Link>
              <XStack
                alignItems="center"
                gap="$1"
                cursor="pointer"
                accessibilityRole="button"
                onPress={() => openTimelineForProfessional(professional.id)}
              >
                <Text fontSize="$2" fontWeight="600" color={brand.cianografia}>
                  Contatta/Cronologia
                </Text>
                <UnreadDot count={effectiveThreadUnread(`${request.id}:${professional.id}`)} />
              </XStack>
            </XStack>
          ))}
        </YStack>
      ) : null}

      {openTimelineProfessionalId ? (
        <TimelineModal
          token={token}
          guidedRequestId={request.id}
          professionalProfileId={openTimelineProfessionalId}
          viewerRole="CLIENT"
          otherPartyName={request.sentTo.find((p) => p.id === openTimelineProfessionalId)?.businessName ?? null}
          onClose={() => setOpenTimelineProfessionalId(null)}
        />
      ) : null}

      {request.quotes.length > 0 ? (
        <YStack gap="$2" borderTopWidth={1} borderTopColor={brand.filetto} paddingTop="$3">
          <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.grafite70}>
            Preventivi ricevuti
          </Text>
          {request.quotes.map((quote) => (
            <QuoteCard
              key={quote.id}
              quote={quote}
              token={token}
              onChanged={onChanged}
              onAcceptQuote={onAcceptQuote}
              requestedTimeSlot={request.preferredTimeSlot}
              guidedRequestId={request.id}
              serviceMode={request.serviceMode}
              isNew={newQuoteIds?.has(quote.id)}
              unreadCount={combineUnreadCounts(quoteUnreadCounts?.get(quote.id), threadUnreadCounts?.get(`${request.id}:${quote.professionalProfileId}`))}
            />
          ))}
        </YStack>
      ) : (
        <Text color={brand.grafite70} fontSize="$3">
          Nessun preventivo ricevuto ancora.
        </Text>
      )}

      {openPhotoIndex !== null ? (
        <PhotoLightbox photos={request.photoUrls} initialIndex={openPhotoIndex} onClose={() => setOpenPhotoIndex(null)} />
      ) : null}
    </Surface>
  );
}

function formatQuoteDate(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })} · ${date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}`;
}

/**
 * Data + fascia oraria completa ("lunedì 5 agosto · 09:00–13:00") —
 * richiesta esplicita dell'utente: "non visualizzare solo il primo orario
 * ma tutta la fascia d'orario". Mostra solo l'inizio se la fine non è nota
 * (preventivi/proposte precedenti a questa funzionalità).
 */
function formatQuoteDateRange(startIso: string, endIso: string | null): string {
  if (!endIso) return formatQuoteDate(startIso);
  const endLabel = new Date(endIso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${formatQuoteDate(startIso)}–${endLabel}`;
}

/** Data+ora di invio di un preventivo (timestamp reale, fuso orario del browser). */
function formatSentAt(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })} alle ${date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
}

// `isCurrentProposal` distingue la data/orario attualmente proposti dal
// professionista quando non corrisponde a nessuna fascia reale
// dell'agenda (data/ora inserita a mano dal professionista, CLAUDE.md
// §46) — mai una vera fascia libera, solo aggiunta per poterla comunque
// scegliere/vedere nell'elenco.
type FreeSlot = { date: string; startTime: string; endTime: string; isCurrentProposal?: boolean };

// Valore speciale per l'opzione "Altro" nel menu a tendina data/ora
// (richiesta esplicita dell'utente) — mai una data reale, quindi non può
// collidere con una vera chiave `date|startTime|endTime`.
const MANUAL_OPTION_VALUE = "altro";

/**
 * Preventivo ricevuto: mostra la data proposta dal professionista (prima
 * non era visibile affatto) e permette al cliente di accettarla o
 * proporne un'altra, scelta tra le fasce libere reali dell'agenda del
 * professionista (mai una data a caso — richiesta esplicita dell'utente).
 */
function QuoteCard({
  quote,
  token,
  onChanged,
  onAcceptQuote,
  requestedTimeSlot,
  guidedRequestId,
  serviceMode,
  isNew,
  unreadCount,
}: {
  quote: ClientGuidedRequest["quotes"][number];
  token: string;
  onChanged: () => void;
  onAcceptQuote: (quoteId: string) => Promise<void>;
  /** Fascia oraria che il cliente aveva originariamente richiesto (solo se la richiesta è nata da una fascia generica dell'agenda), per evidenziare se il professionista l'ha cambiata. */
  requestedTimeSlot: string | null;
  /** Richiesta di origine, per il bottone "Cronologia" (richiesta esplicita dell'utente). */
  guidedRequestId: string;
  /** Modalità della richiesta originale (richiesta esplicita dell'utente: "differenzia sempre... anche nelle successive modifiche della data e ora") — filtra le fasce proponibili a quelle che offrono questa modalità. */
  serviceMode: "HOME" | "ONLINE" | null;
  /** True se proprio QUESTO preventivo ha ricevuto un aggiornamento non letto (richiesta esplicita dell'utente). */
  isNew?: boolean;
  /** Numero di aggiornamenti non letti per questo preventivo — pallino rosso accanto a "Contatta/Cronologia" (richiesta esplicita dell'utente). */
  unreadCount?: number;
}) {
  const [isChoosingDate, setIsChoosingDate] = useState(false);
  const [freeSlots, setFreeSlots] = useState<FreeSlot[] | null>(null);
  const [selectedSlotKey, setSelectedSlotKey] = useState("");
  const [proposeNote, setProposeNote] = useState("");
  // "Altro" nel menu a tendina data/ora (richiesta esplicita dell'utente):
  // il cliente può proporre un orario libero non presente nell'agenda
  // pubblica del professionista — stesso principio già in uso per la
  // controproposta del professionista (isManual, CLAUDE.md §47).
  const [manualDate, setManualDate] = useState("");
  const [manualStartTime, setManualStartTime] = useState("");
  const [manualEndTime, setManualEndTime] = useState("");
  const [isProposing, setIsProposing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [showPaymentInfo, setShowPaymentInfo] = useState(false);
  const [confirmingReject, setConfirmingReject] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  // Il pallino "Contatta/Cronologia" deve sparire non appena si apre la
  // conversazione (richiesta esplicita dell'utente) — vedi
  // useDismissableUnreadCount per il motivo del calcolo differenziale.
  const [effectiveUnreadCount, dismissUnread] = useDismissableUnreadCount(unreadCount);
  // Totale minimo/massimo delle voci di questo preventivo (richiesta
  // esplicita dell'utente: "il totale dei minimi in un riquadro e il totale
  // dei massimi nell'altro").
  const priceTotals = useMemo(() => quotePriceTotals(quote.items), [quote.items]);

  // I dati per raggiungere il cliente (destinatario, indirizzo) sono già
  // stati raccolti alla richiesta (GuidedRequestForm) — accettare crea
  // subito la prenotazione, nessun modulo da compilare qui.
  async function handleAccept() {
    setError(null);
    setIsAccepting(true);
    try {
      await onAcceptQuote(quote.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsAccepting(false);
    }
  }

  async function startChoosingDate() {
    setError(null);
    setIsChoosingDate(true);
    if (freeSlots === null) {
      try {
        const agenda = await apiClient.getProfessionalAgenda(quote.professionalProfileId);
        const slots: FreeSlot[] = [];
        for (const day of agenda.days) {
          for (const slot of day.slots) {
            // Bug reale corretto (segnalato dall'utente: "non compaiono le
            // date disponibili"): il filtro escludeva del tutto le fasce a
            // capienza (maxBookings > 1), lasciando la lista vuota per un
            // professionista che avesse impostato l'agenda solo con quel
            // tipo di fascia — stesso identico bug già corretto altrove in
            // questa sessione per ProfessionalsService.getMyAvailableSlots
            // ("scegliere quando iniziare un lavoro già concordato non
            // consuma la capienza pensata per il fan-out delle richieste").
            // Filtrato anche per modalità (richiesta esplicita dell'utente):
            // solo le fasce che offrono la stessa modalità della richiesta
            // originale — home/online sono capienze indipendenti.
            const modeInfo = serviceMode === "ONLINE" ? slot.online : slot.home;
            if (modeInfo && modeInfo.bookedCount < modeInfo.maxBookings) {
              slots.push({ date: day.date, startTime: slot.startTime, endTime: slot.endTime });
            }
          }
        }
        // La data/orario attualmente proposti dal professionista potrebbe
        // non corrispondere a nessuna fascia reale dell'agenda (richiesta
        // esplicita dell'utente: il professionista può inserire una
        // data/orario manuale, indipendente dalle fasce configurate,
        // CLAUDE.md §46) — senza aggiungerla esplicitamente all'elenco,
        // il cliente non potrebbe mai scegliere "la stessa proposta" (per
        // scrivere solo una nota) né vederla tra le opzioni. Aggiunta in
        // testa se non già presente, così resta anche la selezione
        // iniziale di default.
        const currentDate = quote.estimatedStartDate.slice(0, 10);
        const currentStartTime = quote.estimatedStartDate.slice(11, 16);
        const currentEndTime = quote.estimatedEndDate ? quote.estimatedEndDate.slice(11, 16) : currentStartTime;
        const matching = slots.find((s) => s.date === currentDate && s.startTime === currentStartTime);
        if (!matching) {
          slots.unshift({ date: currentDate, startTime: currentStartTime, endTime: currentEndTime, isCurrentProposal: true });
        }
        setFreeSlots(slots);
        const initial = matching ?? slots[0];
        if (initial) setSelectedSlotKey(`${initial.date}|${initial.startTime}|${initial.endTime}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore nel caricamento degli orari disponibili.");
      }
    }
  }

  async function handleProposeDate() {
    let date: string;
    let startTime: string;
    let endTime: string;
    let isManual = false;
    if (selectedSlotKey === MANUAL_OPTION_VALUE) {
      if (!manualDate) return setError("Indica una data.");
      if (!manualStartTime || !manualEndTime) return setError("Indica sia l'ora di inizio sia l'ora di fine.");
      if (manualEndTime <= manualStartTime) return setError("L'ora di fine deve essere dopo l'ora di inizio.");
      date = manualDate;
      startTime = manualStartTime;
      endTime = manualEndTime;
      isManual = true;
    } else {
      const parts = selectedSlotKey.split("|");
      if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
        setError("Scegli un orario.");
        return;
      }
      [date, startTime, endTime] = parts as [string, string, string];
    }
    setError(null);
    setIsProposing(true);
    try {
      await apiClient.proposeQuoteDate(token, quote.id, { date, startTime, endTime, note: proposeNote.trim() || undefined, isManual: isManual || undefined });
      setIsChoosingDate(false);
      setProposeNote("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsProposing(false);
    }
  }

  // "Dai l'opzione per rifiutare il preventivo oltre ad accettarlo"
  // (richiesta esplicita dell'utente) — distinto dal rifiuto di una
  // singola data proposta (già esistente): qui il preventivo intero non va
  // più bene.
  async function handleRejectQuote() {
    setError(null);
    setIsRejecting(true);
    try {
      await apiClient.rejectQuote(token, quote.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
      setConfirmingReject(false);
    } finally {
      setIsRejecting(false);
    }
  }

  return (
    <YStack backgroundColor={brand.gesso} borderRadius="$3" padding="$3" gap="$2">
      {/* Nome del professionista cliccabile: apre il suo profilo pubblico
          (richiesta esplicita dell'utente, stesso trattamento già in uso
          nella sezione "Inviata a" più sopra in questa pagina). */}
      <XStack alignItems="center" gap="$2" flexWrap="wrap">
        <Link href={`/professionista/${quote.professionalProfileId}`} style={{ textDecoration: "none" }}>
          <Text fontWeight="600" color={brand.cianografia}>
            {quote.businessName}
          </Text>
        </Link>
        {/* Simbolo sul preventivo specifico (richiesta esplicita
            dell'utente): distingue quale preventivo, tra più ricevuti per
            la stessa richiesta, ha ricevuto l'aggiornamento. */}
        {isNew ? <Badge variant="nuovo">Nuovo</Badge> : null}
      </XStack>
      <Text fontSize="$3" color={brand.grafite70}>
        Data proposta: {formatQuoteDateRange(quote.estimatedStartDate, quote.estimatedEndDate)}
      </Text>
      <Text fontSize="$2" color={brand.grafite70}>
        Inviato il {formatSentAt(quote.sentAt)}
      </Text>
      {/* Cronologia completa del thread con questo professionista —
          richiesta esplicita dell'utente: "cliccando ad esempio sul
          preventivo possa vedere la cronologia completa". */}
      <XStack
        alignItems="center"
        gap="$1"
        alignSelf="flex-start"
        cursor="pointer"
        accessibilityRole="button"
        onPress={() => {
          setShowTimeline(true);
          dismissUnread();
        }}
      >
        <Text fontSize="$2" fontWeight="600" color={brand.cianografia}>
          Contatta/Cronologia
        </Text>
        <UnreadDot count={effectiveUnreadCount} />
      </XStack>
      {/* Il professionista ha inviato il preventivo con un orario diverso
          da quello effettivamente richiesto dal cliente (richiesta
          esplicita dell'utente: "evidenzialo... per farglielo notare") —
          solo quando la richiesta portava un orario preferito, cioè è
          nata da una fascia generica dell'agenda pubblica. */}
      {quote.timeChangedFromRequest && requestedTimeSlot ? (
        <YStack gap="$1" borderWidth={1} borderColor={brand.ottone} backgroundColor={brand.calce} borderRadius="$2" padding="$2">
          <Text fontSize="$2" fontWeight="600" color={brand.grafite}>
            Il professionista ha proposto un orario diverso da quello richiesto ({requestedTimeSlot.replace("-", "–")}).
          </Text>
        </YStack>
      ) : null}
      {/* Il professionista ha modificato direttamente l'orario durante la
          trattativa ("Modifica", invece di limitarsi a confermare/rifiutare
          la data proposta) — richiesta esplicita dell'utente. La "Data
          proposta" sopra riflette già il nuovo orario, qui solo l'eventuale
          messaggio lasciato. */}
      {/* Il professionista ha modificato direttamente data/orario durante la
          trattativa ("Modifica") — richiesta esplicita dell'utente: "deve
          essere visibile chiaramente così come visualizzato nella parte del
          professionista quando il cliente modifica data/ora" — stessa resa
          visiva (padding/radius/font) del banner "Il cliente ha proposto
          un'altra data" mostrato al professionista in /dashboard, con la
          nuova data/ora riportata esplicitamente nel banner (non solo nella
          riga "Data proposta" sopra). */}
      {quote.status === "SENT" && quote.professionalCounterNote ? (
        <YStack gap="$2" borderWidth={1} borderColor={brand.ottone} backgroundColor={brand.calce} borderRadius="$3" padding="$3">
          <Text fontSize="$3" fontWeight="600" color={brand.grafite}>
            Il professionista ha risposto proponendo: {formatQuoteDateRange(quote.estimatedStartDate, quote.estimatedEndDate)}
          </Text>
          <Text fontSize="$3" color={brand.grafite70}>
            {quote.professionalCounterNote}
          </Text>
        </YStack>
      ) : null}
      <YStack gap="$1">
        {quote.items.map((item) => (
          <Text key={item.id} color={brand.grafite70} fontSize="$3">
            {item.name}: {formatServicePriceRange(item.priceMinEurCents, item.priceMaxEurCents)}
          </Text>
        ))}
      </YStack>
      {/* Totale indicativo del preventivo: un'unica riga in evidenza invece
          dei due riquadri "Totale minimo"/"Totale massimo" affiancati
          (segnalato in revisione UX: occupava spazio e si leggeva male,
          è la prima cosa che entrambe le parti cercano) — stesso helper
          `formatServicePriceRange` già usato per le prestazioni del
          profilo pubblico, riduce automaticamente a un solo valore quando
          min ed max coincidono. Nascosto se nessuna voce ha un prezzo
          indicato ("Su richiesta"). */}
      {priceTotals.totalMinEurCents > 0 || priceTotals.totalMaxEurCents > 0 ? (
        <YStack backgroundColor={brand.gesso} borderRadius="$3" padding="$3" gap="$1">
          <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.grafite70}>
            Totale indicativo
          </Text>
          <Text fontSize="$6" fontWeight="800" color={brand.grafite}>
            {formatServicePriceRange(priceTotals.totalMinEurCents, priceTotals.totalMaxEurCents)}
          </Text>
        </YStack>
      ) : null}
      {/* Note del professionista in un box a parte (segnalato in revisione
          UX: prima era un rigo di testo isolato, mischiato al resto della
          card) — stesso trattamento visivo già usato per i banner "Il
          professionista ha risposto proponendo"/"Il cliente ha proposto
          un'altra data" più sopra in questo file. */}
      {quote.notes ? (
        <YStack backgroundColor={brand.gesso} borderRadius="$3" padding="$3" gap="$1">
          <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.grafite70}>
            Messaggio del professionista
          </Text>
          <Text color={brand.grafite70} fontSize="$3">
            {quote.notes}
          </Text>
        </YStack>
      ) : null}

      {quote.status === "SENT" ? (
        <>
          {/* Gerarchia dei bottoni (segnalato in revisione UX): "Accetta"
              primario, "Modifica data/orario" secondario, "Rifiuta" spostato
              su una riga propria sotto e reso discreto (testo grigio, non più
              rosso in grassetto affiancato al primario) — il rosso resta
              riservato alla sola conferma effettiva del rifiuto. */}
          <XStack gap="$2" flexWrap="wrap" alignItems="center">
            <Button variant="primary" size="$3" height={40} onPress={handleAccept} disabled={isAccepting} opacity={isAccepting ? 0.6 : 1}>
              {isAccepting ? "Accettazione..." : "Accetta preventivo"}
            </Button>
            {!isChoosingDate ? (
              <Button variant="secondary" size="$3" height={40} onPress={startChoosingDate}>
                Modifica data/orario
              </Button>
            ) : null}
          </XStack>
          {!isChoosingDate ? (
            <XStack gap="$2" alignItems="center">
              {!confirmingReject ? (
                <Text
                  color={brand.grafite70}
                  fontWeight="500"
                  fontSize="$2"
                  textDecorationLine="underline"
                  cursor="pointer"
                  accessibilityRole="button"
                  onPress={() => setConfirmingReject(true)}
                >
                  Rifiuta preventivo
                </Text>
              ) : (
                <>
                  <Text fontSize="$2" color={brand.urgenza}>
                    Rifiutare questo preventivo?
                  </Text>
                  <Button variant="urgent" size="$2" height={36} onPress={handleRejectQuote} disabled={isRejecting} opacity={isRejecting ? 0.6 : 1}>
                    {isRejecting ? "Rifiuto..." : "Conferma"}
                  </Button>
                  <Button variant="ghost" size="$2" height={36} onPress={() => setConfirmingReject(false)}>
                    Annulla
                  </Button>
                </>
              )}
            </XStack>
          ) : null}
          {isChoosingDate ? (
            <YStack gap="$2" paddingTop="$2" borderTopWidth={1} borderTopColor={brand.filetto}>
              {freeSlots === null ? (
                <Text fontSize="$2" color={brand.grafite70}>
                  Caricamento orari disponibili...
                </Text>
              ) : freeSlots.length === 0 ? (
                <Text fontSize="$2" color={brand.grafite70}>
                  Nessun orario libero nell&apos;agenda pubblica di questo professionista al momento.
                </Text>
              ) : (
                <>
                  <select value={selectedSlotKey} onChange={(e) => setSelectedSlotKey(e.target.value)} style={textareaStyle}>
                    {freeSlots.map((slot) => {
                      const key = `${slot.date}|${slot.startTime}|${slot.endTime}`;
                      const label = `${new Date(`${slot.date}T00:00:00Z`).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} · ${slot.startTime}–${slot.endTime}${slot.isCurrentProposal ? " (proposta attuale)" : ""}`;
                      return (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      );
                    })}
                    <option value={MANUAL_OPTION_VALUE}>Altro (data e orario personalizzati)</option>
                  </select>
                  {selectedSlotKey === MANUAL_OPTION_VALUE ? (
                    <YStack gap="$2">
                      <XStack gap="$2" flexWrap="wrap">
                        <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} style={{ ...textareaStyle, flex: 1, minWidth: 130 }} />
                        <input type="time" value={manualStartTime} onChange={(e) => setManualStartTime(e.target.value)} style={{ ...textareaStyle, flex: 1, minWidth: 100 }} />
                        <input type="time" value={manualEndTime} onChange={(e) => setManualEndTime(e.target.value)} style={{ ...textareaStyle, flex: 1, minWidth: 100 }} />
                      </XStack>
                      <Text fontSize={11} color={brand.grafite70}>
                        Il professionista dovrà confermare questo orario prima che diventi un appuntamento.
                      </Text>
                    </YStack>
                  ) : null}
                  <textarea
                    value={proposeNote}
                    onChange={(e) => setProposeNote(e.target.value)}
                    placeholder="Dettagli aggiuntivi (opzionale): es. posso solo dopo le 17"
                    rows={2}
                    style={textareaStyle}
                  />
                  <XStack gap="$2">
                    <Button variant="primary" size="$3" height={40} onPress={handleProposeDate} disabled={isProposing} opacity={isProposing ? 0.6 : 1}>
                      {isProposing ? "Invio..." : "Invia proposta"}
                    </Button>
                    <Button variant="ghost" size="$3" height={40} onPress={() => setIsChoosingDate(false)} disabled={isProposing}>
                      Annulla
                    </Button>
                  </XStack>
                </>
              )}
            </YStack>
          ) : null}
        </>
      ) : quote.status === "MODIFICATION_REQUESTED" ? (
        <YStack gap="$1">
          <Text fontSize="$2" color={brand.ottone} fontWeight="600">
            In attesa di conferma del professionista per il{" "}
            {quote.clientProposedDate ? formatQuoteDateRange(quote.clientProposedDate, quote.clientProposedEndDate) : ""}
          </Text>
          {quote.clientProposedNote ? (
            <Text fontSize="$2" color={brand.grafite70}>
              {quote.clientProposedNote}
            </Text>
          ) : null}
        </YStack>
      ) : quote.status === "ACCEPTED" ? (
        <YStack gap="$2">
          <Text fontSize="$2" color={brand.verificato} fontWeight="600">
            Accettato
          </Text>
          {showPaymentInfo ? (
            <Text fontSize="$2" color={brand.grafite70}>
              Il pagamento in piattaforma non è ancora attivo: accordati direttamente con il professionista sulle
              modalità di pagamento.
            </Text>
          ) : (
            <Text
              color={brand.cianografia}
              fontWeight="600"
              fontSize="$3"
              cursor="pointer"
              accessibilityRole="button"
              onPress={() => setShowPaymentInfo(true)}
            >
              Come pago?
            </Text>
          )}
        </YStack>
      ) : quote.status === "REJECTED" ? (
        <Text fontSize="$2" color={brand.urgenza} fontWeight="600">
          Hai rifiutato questo preventivo
        </Text>
      ) : quote.status === "WITHDRAWN" ? (
        <Text fontSize="$2" color={brand.urgenza} fontWeight="600">
          Il professionista ha ritirato questo preventivo
        </Text>
      ) : null}

      {error ? (
        <Text color={brand.urgenza} fontSize="$3">
          {error}
        </Text>
      ) : null}

      {showTimeline ? (
        <TimelineModal
          token={token}
          guidedRequestId={guidedRequestId}
          professionalProfileId={quote.professionalProfileId}
          viewerRole="CLIENT"
          otherPartyName={quote.businessName}
          onClose={() => setShowTimeline(false)}
        />
      ) : null}
    </YStack>
  );
}

function BookingRow({
  booking,
  token,
  onReviewed,
  isNew,
  unreadCount,
}: {
  booking: ClientBooking;
  token: string;
  onReviewed: () => void;
  /** True se questa prenotazione ha un aggiornamento non letto — richiesta esplicita dell'utente ("rendilo evidente anche nella lista"). */
  isNew?: boolean;
  /** Numero di aggiornamenti non letti per questa prenotazione — pallino rosso accanto a "Contatta/Cronologia" (richiesta esplicita dell'utente). */
  unreadCount?: number;
}) {
  // Conferma del cliente che il lavoro è terminato dal suo lato (richiesta
  // esplicita dell'utente: "servono i completed da entrambi") + recensione
  // al professionista, sbloccata subito dopo — stessi popup condivisi con
  // il lato professionista (ClientCompleteModal/ReviewModal).
  const [showClientCompleteModal, setShowClientCompleteModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [showNoShowModal, setShowNoShowModal] = useState(false);
  const [openRequestPhotoIndex, setOpenRequestPhotoIndex] = useState<number | null>(null);
  const [confirmingDeleteBooking, setConfirmingDeleteBooking] = useState(false);
  const [isDeletingBooking, setIsDeletingBooking] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Cronologia completa della richiesta (richiesta esplicita dell'utente:
  // "in lavori accettati, inserisci un pulsante con scritto vai alla
  // richiesta preventivo, e quindi visualizza tutti gli aggiornamenti").
  const [showTimeline, setShowTimeline] = useState(false);
  // Il pallino "Contatta/Cronologia" deve sparire non appena si apre la
  // conversazione (richiesta esplicita dell'utente) — vedi
  // useDismissableUnreadCount per il motivo del calcolo differenziale.
  const [effectiveUnreadCount, dismissUnread] = useDismissableUnreadCount(unreadCount);

  async function handleCancelBooking() {
    setCancelError(null);
    setIsCanceling(true);
    try {
      await apiClient.cancelMyBooking(token, booking.id);
      onReviewed();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
      setConfirmingCancel(false);
    } finally {
      setIsCanceling(false);
    }
  }

  // Richiesta esplicita dell'utente: quando il professionista ha eliminato
  // l'account, la prenotazione non è più azionabile (nessun modo di
  // contattarlo) e resterebbe altrimenti a ingombrare "Lavori accettati"
  // per sempre — stesso principio/pattern di LeadCard.handleDeleteLead
  // (professionista che elimina una richiesta di un cliente eliminato).
  async function handleDeleteBooking() {
    setDeleteError(null);
    setIsDeletingBooking(true);
    try {
      await apiClient.deleteBooking(token, booking.id);
      onReviewed();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
      setConfirmingDeleteBooking(false);
    } finally {
      setIsDeletingBooking(false);
    }
  }

  async function handleClientConfirmComplete(photoUrls: string[]) {
    await apiClient.clientConfirmComplete(token, booking.id, { photoUrls });
    setShowClientCompleteModal(false);
    // La recensione resta bloccata finché il professionista non ha
    // anche lui completato il lavoro (ReviewsService.create, invariato) —
    // il cliente può ora confermare "a prescindere" dal professionista,
    // quindi qui lo stato potrebbe essere ancora CONFIRMED: aprire il
    // popup di recensione in quel caso fallirebbe subito con un 403.
    if (booking.status === "COMPLETED" && !booking.hasReview) {
      setShowReviewModal(true);
    }
    onReviewed();
  }

  async function handleSubmitReview(input: { rating: number; comment?: string; mediaUrls: string[] }) {
    await apiClient.createReview(token, { bookingId: booking.id, rating: input.rating, comment: input.comment, photoUrls: input.mediaUrls });
    setShowReviewModal(false);
    onReviewed();
  }

  // "Non presentato" (richiesta esplicita dell'utente): disponibile solo
  // dopo che l'appuntamento CONFIRMED è realmente terminato (mai prima —
  // non ha senso segnalare una mancata presentazione a un orario ancora
  // da venire), e solo una volta per prenotazione.
  const referenceEnd = booking.scheduledEndAt ?? booking.scheduledAt;
  const noShowEligible = booking.status === "CONFIRMED" && new Date(referenceEnd).getTime() <= Date.now() && !booking.refundRequested;

  return (
    <Surface gap="$2">
      <YStack flexDirection="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
        {booking.professionalAccountDeleted ? (
          // Il professionista ha eliminato l'account (soft-delete) —
          // richiesta esplicita dell'utente: nessun link (il profilo
          // pubblico non esiste più), stesso stile neutro già in uso per
          // "Account eliminato" lato professionista (LeadCard/AcceptedJobCard).
          <XStack alignItems="center" gap="$2">
            <Text fontWeight="600" color={brand.grafite70}>
              {booking.businessName}
            </Text>
            <Text fontSize="$2" fontWeight="600" color={brand.grafite70}>
              · Account eliminato
            </Text>
          </XStack>
        ) : (
          <Link href={`/professionista/${booking.professionalProfileId}`} style={{ textDecoration: "none" }}>
            <Text fontWeight="600" color={brand.cianografia}>
              {booking.businessName}
            </Text>
          </Link>
        )}
        <XStack alignItems="center" gap="$2">
          <Text fontFamily="$body" fontSize={11} color={booking.status === "CANCELED" ? brand.urgenza : brand.cianografia} fontWeight="700">
            {booking.status === "CANCELED"
              ? // Da questa vista (cliente) "CLIENT" è "tu" — richiesta esplicita
                // dell'utente: far capire chi ha annullato, non solo che è stata
                // annullata. `null` per righe da prima di questo campo.
                `Annullata${booking.canceledBy === "PROFESSIONAL" ? " dal professionista" : booking.canceledBy === "CLIENT" ? " da te" : ""}`
              : BOOKING_STATUS_LABEL[booking.status]}
          </Text>
          {isNew ? <Badge variant="nuovo">Nuovo</Badge> : null}
        </XStack>
      </YStack>
      <Text color={brand.grafite70} fontSize="$3">
        {new Date(booking.scheduledAt).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
        {" · "}
        {new Date(booking.scheduledAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
        {/* Fascia completa (richiesta esplicita dell'utente: "non
            visualizzare solo il primo orario ma tutta la fascia d'orario"),
            quando l'ora di fine è nota. */}
        {booking.scheduledEndAt ? `–${new Date(booking.scheduledEndAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}` : ""}
      </Text>

      {booking.guidedRequestId ? (
        <XStack
          alignItems="center"
          gap="$1"
          alignSelf="flex-start"
          cursor="pointer"
          accessibilityRole="button"
          onPress={() => {
            setShowTimeline(true);
            dismissUnread();
          }}
        >
          <Text fontSize="$2" fontWeight="600" color={brand.cianografia}>
            Contatta/Cronologia
          </Text>
          <UnreadDot count={effectiveUnreadCount} />
        </XStack>
      ) : null}

      {/* Link consulenza video (Meet/Zoom/ecc.), impostato dal
          professionista — richiesta esplicita dell'utente. */}
      {booking.meetingLink ? (
        <a href={booking.meetingLink} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
          <XStack alignItems="center" gap="$2">
            <Icon name="video" size={14} color={brand.cianografia} strokeWidth={1.5} />
            <Text fontSize="$3" color={brand.cianografia} fontWeight="600">
              Partecipa alla videochiamata
            </Text>
          </XStack>
        </a>
      ) : null}

      {/* Dati della richiesta guidata originale (titolo/categoria,
          descrizione, foto) — richiesta esplicita dell'utente: "oltre ai
          dati della persona [professionista] deve venire anche i dati del
          preventivo da lui inviato all'inizio come la descrizione
          dell'evento con il titolo, le foto". Assente per le prenotazioni
          dirette da agenda pubblica (nessuna GuidedRequest collegata). */}
      {booking.categoryLabel || booking.description || booking.photoUrls.length > 0 ? (
        <YStack gap="$2" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto}>
          {booking.categoryLabel ? (
            <Text fontSize="$3" fontWeight="700" color={brand.grafite}>
              {booking.categoryLabel}
            </Text>
          ) : null}
          {booking.description ? (
            <Text fontSize="$3" color={brand.grafite70}>
              {booking.description}
            </Text>
          ) : null}
          {booking.photoUrls.length > 0 ? (
            <XStack gap="$2" flexWrap="wrap">
              {booking.photoUrls.map((url, index) => (
                <MediaPreview
                  key={url}
                  url={url}
                  onClick={() => setOpenRequestPhotoIndex(index)}
                  style={{ width: 72, height: 72, borderRadius: 6, border: `1px solid ${brand.filetto}`, cursor: "pointer" }}
                />
              ))}
            </XStack>
          ) : null}
        </YStack>
      ) : null}

      {openRequestPhotoIndex !== null ? (
        <PhotoLightbox photos={booking.photoUrls} initialIndex={openRequestPhotoIndex} onClose={() => setOpenRequestPhotoIndex(null)} />
      ) : null}

      {/* Preventivo accettato (le voci concordate, distinte dall'importo
          finale esatto mostrato più sotto a lavoro terminato). */}
      {booking.quoteItems.length > 0 ? (
        <YStack gap="$1" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto}>
          <Text fontSize="$2" fontWeight="600" color={brand.grafite}>
            Preventivo accettato
          </Text>
          {booking.quoteItems.map((item) => (
            <XStack key={item.id} justifyContent="space-between" gap="$2">
              <Text fontSize="$2" color={brand.grafite70}>
                {item.name}
              </Text>
              <Text fontSize="$2" color={brand.grafite}>
                {formatServicePriceRange(item.priceMinEurCents, item.priceMaxEurCents)}
              </Text>
            </XStack>
          ))}
          {booking.quoteNotes ? (
            <Text fontSize="$2" color={brand.grafite70}>
              {booking.quoteNotes}
            </Text>
          ) : null}
        </YStack>
      ) : null}

      {booking.status === "COMPLETED" && booking.finalAmountEurCents !== null ? (
        <YStack gap="$1" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto}>
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

      {booking.status === "CANCELED" && booking.cancellationNote ? (
        <YStack gap="$1" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto}>
          <Text fontSize="$2" fontWeight="600" color={brand.grafite}>
            Nota del professionista
          </Text>
          <Text fontSize="$2" color={brand.grafite70}>
            {booking.cancellationNote}
          </Text>
        </YStack>
      ) : null}

      {booking.status === "PENDING" || booking.status === "CONFIRMED" ? (
        <XStack gap="$2" alignItems="center" flexWrap="wrap">
          {confirmingCancel ? (
            <>
              <Text fontSize="$2" color={brand.urgenza}>
                Annullare questa prenotazione?
              </Text>
              <Button variant="urgent" size="$2" height={36} onPress={handleCancelBooking} disabled={isCanceling} opacity={isCanceling ? 0.6 : 1}>
                {isCanceling ? "Annullamento..." : "Conferma"}
              </Button>
              <Button variant="ghost" size="$2" height={36} onPress={() => setConfirmingCancel(false)}>
                Torna indietro
              </Button>
            </>
          ) : (
            <Text
              color={brand.urgenza}
              fontWeight="600"
              fontSize="$3"
              cursor="pointer"
              accessibilityRole="button"
              onPress={() => setConfirmingCancel(true)}
            >
              Annulla prenotazione
            </Text>
          )}
        </XStack>
      ) : null}
      {cancelError ? (
        <Text color={brand.urgenza} fontSize="$3">
          {cancelError}
        </Text>
      ) : null}

      {noShowEligible ? (
        <Text
          color={brand.urgenza}
          fontWeight="600"
          fontSize="$3"
          cursor="pointer"
          accessibilityRole="button"
          onPress={() => setShowNoShowModal(true)}
        >
          Non presentato
        </Text>
      ) : null}

      {booking.status === "CONFIRMED" && booking.refundRequested ? (
        <YStack gap="$1" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto}>
          <Text fontSize="$2" fontWeight="600" color={brand.urgenza}>
            Hai segnalato la mancata presentazione
          </Text>
          <Text fontSize="$2" color={brand.grafite70}>
            Abbiamo avvisato {booking.businessName}. Contattalo direttamente per accordarvi su un rimborso.
          </Text>
        </YStack>
      ) : null}

      {/* Eliminazione dalla lista, richiesta esplicita dell'utente — mostrata
          a prescindere dallo stato della prenotazione, quando il
          professionista ha eliminato l'account. Doppia conferma, stesso
          pattern già in uso per "Annulla prenotazione" sopra. */}
      {booking.professionalAccountDeleted ? (
        <XStack gap="$2" alignItems="center" flexWrap="wrap" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto}>
          {confirmingDeleteBooking ? (
            <>
              <Text fontSize="$2" color={brand.urgenza}>
                Eliminare questa prenotazione dalla lista?
              </Text>
              <Button
                variant="urgent"
                size="$2"
                height={36}
                onPress={handleDeleteBooking}
                disabled={isDeletingBooking}
                opacity={isDeletingBooking ? 0.6 : 1}
              >
                {isDeletingBooking ? "Eliminazione..." : "Conferma"}
              </Button>
              <Button variant="ghost" size="$2" height={36} onPress={() => setConfirmingDeleteBooking(false)}>
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
              onPress={() => setConfirmingDeleteBooking(true)}
            >
              Elimina prenotazione
            </Text>
          )}
        </XStack>
      ) : null}
      {deleteError ? (
        <Text color={brand.urgenza} fontSize="$3">
          {deleteError}
        </Text>
      ) : null}

      {showNoShowModal ? (
        <ReportNoShowModal
          businessName={booking.businessName}
          phone={booking.professionalPhone}
          email={booking.professionalEmail}
          address={booking.professionalAddress}
          onClose={() => setShowNoShowModal(false)}
          onRequestRefund={async () => {
            await apiClient.reportBookingNoShow(token, booking.id);
            onReviewed();
          }}
        />
      ) : null}

      {/* Richiesta esplicita dell'utente: il cliente può cliccare "Lavoro
          terminato" a prescindere dal fatto che il professionista l'abbia
          già fatto o no — non più gated su status === "COMPLETED" (quello
          resta impostato solo dal professionista, con l'importo finale). */}
      {booking.status === "CONFIRMED" || booking.status === "COMPLETED" ? (
        <YStack gap="$2" paddingTop="$2" borderTopWidth={1} borderTopColor={brand.filetto}>
          {!booking.clientConfirmedCompletedAt ? (
            <Button variant="primary" size="$3" height={40} alignSelf="flex-start" onPress={() => setShowClientCompleteModal(true)}>
              Lavoro terminato
            </Button>
          ) : booking.status !== "COMPLETED" ? (
            <Text fontSize="$2" color={brand.grafite70}>
              Hai confermato il completamento. In attesa che anche il professionista lo segnali per poter lasciare una recensione.
            </Text>
          ) : booking.hasReview ? (
            <Text fontSize="$2" color={brand.verificato} fontWeight="600">
              Recensione inviata
            </Text>
          ) : (
            <Button variant="secondary" size="$3" height={40} alignSelf="flex-start" onPress={() => setShowReviewModal(true)}>
              Lascia una recensione
            </Button>
          )}
        </YStack>
      ) : null}

      {showClientCompleteModal ? (
        <ClientCompleteModal
          onClose={() => setShowClientCompleteModal(false)}
          onConfirm={handleClientConfirmComplete}
          uploadPhoto={(file) => apiClient.uploadBookingCompletionPhoto(token, file).then((r) => r.imageUrl)}
        />
      ) : null}
      {showReviewModal ? (
        <ReviewModal
          title="Recensisci il professionista"
          subtitle="Com'è andato il lavoro? La tua recensione sarà pubblica non appena anche il professionista avrà lasciato la sua."
          uploadPhoto={(file) => apiClient.uploadReviewPhoto(token, file).then((r) => r.imageUrl)}
          onSubmit={handleSubmitReview}
          onClose={() => setShowReviewModal(false)}
        />
      ) : null}

      {showTimeline && booking.guidedRequestId ? (
        <TimelineModal
          token={token}
          guidedRequestId={booking.guidedRequestId}
          professionalProfileId={booking.professionalProfileId}
          viewerRole="CLIENT"
          otherPartyName={booking.businessName}
          onClose={() => setShowTimeline(false)}
        />
      ) : null}
    </Surface>
  );
}
