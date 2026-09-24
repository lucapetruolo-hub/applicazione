"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ClientBooking, ClientGuidedRequest } from "@professionisti/api-client";
import { Button, EmptyState, Icon, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { SkeletonRequestList } from "@/components/Skeleton";
import { EmptyRequestsIllustration } from "@/components/icons/EmptyStateIllustrations";
import { CategoryCarousel } from "@/components/CategoryCarousel";
import { mergeCounts, mergeIds, unreadBookingCounts, unreadBookingIds, unreadGuidedRequestIds, unreadQuoteCounts, unreadQuoteIds, unreadThreadCounts } from "@/lib/notificationSections";
import { Pagination } from "@/components/ListControls";
import { highlightDeepLinkTarget } from "@/lib/deepLinkHighlight";
import { classifyClientRequestStage, CLIENT_STAGE_LABEL, REQUEST_STAGE_STYLE, type RequestStage } from "@/lib/requestStage";
import { GuidedRequestCard } from "./_components/GuidedRequestCard";
import { QuoteCard } from "./_components/QuoteCard";
import { clientRequestSearchText, filterInputStyle } from "./_components/clientRequestHelpers";

// Stesso intervallo/motivo già documentato in apps/web/src/app/dashboard/page.tsx.
const UNREAD_BADGE_POLL_MS = 15000;

/**
 * Pagina `/le-mie-richieste` — richiesta esplicita dell'utente: "rendi la
 * pagina le mie richieste simile a quella delle richieste ricevute
 * adattandola però al contesto quindi queste sono visualizzate dalla parte
 * del cliente". Stesso pattern di `/dashboard/richieste` (CLAUDE.md §41):
 * un'unica lista, card collassate di default con una pillola di stadio
 * colorata, tab a scorrimento per stadio, ricerca in ogni campo, filtri in
 * un pop-up + toggle domicilio/online esterno — non più due tab separate
 * ("Le mie richieste"/"Lavori accettati") su due liste indipendenti: una
 * `ClientGuidedRequest` e l'eventuale `ClientBooking` nata dal suo
 * preventivo accettato sono ora LA STESSA card (booking risolta per
 * `guidedRequestId`, stesso principio già in uso lato professionista per
 * `bookingByRequestId`/`RequestCard`).
 *
 * Gli 8 stadi non sono un concetto nuovo: `classifyClientRequestStage`
 * (`lib/requestStage.ts`) è l'equivalente lato cliente di `classifyLeadStage`
 * già in uso lato professionista — stessi nomi di stadio e stessi colori
 * (`REQUEST_STAGE_STYLE`), solo il testo della pillola cambia
 * (`CLIENT_STAGE_LABEL`): lo stesso stadio letto da un professionista ("Da
 * quotare" = tocca a te) e da un cliente ("In attesa di preventivo" = sto
 * aspettando) non può condividere la stessa frase. A differenza di un
 * `Lead` (al più un preventivo), una richiesta generica può averne più di
 * uno (fan-out, CLAUDE.md §14): lo stadio riflette il preventivo più
 * "attivo" tra quelli ricevuti, la lista completa resta comunque visibile
 * nella scheda espansa.
 */

// "archiviate" non è uno stadio: raccoglie le schede archiviate dal
// cliente (menu hamburger, docs/CHANGELOG.md §130), escluse da tutti gli
// altri tab.
type ClientTabKey = "tutte" | RequestStage | "archiviate";

const CLIENT_TABS: { key: ClientTabKey; label: string }[] = [
  { key: "tutte", label: "Tutte" },
  { key: "da_quotare", label: "In attesa" },
  { key: "in_attesa", label: "Da rispondere" },
  { key: "modifica_richiesta", label: "Modifiche" },
  { key: "accettata", label: "Accettate" },
  { key: "completata", label: "Completate" },
  { key: "annullata", label: "Annullate" },
  { key: "scaduta", label: "Scadute" },
  { key: "archiviate", label: "Archiviate" },
];

type SortMode = "recenti" | "vecchie" | "aggiornamento";

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
  const [requests, setRequests] = useState<ClientGuidedRequest[] | null>(null);
  const [bookings, setBookings] = useState<ClientBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [activeStageTab, setActiveStageTab] = useState<ClientTabKey>("tutte");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recenti");
  const [zoneFilter, setZoneFilter] = useState("tutte");
  const [serviceModeFilter, setServiceModeFilter] = useState<"tutte" | "HOME" | "ONLINE">("tutte");
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [pageSize, setPageSize] = useState(5);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  // Simbolo "Nuovo" sulla singola card (richiesta esplicita dell'utente:
  // "rendilo evidente anche nella lista") — un aggiornamento può arrivare
  // sia sulla ClientGuidedRequest sia sulla ClientBooking nata da lei,
  // entrambi riportati sulla stessa card unificata.
  const [newRequestIds, setNewRequestIds] = useState<Set<string>>(new Set());
  const [newClientBookingIds, setNewClientBookingIds] = useState<Set<string>>(new Set());
  const [newQuoteIds, setNewQuoteIds] = useState<Set<string>>(new Set());
  const [threadUnreadCounts, setThreadUnreadCounts] = useState<Map<string, number>>(new Map());
  const [quoteUnreadCounts, setQuoteUnreadCounts] = useState<Map<string, number>>(new Map());
  const [bookingUnreadCounts, setBookingUnreadCounts] = useState<Map<string, number>>(new Map());
  // Schede segnate come lette dal menu hamburger: il "Nuovo" nato dalle
  // notifiche già viste in questa pagina (stato locale sopra) va spento
  // subito, senza aspettare un ricaricamento.
  const [dismissedNewIds, setDismissedNewIds] = useState<Set<string>>(new Set());

  // Bug reale segnalato dall'utente (stesso in /dashboard/richieste,
  // corretto nello stesso giro): un `useRef` "già consumato" tenuto QUI (mai
  // smontato da un cambio di filtro/tab, a differenza della card) evita che
  // un deep link da notifica si riattivi ad ogni cambio successivo di
  // filtro — vedi lo stesso identico commento nel file gemello lato
  // professionista.
  const consumedRequestOpenRef = useRef<string | null>(null);
  const [pendingChatOpen, setPendingChatOpen] = useState<{ requestId: string; professionalProfileId: string } | null>(null);

  const listTopRef = useRef<HTMLDivElement>(null);
  function scrollToListTop() {
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function goToPage(nextPage: number) {
    setPage(nextPage);
    scrollToListTop();
  }
  function updateStageTab(key: ClientTabKey) {
    setActiveStageTab(key);
    setPage(1);
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

  const bookingByRequestId = useMemo(() => {
    const map = new Map<string, ClientBooking>();
    (bookings ?? []).forEach((b) => {
      if (b.guidedRequestId) map.set(b.guidedRequestId, b);
    });
    return map;
  }, [bookings]);

  const stageByRequestId = useMemo(() => {
    const map = new Map<string, RequestStage>();
    (requests ?? []).forEach((r) => map.set(r.id, classifyClientRequestStage(r, bookingByRequestId.get(r.id) ?? null)));
    return map;
  }, [requests, bookingByRequestId]);

  const zones = useMemo(() => {
    const set = new Set((requests ?? []).map((r) => r.city).filter(Boolean));
    return [...set].sort();
  }, [requests]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { tutte: 0, archiviate: 0 };
    (requests ?? []).forEach((r) => {
      if (r.myState.archivedAt) {
        counts.archiviate = (counts.archiviate ?? 0) + 1;
        return;
      }
      counts.tutte = (counts.tutte ?? 0) + 1;
      const stage = stageByRequestId.get(r.id)!;
      counts[stage] = (counts[stage] ?? 0) + 1;
    });
    return counts;
  }, [requests, stageByRequestId]);

  const filtersActiveCount = (zoneFilter !== "tutte" ? 1 : 0) + (sortMode !== "recenti" ? 1 : 0);

  const filteredSortedRequests = useMemo(() => {
    let list = requests ?? [];
    if (activeStageTab === "archiviate") list = list.filter((r) => r.myState.archivedAt);
    else {
      list = list.filter((r) => !r.myState.archivedAt);
      if (activeStageTab !== "tutte") list = list.filter((r) => stageByRequestId.get(r.id) === activeStageTab);
    }
    if (zoneFilter !== "tutte") list = list.filter((r) => r.city === zoneFilter);
    if (serviceModeFilter !== "tutte") list = list.filter((r) => r.serviceMode === serviceModeFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => clientRequestSearchText(r, stageByRequestId.get(r.id), bookingByRequestId.get(r.id)).includes(q));
    }
    list = [...list];
    if (sortMode === "vecchie") list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    else if (sortMode === "recenti") list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else if (sortMode === "aggiornamento") list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return list;
  }, [requests, activeStageTab, zoneFilter, serviceModeFilter, search, sortMode, stageByRequestId, bookingByRequestId]);

  const totalPages = Math.max(1, Math.ceil(filteredSortedRequests.length / pageSize));
  const effectivePage = Math.min(page, totalPages);
  const visibleRequests = filteredSortedRequests.slice((effectivePage - 1) * pageSize, effectivePage * pageSize);

  // Deep link da una notifica/da /chat (richiesta esplicita dell'utente) —
  // `?open=<guidedRequestId>` apre/scrolla alla card giusta, a prescindere
  // da quale `?tab=` storico l'accompagni (la pagina non ne ha più bisogno,
  // un'unica lista unificata copre sia le richieste che i lavori accettati:
  // il valore, se presente, viene semplicemente ignorato). `&chat=` apre
  // subito la conversazione col professionista giusto.
  useEffect(() => {
    if (!requests) return;
    const targetId = searchParams.get("open");
    if (!targetId) return;
    if (consumedRequestOpenRef.current === targetId) return;
    const target = requests.find((r) => r.id === targetId);
    if (!target) return;
    // Una scheda archiviata vive solo nel tab "Archiviate".
    const targetTab: ClientTabKey = target.myState.archivedAt ? "archiviate" : "tutte";
    if (activeStageTab !== targetTab) {
      setActiveStageTab(targetTab);
      return;
    }
    if (zoneFilter !== "tutte") {
      setZoneFilter("tutte");
      return;
    }
    if (serviceModeFilter !== "tutte") {
      setServiceModeFilter("tutte");
      return;
    }
    const index = filteredSortedRequests.findIndex((r) => r.id === targetId);
    if (index === -1) return;
    consumedRequestOpenRef.current = targetId;
    setOpenId(targetId);
    const chatParam = searchParams.get("chat");
    if (chatParam) setPendingChatOpen({ requestId: targetId, professionalProfileId: chatParam });
    setPage(Math.floor(index / pageSize) + 1);
    setTimeout(() => {
      const elementId = `request-${targetId}`;
      document.getElementById(elementId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      highlightDeepLinkTarget(elementId);
    }, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, activeStageTab, zoneFilter, serviceModeFilter, filteredSortedRequests, pageSize, searchParams]);

  // Stesso principio della dashboard professionista: aprire questa pagina
  // segna come lette le notifiche in attesa, ripetuto ogni
  // UNREAD_BADGE_POLL_MS finché la pagina resta aperta. Ogni tick trova solo
  // le notifiche arrivate dopo il markNotificationsRead del tick
  // precedente, quindi i conteggi si sommano (mergeCounts/mergeIds) invece
  // di sostituire lo stato — e ricarica anche le due liste (bug reale
  // corretto in un giro precedente: un evento generato dal professionista
  // mentre questa pagina resta aperta deve riflettersi senza un
  // ricaricamento manuale).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    function poll() {
      apiClient
        .unreadNotifications(token!)
        .then((notifications) => {
          if (cancelled || notifications.length === 0) return;
          const freshRequestIds = unreadGuidedRequestIds(notifications);
          setNewRequestIds((prev) => mergeIds(prev, freshRequestIds));
          // Un aggiornamento arrivato dopo "Segna come letta" riaccende il "Nuovo".
          setDismissedNewIds((prev) => (prev.size === 0 ? prev : new Set([...prev].filter((id) => !freshRequestIds.has(id)))));
          setNewClientBookingIds((prev) => mergeIds(prev, unreadBookingIds(notifications)));
          setNewQuoteIds((prev) => mergeIds(prev, unreadQuoteIds(notifications)));
          setThreadUnreadCounts((prev) => mergeCounts(prev, unreadThreadCounts(notifications)));
          setQuoteUnreadCounts((prev) => mergeCounts(prev, unreadQuoteCounts(notifications)));
          setBookingUnreadCounts((prev) => mergeCounts(prev, unreadBookingCounts(notifications)));
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

  // "Nuovo" su una card raggiunta solo tramite la propria Booking (un
  // aggiornamento sul lavoro, non sulla richiesta in sé) — tradotto nella
  // stessa chiave `request.id` usata dalla card unificata.
  const newRequestIdsFromBookings = useMemo(() => {
    const set = new Set<string>();
    (bookings ?? []).forEach((b) => {
      if (b.guidedRequestId && newClientBookingIds.has(b.id)) set.add(b.guidedRequestId);
    });
    return set;
  }, [bookings, newClientBookingIds]);

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

  return (
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$8" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={1000} gap="$5">
        <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite}>
          Le mie richieste
        </Text>

        {error ? <Text color={brand.urgenza}>{error}</Text> : null}

        {requests !== null && requests.length > 0 ? (
          <>
            {/* Tab per stadio — stessa riga scorrevole di /dashboard/richieste
                (frecce riusate da CategoryCarousel), etichette adattate al
                punto di vista del cliente. */}
            <CategoryCarousel>
              {CLIENT_TABS.map((tab) => {
                const active = activeStageTab === tab.key;
                const count = tabCounts[tab.key] ?? 0;
                return (
                  <XStack key={tab.key} flexShrink={0} position="relative">
                    <XStack
                      alignItems="center"
                      paddingHorizontal="$3"
                      paddingVertical={9}
                      borderRadius={999}
                      backgroundColor={active ? brand.cianografia : brand.calce}
                      borderWidth={1}
                      borderColor={active ? brand.cianografia : brand.filetto}
                      cursor="pointer"
                      onPress={() => updateStageTab(tab.key)}
                      accessibilityRole="button"
                    >
                      <Text fontFamily="$body" fontSize={13.5} fontWeight="800" color={active ? "white" : brand.grafite}>
                        {tab.label}
                      </Text>
                    </XStack>
                    {count > 0 ? (
                      <YStack
                        position="absolute"
                        top={-5}
                        right={-5}
                        minWidth={18}
                        height={18}
                        paddingHorizontal={4}
                        borderRadius={999}
                        backgroundColor={brand.urgenza}
                        alignItems="center"
                        justifyContent="center"
                        borderWidth={2}
                        borderColor={brand.gesso}
                      >
                        <Text fontSize={10} fontWeight="800" color="white">
                          {count}
                        </Text>
                      </YStack>
                    ) : null}
                  </XStack>
                );
              })}
            </CategoryCarousel>

            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Cerca in ogni campo della richiesta..."
              style={{ ...filterInputStyle, width: "100%" }}
            />

            <XStack gap="$2" alignItems="center" flexWrap="wrap">
              <XStack
                alignItems="center"
                gap={6}
                paddingHorizontal="$4"
                paddingVertical={12}
                borderRadius={radiusDoc}
                backgroundColor={brand.calce}
                borderWidth={1}
                borderColor={brand.filetto}
                cursor="pointer"
                onPress={() => setShowFiltersModal(true)}
                accessibilityRole="button"
              >
                <Icon name="sliders-horizontal" size={16} color={brand.grafite} />
                <Text fontWeight="700" fontSize={14} color={brand.grafite}>
                  Filtri{filtersActiveCount > 0 ? ` (${filtersActiveCount})` : ""}
                </Text>
              </XStack>

              <XStack borderRadius={999} borderWidth={1} borderColor={brand.filetto} overflow="hidden">
                {(
                  [
                    { key: "tutte", label: "Tutte", icon: null },
                    { key: "HOME", label: "A domicilio", icon: "house" },
                    { key: "ONLINE", label: "Online", icon: "video" },
                  ] as const
                ).map((opt) => {
                  const active = serviceModeFilter === opt.key;
                  return (
                    <XStack
                      key={opt.key}
                      alignItems="center"
                      gap={6}
                      paddingHorizontal="$3"
                      paddingVertical={12}
                      backgroundColor={active ? brand.cianografia : brand.calce}
                      cursor="pointer"
                      onPress={() => {
                        setServiceModeFilter(opt.key);
                        setPage(1);
                      }}
                      accessibilityRole="button"
                    >
                      {opt.icon ? <Icon name={opt.icon} size={14} strokeWidth={2} color={active ? "white" : brand.grafite} /> : null}
                      <Text fontSize={13.5} fontWeight="700" color={active ? "white" : brand.grafite}>
                        {opt.label}
                      </Text>
                    </XStack>
                  );
                })}
              </XStack>
            </XStack>

            {showFiltersModal ? (
              <div
                onClick={() => setShowFiltersModal(false)}
                role="dialog"
                aria-modal="true"
                aria-label="Filtri"
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: "rgba(20,24,30,0.55)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 1000,
                  padding: 16,
                  overflowY: "auto",
                }}
              >
                <YStack
                  onPress={(e: { stopPropagation: () => void }) => e.stopPropagation()}
                  width="100%"
                  maxWidth={420}
                  backgroundColor={brand.calce}
                  borderRadius="$3"
                  padding="$5"
                  gap="$4"
                  marginVertical="$6"
                >
                  <XStack justifyContent="space-between" alignItems="center">
                    <Text fontFamily="$heading" fontWeight="800" fontSize="$5" color={brand.grafite}>
                      Filtri
                    </Text>
                    <XStack cursor="pointer" onPress={() => setShowFiltersModal(false)} accessibilityRole="button" accessibilityLabel="Chiudi">
                      <Icon name="x" size={20} color={brand.grafite70} />
                    </XStack>
                  </XStack>

                  <YStack gap="$3">
                    <select
                      value={sortMode}
                      onChange={(e) => {
                        setSortMode(e.target.value as SortMode);
                        setPage(1);
                      }}
                      style={{ ...filterInputStyle, width: "100%" }}
                    >
                      <option value="recenti">Data di invio più recente</option>
                      <option value="vecchie">Data di invio più vecchia</option>
                      <option value="aggiornamento">Ultimo aggiornamento</option>
                    </select>
                    <select
                      value={zoneFilter}
                      onChange={(e) => {
                        setZoneFilter(e.target.value);
                        setPage(1);
                      }}
                      style={{ ...filterInputStyle, width: "100%" }}
                    >
                      <option value="tutte">Tutte le zone</option>
                      {zones.map((z) => (
                        <option key={z} value={z}>
                          {z}
                        </option>
                      ))}
                    </select>
                  </YStack>

                  {filtersActiveCount > 0 ? (
                    <XStack
                      justifyContent="center"
                      cursor="pointer"
                      onPress={() => {
                        setSortMode("recenti");
                        setZoneFilter("tutte");
                        setPage(1);
                      }}
                      accessibilityRole="button"
                    >
                      <Text fontSize={13} fontWeight="700" color={brand.grafite70} textDecorationLine="underline">
                        Reimposta filtri
                      </Text>
                    </XStack>
                  ) : null}

                  <Button variant="primary" onPress={() => setShowFiltersModal(false)}>
                    Mostra {filteredSortedRequests.length} {filteredSortedRequests.length === 1 ? "richiesta" : "richieste"}
                  </Button>
                </YStack>
              </div>
            ) : null}
          </>
        ) : null}

        <YStack ref={listTopRef} gap="$4">
          <Pagination page={effectivePage} totalPages={totalPages} onPageChange={goToPage} />

          {requests === null ? (
            <SkeletonRequestList count={3} />
          ) : requests.length === 0 ? (
            <EmptyState
              icon="file-text"
              illustration={<EmptyRequestsIllustration size={28} style={{ color: brand.cianografia }} />}
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
          ) : visibleRequests.length === 0 ? (
            <Text color={brand.grafite70}>Nessuna richiesta corrisponde al filtro selezionato.</Text>
          ) : (
            visibleRequests.map((request) => (
              <div key={request.id} id={`request-${request.id}`}>
                <GuidedRequestCard
                  request={request}
                  booking={bookingByRequestId.get(request.id) ?? null}
                  stage={stageByRequestId.get(request.id)!}
                  token={token}
                  onChanged={reload}
                  onAcceptQuote={handleAcceptQuote}
                  isOpen={openId === request.id}
                  onToggle={() => {
                    const opening = openId !== request.id;
                    setOpenId(opening ? request.id : null);
                    // Aprire una scheda segnata "da leggere" la considera letta.
                    if (opening && request.myState.markedUnreadAt) {
                      apiClient.updateGuidedRequestMyState(token, request.id, { markedUnread: false }).then(reload).catch(() => {});
                    }
                  }}
                  isNew={
                    Boolean(request.myState.markedUnreadAt) ||
                    (!dismissedNewIds.has(request.id) && (newRequestIds.has(request.id) || newRequestIdsFromBookings.has(request.id)))
                  }
                  onMarkedRead={() => setDismissedNewIds((prev) => new Set(prev).add(request.id))}
                  newQuoteIds={newQuoteIds}
                  threadUnreadCounts={threadUnreadCounts}
                  quoteUnreadCounts={quoteUnreadCounts}
                  bookingUnreadCounts={bookingUnreadCounts}
                  autoOpenChatProfessionalId={pendingChatOpen && pendingChatOpen.requestId === request.id ? pendingChatOpen.professionalProfileId : null}
                  onChatAutoOpenHandled={() => setPendingChatOpen((prev) => (prev && prev.requestId === request.id ? null : prev))}
                />
              </div>
            ))
          )}

          <Pagination page={effectivePage} totalPages={totalPages} onPageChange={goToPage} />
        </YStack>
      </YStack>
    </YStack>
  );
}
