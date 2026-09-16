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
import { Autocomplete, Badge, Button, EmptyState, Icon, Surface, Text, XStack, YStack, brand, radiusDoc, type IconName } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { ProfessionalAvatar } from "@/components/ProfessionalAvatar";
import { LoadingState } from "@/components/LoadingState";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { MediaPreview } from "@/components/MediaPreview";
import { UploadingDots } from "@/components/UploadingDots";
import { ReportNoShowModal } from "@/components/ReportNoShowModal";
import { CancelBookingModal } from "@/components/CancelBookingModal";
import { TimelineModal } from "@/components/TimelineModal";
import { ClientCompleteModal } from "@/components/ClientCompleteModal";
import { ReviewModal } from "@/components/ReviewModal";
import { CategoryCarousel } from "@/components/CategoryCarousel";
import {
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
import { Pagination } from "@/components/ListControls";
import { highlightDeepLinkTarget } from "@/lib/deepLinkHighlight";
import { classifyClientRequestStage, CLIENT_STAGE_LABEL, REQUEST_STAGE_STYLE, type RequestStage } from "@/lib/requestStage";

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

// Foto E video (richiesta esplicita dell'utente), fino a 5 elementi
// (aumentato da 3, stessa richiesta).
const MAX_REQUEST_PHOTOS = 5;

const textareaStyle = {
  padding: 10,
  borderRadius: 4,
  border: `1px solid ${brand.filetto}`,
  fontSize: 14,
  fontFamily: "inherit",
  color: brand.grafite,
  resize: "vertical" as const,
};
// Filtri in cima alla pagina (cerca/ordina/zona) — stesse dimensioni già in
// uso in /dashboard/richieste per lo stesso identico blocco.
const filterInputStyle = { padding: "14px 16px", borderRadius: radiusDoc, border: `1px solid ${brand.filetto}`, fontSize: 16, fontFamily: "inherit", color: brand.grafite, backgroundColor: brand.calce };

const STAGE_STYLE = REQUEST_STAGE_STYLE;

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("it-IT", { day: "numeric", month: "short" })} · ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * Testo di ricerca concatenato per una richiesta — stesso principio già
 * applicato lato professionista (`leadSearchText`, /dashboard/richieste):
 * ogni campo utile a un umano entra nel testo cercabile, non solo
 * categoria/città.
 */
function clientRequestSearchText(request: ClientGuidedRequest, stage: RequestStage | undefined, booking: ClientBooking | undefined): string {
  return [
    request.categoryLabel,
    request.description,
    request.city,
    request.address,
    request.serviceMode === "ONLINE" ? "consulenza online" : "a domicilio",
    request.isUrgent ? "urgente" : null,
    stage ? CLIENT_STAGE_LABEL[stage] : null,
    request.recipientName,
    request.recipientSurname,
    ...request.sentTo.map((p) => p.businessName),
    ...request.quotes.map((q) => q.businessName),
    ...request.quotes.map((q) => q.notes),
    ...request.quotes.flatMap((q) => q.items.map((i) => i.name)),
    booking?.businessName,
    booking?.description,
    booking?.cancellationNote,
    booking?.meetingLink,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

const CLIENT_TABS: { key: "tutte" | RequestStage; label: string }[] = [
  { key: "tutte", label: "Tutte" },
  { key: "da_quotare", label: "In attesa" },
  { key: "in_attesa", label: "Da rispondere" },
  { key: "modifica_richiesta", label: "Modifiche" },
  { key: "accettata", label: "Accettate" },
  { key: "completata", label: "Completate" },
  { key: "annullata", label: "Annullate" },
  { key: "scaduta", label: "Scadute" },
];

type SortMode = "recenti" | "vecchie" | "aggiornamento";

/** Stessa pillola colorata di /dashboard/richieste, testo lato cliente (`CLIENT_STAGE_LABEL`). */
function ClientStagePill({ stage }: { stage: RequestStage }) {
  const s = STAGE_STYLE[stage];
  return (
    <XStack alignItems="center" gap={6} paddingHorizontal="$3" paddingVertical={8} borderRadius={999} backgroundColor={s.bg}>
      <Icon name={s.icon} size={15} strokeWidth={2} color={s.fg} />
      <Text fontFamily="$body" fontSize={14} fontWeight="800" color={s.fg} textTransform="uppercase">
        {CLIENT_STAGE_LABEL[stage]}
      </Text>
    </XStack>
  );
}

function ServiceBadge({ online }: { online: boolean }) {
  return (
    <XStack alignItems="center" gap={6} paddingHorizontal="$3" paddingVertical={8} borderRadius={999} backgroundColor={brand.gesso}>
      <Icon name={online ? "video" : "house"} size={15} strokeWidth={2} color={brand.cianografia} />
      <Text fontFamily="$body" fontSize={14} fontWeight="700" color={brand.grafite}>
        {online ? "Consulenza online" : "A domicilio"}
      </Text>
    </XStack>
  );
}

/**
 * Barra a step (stesso pattern di `MiniTimeline` in /dashboard/richieste),
 * riscritta qui con le etichette lato cliente: lo stadio "modifica_richiesta"
 * significa sempre "hai proposto tu un'altra data" (solo il cliente può
 * portare un preventivo in quello stato, `QuotesService.proposeDate`), mai
 * "il cliente ha richiesto una modifica" come nella versione professionista.
 */
function ClientMiniTimeline({ stage }: { stage: RequestStage }) {
  const steps: { key: string; label: string; extra?: boolean }[] = [
    { key: "richiesta", label: "Richiesta inviata" },
    { key: "preventivo", label: "Preventivo ricevuto" },
  ];
  if (stage === "modifica_richiesta") steps.push({ key: "modifica", label: "Hai proposto un'altra data", extra: true });
  steps.push({ key: "accettata", label: "Accettata" }, { key: "completata", label: "Completata" });

  const reachedIndex: Record<RequestStage, number> = {
    da_quotare: 0,
    in_attesa: 1,
    modifica_richiesta: 2,
    accettata: stage === "modifica_richiesta" ? 3 : 2,
    completata: stage === "modifica_richiesta" ? 4 : 3,
    annullata: 2,
    scaduta: -1,
    chiusa: -1,
  };
  const reached = reachedIndex[stage];

  return (
    <XStack alignItems="flex-start" width="100%">
      {steps.map((step, i) => {
        const done = reached >= i;
        return (
          <YStack key={step.key} flex={1} alignItems="center" position="relative" minWidth={0}>
            {i > 0 ? (
              <YStack position="absolute" top={5} right="50%" width="100%" height={2} backgroundColor={done ? brand.cianografia : brand.filetto} zIndex={0} />
            ) : null}
            <YStack
              width={step.extra ? 13 : 11}
              height={step.extra ? 13 : 11}
              borderRadius={999}
              backgroundColor={done ? (step.extra ? brand.ottone : brand.cianografia) : brand.filetto}
              zIndex={1}
              marginBottom={5}
            />
            <Text fontFamily="$body" fontSize={10} fontWeight={done ? "700" : "500"} color={done ? (step.extra ? "#8a5a00" : brand.grafite) : brand.grafite70} textAlign="center">
              {step.label}
            </Text>
          </YStack>
        );
      })}
    </XStack>
  );
}

/**
 * Menu hamburger generico (click-to-open, chiusura al click esterno) — già
 * in uso per "Annulla prenotazione"/"Annulla richiesta" prima del redesign,
 * riusato identico qui per il solo caso "Annulla prenotazione" (l'azione
 * "Annulla richiesta" resta un menu hand-rolled a due passi, vedi
 * `GuidedRequestCard`, per lo stesso motivo storico: il popup di conferma
 * deve comparire subito sotto al pulsante, non in un modale a sé).
 */
function ActionsMenu({ accessibilityLabel, items }: { accessibilityLabel: string; items: { icon: IconName; text: string; color: string; onPress: () => void }[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <YStack ref={containerRef} position="relative">
      <YStack
        width={32}
        height={32}
        borderRadius={999}
        alignItems="center"
        justifyContent="center"
        cursor="pointer"
        hoverStyle={{ backgroundColor: brand.gesso }}
        onPress={(e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          setIsOpen((open) => !open);
        }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <Icon name="menu" size={18} color={brand.grafite} />
      </YStack>

      {isOpen ? (
        <YStack
          position="absolute"
          top="100%"
          right={0}
          marginTop="$2"
          minWidth={200}
          backgroundColor={brand.calce}
          borderRadius={radiusDoc}
          overflow="hidden"
          zIndex={1000}
          shadowColor="rgba(43,32,19,0.12)"
          shadowRadius={12}
          shadowOffset={{ width: 0, height: 4 }}
          shadowOpacity={1}
        >
          {items.map((item) => (
            <XStack
              key={item.text}
              paddingHorizontal="$4"
              paddingVertical="$3"
              alignItems="center"
              gap="$2"
              cursor="pointer"
              hoverStyle={{ backgroundColor: brand.gesso }}
              onPress={(e: { stopPropagation: () => void }) => {
                e.stopPropagation();
                item.onPress();
                setIsOpen(false);
              }}
              accessibilityRole="button"
            >
              <Icon name={item.icon} size={16} color={item.color} />
              <Text fontSize="$3" color={item.color} fontWeight="600">
                {item.text}
              </Text>
            </XStack>
          ))}
        </YStack>
      ) : null}
    </YStack>
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
  const [requests, setRequests] = useState<ClientGuidedRequest[] | null>(null);
  const [bookings, setBookings] = useState<ClientBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [activeStageTab, setActiveStageTab] = useState<"tutte" | RequestStage>("tutte");
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
  function updateStageTab(key: "tutte" | RequestStage) {
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
    const counts: Record<string, number> = { tutte: (requests ?? []).length };
    (requests ?? []).forEach((r) => {
      const stage = stageByRequestId.get(r.id)!;
      counts[stage] = (counts[stage] ?? 0) + 1;
    });
    return counts;
  }, [requests, stageByRequestId]);

  const filtersActiveCount = (zoneFilter !== "tutte" ? 1 : 0) + (sortMode !== "recenti" ? 1 : 0);

  const filteredSortedRequests = useMemo(() => {
    let list = requests ?? [];
    if (activeStageTab !== "tutte") list = list.filter((r) => stageByRequestId.get(r.id) === activeStageTab);
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
    if (!requests.some((r) => r.id === targetId)) return;
    if (activeStageTab !== "tutte") {
      setActiveStageTab("tutte");
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
          setNewRequestIds((prev) => mergeIds(prev, unreadGuidedRequestIds(notifications)));
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
      <YStack width="100%" maxWidth={900} gap="$5">
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
                  onToggle={() => setOpenId((prev) => (prev === request.id ? null : request.id))}
                  isNew={newRequestIds.has(request.id) || newRequestIdsFromBookings.has(request.id)}
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

function GuidedRequestCard({
  request,
  booking,
  stage,
  token,
  onChanged,
  onAcceptQuote,
  isOpen,
  onToggle,
  isNew,
  newQuoteIds,
  threadUnreadCounts,
  quoteUnreadCounts,
  bookingUnreadCounts,
  autoOpenChatProfessionalId,
  onChatAutoOpenHandled,
}: {
  request: ClientGuidedRequest;
  /** Prenotazione nata dal preventivo accettato di questa richiesta, se esiste. */
  booking: ClientBooking | null;
  stage: RequestStage;
  token: string;
  onChanged: () => void;
  onAcceptQuote: (quoteId: string) => Promise<void>;
  isOpen: boolean;
  onToggle: () => void;
  /** True se questa richiesta (o la sua prenotazione) ha un aggiornamento non letto. */
  isNew?: boolean;
  /** ID dei preventivi con un aggiornamento non letto — disambigua QUALE preventivo tra più ricevuti per questa richiesta. */
  newQuoteIds?: Set<string>;
  /** Conteggio aggiornamenti non letti per thread (chiave `guidedRequestId:professionalProfileId`) — pallino su "Contatta/Cronologia" nella sezione "Inviata a", prima che esista un preventivo. */
  threadUnreadCounts?: Map<string, number>;
  /** Conteggio aggiornamenti non letti per singolo preventivo. */
  quoteUnreadCounts?: Map<string, number>;
  /** Conteggio aggiornamenti non letti per la prenotazione. */
  bookingUnreadCounts?: Map<string, number>;
  /** Professionista del cui thread arriva un nuovo messaggio in chat — apre subito il TimelineModal giusto. */
  autoOpenChatProfessionalId?: string | null;
  /** Richiamata subito dopo aver gestito `autoOpenChatProfessionalId` — il genitore azzera il proprio stato "in sospeso" così un eventuale rimontaggio successivo non la riapre da sola. */
  onChatAutoOpenHandled?: () => void;
}) {
  const isOnline = request.serviceMode === "ONLINE";

  // Professionista il cui thread è aperto nella cronologia (sezione "Inviata
  // a", prima che esista un preventivo).
  const [openTimelineProfessionalId, setOpenTimelineProfessionalId] = useState<string | null>(null);
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
  const autoOpenedChatRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoOpenChatProfessionalId) return;
    if (autoOpenedChatRef.current === autoOpenChatProfessionalId) return;
    autoOpenedChatRef.current = autoOpenChatProfessionalId;
    const hasQuote = request.quotes.some((q) => q.professionalProfileId === autoOpenChatProfessionalId);
    if (!hasQuote) openTimelineForProfessional(autoOpenChatProfessionalId);
    onChatAutoOpenHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenChatProfessionalId]);

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
  // Menu hamburger "Annulla richiesta" — hand-rolled (non il generico
  // ActionsMenu): il popup di conferma deve comparire subito sotto al
  // pulsante hamburger, non in un modale a sé (richiesta esplicita
  // dell'utente, stesso vincolo già presente prima di questo redesign).
  const [isDeleteMenuOpen, setIsDeleteMenuOpen] = useState(false);
  const deleteMenuRef = useRef<HTMLDivElement>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openPhotoIndex, setOpenPhotoIndex] = useState<number | null>(null);
  // "Annulla prenotazione" (una volta accettato un preventivo) apre un
  // modale a sé, CancelBookingModal — stato tenuto qui perché il pulsante
  // che lo apre vive nell'intestazione (unificata con quella della
  // richiesta), non dentro BookingSection.
  const [showCancelModal, setShowCancelModal] = useState(false);

  const [statusSummary, setStatusSummary] = useState<GuidedRequestStatusSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    apiClient
      .guidedRequestStatus(token, request.id)
      .then((summary) => {
        if (!cancelled) setStatusSummary(summary);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token, request.id]);

  // Una richiesta CLOSED ha già portato a una prenotazione (o è stata
  // annullata/è scaduta): non ha senso modificarla o eliminarla a quel
  // punto (stesso confine applicato lato API).
  const canDelete = request.status !== "CLOSED";
  const hasQuote = request.quotes.length > 0;
  const canEditDetails = canDelete && !hasQuote;
  const averagePriceEurCents = useMemo(() => averageQuoteTotalEurCents(request.quotes.map((quote) => quote.items)), [request.quotes]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (deleteMenuRef.current && !deleteMenuRef.current.contains(event.target as Node)) {
        setIsDeleteMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  async function handleCancelBooking(): Promise<void> {
    if (!booking) return;
    await apiClient.cancelMyBooking(token, booking.id);
    setShowCancelModal(false);
    onChanged();
  }

  if (isEditing) {
    return (
      <Surface gap="$3">
        <YStack gap="$2">
          <Text fontFamily="$heading" fontWeight="700" fontSize="$5" color={brand.grafite}>
            {request.categoryLabel}
          </Text>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={textareaStyle} />
          <YStack borderWidth={1} borderColor={brand.filetto} borderRadius="$4" backgroundColor={brand.calce}>
            <Autocomplete items={ALL_ITALIAN_CITY_NAMES} getKey={(item) => item} getLabel={(item) => item} onSelect={setCity} value={city} onChangeText={setCity} placeholder="Città" minChars={3} />
          </YStack>
          {request.serviceMode === "ONLINE" ? (
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
          <input value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} placeholder="Numero di telefono" style={textareaStyle} />
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
          <input value={addressExtra} onChange={(e) => setAddressExtra(e.target.value)} placeholder="Scala, piano, interno (facoltativo)" style={textareaStyle} />

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
                  {isUploadingPhoto ? (
                    <UploadingDots dotSize={6} />
                  ) : (
                    <Text fontSize="$6" color={brand.grafite70}>
                      +
                    </Text>
                  )}
                </YStack>
              ) : null}
            </YStack>
            <input ref={photoInputRef} type="file" accept="image/*,video/*" onChange={handlePhotoChange} disabled={isUploadingPhoto} style={{ display: "none" }} />
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
      </Surface>
    );
  }

  const headingName = booking ? (booking.professionalAccountDeleted ? "Account eliminato" : booking.businessName) : request.categoryLabel;

  return (
    <Surface borderLeftWidth={4} borderLeftColor={STAGE_STYLE[stage].border} gap="$0" padding={0} overflow="hidden">
      <YStack padding="$4" gap="$2" cursor="pointer" onPress={onToggle} accessibilityRole="button">
        <XStack justifyContent="space-between" alignItems="flex-start" gap="$2" flexWrap="wrap">
          <XStack gap="$2" flexWrap="wrap">
            {request.isUrgent ? <Badge variant="urgente">Urgente</Badge> : null}
            <ClientStagePill stage={stage} />
            <ServiceBadge online={isOnline} />
          </XStack>
          <YStack alignItems="flex-end" gap="$1">
            <XStack alignItems="center" gap="$2">
              <Text fontSize={14} color={brand.grafite70}>
                Inviata {formatDateTime(request.createdAt)}
              </Text>
              {booking && (booking.status === "PENDING" || booking.status === "CONFIRMED") ? (
                <ActionsMenu
                  accessibilityLabel="Azioni sulla prenotazione"
                  items={[{ icon: "x", text: "Annulla prenotazione", color: brand.urgenza, onPress: () => setShowCancelModal(true) }]}
                />
              ) : canDelete ? (
                <YStack ref={deleteMenuRef} position="relative">
                  <YStack
                    width={32}
                    height={32}
                    borderRadius={999}
                    alignItems="center"
                    justifyContent="center"
                    cursor="pointer"
                    hoverStyle={{ backgroundColor: brand.gesso }}
                    onPress={(e: { stopPropagation: () => void }) => {
                      e.stopPropagation();
                      setIsDeleteMenuOpen((open) => !open);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Azioni sulla richiesta"
                  >
                    <Icon name="menu" size={18} color={brand.grafite} />
                  </YStack>

                  {isDeleteMenuOpen ? (
                    <YStack
                      position="absolute"
                      top="100%"
                      right={0}
                      marginTop="$2"
                      minWidth={confirmingDelete ? 240 : 200}
                      backgroundColor={brand.calce}
                      borderRadius={radiusDoc}
                      overflow="hidden"
                      zIndex={1000}
                      shadowColor="rgba(43,32,19,0.12)"
                      shadowRadius={12}
                      shadowOffset={{ width: 0, height: 4 }}
                      shadowOpacity={1}
                    >
                      {confirmingDelete ? (
                        <YStack padding="$3" gap="$2">
                          <Text fontSize="$2" color={brand.grafite}>
                            Eliminare questa richiesta?
                          </Text>
                          <XStack gap="$2">
                            <Button
                              variant="urgent"
                              size="$2"
                              height={34}
                              onPress={(e: { stopPropagation: () => void }) => {
                                e.stopPropagation();
                                handleDelete();
                              }}
                              disabled={isDeleting}
                              opacity={isDeleting ? 0.6 : 1}
                            >
                              {isDeleting ? "Eliminazione..." : "Conferma"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="$2"
                              height={34}
                              onPress={(e: { stopPropagation: () => void }) => {
                                e.stopPropagation();
                                setConfirmingDelete(false);
                                setIsDeleteMenuOpen(false);
                              }}
                            >
                              Annulla
                            </Button>
                          </XStack>
                        </YStack>
                      ) : (
                        <XStack
                          paddingHorizontal="$4"
                          paddingVertical="$3"
                          alignItems="center"
                          gap="$2"
                          cursor="pointer"
                          hoverStyle={{ backgroundColor: brand.gesso }}
                          onPress={(e: { stopPropagation: () => void }) => {
                            e.stopPropagation();
                            setConfirmingDelete(true);
                          }}
                          accessibilityRole="button"
                        >
                          <Icon name="trash-2" size={16} color={brand.urgenza} />
                          <Text fontSize="$3" color={brand.urgenza} fontWeight="600">
                            Annulla richiesta
                          </Text>
                        </XStack>
                      )}
                    </YStack>
                  ) : null}
                </YStack>
              ) : null}
            </XStack>
            {stage === "completata" && booking?.finalAmountEurCents != null ? (
              <Text fontFamily="$body" fontWeight="800" fontSize={18} color={brand.grafite}>
                {formatEurCents(booking.finalAmountEurCents)}
              </Text>
            ) : null}
            {isNew ? <Badge variant="nuovo">Nuovo</Badge> : null}
          </YStack>
        </XStack>

        <Text fontFamily="$heading" fontWeight="800" fontSize={26} color={brand.grafite}>
          {headingName}
        </Text>
        {booking ? (
          <XStack alignItems="center" gap="$1">
            <Icon name="wrench" size={15} color={brand.grafite70} />
            <Text fontSize={16} color={brand.grafite70}>
              {request.categoryLabel} · {request.city || "Online"}
            </Text>
          </XStack>
        ) : (
          <XStack alignItems="center" gap="$1">
            <Icon name="map-pin" size={14} color={brand.grafite70} />
            <Text fontSize={16} color={brand.grafite70}>
              {request.city || (isOnline ? "Consulenza online" : "")}
            </Text>
          </XStack>
        )}
        {stage === "annullata" && booking?.canceledBy ? (
          <Text fontSize={13} fontWeight="700" color={STAGE_STYLE.annullata.fg}>
            Annullata {booking.canceledBy === "PROFESSIONAL" ? "dal professionista" : "da te"}
          </Text>
        ) : null}
        <Text fontSize={16} color={brand.grafite} lineHeight={22}>
          {request.description}
        </Text>

        <XStack justifyContent="center" paddingTop="$1">
          <Icon name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={brand.grafite70} />
        </XStack>
      </YStack>

      {isOpen ? (
        <YStack paddingHorizontal="$4" paddingBottom="$4" gap="$4" borderTopWidth={1} borderTopColor={brand.filetto}>
          {stage !== "scaduta" && stage !== "chiusa" ? (
            <YStack gap="$2" paddingTop="$3">
              <Text fontSize={11} fontWeight="800" color={brand.grafite70} textTransform="uppercase">
                Andamento
              </Text>
              <ClientMiniTimeline stage={stage} />
            </YStack>
          ) : null}

          {statusSummary ? (
            <YStack gap="$1" backgroundColor={brand.gesso} borderRadius="$3" padding="$3">
              {statusSummary.statusMessage ? (
                <Text fontSize="$2" color={brand.grafite70}>
                  {statusSummary.statusMessage}
                </Text>
              ) : (
                <Text fontSize="$2" color={brand.grafite70}>
                  {statusSummary.responded === 0
                    ? `Nessun preventivo ricevuto ancora, su ${statusSummary.totalContacted} professionist${statusSummary.totalContacted === 1 ? "a" : "i"} contattat${statusSummary.totalContacted === 1 ? "o" : "i"}.`
                    : `${statusSummary.responded} preventiv${statusSummary.responded === 1 ? "o" : "i"} ricevut${statusSummary.responded === 1 ? "o" : "i"} su ${statusSummary.totalContacted} professionist${statusSummary.totalContacted === 1 ? "a" : "i"} contattat${statusSummary.totalContacted === 1 ? "o" : "i"}.`}
                </Text>
              )}
            </YStack>
          ) : null}

          {!request.professionalProfileId && averagePriceEurCents !== null ? (
            <XStack alignItems="center" gap="$2" backgroundColor={brand.cianografiaVelo} borderRadius="$3" padding="$3">
              <Icon name="coins" size={16} color={brand.cianografia} strokeWidth={1.5} />
              <Text fontSize="$3" fontWeight="700" color={brand.cianografia}>
                Prezzo totale medio: {formatEurCents(averagePriceEurCents)}
              </Text>
            </XStack>
          ) : null}

          {request.address ? (
            <XStack alignItems="center" gap="$1">
              <Icon name="map-pin" size={14} color={brand.grafite70} strokeWidth={1.5} />
              <Text fontSize="$3" color={brand.grafite70}>
                {request.address}
                {request.city ? `, ${request.city}` : ""}
              </Text>
            </XStack>
          ) : null}

          {request.photoUrls.length > 0 ? (
            <XStack gap="$2" flexWrap="wrap">
              {request.photoUrls.map((url, index) => (
                <MediaPreview key={url} url={url} onClick={() => setOpenPhotoIndex(index)} style={{ width: 72, height: 72, borderRadius: 6, border: `1px solid ${brand.filetto}`, cursor: "pointer" }} />
              ))}
            </XStack>
          ) : null}

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
            </XStack>
          ) : null}
          {error ? (
            <Text color={brand.urgenza} fontSize="$3">
              {error}
            </Text>
          ) : null}

          {request.sentTo.length > 0 ? (
            <YStack gap="$2" borderTopWidth={1} borderTopColor={brand.filetto} paddingTop="$3">
              <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.grafite70}>
                Inviata a
              </Text>
              {request.sentTo.map((professional) => (
                <XStack key={professional.id} gap="$3" alignItems="center" backgroundColor={brand.gesso} borderRadius="$3" padding="$3" opacity={professional.declined ? 0.7 : 1}>
                  <Link href={`/professionista/${professional.id}`} style={{ textDecoration: "none", color: "inherit", flex: 1 }}>
                    <XStack gap="$3" alignItems="center">
                      <ProfessionalAvatar imageUrl={professional.imageUrl} categorySlug={professional.categorySlug} size={44} />
                      <YStack gap="$1" flex={1}>
                        <XStack gap="$2" alignItems="center" flexWrap="wrap">
                          <Text fontWeight="600" color={brand.grafite}>
                            {professional.businessName}
                          </Text>
                          {professional.verified ? <Badge variant="verificato">Verificato</Badge> : null}
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
                  <XStack alignItems="center" gap="$1" cursor="pointer" accessibilityRole="button" onPress={() => openTimelineForProfessional(professional.id)}>
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
                  autoOpenTimeline={autoOpenChatProfessionalId === quote.professionalProfileId}
                />
              ))}
            </YStack>
          ) : (
            <Text color={brand.grafite70} fontSize="$3">
              Nessun preventivo ricevuto ancora.
            </Text>
          )}

          {booking ? (
            <BookingSection
              booking={booking}
              token={token}
              onChanged={onChanged}
              unreadCount={combineUnreadCounts(bookingUnreadCounts?.get(booking.id), threadUnreadCounts?.get(`${request.id}:${booking.professionalProfileId}`))}
            />
          ) : null}

          {openPhotoIndex !== null ? <PhotoLightbox photos={request.photoUrls} initialIndex={openPhotoIndex} onClose={() => setOpenPhotoIndex(null)} /> : null}

          {showCancelModal ? (
            <CancelBookingModal
              title="Annulla prenotazione"
              description="Il professionista verrà avvisato dell'annullamento."
              confirmLabel="Sì, annulla prenotazione"
              confirmingLabel="Annullamento..."
              showNote={false}
              onClose={() => setShowCancelModal(false)}
              onCancel={handleCancelBooking}
            />
          ) : null}

          <XStack justifyContent="center" paddingTop="$2" cursor="pointer" onPress={onToggle} accessibilityRole="button" accessibilityLabel="Richiudi la scheda">
            <Icon name="chevron-up" size={18} color={brand.grafite70} />
          </XStack>
        </YStack>
      ) : null}
    </Surface>
  );
}

/**
 * Dettagli/azioni propri della prenotazione (nata dal preventivo accettato)
 * — estratto dalla vecchia `BookingRow`, senza più il proprio header (già
 * mostrato in `GuidedRequestCard`) né la ripetizione di categoria/
 * descrizione/foto/voci del preventivo (già visibili più sopra nella stessa
 * card, essendo la stessa identica richiesta: booking/quote li denormalizzano
 * ma restano gli stessi dati, mostrarli due volte sarebbe stato ridondante
 * ora che le due liste sono un'unica card).
 */
function BookingSection({ booking, token, onChanged, unreadCount }: { booking: ClientBooking; token: string; onChanged: () => void; unreadCount?: number }) {
  const [showClientCompleteModal, setShowClientCompleteModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);
  const [showNoShowModal, setShowNoShowModal] = useState(false);
  const [confirmingDeleteBooking, setConfirmingDeleteBooking] = useState(false);
  const [isDeletingBooking, setIsDeletingBooking] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [effectiveUnreadCount, dismissUnread] = useDismissableUnreadCount(unreadCount);

  async function handleReopenBooking() {
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

  async function handleDeleteBooking() {
    setDeleteError(null);
    setIsDeletingBooking(true);
    try {
      await apiClient.deleteBooking(token, booking.id);
      onChanged();
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
    if (booking.status === "COMPLETED" && !booking.hasReview) {
      setShowReviewModal(true);
    } else {
      onChanged();
    }
  }

  async function handleSubmitReview(input: { rating: number; comment?: string; mediaUrls: string[] }) {
    await apiClient.createReview(token, { bookingId: booking.id, rating: input.rating, comment: input.comment, photoUrls: input.mediaUrls });
    setShowReviewModal(false);
    onChanged();
  }

  function closeReviewModal() {
    setShowReviewModal(false);
    onChanged();
  }

  const referenceEnd = booking.scheduledEndAt ?? booking.scheduledAt;
  const noShowEligible = booking.status === "CONFIRMED" && new Date(referenceEnd).getTime() <= Date.now() && !booking.refundRequested;

  return (
    <YStack gap="$2" borderTopWidth={1} borderTopColor={brand.filetto} paddingTop="$3">
      <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.grafite70} textTransform="uppercase">
        Intervento
      </Text>
      <Text color={brand.grafite70} fontSize="$3">
        {new Date(booking.scheduledAt).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
        {" · "}
        {new Date(booking.scheduledAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
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

      {booking.status === "CANCELED" ? (
        <XStack gap="$2" alignItems="center" flexWrap="wrap">
          <Button variant="secondary" size="$2" height={36} onPress={handleReopenBooking} disabled={isReopening} opacity={isReopening ? 0.6 : 1}>
            {isReopening ? "Riapertura..." : "Riapri prenotazione"}
          </Button>
        </XStack>
      ) : null}
      {reopenError ? (
        <Text color={brand.urgenza} fontSize="$3">
          {reopenError}
        </Text>
      ) : null}

      {noShowEligible ? (
        <Text color={brand.urgenza} fontWeight="600" fontSize="$3" cursor="pointer" accessibilityRole="button" onPress={() => setShowNoShowModal(true)}>
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

      {booking.professionalAccountDeleted ? (
        <XStack gap="$2" alignItems="center" flexWrap="wrap" paddingTop="$1" borderTopWidth={1} borderTopColor={brand.filetto}>
          {confirmingDeleteBooking ? (
            <>
              <Text fontSize="$2" color={brand.urgenza}>
                Eliminare questa prenotazione dalla lista?
              </Text>
              <Button variant="urgent" size="$2" height={36} onPress={handleDeleteBooking} disabled={isDeletingBooking} opacity={isDeletingBooking ? 0.6 : 1}>
                {isDeletingBooking ? "Eliminazione..." : "Conferma"}
              </Button>
              <Button variant="ghost" size="$2" height={36} onPress={() => setConfirmingDeleteBooking(false)}>
                Annulla
              </Button>
            </>
          ) : (
            <Text color={brand.urgenza} fontWeight="600" fontSize="$2" cursor="pointer" accessibilityRole="button" onPress={() => setConfirmingDeleteBooking(true)}>
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
            onChanged();
          }}
        />
      ) : null}

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
        <ClientCompleteModal onClose={() => setShowClientCompleteModal(false)} onConfirm={handleClientConfirmComplete} uploadPhoto={(file) => apiClient.uploadBookingCompletionPhoto(token, file).then((r) => r.imageUrl)} />
      ) : null}
      {showReviewModal ? (
        <ReviewModal
          title="Recensisci il professionista"
          subtitle="Com'è andato il lavoro? La tua recensione sarà pubblica non appena anche il professionista avrà lasciato la sua."
          uploadPhoto={(file) => apiClient.uploadReviewPhoto(token, file).then((r) => r.imageUrl)}
          onSubmit={handleSubmitReview}
          onClose={closeReviewModal}
        />
      ) : null}

      {showTimeline && booking.guidedRequestId ? (
        <TimelineModal token={token} guidedRequestId={booking.guidedRequestId} professionalProfileId={booking.professionalProfileId} viewerRole="CLIENT" otherPartyName={booking.businessName} onClose={() => setShowTimeline(false)} />
      ) : null}
    </YStack>
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
 * Preventivo ricevuto: mostra la data proposta dal professionista e
 * permette al cliente di accettarla o proporne un'altra, scelta tra le
 * fasce libere reali dell'agenda del professionista.
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
  autoOpenTimeline,
}: {
  quote: ClientGuidedRequest["quotes"][number];
  token: string;
  onChanged: () => void;
  onAcceptQuote: (quoteId: string) => Promise<void>;
  /** Fascia oraria che il cliente aveva originariamente richiesto (solo se la richiesta è nata da una fascia generica dell'agenda), per evidenziare se il professionista l'ha cambiata. */
  requestedTimeSlot: string | null;
  /** Richiesta di origine, per il bottone "Cronologia". */
  guidedRequestId: string;
  /** Modalità della richiesta originale — filtra le fasce proponibili a quelle che offrono questa modalità. */
  serviceMode: "HOME" | "ONLINE" | null;
  /** True se proprio QUESTO preventivo ha ricevuto un aggiornamento non letto. */
  isNew?: boolean;
  /** Numero di aggiornamenti non letti per questo preventivo — pallino rosso accanto a "Contatta/Cronologia". */
  unreadCount?: number;
  /** True se questo preventivo è il thread da cui arriva un nuovo messaggio in chat — apre subito il TimelineModal invece di aspettare un click. */
  autoOpenTimeline?: boolean;
}) {
  const [isChoosingDate, setIsChoosingDate] = useState(false);
  const [freeSlots, setFreeSlots] = useState<FreeSlot[] | null>(null);
  const [selectedSlotKey, setSelectedSlotKey] = useState("");
  const [proposeNote, setProposeNote] = useState("");
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
  const [effectiveUnreadCount, dismissUnread] = useDismissableUnreadCount(unreadCount);
  const autoOpenedTimelineRef = useRef(false);
  useEffect(() => {
    if (autoOpenTimeline && !autoOpenedTimelineRef.current) {
      autoOpenedTimelineRef.current = true;
      setShowTimeline(true);
    }
  }, [autoOpenTimeline]);
  const priceTotals = useMemo(() => quotePriceTotals(quote.items), [quote.items]);

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
            const modeInfo = serviceMode === "ONLINE" ? slot.online : slot.home;
            if (modeInfo && modeInfo.bookedCount < modeInfo.maxBookings) {
              slots.push({ date: day.date, startTime: slot.startTime, endTime: slot.endTime });
            }
          }
        }
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
      <XStack alignItems="center" gap="$2" flexWrap="wrap">
        <Link href={`/professionista/${quote.professionalProfileId}`} style={{ textDecoration: "none" }}>
          <Text fontWeight="600" color={brand.cianografia}>
            {quote.businessName}
          </Text>
        </Link>
        {isNew ? <Badge variant="nuovo">Nuovo</Badge> : null}
      </XStack>
      <Text fontSize="$3" color={brand.grafite70}>
        Data proposta: {formatQuoteDateRange(quote.estimatedStartDate, quote.estimatedEndDate)}
      </Text>
      <Text fontSize="$2" color={brand.grafite70}>
        Inviato il {formatSentAt(quote.sentAt)}
      </Text>
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
      {quote.timeChangedFromRequest && requestedTimeSlot ? (
        <YStack gap="$1" borderWidth={1} borderColor={brand.ottone} backgroundColor={brand.calce} borderRadius="$2" padding="$2">
          <Text fontSize="$2" fontWeight="600" color={brand.grafite}>
            Il professionista ha proposto un orario diverso da quello richiesto ({requestedTimeSlot.replace("-", "–")}).
          </Text>
        </YStack>
      ) : null}
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
          <XStack gap="$2" flexWrap="wrap" alignItems="center">
            <Button variant="primary" size="$3" height={40} onPress={handleAccept} disabled={isAccepting} opacity={isAccepting ? 0.6 : 1}>
              {isAccepting ? "Accettazione..." : "Accetta preventivo"}
            </Button>
            {!isChoosingDate ? (
              <Button variant="secondary" size="$3" height={40} onPress={startChoosingDate}>
                Modifica
              </Button>
            ) : null}
            {!isChoosingDate && !confirmingReject ? (
              <Button variant="ghost" size="$3" height={40} onPress={() => setConfirmingReject(true)}>
                <Text color={brand.urgenza} fontWeight="700" fontSize="$3">
                  Rifiuta
                </Text>
              </Button>
            ) : null}
          </XStack>
          {!isChoosingDate && confirmingReject ? (
            <XStack gap="$2" alignItems="center">
              <Text fontSize="$2" color={brand.urgenza}>
                Rifiutare questo preventivo?
              </Text>
              <Button variant="urgent" size="$2" height={36} onPress={handleRejectQuote} disabled={isRejecting} opacity={isRejecting ? 0.6 : 1}>
                {isRejecting ? "Rifiuto..." : "Conferma"}
              </Button>
              <Button variant="ghost" size="$2" height={36} onPress={() => setConfirmingReject(false)}>
                Annulla
              </Button>
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
                  <textarea value={proposeNote} onChange={(e) => setProposeNote(e.target.value)} placeholder="Dettagli aggiuntivi (opzionale): es. posso solo dopo le 17" rows={2} style={textareaStyle} />
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
              Il pagamento in piattaforma non è ancora attivo: accordati direttamente con il professionista sulle modalità di pagamento.
            </Text>
          ) : (
            <Text color={brand.cianografia} fontWeight="600" fontSize="$3" cursor="pointer" accessibilityRole="button" onPress={() => setShowPaymentInfo(true)}>
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
        <TimelineModal token={token} guidedRequestId={guidedRequestId} professionalProfileId={quote.professionalProfileId} viewerRole="CLIENT" otherPartyName={quote.businessName} onClose={() => setShowTimeline(false)} />
      ) : null}
    </YStack>
  );
}
