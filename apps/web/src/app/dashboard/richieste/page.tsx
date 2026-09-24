"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type ProfessionalAvailableSlot, type ProfessionalBooking, type ProfessionalLead } from "@professionisti/shared";
import { Button, EmptyState, Icon, Surface, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { SkeletonRequestList } from "@/components/Skeleton";
import { classifyLeadStage, type RequestStage } from "@/lib/requestStage";
import { mergeCounts, unreadGuidedRequestCounts } from "@/lib/notificationSections";
import { highlightDeepLinkTarget } from "@/lib/deepLinkHighlight";
import { CategoryCarousel } from "@/components/CategoryCarousel";
import { RequestCard } from "./_components/RequestCard";
import { ServiceBadge, filterInputStyle, leadSearchText } from "./_components/requestHelpers";

// Stesso intervallo/motivo già documentato in apps/web/src/app/dashboard/page.tsx.
const UNREAD_BADGE_POLL_MS = 15000;

/**
 * Pagina `/dashboard/richieste` — vista alternativa e più ricca delle
 * "Richieste ricevute" già presenti su `/dashboard` (non le sostituisce,
 * puramente additiva): card collassate di default, filtri per stadio di
 * pipeline (Da quotare/In attesa/Modifiche/Accettate/Scadute), timeline
 * mini, note private per richiesta. Segue il sistema "Vicinato" (CLAUDE.md
 * §19) — nessun colore/font fuori dal set esistente, zero emoji (Fase 2 del
 * redesign, sostituite con `Icon`).
 *
 * I 6 stati non sono un concetto nuovo nel dominio: sono derivati
 * puramente da `Lead.status`/`Quote.status`/`Quote.bookingStatus` già
 * esistenti (vedi `classifyLeadStage`, `lib/requestStage.ts`) — nessun
 * campo nuovo per gli stati stessi. Le uniche aggiunte reali sono la nota
 * privata per-richiesta (`Lead.professionalNote`, prima esisteva solo su
 * `Booking`, quindi non copriva le richieste ancora senza prenotazione) e
 * questa stessa pagina.
 */

// "archiviate" non è uno stadio: le richieste archiviate dal professionista
// (menu hamburger, docs/CHANGELOG.md §130), escluse da tutti gli altri tab.
type ProTabKey = "tutte" | RequestStage | "archiviate";

const TABS: { key: ProTabKey; label: string }[] = [
  { key: "tutte", label: "Tutte" },
  { key: "da_quotare", label: "Da quotare" },
  { key: "in_attesa", label: "In attesa" },
  { key: "modifica_richiesta", label: "Modifiche" },
  { key: "accettata", label: "Accettate" },
  { key: "completata", label: "Completate" },
  { key: "annullata", label: "Annullate" },
  { key: "scaduta", label: "Scadute" },
  { key: "archiviate", label: "Archiviate" },
];

type SortMode = "recenti" | "vecchie" | "aggiornamento";

export default function RichiestePage() {
  return (
    <Suspense fallback={null}>
      <RichiesteContent />
    </Suspense>
  );
}

function RichiesteContent() {
  const { token, isLoading, markNotificationsRead } = useAuth();
  const searchParams = useSearchParams();
  const [leads, setLeads] = useState<ProfessionalLead[] | null>(null);
  const [bookings, setBookings] = useState<ProfessionalBooking[] | null>(null);
  const [availableSlots, setAvailableSlots] = useState<ProfessionalAvailableSlot[]>([]);
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);
  // Pallino rosso su "Contatta" (stesso significato già in uso su
  // /dashboard e /le-mie-richieste) — questa pagina è ora la destinazione
  // canonica per il dettaglio di una richiesta (link dal menu account e dal
  // riepilogo compatto di /dashboard), deve azzerare le notifiche in
  // arrivo esattamente come faceva prima la vecchia scheda in /dashboard.
  const [leadUnreadCounts, setLeadUnreadCounts] = useState<Map<string, number>>(new Map());

  const [activeTab, setActiveTab] = useState<ProTabKey>("tutte");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recenti");
  const [zoneFilter, setZoneFilter] = useState("tutte");
  // Toggle "A domicilio"/"Online" esterno al pop-up Filtri — richiesta
  // esplicita dell'utente: gli altri filtri (ricerca/ordina/zona) vanno
  // raggruppati dentro un pulsante "Filtri", ma questo resta fuori,
  // sempre visibile, stesso principio dei tab "A domicilio"/"Online" già
  // in uso in `SearchBar`/`ProfessionalCard` per la stessa distinzione.
  const [serviceModeFilter, setServiceModeFilter] = useState<"tutte" | "HOME" | "ONLINE">("tutte");
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  // Deep link "stage" (richiesta esplicita dell'utente, deduplicazione
  // /dashboard "Lavori accettati" → CTA "Apri tutti i lavori accettati",
  // CLAUDE.md §56): preseleziona il tab quando si arriva da un link
  // esterno con `?stage=<chiave>` — una sola volta al mount, a differenza
  // di `?open=` sotto non serve aspettare i lead (il tab è impostabile
  // subito, nessun dato da cui dipende).
  useEffect(() => {
    const stageParam = searchParams.get("stage");
    if (stageParam && TABS.some((t) => t.key === stageParam)) {
      setActiveTab(stageParam as ProTabKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep link da /chat (richiesta esplicita dell'utente: "dai la
  // possibilità di andare alla pagina del preventivo/informazioni di
  // quella determinata chat") — `?open=<guidedRequestId>` apre e scrolla
  // alla card giusta appena i lead sono caricati, a prescindere dal filtro
  // per stadio corrente (passato a "tutte" per non nascondere la card).
  // Bug reale segnalato dall'utente (stesso in `/le-mie-richieste`, corretto
  // nello stesso giro): `leads` è tra le dipendenze e cambia riferimento ad
  // ogni poll da 15s (§46) — senza un ref "già consumato", questo effetto
  // riforzava `setActiveTab("tutte")` e riapriva/ri-scrollava la stessa
  // card ad ogni tick, sovrascrivendo qualunque tab/scroll l'utente avesse
  // scelto nel frattempo.
  const consumedRequestOpenRef = useRef<string | null>(null);
  // Bug reale segnalato dall'utente: cliccando una notifica di nuovo
  // messaggio (che porta `&chat=<professionalProfileId>` oltre a `?open=`)
  // la chat si apriva correttamente, ma cambiare filtro e tornare a "Tutte"
  // la riapriva da sola — come se fosse rimasta "incantata". Causa: la prop
  // `autoOpenChat` di RequestCard era calcolata ad ogni render direttamente
  // da `searchParams` (mai ripulito dall'URL), e il guard "già aperta" viveva
  // in un `useRef` DENTRO RequestCard — un cambio di filtro può smontare e
  // rimontare quella card (esce/rientra dalla lista filtrata), azzerando quel
  // ref e riaprendo la chat perché la prop restava `true`. Stesso principio
  // di `consumedRequestOpenRef` sopra, ma qui il guard deve vivere QUI (il
  // genitore non viene mai smontato dal cambio di filtro): `pendingChatOpenLeadId`
  // è impostato una sola volta e azzerato non appena la card lo consuma
  // davvero (`onChatAutoOpenHandled`), così un rimontaggio successivo vede
  // sempre `autoOpenChat=false`, a prescindere da quante volte la card
  // esce/rientra dalla lista filtrata.
  const [pendingChatOpenLeadId, setPendingChatOpenLeadId] = useState<string | null>(null);
  useEffect(() => {
    if (!leads) return;
    const targetGuidedRequestId = searchParams.get("open");
    if (!targetGuidedRequestId) return;
    if (consumedRequestOpenRef.current === targetGuidedRequestId) return;
    const match = leads.find((l) => l.guidedRequest.id === targetGuidedRequestId);
    if (!match) return;
    consumedRequestOpenRef.current = targetGuidedRequestId;
    setActiveTab(match.myState.archivedAt ? "archiviate" : "tutte");
    setOpenId(match.id);
    if (searchParams.get("chat")) setPendingChatOpenLeadId(match.id);
    // Il DOM della card esiste solo dopo che React ha renderizzato lo stato
    // appena impostato — un breve timeout invece di un secondo effetto
    // dedicato, stesso compromesso pragmatico già in uso altrove nel
    // progetto per attese di rendering minime.
    setTimeout(() => {
      const elementId = `request-${match.id}`;
      document.getElementById(elementId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      // Richiesta esplicita dell'utente: non solo scrollare, evidenziare
      // brevemente la card raggiunta (transizione di luce, si spegne da
      // sola dopo qualche secondo).
      highlightDeepLinkTarget(elementId);
    }, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, searchParams]);

  // Bug reale corretto: ricaricava solo i Lead, mai le Booking — dopo
  // "Lavoro terminato" (che porta booking.status a COMPLETED) la card
  // continuava a leggere lo stato locale non aggiornato e mostrava di
  // nuovo il bottone "Lavoro terminato" come se il lavoro non fosse mai
  // stato segnato completato, permettendo un secondo click. Entrambe le
  // liste alimentano la stessa card (booking risolto da bookingByRequestId
  // sopra), quindi vanno ricaricate insieme ad ogni azione.
  function reloadLeads() {
    if (!token) return;
    Promise.all([apiClient.myLeads(token), apiClient.myProfessionalBookings(token)]).then(([l, b]) => {
      setLeads(l);
      setBookings(b);
    });
  }

  useEffect(() => {
    if (!token) return;
    Promise.all([apiClient.myLeads(token), apiClient.myProfessionalBookings(token), apiClient.myAvailableSlots(token), apiClient.getMyProfessionalProfile(token)])
      .then(([l, b, slots, profile]) => {
        setLeads(l);
        setBookings(b);
        setAvailableSlots(slots);
        setMyProfileId(profile?.id ?? null);
        if (!profile) setProfileMissing(true);
      })
      .catch(() => setProfileMissing(true));
  }, [token]);

  // Ripetuto ogni UNREAD_BADGE_POLL_MS finché la pagina resta aperta
  // (richiesta esplicita dell'utente: "al professionista ancora non si
  // capisce che è arrivato un nuovo messaggio da quella particolare
  // richiesta") — ogni tick trova solo le notifiche arrivate dopo il
  // markNotificationsRead del tick precedente, quindi i conteggi si sommano
  // (mergeCounts) invece di sostituire lo stato, stesso principio già in
  // uso su /dashboard e /le-mie-richieste.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    function poll() {
      apiClient
        .unreadNotifications(token!)
        .then((notifications) => {
          if (cancelled || notifications.length === 0) return;
          setLeadUnreadCounts((prev) => mergeCounts(prev, unreadGuidedRequestCounts(notifications)));
          // Stesso bug/fix già applicato in /le-mie-richieste: un evento
          // generato dal cliente (accettazione, proposta data, conferma
          // "lavoro terminato", ecc.) mentre questa pagina resta aperta
          // lasciava leads/bookings non aggiornati fino a un ricaricamento
          // manuale — il poll dei pallini ora ricarica anche le due liste.
          reloadLeads();
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

  const bookingByRequestId = useMemo(() => {
    const map = new Map<string, ProfessionalBooking>();
    (bookings ?? []).forEach((b) => {
      if (b.guidedRequestId) map.set(b.guidedRequestId, b);
    });
    return map;
  }, [bookings]);

  const zones = useMemo(() => {
    const set = new Set((leads ?? []).map((l) => l.guidedRequest.city).filter(Boolean));
    return [...set].sort();
  }, [leads]);

  // Conteggio dei filtri del pop-up "Filtri" (ordina/zona) — la ricerca è
  // ora esterna al pop-up, con il proprio campo sempre visibile (il testo
  // digitato è già la propria indicazione di stato), e il toggle "A
  // domicilio/Online" resta anch'esso fuori: nessuno dei due contribuisce
  // al conteggio qui.
  const filtersActiveCount = (zoneFilter !== "tutte" ? 1 : 0) + (sortMode !== "recenti" ? 1 : 0);

  const stageByLeadId = useMemo(() => {
    const map = new Map<string, RequestStage>();
    (leads ?? []).forEach((l) => map.set(l.id, classifyLeadStage(l)));
    return map;
  }, [leads]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { tutte: 0, archiviate: 0 };
    (leads ?? []).forEach((l) => {
      if (l.myState.archivedAt) {
        counts.archiviate = (counts.archiviate ?? 0) + 1;
        return;
      }
      counts.tutte = (counts.tutte ?? 0) + 1;
      const stage = stageByLeadId.get(l.id)!;
      const bucket = stage === "chiusa" ? "scaduta" : stage;
      counts[bucket] = (counts[bucket] ?? 0) + 1;
    });
    return counts;
  }, [leads, stageByLeadId]);

  const visibleLeads = useMemo(() => {
    let list = leads ?? [];
    if (activeTab === "archiviate") list = list.filter((l) => l.myState.archivedAt);
    else list = list.filter((l) => !l.myState.archivedAt);
    if (activeTab !== "tutte" && activeTab !== "archiviate") {
      list = list.filter((l) => {
        const stage = stageByLeadId.get(l.id);
        return activeTab === "scaduta" ? stage === "scaduta" || stage === "chiusa" : stage === activeTab;
      });
    }
    if (zoneFilter !== "tutte") list = list.filter((l) => l.guidedRequest.city === zoneFilter);
    if (serviceModeFilter !== "tutte") list = list.filter((l) => l.guidedRequest.serviceMode === serviceModeFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((l) => leadSearchText(l, stageByLeadId.get(l.id), bookingByRequestId.get(l.guidedRequest.id)).includes(q));
    }
    list = [...list];
    if (sortMode === "vecchie") list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    else if (sortMode === "recenti") list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else if (sortMode === "aggiornamento") list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return list;
  }, [leads, activeTab, zoneFilter, serviceModeFilter, search, sortMode, stageByLeadId, bookingByRequestId]);

  if (isLoading || (token && leads === null && !profileMissing)) {
    return (
      <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={800}>
          <SkeletonRequestList count={3} />
        </YStack>
      </YStack>
    );
  }

  if (!token) {
    return (
      <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite} textAlign="center">
            Accedi come professionista
          </Text>
          <Link href="/accedi?redirect=/dashboard/richieste">
            <Button variant="primary">Accedi</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  if (profileMissing) {
    return (
      <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite} textAlign="center">
            Crea prima il tuo profilo professionista
          </Text>
          <Link href="/dashboard/profilo">
            <Button variant="primary">Vai al profilo</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  return (
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$8" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={1000} gap="$5">
        <XStack justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap="$3">
          <YStack gap="$1">
            <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite}>
              Richieste ricevute
            </Text>
            <Text fontFamily="$body" fontSize={13} color={brand.grafite70}>
              Gestisci preventivi, rispondi ai clienti e tieni traccia di ogni lavoro
            </Text>
          </YStack>
          <Link href="/dashboard">
            <Button variant="ghost" size="$3">
              ← Dashboard
            </Button>
          </Link>
        </XStack>

        {/* Tab filtro — riga unica scorrevole orizzontalmente (richiesta
            esplicita dell'utente, con riferimento visivo puntuale): niente
            flexWrap, altrimenti le pillole andrebbero a capo invece di
            scorrere su schermi stretti. Frecce prev/next riusate da
            CategoryCarousel (stesso pattern già in uso per i caroselli
            della home) — "Verbale Cognitivo" F4.3: su un laptop comune
            (1280px) le 8 pillole eccedevano la larghezza disponibile senza
            alcun indizio visivo (l'ultima, "Scadute", appariva tagliata),
            lo scroll da solo era già possibile ma invisibile. */}
        <CategoryCarousel>
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
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
                  onPress={() => setActiveTab(tab.key)}
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

        {/* Barra filtri — richiesta esplicita dell'utente: la ricerca resta
            esterna, sempre visibile (non dentro il pop-up "Filtri"), mentre
            ordina/zona restano raggruppati nel pulsante "Filtri" (pop-up,
            stesso pattern overlay già in uso altrove nel prodotto —
            role="dialog", chiusura su Escape/click sul backdrop). Il toggle
            "A domicilio/Online" resta anch'esso fuori, sempre visibile. */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
                  onPress={() => setServiceModeFilter(opt.key)}
                  accessibilityRole="button"
                >
                  {/* Stesse icone già usate su ServiceBadge (house/video) per
                      la stessa distinzione — richiesta esplicita dell'utente
                      di coerenza tra il filtro e le richieste mostrate. */}
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
                <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} style={{ ...filterInputStyle, width: "100%" }}>
                  <option value="recenti">Data di ricezione più recente</option>
                  <option value="vecchie">Data di ricezione più vecchie</option>
                  <option value="aggiornamento">Ultimo aggiornamento</option>
                </select>
                <select value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)} style={{ ...filterInputStyle, width: "100%" }}>
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
                  }}
                  accessibilityRole="button"
                >
                  <Text fontSize={13} fontWeight="700" color={brand.grafite70} textDecorationLine="underline">
                    Reimposta filtri
                  </Text>
                </XStack>
              ) : null}

              <Button variant="primary" onPress={() => setShowFiltersModal(false)}>
                Mostra {visibleLeads.length} {visibleLeads.length === 1 ? "richiesta" : "richieste"}
              </Button>
            </YStack>
          </div>
        ) : null}

        {/* Elenco */}
        {visibleLeads.length === 0 ? (
          <YStack gap="$3">
            <Surface>
              <EmptyState icon="search" title="Nessuna richiesta in questa categoria" description="Cambia filtro o attendi nuove richieste dai clienti." />
            </Surface>
            {/* Mini-guida per i professionisti appena iscritti (tour
                pre-lancio): senza richieste la pagina non spiegava cosa
                succede "dopo" — i tre passi sotto danno aspettative
                concrete invece di lasciare un vuoto muto. */}
            <Surface gap="$3">
              <Text fontFamily="$heading" fontWeight="700" fontSize="$5" color={brand.grafite}>
                Come funziona quando arriva una richiesta
              </Text>
              <XStack gap="$3" flexWrap="wrap">
                <YStack flex={1} minWidth={180} gap="$1">
                  <XStack alignItems="center" gap="$2">
                    <Icon name="bell-ring" size={16} color={brand.cianografia} strokeWidth={1.5} />
                    <Text fontWeight="700" fontSize="$3" color={brand.grafite}>
                      1. Ricevi la richiesta
                    </Text>
                  </XStack>
                  <Text fontSize="$2" color={brand.grafite70}>
                    Un cliente della tua zona descrive il lavoro con foto: ti arriva qui e ti avvisiamo.
                  </Text>
                </YStack>
                <YStack flex={1} minWidth={180} gap="$1">
                  <XStack alignItems="center" gap="$2">
                    <Icon name="file-text" size={16} color={brand.cianografia} strokeWidth={1.5} />
                    <Text fontWeight="700" fontSize="$3" color={brand.grafite}>
                      2. Invii il preventivo
                    </Text>
                  </XStack>
                  <Text fontSize="$2" color={brand.grafite70}>
                    Prezzo e data scelti dalla tua agenda. Solo allora il cliente vede chi sei.
                  </Text>
                </YStack>
                <YStack flex={1} minWidth={180} gap="$1">
                  <XStack alignItems="center" gap="$2">
                    <Icon name="calendar" size={16} color={brand.cianografia} strokeWidth={1.5} />
                    <Text fontWeight="700" fontSize="$3" color={brand.grafite}>
                      3. Il lavoro entra in agenda
                    </Text>
                  </XStack>
                  <Text fontSize="$2" color={brand.grafite70}>
                    Se il cliente accetta, l'appuntamento compare nella tua agenda con contatti e indirizzo.
                  </Text>
                </YStack>
              </XStack>
            </Surface>
          </YStack>
        ) : (
          <YStack gap="$3">
            {visibleLeads.map((lead) => (
              <div key={lead.id} id={`request-${lead.id}`}>
                <RequestCard
                  lead={lead}
                  stage={stageByLeadId.get(lead.id)!}
                  booking={bookingByRequestId.get(lead.guidedRequest.id) ?? null}
                  token={token}
                  availableSlots={availableSlots}
                  myProfileId={myProfileId}
                  isOpen={openId === lead.id}
                  onToggle={() => {
                    const opening = openId !== lead.id;
                    setOpenId(opening ? lead.id : null);
                    // Aprire una scheda segnata "da leggere" la considera letta.
                    if (opening && lead.myState.markedUnreadAt) {
                      apiClient.updateGuidedRequestMyState(token, lead.guidedRequest.id, { markedUnread: false }).then(reloadLeads).catch(() => {});
                    }
                  }}
                  onChanged={reloadLeads}
                  unreadCount={leadUnreadCounts.get(lead.guidedRequest.id)}
                  onMarkedRead={() =>
                    setLeadUnreadCounts((prev) => {
                      const next = new Map(prev);
                      next.delete(lead.guidedRequest.id);
                      return next;
                    })
                  }
                  autoOpenChat={pendingChatOpenLeadId === lead.id}
                  onChatAutoOpenHandled={() => setPendingChatOpenLeadId((prev) => (prev === lead.id ? null : prev))}
                />
              </div>
            ))}
          </YStack>
        )}
      </YStack>
    </YStack>
  );
}
