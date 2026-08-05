"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { ClientBooking, ClientGuidedRequest } from "@professionisti/api-client";
import { ALL_ITALIAN_CITY_NAMES, formatServicePriceRange, type AcceptQuoteInput, type GuidedRequestStatusSummary } from "@professionisti/shared";
import { Autocomplete, Badge, Button, EmptyState, Icon, Surface, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AccountSidebar } from "@/components/AccountSidebar";
import { ProfessionalAvatar } from "@/components/ProfessionalAvatar";
import { LoadingState } from "@/components/LoadingState";
import { AcceptQuoteModal } from "@/components/AcceptQuoteModal";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { clientSectionCounts, unreadBookingIds, unreadGuidedRequestIds } from "@/lib/notificationSections";
import { ListControls, Pagination, sortListItems, type ListSortKey } from "@/components/ListControls";

const STATUS_LABEL: Record<ClientGuidedRequest["status"], string> = {
  OPEN: "In attesa di risposte",
  MATCHED: "Inviata ai professionisti",
  CLOSED: "Chiusa",
};

const MAX_REVIEW_PHOTOS = 3;
const MAX_REQUEST_PHOTOS = 3;

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
        <YStack backgroundColor="$red10" borderRadius={999} minWidth={18} height={18} paddingHorizontal={4} alignItems="center" justifyContent="center">
          <Text fontSize={11} fontWeight="700" color="white" lineHeight={14}>
            {badgeCount > 9 ? "9+" : badgeCount}
          </Text>
        </YStack>
      ) : null}
    </XStack>
  );
}

export default function LeMieRichiestePage() {
  const { user, token, isLoading, markNotificationsRead } = useAuth();
  const [activeTab, setActiveTab] = useState<ClientTab>("richieste");
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
  // rifiuto della data proposta) e azzera il badge nell'header.
  useEffect(() => {
    if (!token) return;
    apiClient
      .unreadNotifications(token)
      .then((notifications) => {
        setSectionSnapshot(clientSectionCounts(notifications));
        setNewRequestIds(unreadGuidedRequestIds(notifications));
        setNewClientBookingIds(unreadBookingIds(notifications));
      })
      .catch(() => {})
      .finally(() => markNotificationsRead());
  }, [token, markNotificationsRead]);

  // Il salvataggio dell'indirizzo (AcceptQuoteModal) gestisce da sé stato di
  // caricamento ed errore; qui basta propagare la chiamata reale e
  // ricaricare l'elenco al successo.
  async function handleAcceptQuote(quoteId: string, input: AcceptQuoteInput) {
    if (!token) throw new Error("Devi accedere per accettare un preventivo.");
    await apiClient.acceptQuote(token, quoteId, input);
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
      <XStack width="100%" maxWidth={900} gap="$8" alignItems="flex-start" flexWrap="wrap">
        <AccountSidebar />

        <YStack flex={1} minWidth={280} gap="$5">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
            Le mie richieste
          </Text>

          {error ? <Text color={brand.urgenza}>{error}</Text> : null}

          <XStack gap="$2" borderBottomWidth={1} borderBottomColor={brand.filetto}>
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
                  <GuidedRequestCard
                    key={request.id}
                    request={request}
                    token={token}
                    onChanged={reload}
                    onAcceptQuote={handleAcceptQuote}
                    isNew={newRequestIds.has(request.id)}
                  />
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
                  <BookingRow key={booking.id} booking={booking} token={token} onReviewed={reload} isNew={newClientBookingIds.has(booking.id)} />
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
}: {
  request: ClientGuidedRequest;
  token: string;
  onChanged: () => void;
  onAcceptQuote: (quoteId: string, input: AcceptQuoteInput) => Promise<void>;
  /** True se questa richiesta ha un aggiornamento non letto — richiesta esplicita dell'utente ("rendilo evidente anche nella lista"). */
  isNew?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [description, setDescription] = useState(request.description);
  const [city, setCity] = useState(request.city);
  const [address, setAddress] = useState(request.address ?? "");
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

  function startEditing() {
    setDescription(request.description);
    setCity(request.city);
    setAddress(request.address ?? "");
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
    if (!city.trim()) {
      setError("Indica la città.");
      return;
    }
    setIsSaving(true);
    try {
      await apiClient.updateGuidedRequest(token, request.id, {
        description: description.trim(),
        city: city.trim(),
        address: address.trim() || undefined,
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
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Indirizzo (opzionale, anche senza numero civico)"
            style={textareaStyle}
          />

          <YStack gap="$1">
            <Text fontSize="$2" color={brand.grafite70}>
              Foto (opzionale, fino a {MAX_REQUEST_PHOTOS})
            </Text>
            <YStack flexDirection="row" flexWrap="wrap" gap="$2">
              {photoUrls.map((url) => (
                <YStack key={url} width={72} height={72} borderRadius="$3" overflow="hidden" position="relative" borderWidth={1} borderColor={brand.filetto}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
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
              accept="image/*"
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
            <YStack gap="$1">
              <Text fontFamily="$heading" fontWeight="700" fontSize="$5" color={brand.grafite}>
                {request.categoryLabel} · {request.city}
              </Text>
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
            <YStack alignItems="flex-end" gap="$1">
              <Text fontFamily="$mono" fontSize={11} textTransform="uppercase" color={brand.cianografia} fontWeight="600">
                {STATUS_LABEL[request.status]}
              </Text>
              {isNew ? <Badge variant="nuovo">Nuovo</Badge> : null}
            </YStack>
          </YStack>

          {statusSummary ? (
            <YStack gap="$1" backgroundColor={brand.gesso} borderRadius="$3" padding="$3">
              {statusSummary.statusMessage ? (
                <Text fontSize="$2" color={brand.grafite70}>
                  {statusSummary.statusMessage}
                </Text>
              ) : (
                <Text fontSize="$2" color={brand.grafite70}>
                  Contattati {statusSummary.totalContacted} · Risposto {statusSummary.responded} · In attesa{" "}
                  {statusSummary.pending}
                </Text>
              )}
            </YStack>
          ) : null}

          {/* Foto già allegate alla richiesta, visibili subito nell'anteprima
              (richiesta esplicita dell'utente) invece di essere nascoste
              finché non si entra in modifica. Cliccabili per ingrandirle,
              stesso PhotoLightbox già usato lato professionista in LeadCard. */}
          {request.photoUrls.length > 0 ? (
            <XStack gap="$2" flexWrap="wrap">
              {request.photoUrls.map((url, index) => (
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
          <Text fontFamily="$mono" fontSize={11} fontWeight="600" textTransform="uppercase" color={brand.grafite70}>
            Inviata a
          </Text>
          {request.sentTo.map((professional) => (
            <Link
              key={professional.id}
              href={`/professionista/${professional.id}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <XStack
                gap="$3"
                alignItems="center"
                backgroundColor={brand.gesso}
                borderRadius="$3"
                padding="$3"
                opacity={professional.declined ? 0.7 : 1}
              >
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
                      <Text fontFamily="$mono" fontSize={10} fontWeight="700" textTransform="uppercase" color={brand.urgenza}>
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
          ))}
        </YStack>
      ) : null}

      {request.quotes.length > 0 ? (
        <YStack gap="$2" borderTopWidth={1} borderTopColor={brand.filetto} paddingTop="$3">
          <Text fontFamily="$mono" fontSize={11} fontWeight="600" textTransform="uppercase" color={brand.grafite70}>
            Preventivi ricevuti
          </Text>
          {request.quotes.map((quote) => (
            <QuoteCard key={quote.id} quote={quote} token={token} onChanged={onChanged} onAcceptQuote={onAcceptQuote} />
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

type FreeSlot = { date: string; startTime: string; endTime: string };

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
}: {
  quote: ClientGuidedRequest["quotes"][number];
  token: string;
  onChanged: () => void;
  onAcceptQuote: (quoteId: string, input: AcceptQuoteInput) => Promise<void>;
}) {
  const [isChoosingDate, setIsChoosingDate] = useState(false);
  const [freeSlots, setFreeSlots] = useState<FreeSlot[] | null>(null);
  const [selectedSlotKey, setSelectedSlotKey] = useState("");
  const [proposeNote, setProposeNote] = useState("");
  const [isProposing, setIsProposing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [confirmingReject, setConfirmingReject] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

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
            if (slot.bookedCount < slot.maxBookings) {
              slots.push({ date: day.date, startTime: slot.startTime, endTime: slot.endTime });
            }
          }
        }
        setFreeSlots(slots);
        if (slots[0]) setSelectedSlotKey(`${slots[0].date}|${slots[0].startTime}|${slots[0].endTime}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore nel caricamento degli orari disponibili.");
      }
    }
  }

  async function handleProposeDate() {
    const [date, startTime, endTime] = selectedSlotKey.split("|");
    if (!date || !startTime || !endTime) {
      setError("Scegli un orario.");
      return;
    }
    setError(null);
    setIsProposing(true);
    try {
      await apiClient.proposeQuoteDate(token, quote.id, { date, startTime, endTime, note: proposeNote.trim() || undefined });
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
      <Link href={`/professionista/${quote.professionalProfileId}`} style={{ textDecoration: "none", alignSelf: "flex-start" }}>
        <Text fontWeight="600" color={brand.cianografia}>
          {quote.businessName}
        </Text>
      </Link>
      <Text fontSize="$3" color={brand.grafite70}>
        Data proposta: {formatQuoteDate(quote.estimatedStartDate)}
      </Text>
      <YStack gap="$1">
        {quote.items.map((item) => (
          <Text key={item.id} color={brand.grafite70} fontSize="$3">
            {item.name}: {formatServicePriceRange(item.priceMinEurCents, item.priceMaxEurCents)}
          </Text>
        ))}
      </YStack>
      {quote.notes ? (
        <Text color={brand.grafite70} fontSize="$3">
          {quote.notes}
        </Text>
      ) : null}

      {quote.status === "SENT" ? (
        <>
          <XStack gap="$2" flexWrap="wrap" alignItems="center">
            <Button variant="primary" size="$3" height={40} onPress={() => setShowAcceptModal(true)}>
              Accetta preventivo
            </Button>
            {!isChoosingDate ? (
              <Button variant="secondary" size="$3" height={40} onPress={startChoosingDate}>
                Proponi altra data
              </Button>
            ) : null}
            {!isChoosingDate && !confirmingReject ? (
              <Text
                color={brand.urgenza}
                fontWeight="600"
                fontSize="$3"
                cursor="pointer"
                accessibilityRole="button"
                onPress={() => setConfirmingReject(true)}
              >
                Rifiuta preventivo
              </Text>
            ) : null}
            {confirmingReject ? (
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
            ) : null}
          </XStack>
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
                      const label = `${new Date(`${slot.date}T00:00:00Z`).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} · ${slot.startTime}–${slot.endTime}`;
                      return (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
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
            In attesa di conferma del professionista per il {quote.clientProposedDate ? formatQuoteDate(quote.clientProposedDate) : ""}
          </Text>
          {quote.clientProposedNote ? (
            <Text fontSize="$2" color={brand.grafite70}>
              {quote.clientProposedNote}
            </Text>
          ) : null}
        </YStack>
      ) : quote.status === "ACCEPTED" ? (
        <Text fontSize="$2" color={brand.verificato} fontWeight="600">
          Accettato
        </Text>
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

      {showAcceptModal ? (
        <AcceptQuoteModal onClose={() => setShowAcceptModal(false)} onAccept={(input) => onAcceptQuote(quote.id, input)} />
      ) : null}
    </YStack>
  );
}

function BookingRow({
  booking,
  token,
  onReviewed,
  isNew,
}: {
  booking: ClientBooking;
  token: string;
  onReviewed: () => void;
  /** True se questa prenotazione ha un aggiornamento non letto — richiesta esplicita dell'utente ("rendilo evidente anche nella lista"). */
  isNew?: boolean;
}) {
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

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

  async function handleSubmitReview() {
    setError(null);
    setIsSubmitting(true);
    try {
      await apiClient.createReview(token, { bookingId: booking.id, rating, comment: comment.trim() || undefined, photoUrls });
      setShowReviewForm(false);
      onReviewed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setPhotoError(null);
    setIsUploadingPhoto(true);
    try {
      // Cloudinary ridimensiona e comprime lato server, stessa trasformazione
      // già usata per le foto della richiesta guidata e per l'immagine
      // profilo professionista.
      const result = await apiClient.uploadReviewPhoto(token, file);
      setPhotoUrls((prev) => [...prev, result.imageUrl].slice(0, MAX_REVIEW_PHOTOS));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Errore durante il caricamento della foto.");
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  function removePhoto(url: string) {
    setPhotoUrls((prev) => prev.filter((u) => u !== url));
  }

  return (
    <Surface gap="$2">
      <YStack flexDirection="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
        <Link href={`/professionista/${booking.professionalProfileId}`} style={{ textDecoration: "none" }}>
          <Text fontWeight="600" color={brand.cianografia}>
            {booking.businessName}
          </Text>
        </Link>
        <XStack alignItems="center" gap="$2">
          <Text fontFamily="$mono" fontSize={11} textTransform="uppercase" color={brand.cianografia} fontWeight="600">
            {BOOKING_STATUS_LABEL[booking.status]}
          </Text>
          {isNew ? <Badge variant="nuovo">Nuovo</Badge> : null}
        </XStack>
      </YStack>
      <Text color={brand.grafite70} fontSize="$3">
        {new Date(booking.scheduledAt).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
      </Text>

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

      {booking.status === "COMPLETED" && !booking.hasReview ? (
        showReviewForm ? (
          <YStack gap="$2" paddingTop="$2" borderTopWidth={1} borderTopColor={brand.filetto}>
            <YStack flexDirection="row" gap="$1">
              {[1, 2, 3, 4, 5].map((value) => (
                <YStack
                  key={value}
                  cursor="pointer"
                  onPress={() => setRating(value)}
                  accessibilityRole="button"
                  accessibilityLabel={`${value} stelle`}
                >
                  <Icon name="star" size={24} strokeWidth={1.5} color={brand.ottone} fill={value <= rating ? brand.ottone : "none"} />
                </YStack>
              ))}
            </YStack>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Com'è andata? (opzionale)"
              rows={2}
              style={textareaStyle}
            />

            <YStack gap="$1">
              <Text fontSize="$2" color={brand.grafite70}>
                Foto del lavoro svolto (opzionale, fino a {MAX_REVIEW_PHOTOS})
              </Text>
              <YStack flexDirection="row" flexWrap="wrap" gap="$2">
                {photoUrls.map((url) => (
                  <YStack key={url} width={64} height={64} borderRadius="$3" overflow="hidden" position="relative" borderWidth={1} borderColor={brand.filetto}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
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
                {photoUrls.length < MAX_REVIEW_PHOTOS ? (
                  <YStack
                    width={64}
                    height={64}
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
                accept="image/*"
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
            <Button
              variant="primary"
              size="$3"
              height={40}
              alignSelf="flex-start"
              onPress={handleSubmitReview}
              disabled={isSubmitting || isUploadingPhoto}
              opacity={isSubmitting || isUploadingPhoto ? 0.6 : 1}
            >
              {isSubmitting ? "Invio..." : "Invia recensione"}
            </Button>
          </YStack>
        ) : (
          <Button variant="secondary" size="$3" height={40} alignSelf="flex-start" onPress={() => setShowReviewForm(true)}>
            Lascia una recensione
          </Button>
        )
      ) : booking.status === "COMPLETED" && booking.hasReview ? (
        <Text fontSize="$2" color={brand.verificato} fontWeight="600">
          Recensione inviata
        </Text>
      ) : null}
    </Surface>
  );
}
