"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  buildWhatsAppLink,
  formatBookingAddress,
  formatEurCents,
  quotePriceTotals,
  type CompleteBookingInput,
  type ProfessionalAvailableSlot,
  type ProfessionalBooking,
  type ProfessionalLead,
} from "@professionisti/shared";
import { Badge, Button, EmptyState, Icon, Surface, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
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
import { classifyLeadStage, describeClosedReason, type RequestStage } from "@/lib/requestStage";
import { mergeCounts, unreadGuidedRequestCounts } from "@/lib/notificationSections";
import { UnreadDot } from "@/components/UnreadDot";
import { useDismissableUnreadCount } from "@/lib/useDismissableUnreadCount";

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

const smallInputStyle = { padding: 10, borderRadius: radiusDoc, border: `1px solid ${brand.filetto}`, fontSize: 13, fontFamily: "inherit", color: brand.grafite };
// Filtri in cima alla pagina (cerca/ordina/zona) — dimensioni più grandi
// della versione compatta usata nel form preventivo, richiesta esplicita
// dell'utente ("anche le dimensioni e il carattere delle scritte").
const filterInputStyle = { padding: "14px 16px", borderRadius: radiusDoc, border: `1px solid ${brand.filetto}`, fontSize: 16, fontFamily: "inherit", color: brand.grafite, backgroundColor: brand.calce };

type QuoteItemDraft = { name: string; priceMin: string; priceMax: string };

function slotKey(slot: ProfessionalAvailableSlot): string {
  return `${slot.date}|${slot.startTime}|${slot.endTime}`;
}
function slotLabel(slot: ProfessionalAvailableSlot): string {
  const date = new Date(`${slot.date}T00:00:00Z`);
  const dateLabel = date.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return `${dateLabel} · ${slot.startTime}–${slot.endTime}`;
}
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("it-IT", { day: "numeric", month: "short" })} · ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
}
function formatSlotRange(startIso: string, endIso: string | null): string {
  const start = new Date(startIso);
  const dateLabel = start.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const startLabel = start.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  if (!endIso) return `${dateLabel} · ${startLabel}`;
  const endLabel = new Date(endIso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${dateLabel} · ${startLabel}–${endLabel}`;
}

/**
 * "Rispondi entro..." per una richiesta non ancora quotata — richiesta
 * esplicita dell'utente (revisione UX, finitura §10: "evidenziare quanto
 * manca alla scadenza della richiesta spinge a quotare in fretta"). Gli
 * orizzonti reali (CLAUDE.md §14) sono brevi — 20 minuti per le urgenti,
 * fino a 4 ore per le standard — mai giorni, quindi il formato resta
 * sempre minuti/ore, mai una data. `null` se la scadenza è già passata
 * (il job schedulato la marcherà EXPIRED a breve, non ha senso mostrare un
 * conto alla rovescia negativo) o non nota (Lead precedenti a questa
 * funzionalità).
 */
function formatLeadDeadline(expiresAt: string | null): { label: string; urgent: boolean } | null {
  if (!expiresAt) return null;
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return null;
  const diffMinutes = Math.ceil(diffMs / 60_000);
  // Urgente (bordo/testo rosso invece di ambra) sotto mezz'ora, a
  // prescindere dal tipo di richiesta — un margine sempre stretto,
  // indipendentemente da quanto tempo aveva a disposizione all'inizio.
  const urgent = diffMinutes <= 30;
  if (diffMinutes < 60) {
    return { label: `Rispondi entro ${diffMinutes} minut${diffMinutes === 1 ? "o" : "i"}`, urgent };
  }
  const diffHours = Math.ceil(diffMinutes / 60);
  return { label: `Rispondi entro ${diffHours} or${diffHours === 1 ? "a" : "e"}`, urgent };
}

// Palette per gli stati — richiesta esplicita dell'utente, poi rivista una
// seconda volta con una mappatura più puntuale (turchese/completata,
// blu/da quotare, giallo/in attesa, giallo più scuro/modifiche, verde/
// accettate, rosso/scadute, rosso firebrick/annullate): eccezione
// deliberata alla palette chiusa "Vicinato" (CLAUDE.md §19) solo per questi
// indicatori di stato — stessa logica già usata altrove nel progetto per
// un'eccezione puntuale e circoscritta (es. CLAUDE.md §31, emoji
// nell'eyebrow home). Hex letterali locali a questa pagina, non toccano
// `packages/ui/tokens.ts` né le 4 varianti fisse di `Badge` (quelle restano
// semantiche "verificato/pro/urgente/nuovo" per il resto del sito).
// `annullata` e `scaduta` condividono lo stesso significato "non riuscita"
// ma sono ora distinte anche nel colore (non solo nell'icona): rosso
// standard per una scadenza, rosso firebrick — più cupo, distinguibile a
// colpo d'occhio — per un annullamento vero e proprio, richiesto
// esplicitamente due volte dall'utente nello stesso messaggio. `chiusa`
// (rifiuto/ritiro, raggruppata sotto "Scadute") non era tra gli stati
// nominati esplicitamente: resta grigio neutro, invariata.
const STAGE_STYLE: Record<RequestStage, { label: string; icon: import("@professionisti/ui").IconName; fg: string; bg: string; border: string }> = {
  da_quotare: { label: "Da quotare", icon: "zap", fg: "#0D6EFD", bg: "#E7F1FF", border: "#0D6EFD" },
  // "In attesa" da solo era ambiguo sulla singola card (segnalato in
  // revisione UX: "il pro ha già inviato il preventivo, in attesa di
  // chi?") — la pillola sulla card ora lo dice esplicitamente, il tab
  // resta "In attesa" (spazio ridotto nella riga a scorrimento, stesso
  // significato).
  in_attesa: { label: "In attesa del cliente", icon: "clock", fg: "#8A6D00", bg: "#FFF3CD", border: "#FFC107" },
  modifica_richiesta: { label: "Modifica richiesta", icon: "rotate-ccw", fg: "#7A4F01", bg: "#FFE8A3", border: "#B8860B" },
  accettata: { label: "Accettata", icon: "check", fg: "#28A745", bg: "#E6F4EA", border: "#28A745" },
  completata: { label: "Completata", icon: "check", fg: "#0E7C7B", bg: "#DFF7F5", border: "#20B2AA" },
  // Richiesta esplicita dell'utente: "rendi chiare quelle che sono state
  // annullate" — prima indistinguibile da "accettata" (nessuno stadio
  // dedicato). Icona "x" (già usata per "chiusa", stesso significato
  // "non riuscita") a distinguerla visivamente da "scaduta" pur
  // condividendo lo stesso significato semantico "rosso".
  annullata: { label: "Annullata", icon: "x", fg: "#B22222", bg: "#F8D7DA", border: "#B22222" },
  scaduta: { label: "Scaduta", icon: "clock", fg: "#DC3545", bg: "#FBEAEA", border: "#DC3545" },
  chiusa: { label: "Chiusa", icon: "x", fg: brand.grafite70, bg: brand.gesso, border: brand.filetto },
};

const TABS: { key: "tutte" | RequestStage; label: string }[] = [
  { key: "tutte", label: "Tutte" },
  { key: "da_quotare", label: "Da quotare" },
  { key: "in_attesa", label: "In attesa" },
  { key: "modifica_richiesta", label: "Modifiche" },
  { key: "accettata", label: "Accettate" },
  { key: "completata", label: "Completate" },
  { key: "annullata", label: "Annullate" },
  { key: "scaduta", label: "Scadute" },
];

type SortMode = "recenti" | "vecchie" | "aggiornamento";

function StagePill({ stage }: { stage: RequestStage }) {
  const s = STAGE_STYLE[stage];
  return (
    <XStack alignItems="center" gap={6} paddingHorizontal="$3" paddingVertical={8} borderRadius={999} backgroundColor={s.bg}>
      <Icon name={s.icon} size={15} strokeWidth={2} color={s.fg} />
      <Text fontFamily="$body" fontSize={14} fontWeight="800" color={s.fg} textTransform="uppercase">
        {s.label}
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
 * "Rispondi entro..." per una richiesta da quotare — richiesta esplicita
 * dell'utente (revisione UX, finitura #10): rende visibile a colpo
 * d'occhio quanto tempo resta prima che il Lead scada, per spingere a
 * quotare in fretta. Ambra di default, rosso (`brand.urgenza`) sotto i 30
 * minuti — stesso principio "rosso solo su urgenza" già seguito ovunque
 * nel prodotto.
 */
function DeadlinePill({ deadline }: { deadline: { label: string; urgent: boolean } }) {
  const color = deadline.urgent ? brand.urgenza : "#B8860B";
  const bg = deadline.urgent ? "#FBEAEA" : "#FFF3D6";
  return (
    <XStack alignItems="center" gap={6} paddingHorizontal="$3" paddingVertical={8} borderRadius={999} backgroundColor={bg}>
      <Icon name="clock" size={15} strokeWidth={2} color={color} />
      <Text fontFamily="$body" fontSize={14} fontWeight="800" color={color}>
        {deadline.label}
      </Text>
    </XStack>
  );
}

/** Barra orizzontale a step (versione "mini" per questa pagina, distinta da RequestStepper: qui serve il ramo extra "Modifica richiesta"). */
function MiniTimeline({ stage }: { stage: RequestStage }) {
  const steps: { key: string; label: string; extra?: boolean }[] = [{ key: "richiesta", label: "Richiesta" }, { key: "preventivo", label: "Preventivo inviato" }];
  if (stage === "modifica_richiesta") steps.push({ key: "modifica", label: "Modifica richiesta dal cliente", extra: true });
  steps.push({ key: "accettata", label: "Accettata" }, { key: "completata", label: "Completata" });

  const reachedIndex: Record<RequestStage, number> = {
    da_quotare: 0,
    in_attesa: 1,
    modifica_richiesta: 2,
    accettata: stage === "modifica_richiesta" ? 3 : 2,
    completata: stage === "modifica_richiesta" ? 4 : 3,
    // Una prenotazione annullata era comunque già "accettata" prima di
    // esserlo (stesso passo raggiunto, non un passo a sé nella mini
    // timeline che non ha una bolla dedicata per questo stato).
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

  const [activeTab, setActiveTab] = useState<"tutte" | RequestStage>("tutte");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recenti");
  const [zoneFilter, setZoneFilter] = useState("tutte");
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
      setActiveTab(stageParam as "tutte" | RequestStage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep link da /chat (richiesta esplicita dell'utente: "dai la
  // possibilità di andare alla pagina del preventivo/informazioni di
  // quella determinata chat") — `?open=<guidedRequestId>` apre e scrolla
  // alla card giusta appena i lead sono caricati, a prescindere dal filtro
  // per stadio corrente (passato a "tutte" per non nascondere la card).
  useEffect(() => {
    if (!leads) return;
    const targetGuidedRequestId = searchParams.get("open");
    if (!targetGuidedRequestId) return;
    const match = leads.find((l) => l.guidedRequest.id === targetGuidedRequestId);
    if (!match) return;
    setActiveTab("tutte");
    setOpenId(match.id);
    // Il DOM della card esiste solo dopo che React ha renderizzato lo stato
    // appena impostato — un breve timeout invece di un secondo effetto
    // dedicato, stesso compromesso pragmatico già in uso altrove nel
    // progetto per attese di rendering minime.
    setTimeout(() => {
      document.getElementById(`request-${match.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  const stageByLeadId = useMemo(() => {
    const map = new Map<string, RequestStage>();
    (leads ?? []).forEach((l) => map.set(l.id, classifyLeadStage(l)));
    return map;
  }, [leads]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { tutte: (leads ?? []).length };
    (leads ?? []).forEach((l) => {
      const stage = stageByLeadId.get(l.id)!;
      const bucket = stage === "chiusa" ? "scaduta" : stage;
      counts[bucket] = (counts[bucket] ?? 0) + 1;
    });
    return counts;
  }, [leads, stageByLeadId]);

  const visibleLeads = useMemo(() => {
    let list = leads ?? [];
    if (activeTab !== "tutte") {
      list = list.filter((l) => {
        const stage = stageByLeadId.get(l.id);
        return activeTab === "scaduta" ? stage === "scaduta" || stage === "chiusa" : stage === activeTab;
      });
    }
    if (zoneFilter !== "tutte") list = list.filter((l) => l.guidedRequest.city === zoneFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      // Indirizzo non più disponibile a questo livello (richiesta esplicita
      // dell'utente: nessun dato di contatto/indirizzo prima
      // dell'accettazione) — il filtro cerca ora su nome cliente e città.
      list = list.filter((l) => (l.guidedRequest.clientName ?? "").toLowerCase().includes(q) || l.guidedRequest.city.toLowerCase().includes(q));
    }
    list = [...list];
    if (sortMode === "vecchie") list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    else if (sortMode === "recenti") list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else if (sortMode === "aggiornamento") list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return list;
  }, [leads, activeTab, zoneFilter, search, sortMode, stageByLeadId]);

  if (isLoading || (token && leads === null && !profileMissing)) {
    return (
      <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
        <LoadingState />
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
      <YStack width="100%" maxWidth={900} gap="$5">
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
            scorrere su schermi stretti. */}
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingTop: 6, paddingBottom: 8, WebkitOverflowScrolling: "touch" }}>
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            const count = tabCounts[tab.key] ?? 0;
            return (
              <XStack key={tab.key} flexShrink={0} position="relative">
                <XStack
                  alignItems="center"
                  paddingHorizontal="$4"
                  paddingVertical={14}
                  borderRadius={999}
                  backgroundColor={active ? brand.cianografia : brand.calce}
                  borderWidth={1}
                  borderColor={active ? brand.cianografia : brand.filetto}
                  cursor="pointer"
                  onPress={() => setActiveTab(tab.key)}
                  accessibilityRole="button"
                >
                  <Text fontFamily="$body" fontSize={17} fontWeight="800" color={active ? "white" : brand.grafite}>
                    {tab.label}
                  </Text>
                </XStack>
                {count > 0 ? (
                  <YStack
                    position="absolute"
                    top={-6}
                    right={-6}
                    minWidth={24}
                    height={24}
                    paddingHorizontal={5}
                    borderRadius={999}
                    backgroundColor={brand.urgenza}
                    alignItems="center"
                    justifyContent="center"
                    borderWidth={2}
                    borderColor={brand.gesso}
                  >
                    <Text fontSize={12} fontWeight="800" color="white">
                      {count}
                    </Text>
                  </YStack>
                ) : null}
              </XStack>
            );
          })}
        </div>

        {/* Barra filtri */}
        <XStack gap="$2" flexWrap="wrap">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca cliente o indirizzo..."
            style={{ ...filterInputStyle, flex: "1 1 220px", minWidth: 200 }}
          />
          <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} style={filterInputStyle}>
            <option value="recenti">Data di ricezione più recente</option>
            <option value="vecchie">Data di ricezione più vecchie</option>
            <option value="aggiornamento">Ultimo aggiornamento</option>
          </select>
          <select value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)} style={filterInputStyle}>
            <option value="tutte">Tutte le zone</option>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </XStack>

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
                  onToggle={() => setOpenId((prev) => (prev === lead.id ? null : lead.id))}
                  onChanged={reloadLeads}
                  unreadCount={leadUnreadCounts.get(lead.guidedRequest.id)}
                />
              </div>
            ))}
          </YStack>
        )}
      </YStack>
    </YStack>
  );
}

function RequestCard({
  lead,
  stage,
  booking,
  token,
  availableSlots,
  myProfileId,
  isOpen,
  onToggle,
  onChanged,
  unreadCount,
}: {
  lead: ProfessionalLead;
  stage: RequestStage;
  /** Prenotazione collegata (se il preventivo è stato accettato), per intervento/importo finale. */
  booking: ProfessionalBooking | null;
  token: string;
  availableSlots: ProfessionalAvailableSlot[];
  myProfileId: string | null;
  isOpen: boolean;
  onToggle: () => void;
  onChanged: () => void;
  /** Numero di aggiornamenti non letti per questa richiesta — pallino rosso accanto a "Contatta", stesso significato già in uso su /dashboard e /le-mie-richieste. */
  unreadCount?: number;
}) {
  const gr = lead.guidedRequest;
  const isOnline = gr.serviceMode === "ONLINE";
  const s = STAGE_STYLE[stage];
  const priceRange = lead.quote ? quotePriceTotals(lead.quote.items) : null;
  const leadDeadline = formatLeadDeadline(lead.expiresAt);

  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [items, setItems] = useState<QuoteItemDraft[]>([{ name: "Manodopera", priceMin: "", priceMax: "" }]);
  const modeAvailableSlots = availableSlots.filter((sl) => (isOnline ? sl.onlineAvailable : sl.homeAvailable));
  const [selectedSlotKey, setSelectedSlotKey] = useState(modeAvailableSlots[0] ? slotKey(modeAvailableSlots[0]) : "");
  // Data/orario inserita a mano (richiesta esplicita dell'utente: "dai la
  // possibilità di inserire una data orario manualmente"), non solo come
  // ripiego quando l'agenda non ha fasce — sempre disponibile tramite il
  // link "Inserisci data e orario manualmente" anche quando la tendina è
  // popolata. Nessuna validazione contro AvailabilitySlot lato server per
  // questo campo (mai stata presente, `QuotesService.createOrUpdate`
  // accetta già qualunque data/ora — solo il form obbligava a scegliere da
  // una fascia reale): a differenza della contro-proposta
  // (`counterProposeDate`, che invece rivalida contro l'agenda reale via
  // `resolveFreeExactSlot`), qui resta volutamente libero.
  const [useManualDateTime, setUseManualDateTime] = useState(false);
  const [manualDate, setManualDate] = useState("");
  const [manualStartTime, setManualStartTime] = useState("");
  const [manualEndTime, setManualEndTime] = useState("");
  const [quoteNotes, setQuoteNotes] = useState("");
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isSubmittingQuote, setIsSubmittingQuote] = useState(false);

  const [showCounterForm, setShowCounterForm] = useState(false);
  const [counterSlotKey, setCounterSlotKey] = useState(modeAvailableSlots[0] ? slotKey(modeAvailableSlots[0]) : "");
  // Data/orario libera anche qui (richiesta esplicita dell'utente: "ogni
  // volta che il professionista clicca su proponi un'altra data gli si
  // deve dare la possibilità di inserire un gruppo data orario che non è
  // presente in agenda") — stesso pattern del primo invio preventivo, ma
  // qui il backend (counterProposeDate) richiede il flag esplicito
  // `isManual` per saltare la validazione contro l'agenda reale, perché
  // altrimenti questo endpoint rivalida sempre via resolveFreeExactSlot.
  const [useManualCounterDateTime, setUseManualCounterDateTime] = useState(false);
  const [manualCounterDate, setManualCounterDate] = useState("");
  const [manualCounterStartTime, setManualCounterStartTime] = useState("");
  const [manualCounterEndTime, setManualCounterEndTime] = useState("");
  const [counterNote, setCounterNote] = useState("");
  const [counterError, setCounterError] = useState<string | null>(null);
  const [isCountering, setIsCountering] = useState(false);
  const [isConfirmingDate, setIsConfirmingDate] = useState(false);
  const [isRejectingDate, setIsRejectingDate] = useState(false);

  const [confirmingDecline, setConfirmingDecline] = useState(false);
  const [declineNoteDraft, setDeclineNoteDraft] = useState("");
  const [isDeclining, setIsDeclining] = useState(false);

  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Stessi popup già in uso in /dashboard (LeadCard/AcceptedJobCard) per
  // "Lavoro terminato"/"Annulla intervento"/"Recensisci il cliente" —
  // richiesta esplicita dell'utente di implementarli qui identici.
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showClientReviewModal, setShowClientReviewModal] = useState(false);

  const [showClientProfile, setShowClientProfile] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [openPhotoIndex, setOpenPhotoIndex] = useState<number | null>(null);
  // Il pallino "Contatta/Cronologia" deve sparire non appena si apre la
  // conversazione (richiesta esplicita dell'utente) — vedi
  // useDismissableUnreadCount per il motivo del calcolo differenziale.
  // Un solo stato per l'intera card: qualunque bottone apra la cronologia
  // (Chat/Contatta/Cronologia, in stadi diversi) azzera lo stesso pallino.
  const [effectiveUnreadCount, dismissUnread] = useDismissableUnreadCount(unreadCount);
  function openTimeline() {
    setShowTimeline(true);
    dismissUnread();
  }

  const [noteDraft, setNoteDraft] = useState(lead.professionalNote ?? "");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const noteChanged = noteDraft !== (lead.professionalNote ?? "");
  // La textarea "Note personali" si espandeva solo trascinando l'angolo
  // (CSS resize:vertical) — su mobile quel trascinamento non è
  // disponibile (nessun browser touch lo supporta), quindi il campo
  // restava bloccato a 2 righe. Corretto con un auto-grow via JS
  // (altezza = scrollHeight ad ogni digitazione/cambio nota), identico
  // su desktop e mobile — richiesta esplicita dell'utente.
  const noteTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const autoGrowNote = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(() => {
    autoGrowNote(noteTextareaRef.current);
  }, [noteDraft]);

  const clientName = gr.clientAccountDeleted ? "Account eliminato" : (gr.clientName ?? "Cliente");
  // Telefono/email/indirizzo NON arrivano più su `gr` (richiesta esplicita
  // dell'utente: visibili solo ad accettazione del lavoro) — quando esiste
  // una Booking (preventivo accettato) vengono letti da lì, dove sono
  // sempre stati disponibili (recipientPhone/street/ecc.), mai prima.
  const revealedPhone = booking ? (booking.recipientPhone ?? booking.clientPhone) : null;
  const revealedEmail = booking ? booking.clientEmail : null;
  const revealedAddress = booking ? (formatBookingAddress(booking) ?? (booking.address ? `${booking.address}, ${gr.city}` : null)) : null;
  const whatsAppLink = buildWhatsAppLink(revealedPhone);
  const quoteWithdrawn = lead.quote?.status === "WITHDRAWN";
  const canDelete = gr.clientAccountDeleted || quoteWithdrawn;

  // Data/ora dell'intervento visibile già nell'anteprima non espansa
  // (richiesta esplicita dell'utente: "deve essere visualizzata già la
  // data e ora dell'intervento o la richiesta di quella specifica
  // data/intervento cosi che sia subito visibile") — priorità: la
  // prenotazione reale se esiste, altrimenti la data proposta nel
  // preventivo inviato, altrimenti la fascia richiesta dal cliente fin
  // dall'invio (se nata da una fascia generica dell'agenda pubblica,
  // stesso campo già mostrato in /le-mie-richieste).
  const collapsedDateTime = booking?.scheduledAt
    ? { label: "Intervento", text: formatSlotRange(booking.scheduledAt, booking.scheduledEndAt) }
    : lead.quote?.estimatedStartDate
      ? { label: "Preventivo per", text: formatSlotRange(lead.quote.estimatedStartDate, lead.quote.estimatedEndDate) }
      : gr.preferredDate && gr.preferredTimeSlot
        ? {
            label: "Richiesta per",
            text: `${new Date(`${gr.preferredDate}T00:00:00Z`).toLocaleDateString("it-IT", {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: "UTC",
            })} · ${gr.preferredTimeSlot.replace("-", "–")}`,
          }
        : null;

  function updateItem(index: number, field: "name" | "priceMin" | "priceMax", value: string) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }
  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSendQuote() {
    setQuoteError(null);
    const cleaned = items.map((it) => ({ ...it, name: it.name.trim() })).filter((it) => it.name.length > 0);
    if (cleaned.length === 0) {
      setQuoteError("Aggiungi almeno una voce al preventivo.");
      return;
    }
    const parsed: { name: string; priceMinEurCents?: number; priceMaxEurCents?: number }[] = [];
    for (const item of cleaned) {
      const priceMinEurCents = item.priceMin.trim() ? Math.round(Number(item.priceMin.replace(",", ".")) * 100) : undefined;
      const priceMaxEurCents = item.priceMax.trim() ? Math.round(Number(item.priceMax.replace(",", ".")) * 100) : undefined;
      if (item.priceMin.trim() && !Number.isFinite(priceMinEurCents)) return setQuoteError(`Prezzo minimo non valido per "${item.name}".`);
      if (item.priceMax.trim() && !Number.isFinite(priceMaxEurCents)) return setQuoteError(`Prezzo massimo non valido per "${item.name}".`);
      if (priceMinEurCents === undefined && priceMaxEurCents === undefined) return setQuoteError(`Indica almeno un prezzo per "${item.name}".`);
      if (priceMinEurCents !== undefined && priceMaxEurCents !== undefined && priceMaxEurCents < priceMinEurCents)
        return setQuoteError(`Il prezzo massimo di "${item.name}" dev'essere maggiore o uguale al minimo.`);
      parsed.push({ name: item.name, priceMinEurCents, priceMaxEurCents });
    }

    let estimatedStartDate: string;
    let estimatedEndDate: string | undefined;
    if (modeAvailableSlots.length > 0 && !useManualDateTime) {
      const slot = modeAvailableSlots.find((sl) => slotKey(sl) === selectedSlotKey);
      if (!slot) return setQuoteError("Scegli un orario dalla tua agenda.");
      estimatedStartDate = new Date(`${slot.date}T${slot.startTime}:00.000Z`).toISOString();
      estimatedEndDate = new Date(`${slot.date}T${slot.endTime}:00.000Z`).toISOString();
    } else {
      if (!manualDate) return setQuoteError("Indica una data di inizio stimata.");
      if (manualEndTime && !manualStartTime) return setQuoteError("Indica anche l'ora di inizio.");
      if (manualStartTime && manualEndTime && manualEndTime <= manualStartTime) return setQuoteError("L'ora di fine deve essere dopo l'ora di inizio.");
      if (manualStartTime) {
        estimatedStartDate = new Date(`${manualDate}T${manualStartTime}:00.000Z`).toISOString();
        estimatedEndDate = manualEndTime ? new Date(`${manualDate}T${manualEndTime}:00.000Z`).toISOString() : undefined;
      } else {
        estimatedStartDate = new Date(manualDate).toISOString();
      }
    }

    setIsSubmittingQuote(true);
    try {
      await apiClient.createQuote(token, { requestId: gr.id, items: parsed, estimatedStartDate, estimatedEndDate, notes: quoteNotes.trim() || undefined });
      setShowQuoteForm(false);
      onChanged();
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmittingQuote(false);
    }
  }

  async function handleConfirmDate() {
    if (!lead.quote) return;
    setIsConfirmingDate(true);
    try {
      await apiClient.confirmProposedQuoteDate(token, lead.quote.id);
      onChanged();
    } finally {
      setIsConfirmingDate(false);
    }
  }
  async function handleRejectDate() {
    if (!lead.quote) return;
    setIsRejectingDate(true);
    try {
      await apiClient.rejectProposedQuoteDate(token, lead.quote.id);
      onChanged();
    } finally {
      setIsRejectingDate(false);
    }
  }
  async function handleCounterPropose() {
    if (!lead.quote) return;
    let payload: { date: string; startTime: string; endTime: string; isManual?: boolean };
    if (modeAvailableSlots.length > 0 && !useManualCounterDateTime) {
      const slot = modeAvailableSlots.find((sl) => slotKey(sl) === counterSlotKey);
      if (!slot) return setCounterError("Scegli un orario dalla tua agenda.");
      payload = { date: slot.date, startTime: slot.startTime, endTime: slot.endTime };
    } else {
      if (!manualCounterDate) return setCounterError("Indica una data.");
      if (!manualCounterStartTime || !manualCounterEndTime) return setCounterError("Indica sia l'ora di inizio sia l'ora di fine.");
      if (manualCounterEndTime <= manualCounterStartTime) return setCounterError("L'ora di fine deve essere dopo l'ora di inizio.");
      payload = { date: manualCounterDate, startTime: manualCounterStartTime, endTime: manualCounterEndTime, isManual: true };
    }
    setCounterError(null);
    setIsCountering(true);
    try {
      await apiClient.counterProposeQuoteDate(token, lead.quote.id, { ...payload, note: counterNote.trim() || undefined });
      setShowCounterForm(false);
      onChanged();
    } catch (err) {
      setCounterError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsCountering(false);
    }
  }

  async function handleDecline() {
    setIsDeclining(true);
    try {
      await apiClient.declineLead(token, lead.id, declineNoteDraft.trim() || undefined);
      onChanged();
    } finally {
      setIsDeclining(false);
      setConfirmingDecline(false);
    }
  }

  async function handleWithdrawQuote() {
    if (!lead.quote) return;
    setIsWithdrawing(true);
    try {
      await apiClient.withdrawQuote(token, lead.quote.id);
      onChanged();
    } finally {
      setIsWithdrawing(false);
      setConfirmingWithdraw(false);
    }
  }

  async function handleComplete(input: CompleteBookingInput) {
    if (!booking) return;
    await apiClient.completeBooking(token, booking.id, input);
    setShowCompleteModal(false);
    // Subito dopo aver segnalato il lavoro terminato si apre il popup per
    // recensire il cliente (stesso comportamento già in uso in /dashboard).
    // Bug reale corretto: `onChanged()` non va chiamato qui — se il tab
    // attivo è "Accettate", ricaricare subito filtra via questa card (lo
    // stadio passa a "completata") chiudendo il popup di recensione un
    // istante dopo averlo aperto. Il reload va rimandato alla chiusura del
    // popup (submit o annulla, sotto).
    setShowClientReviewModal(true);
  }

  async function handleSubmitClientReview(input: { rating: number; comment?: string; mediaUrls: string[] }) {
    if (!booking) return;
    await apiClient.createClientReview(token, { bookingId: booking.id, ...input });
    setShowClientReviewModal(false);
    onChanged();
  }

  function closeClientReviewModal() {
    setShowClientReviewModal(false);
    // Il lavoro è comunque già stato segnalato come terminato — la lista va
    // aggiornata anche se il popup viene chiuso senza recensire, altrimenti
    // resterebbe visibile come "Accettata" finché non arriva il prossimo
    // poll periodico.
    onChanged();
  }

  async function handleCancelBooking(note: string | undefined) {
    if (!booking) return;
    await apiClient.cancelBookingByProfessional(token, booking.id, { note });
    setShowCancelModal(false);
    onChanged();
  }

  // Riapertura di una prenotazione annullata (richiesta esplicita
  // dell'utente: "una volta annullata dai la possibilità di riaprirla") —
  // stesso endpoint condiviso già in uso in /dashboard e /le-mie-richieste.
  const [isReopening, setIsReopening] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);
  async function handleReopenBooking() {
    if (!booking) return;
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

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await apiClient.deleteLead(token, lead.id);
      onChanged();
    } finally {
      setIsDeleting(false);
      setConfirmingDelete(false);
    }
  }

  async function handleSaveNote() {
    setIsSavingNote(true);
    try {
      await apiClient.updateLeadNote(token, lead.id, noteDraft);
    } finally {
      setIsSavingNote(false);
    }
  }

  return (
    <Surface borderLeftWidth={4} borderLeftColor={s.border} gap="$0" padding={0} overflow="hidden">
      <YStack padding="$4" gap="$2" cursor="pointer" onPress={onToggle} accessibilityRole="button">
        <XStack justifyContent="space-between" alignItems="flex-start" gap="$2" flexWrap="wrap">
          <XStack gap="$2" flexWrap="wrap">
            {/* Le richieste urgenti (costo lead maggiore, scadenza breve —
                vedi guided-requests.service) erano indistinguibili dalle
                normali: il badge rosso è la variante semantica prevista
                dal design system proprio per questo flusso. */}
            {gr.isUrgent ? <Badge variant="urgente">Urgente</Badge> : null}
            {/* Ordine invertito su richiesta esplicita dell'utente: lo stato
                della richiesta (StagePill) precede il badge di modalità
                (ServiceBadge, "A domicilio"/"Consulenza online"). */}
            <StagePill stage={stage} />
            <ServiceBadge online={isOnline} />
            {stage === "da_quotare" && leadDeadline ? <DeadlinePill deadline={leadDeadline} /> : null}
          </XStack>
          <YStack alignItems="flex-end">
            <Text fontSize={14} color={brand.grafite70}>
              Ricevuta {formatDateTime(lead.createdAt)}
            </Text>
            {/* Per una richiesta completata, l'importo finale (esatto, da
                "Lavoro terminato") sostituisce il range preventivato: è
                l'informazione rilevante a lavoro concluso — richiesta
                esplicita dell'utente. */}
            {stage === "completata" && booking?.finalAmountEurCents != null ? (
              <Text fontFamily="$body" fontWeight="800" fontSize={18} color={brand.grafite}>
                {formatEurCents(booking.finalAmountEurCents)}
              </Text>
            ) : priceRange && (priceRange.totalMinEurCents > 0 || priceRange.totalMaxEurCents > 0) ? (
              <Text fontFamily="$body" fontWeight="800" fontSize={18} color={brand.grafite}>
                {formatEurCents(priceRange.totalMinEurCents)}
                {priceRange.totalMaxEurCents !== priceRange.totalMinEurCents ? ` – ${formatEurCents(priceRange.totalMaxEurCents)}` : ""}
              </Text>
            ) : null}
          </YStack>
        </XStack>

        <Text fontFamily="$heading" fontWeight="800" fontSize={26} color={brand.grafite}>
          {clientName}
        </Text>
        <XStack alignItems="center" gap="$1">
          <Icon name="wrench" size={15} color={brand.grafite70} />
          <Text fontSize={16} color={brand.grafite70}>
            {gr.categoryLabel} · {gr.city}
          </Text>
        </XStack>
        <Text fontSize={16} color={brand.grafite} lineHeight={22}>
          {gr.description}
        </Text>
        <XStack alignItems="center" gap="$1">
          <Icon name="map-pin" size={14} color={brand.grafite70} />
          <Text fontSize={15} color={brand.grafite70}>
            {isOnline ? `Zona: ${gr.city}` : (revealedAddress ?? gr.city)}
          </Text>
        </XStack>
        {collapsedDateTime ? (
          <XStack alignItems="center" gap="$1">
            <Icon name="calendar" size={14} color={brand.grafite70} />
            <Text fontSize={15} fontWeight="700" color={brand.grafite}>
              {collapsedDateTime.label}: {collapsedDateTime.text}
            </Text>
          </XStack>
        ) : null}

        <XStack justifyContent="center" paddingTop="$1">
          <Icon name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={brand.grafite70} />
        </XStack>
      </YStack>

      {isOpen ? (
        <YStack paddingHorizontal="$4" paddingBottom="$4" gap="$4" borderTopWidth={1} borderTopColor={brand.filetto}>
          {stage === "modifica_richiesta" && lead.quote?.clientProposedDate ? (
            <YStack
              marginTop="$3"
              padding="$4"
              borderRadius={radiusDoc}
              backgroundColor="#FFF8E1"
              borderWidth={1.5}
              borderStyle="dashed"
              borderColor={brand.ottone}
              gap="$3"
            >
              <Text fontFamily="$body" fontWeight="800" fontSize={14} color="#8a5a00">
                Il cliente ha richiesto una modifica
              </Text>
              <XStack alignItems="center" gap="$2">
                <YStack flex={1} padding="$3" borderRadius={12} backgroundColor="#F5F5F5">
                  <Text fontSize={10.5} fontWeight="700" color={brand.grafite70} textTransform="uppercase">
                    Data originale
                  </Text>
                  <Text fontSize={13} color={brand.grafite70} textDecorationLine="line-through">
                    {formatSlotRange(lead.quote.estimatedStartDate, lead.quote.estimatedEndDate)}
                  </Text>
                </YStack>
                <Text fontSize={20} fontWeight="800" color={brand.ottone}>
                  →
                </Text>
                <YStack flex={1} padding="$3" borderRadius={12} backgroundColor={brand.calce} borderWidth={2} borderColor={brand.ottone}>
                  <Text fontSize={10.5} fontWeight="700" color={brand.ottone} textTransform="uppercase">
                    Nuova data richiesta
                  </Text>
                  <Text fontSize={13} fontWeight="800" color={brand.grafite}>
                    {formatSlotRange(lead.quote.clientProposedDate, lead.quote.clientProposedEndDate)}
                  </Text>
                </YStack>
              </XStack>
              {lead.quote.clientProposedNote ? (
                <YStack padding="$3" borderRadius={8} backgroundColor={brand.calce} borderLeftWidth={3} borderLeftColor={brand.ottone}>
                  <Text fontSize={13} color={brand.grafite}>
                    {lead.quote.clientProposedNote}
                  </Text>
                </YStack>
              ) : null}
            </YStack>
          ) : null}

          <XStack flexWrap="wrap" gap="$4" paddingTop="$3">
            {/* Sezione 1 — Dettagli cliente. Sfondo colorato (richiesta
                esplicita dell'utente: "fai visualizzare meglio la sezione
                dettagli cliente magari colorando lo sfondo") — stesso
                trattamento già in uso per "Sezione 3 — Preventivo" più
                sotto in questo file, per coerenza visiva tra le due
                sezioni "a riquadro" della card. */}
            <YStack
              flex={1}
              minWidth={260}
              gap="$2"
              padding="$3"
              borderRadius={radiusDoc}
              backgroundColor={brand.gesso}
              borderWidth={1}
              borderColor={brand.filetto}
            >
              <Text fontSize={11} fontWeight="800" color={brand.grafite70} textTransform="uppercase">
                Dettagli cliente
              </Text>
              {gr.clientAccountDeleted ? (
                <Text fontSize={13} color={brand.grafite70}>
                  L&apos;account di questo cliente è stato eliminato.
                </Text>
              ) : (
                <>
                  {/* Reso chiaramente cliccabile (richiesta esplicita
                      dell'utente: "il cliente deve avere ben visibile che
                      è cliccabile il nome del cliente per visualizzare le
                      informazioni come il rating") — prima era testo
                      grigio piatto, indistinguibile da un'etichetta
                      qualunque. Colore/sottolineatura da link + icona,
                      stesso principio "affordance visiva" già seguito
                      altrove nel sito per un controllo cliccabile senza
                      un bordo/pillola proprio. */}
                  <XStack
                    alignItems="center"
                    gap={4}
                    cursor="pointer"
                    alignSelf="flex-start"
                    accessibilityRole="button"
                    accessibilityLabel={`Vedi il profilo di ${clientName}`}
                    onPress={() => setShowClientProfile(true)}
                  >
                    <Text fontSize={14} fontWeight="700" color={brand.cianografia} textDecorationLine="underline">
                      {clientName}
                    </Text>
                    <Icon name="chevron-right" size={13} color={brand.cianografia} strokeWidth={2} />
                  </XStack>
                  {/* Nome e cognome del destinatario indicati sulla
                      richiesta (chi riceverà il professionista sul
                      lavoro, non necessariamente l'intestatario
                      dell'account — CLAUDE.md §16). Ordine della sezione
                      (nome → indirizzo → numero → e-mail, chat spostata
                      in fondo) e rimozione della dicitura "Riceverà il
                      professionista" (resta solo il nome): entrambe
                      richieste esplicite dell'utente. */}
                  {booking?.recipientName || booking?.recipientSurname ? (
                    <Text fontSize={13.5} fontWeight="700" color={brand.grafite}>
                      {[booking.recipientName, booking.recipientSurname].filter(Boolean).join(" ")}
                    </Text>
                  ) : null}
                  {/* Indirizzo cliccabile (link Google Maps, stesso
                      principio già in uso per tel:/mailto:/wa.me —
                      nessuna API a pagamento, solo un URL di apertura) —
                      spostato subito sotto il nome, richiesta esplicita
                      dell'utente. */}
                  {isOnline ? (
                    <Text fontSize={12.5} color={brand.grafite70}>
                      Zona: {gr.city} (indirizzo nascosto)
                    </Text>
                  ) : revealedAddress ? (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(revealedAddress)}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ textDecoration: "none" }}
                    >
                      <Text fontSize={12.5} fontWeight="600" color={brand.cianografia} textDecorationLine="underline">
                        {revealedAddress}
                      </Text>
                    </a>
                  ) : (
                    <Text fontSize={12.5} color={brand.grafite70}>
                      {gr.city}
                    </Text>
                  )}
                  {/* Numero cliccabile (tel:) con i tasti WhatsApp/Chiama
                      di fianco, non più in una riga separata più sotto —
                      richiesta esplicita dell'utente. */}
                  {revealedPhone ? (
                    <XStack alignItems="center" gap="$2" flexWrap="wrap">
                      <a href={`tel:${revealedPhone}`} style={{ textDecoration: "none" }}>
                        <Text fontSize={13} fontWeight="600" color={brand.cianografia} textDecorationLine="underline">
                          {revealedPhone}
                        </Text>
                      </a>
                      {whatsAppLink ? (
                        <a href={whatsAppLink} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                          <XStack paddingHorizontal="$2.5" paddingVertical={5} borderRadius={8} backgroundColor="#25d366">
                            <Text fontSize={11.5} fontWeight="700" color="white">
                              WhatsApp
                            </Text>
                          </XStack>
                        </a>
                      ) : null}
                      <a href={`tel:${revealedPhone}`} style={{ textDecoration: "none" }}>
                        <XStack paddingHorizontal="$2.5" paddingVertical={5} borderRadius={8} backgroundColor={brand.cianografia}>
                          <Text fontSize={11.5} fontWeight="700" color="white">
                            Chiama
                          </Text>
                        </XStack>
                      </a>
                    </XStack>
                  ) : null}
                  {revealedEmail ? (
                    <a href={`mailto:${revealedEmail}`} style={{ textDecoration: "none" }}>
                      <Text fontSize={13} fontWeight="600" color={brand.cianografia} textDecorationLine="underline">
                        {revealedEmail}
                      </Text>
                    </a>
                  ) : null}
                  {!booking ? (
                    <Text fontSize={12.5} color={brand.grafite70} fontStyle="italic">
                      Telefono, email e indirizzo saranno visibili qui ad accettazione del preventivo.
                    </Text>
                  ) : null}
                  {booking?.scheduledAt && (stage === "accettata" || stage === "completata" || stage === "annullata") ? (
                    <Text fontSize={12.5} fontWeight="700" color={brand.grafite} paddingTop="$1">
                      Intervento: {formatSlotRange(booking.scheduledAt, booking.scheduledEndAt)}
                    </Text>
                  ) : null}
                  {/* Tasto Chat spostato in fondo alla scheda "Dettagli
                      cliente" — richiesta esplicita dell'utente. */}
                  <XStack gap="$2" flexWrap="wrap" paddingTop="$1">
                    <XStack paddingHorizontal="$3" paddingVertical={8} borderRadius={8} backgroundColor={brand.cianografiaVelo} cursor="pointer" onPress={openTimeline} gap="$1" alignItems="center">
                      <Text fontSize={12.5} fontWeight="700" color={brand.cianografiaScuro}>
                        Chat
                      </Text>
                      <UnreadDot count={effectiveUnreadCount} />
                    </XStack>
                  </XStack>
                </>
              )}
            </YStack>

            {/* Sezione 2 — Descrizione lavoro */}
            <YStack flex={1} minWidth={260} gap="$2">
              <Text fontSize={11} fontWeight="800" color={brand.grafite70} textTransform="uppercase">
                Descrizione lavoro
              </Text>
              <Text fontSize={13.5} color={brand.grafite} lineHeight={19}>
                {gr.description}
              </Text>
              {gr.photoUrls.length > 0 ? (
                <XStack gap="$2" style={{ overflowX: "auto" }}>
                  {gr.photoUrls.map((url, i) => (
                    <YStack
                      key={url}
                      width={72}
                      height={72}
                      borderRadius={8}
                      overflow="hidden"
                      borderWidth={1}
                      borderColor={brand.filetto}
                      cursor="pointer"
                      onPress={() => setOpenPhotoIndex(i)}
                      accessibilityRole="button"
                      accessibilityLabel={`Apri foto ${i + 1}`}
                    >
                      <MediaPreview url={url} />
                    </YStack>
                  ))}
                </XStack>
              ) : null}
            </YStack>
          </XStack>

          {/* Sezione 3 — Preventivo */}
          {lead.quote ? (
            <YStack gap="$2" padding="$3" borderRadius={12} backgroundColor={brand.gesso} borderWidth={1} borderColor={brand.filetto}>
              <Text fontSize={13} fontWeight="800" color={brand.grafite}>
                {stage === "accettata" || stage === "completata" || stage === "annullata" ? "Preventivo accettato" : "Il tuo preventivo"}
              </Text>
              {lead.quote.items.map((item) => (
                <XStack key={item.id} justifyContent="space-between">
                  <Text fontSize={13} color={brand.grafite}>
                    {item.name}
                  </Text>
                  <Text fontSize={13} color={brand.grafite}>
                    {item.priceMinEurCents != null ? formatEurCents(item.priceMinEurCents) : "–"}
                    {item.priceMaxEurCents != null && item.priceMaxEurCents !== item.priceMinEurCents ? ` – ${formatEurCents(item.priceMaxEurCents)}` : ""}
                  </Text>
                </XStack>
              ))}
              {stage === "completata" && booking?.finalAmountEurCents != null ? (
                <XStack justifyContent="space-between" borderTopWidth={1} borderTopColor={brand.filetto} paddingTop={6} marginTop={2}>
                  <Text fontSize={13.5} fontWeight="800" color={brand.grafite}>
                    Importo finale
                  </Text>
                  <Text fontSize={13.5} fontWeight="800" color={brand.cianografiaScuro}>
                    {formatEurCents(booking.finalAmountEurCents)}
                  </Text>
                </XStack>
              ) : priceRange && (priceRange.totalMinEurCents > 0 || priceRange.totalMaxEurCents > 0) ? (
                <XStack justifyContent="space-between" borderTopWidth={1} borderTopColor={brand.filetto} paddingTop={6} marginTop={2}>
                  <Text fontSize={13.5} fontWeight="800" color={brand.grafite}>
                    Totale stimato
                  </Text>
                  <Text fontSize={13.5} fontWeight="800" color={brand.grafite}>
                    {formatEurCents(priceRange.totalMinEurCents)}
                    {priceRange.totalMaxEurCents !== priceRange.totalMinEurCents ? ` – ${formatEurCents(priceRange.totalMaxEurCents)}` : ""}
                  </Text>
                </XStack>
              ) : null}
            </YStack>
          ) : null}

          {/* Sezione 4 — Note personali */}
          <YStack gap="$2">
            <Text fontSize={12} fontWeight="700" color={brand.grafite}>
              Note personali (solo per te)
            </Text>
            <textarea
              ref={(el) => {
                noteTextareaRef.current = el;
                autoGrowNote(el);
              }}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={() => noteChanged && handleSaveNote()}
              placeholder="Es. portare il pezzo di ricambio, citofono guasto..."
              rows={2}
              style={{ width: "100%", padding: 8, borderRadius: radiusDoc, border: `1px solid ${brand.filetto}`, fontSize: 13, fontFamily: "inherit", color: brand.grafite, resize: "none", overflow: "hidden" }}
            />
            {noteChanged ? (
              <Button variant="secondary" size="$2" height={32} alignSelf="flex-start" disabled={isSavingNote} onPress={handleSaveNote}>
                {isSavingNote ? "Salvataggio..." : "Salva"}
              </Button>
            ) : null}
          </YStack>

          {/* Sezione 5 — Timeline mini */}
          {stage !== "scaduta" && stage !== "chiusa" ? (
            <YStack gap="$2">
              <Text fontSize={11} fontWeight="800" color={brand.grafite70} textTransform="uppercase">
                Andamento
              </Text>
              <MiniTimeline stage={stage} />
            </YStack>
          ) : null}

          {/* Sezione 6 — Azioni */}
          <YStack gap="$3" borderTopWidth={1} borderTopColor={brand.filetto} paddingTop="$3">
            {stage === "da_quotare" ? (
              <XStack gap="$2" flexWrap="wrap">
                <Button variant="primary" size="$3" onPress={() => setShowQuoteForm((v) => !v)}>
                  Invia preventivo
                </Button>
                <Button variant="ghost" size="$3" onPress={openTimeline}>
                  <XStack alignItems="center" gap="$1">
                    <Text fontFamily="$body" fontWeight="600" fontSize="$3">
                      Chat
                    </Text>
                    <UnreadDot count={effectiveUnreadCount} />
                  </XStack>
                </Button>
                {!confirmingDecline ? (
                  <Button variant="ghost" size="$3" onPress={() => setConfirmingDecline(true)}>
                    <Text color={brand.urgenza} fontWeight="700" fontSize="$3">
                      Rifiuta
                    </Text>
                  </Button>
                ) : null}
              </XStack>
            ) : null}

            {stage === "in_attesa" ? (
              <XStack gap="$2" flexWrap="wrap" alignItems="center">
                {/* Richiesta esplicita dell'utente: reso "più simile a un
                    pulsante" (prima variant="ghost", quasi solo testo) —
                    ottone/giallo, stesso token semantico già in uso per lo
                    stadio "modifica_richiesta"/"in attesa di modifica" in
                    tutto il resto di questa pagina. */}
                <Button
                  variant="secondary"
                  backgroundColor={brand.ottone}
                  size="$3"
                  onPress={() => {
                    if (!lead.quote) return;
                    setItems(lead.quote.items.map((it) => ({ name: it.name, priceMin: it.priceMinEurCents != null ? (it.priceMinEurCents / 100).toString() : "", priceMax: it.priceMaxEurCents != null ? (it.priceMaxEurCents / 100).toString() : "" })));
                    setQuoteNotes(lead.quote.notes ?? "");
                    setShowQuoteForm(true);
                  }}
                >
                  <Text color="white" fontWeight="700" fontSize="$3">
                    Modifica preventivo
                  </Text>
                </Button>
                <Button variant="primary" size="$3" onPress={openTimeline}>
                  <XStack alignItems="center" gap="$1">
                    <Text color="white" fontFamily="$body" fontWeight="600" fontSize="$3">
                      Contatta
                    </Text>
                    <UnreadDot count={effectiveUnreadCount} />
                  </XStack>
                </Button>
                {confirmingWithdraw ? (
                  <>
                    <Text fontSize="$2" color={brand.urgenza}>
                      Ritirare questo preventivo?
                    </Text>
                    <Button variant="urgent" size="$3" disabled={isWithdrawing} opacity={isWithdrawing ? 0.6 : 1} onPress={handleWithdrawQuote}>
                      {isWithdrawing ? "Ritiro..." : "Conferma"}
                    </Button>
                    <Button variant="ghost" size="$3" onPress={() => setConfirmingWithdraw(false)}>
                      Annulla
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" size="$3" onPress={() => setConfirmingWithdraw(true)}>
                    <Text color={brand.urgenza} fontWeight="600" fontSize="$3">
                      Ritira preventivo
                    </Text>
                  </Button>
                )}
              </XStack>
            ) : null}

            {stage === "modifica_richiesta" ? (
              <XStack gap="$2" flexWrap="wrap">
                <Button variant="secondary" size="$3" backgroundColor={brand.verificato} disabled={isConfirmingDate} onPress={handleConfirmDate}>
                  <Text color="white" fontWeight="700" fontSize="$3">
                    {isConfirmingDate ? "Conferma..." : "Accetta nuova data"}
                  </Text>
                </Button>
                <Button
                  variant="ghost"
                  size="$3"
                  onPress={() => {
                    const proposedDate = lead.quote?.clientProposedDate?.slice(0, 10);
                    const proposedTime = lead.quote?.clientProposedDate?.slice(11, 16);
                    const matching = modeAvailableSlots.find((sl) => sl.date === proposedDate && sl.startTime === proposedTime);
                    setCounterSlotKey(matching ? slotKey(matching) : modeAvailableSlots[0] ? slotKey(modeAvailableSlots[0]) : "");
                    setCounterNote("");
                    setCounterError(null);
                    setShowCounterForm((v) => !v);
                  }}
                >
                  Proponi altra data
                </Button>
                <Button variant="primary" size="$3" onPress={openTimeline}>
                  <XStack alignItems="center" gap="$1">
                    <Text color="white" fontFamily="$body" fontWeight="600" fontSize="$3">
                      Chat
                    </Text>
                    <UnreadDot count={effectiveUnreadCount} />
                  </XStack>
                </Button>
                <Button variant="ghost" size="$3" disabled={isRejectingDate} onPress={handleRejectDate}>
                  <Text color={brand.grafite70} fontSize="$3">
                    {isRejectingDate ? "..." : "Rifiuta la proposta"}
                  </Text>
                </Button>
              </XStack>
            ) : null}

            {stage === "accettata" || stage === "completata" || stage === "annullata" ? (
              <XStack gap="$2" flexWrap="wrap">
                {/* Stessi bottoni già in uso in /dashboard (AcceptedJobCard) —
                    richiesta esplicita dell'utente di implementarli identici
                    qui: "Lavoro terminato"/"Annulla intervento" finché la
                    prenotazione è CONFIRMED, "Recensisci il cliente" dopo il
                    completamento se non già recensito. */}
                {booking?.status === "CONFIRMED" ? (
                  <>
                    {/* Turchese su richiesta esplicita dell'utente — stesso hex
                        già in uso per lo stato "Completata" in STAGE_STYLE
                        sopra, coerenza cromatica tra il bottone che porta a
                        quello stato e lo stato stesso. */}
                    <Button
                      variant="secondary"
                      size="$3"
                      backgroundColor="#20B2AA"
                      borderColor="#20B2AA"
                      color="white"
                      hoverStyle={{ backgroundColor: "#1A8F89", borderColor: "#1A8F89" }}
                      pressStyle={{ backgroundColor: "#178077", borderColor: "#178077" }}
                      onPress={() => setShowCompleteModal(true)}
                    >
                      Lavoro terminato
                    </Button>
                    <Button variant="ghost" size="$3" onPress={() => setShowCancelModal(true)}>
                      <Text color={brand.urgenza} fontWeight="600" fontSize="$3">
                        Annulla intervento
                      </Text>
                    </Button>
                  </>
                ) : null}
                {booking?.status === "COMPLETED" && !booking.hasClientReview ? (
                  <Button variant="ghost" size="$3" onPress={() => setShowClientReviewModal(true)}>
                    <Text color={brand.cianografia} fontWeight="600" fontSize="$3">
                      Recensisci il cliente
                    </Text>
                  </Button>
                ) : null}
                {booking?.status === "CANCELED" ? (
                  <Button variant="secondary" backgroundColor={brand.verificato} size="$3" onPress={handleReopenBooking} disabled={isReopening} opacity={isReopening ? 0.6 : 1}>
                    <Text color="white" fontWeight="700" fontSize="$3">
                      {isReopening ? "Riapertura..." : "Riapri intervento"}
                    </Text>
                  </Button>
                ) : null}
                {/* Bug reale corretto: il link portava sempre alla data odierna
                    del calendario "Prenotazioni" invece che alla data vera
                    della prenotazione (spesso settimane avanti/indietro),
                    facendola sembrare assente dall'agenda. Il parametro
                    `?booking=` (letto da /dashboard/agenda) naviga alla data
                    esatta e apre subito il pannello di dettaglio. */}
                <Link href={booking ? `/dashboard/agenda?booking=${booking.id}` : "/dashboard/agenda"}>
                  <Button variant="secondary" backgroundColor={brand.verificato} size="$3">
                    <Text color="white" fontWeight="700" fontSize="$3">
                      Vedi in agenda
                    </Text>
                  </Button>
                </Link>
                <Button variant="ghost" size="$3" onPress={openTimeline}>
                  <XStack alignItems="center" gap="$1">
                    <Text color={brand.grafite} fontFamily="$body" fontWeight="600" fontSize="$3">
                      Contatta
                    </Text>
                    <UnreadDot count={effectiveUnreadCount} />
                  </XStack>
                </Button>
              </XStack>
            ) : null}
            {showCompleteModal && booking ? (
              <CompleteJobModal
                quotedItems={booking.items}
                onClose={() => setShowCompleteModal(false)}
                onComplete={handleComplete}
                uploadPhoto={(file) => apiClient.uploadBookingCompletionPhoto(token, file).then((r) => r.imageUrl)}
              />
            ) : null}
            {showClientReviewModal && booking ? (
              <ReviewModal
                title="Recensisci il cliente"
                subtitle="Com'è andato il lavoro con questo cliente? La tua recensione sarà visibile solo nella sua scheda."
                uploadPhoto={(file) => apiClient.uploadClientReviewPhoto(token, file).then((r) => r.imageUrl)}
                onSubmit={handleSubmitClientReview}
                onClose={closeClientReviewModal}
              />
            ) : null}
            {showCancelModal && booking ? <CancelBookingModal onClose={() => setShowCancelModal(false)} onCancel={handleCancelBooking} /> : null}
            {reopenError ? (
              <Text fontSize="$2" color={brand.urgenza}>
                {reopenError}
              </Text>
            ) : null}

            {(stage === "scaduta" || stage === "chiusa") && !canDelete ? (
              <Text fontSize={12.5} color={brand.grafite70}>
                {stage === "chiusa" ? describeClosedReason(lead) : "Questa richiesta è scaduta: la coda di riserva è stata già inoltrata ad altri professionisti."}
              </Text>
            ) : null}
            {(stage === "scaduta" || stage === "chiusa") && canDelete ? (
              !confirmingDelete ? (
                <Text fontSize={12.5} fontWeight="700" color={brand.urgenza} cursor="pointer" onPress={() => setConfirmingDelete(true)}>
                  {quoteWithdrawn ? "Elimina preventivo ritirato" : "Elimina richiesta"}
                </Text>
              ) : (
                <XStack gap="$2" alignItems="center">
                  <Text fontSize={12.5} color={brand.grafite70}>
                    Confermi l&apos;eliminazione?
                  </Text>
                  <Text fontSize={12.5} fontWeight="700" color={brand.urgenza} cursor="pointer" onPress={handleDelete}>
                    {isDeleting ? "..." : "Sì, elimina"}
                  </Text>
                  <Text fontSize={12.5} color={brand.grafite70} cursor="pointer" onPress={() => setConfirmingDelete(false)}>
                    Annulla
                  </Text>
                </XStack>
              )
            ) : null}
          </YStack>

          {/* Form invio/modifica preventivo */}
          {showQuoteForm ? (
            <YStack gap="$3" padding="$3" borderRadius={radiusDoc} backgroundColor={brand.gesso} borderWidth={1} borderColor={brand.filetto}>
              {items.map((item, index) => (
                <XStack key={index} gap="$2" alignItems="center" flexWrap="wrap">
                  <input value={item.name} onChange={(e) => updateItem(index, "name", e.target.value)} placeholder="Voce" style={{ ...smallInputStyle, flex: 1, minWidth: 140 }} />
                  <input value={item.priceMin} onChange={(e) => updateItem(index, "priceMin", e.target.value)} placeholder="Da €" inputMode="decimal" style={{ ...smallInputStyle, width: 80 }} />
                  <input value={item.priceMax} onChange={(e) => updateItem(index, "priceMax", e.target.value)} placeholder="A €" inputMode="decimal" style={{ ...smallInputStyle, width: 80 }} />
                  {items.length > 1 ? (
                    <XStack width={32} height={32} alignItems="center" justifyContent="center" borderWidth={1} borderColor={brand.urgenza} backgroundColor={brand.urgenzaVelo} borderRadius={8} cursor="pointer" onPress={() => removeItem(index)}>
                      <Icon name="x" size={14} color={brand.urgenza} />
                    </XStack>
                  ) : null}
                </XStack>
              ))}
              <Button variant="ghost" size="$2" alignSelf="flex-start" onPress={() => setItems((prev) => [...prev, { name: "", priceMin: "", priceMax: "" }])}>
                + Aggiungi voce
              </Button>

              {modeAvailableSlots.length > 0 && !useManualDateTime ? (
                <YStack gap="$2">
                  <select value={selectedSlotKey} onChange={(e) => setSelectedSlotKey(e.target.value)} style={smallInputStyle}>
                    {modeAvailableSlots.map((sl) => (
                      <option key={slotKey(sl)} value={slotKey(sl)}>
                        {slotLabel(sl)}
                      </option>
                    ))}
                  </select>
                  <Text
                    fontSize={12}
                    fontWeight="600"
                    color={brand.cianografia}
                    cursor="pointer"
                    accessibilityRole="button"
                    onPress={() => setUseManualDateTime(true)}
                  >
                    Inserisci data e orario manualmente
                  </Text>
                </YStack>
              ) : (
                <YStack gap="$2">
                  <XStack gap="$2" flexWrap="wrap">
                    <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} style={{ ...smallInputStyle, flex: 1, minWidth: 130 }} />
                    <input type="time" value={manualStartTime} onChange={(e) => setManualStartTime(e.target.value)} style={{ ...smallInputStyle, flex: 1, minWidth: 100 }} />
                    <input
                      type="time"
                      value={manualEndTime}
                      onChange={(e) => setManualEndTime(e.target.value)}
                      placeholder="Ora fine (facoltativa)"
                      style={{ ...smallInputStyle, flex: 1, minWidth: 100 }}
                    />
                  </XStack>
                  {/* Richiesta esplicita dell'utente: una data/orario inserita
                      a mano non fa parte delle fasce configurate in agenda —
                      comparirà comunque nel calendario "Prenotazioni" con
                      l'etichetta "In attesa" finché il cliente non accetta
                      il preventivo (vedi renderBookingDayColumn in
                      /dashboard/agenda). */}
                  <Text fontSize={11} color={brand.grafite70}>
                    Non fa parte della tua agenda — comparirà nel calendario &quot;Prenotazioni&quot; come &quot;In
                    attesa&quot; finché il cliente non accetta il preventivo.
                  </Text>
                  {modeAvailableSlots.length > 0 ? (
                    <Text
                      fontSize={12}
                      fontWeight="600"
                      color={brand.cianografia}
                      cursor="pointer"
                      accessibilityRole="button"
                      onPress={() => setUseManualDateTime(false)}
                    >
                      Usa un orario dalla mia agenda
                    </Text>
                  ) : null}
                </YStack>
              )}

              <textarea value={quoteNotes} onChange={(e) => setQuoteNotes(e.target.value)} placeholder="Messaggio per il cliente (facoltativo)" rows={2} style={{ ...smallInputStyle, resize: "vertical" }} />

              {quoteError ? (
                <Text color={brand.urgenza} fontSize={13}>
                  {quoteError}
                </Text>
              ) : null}

              <XStack gap="$2">
                <Button variant="primary" size="$3" disabled={isSubmittingQuote} onPress={handleSendQuote}>
                  {isSubmittingQuote ? "Invio..." : "Invia preventivo"}
                </Button>
                <Button variant="ghost" size="$3" onPress={() => setShowQuoteForm(false)}>
                  Annulla
                </Button>
              </XStack>
            </YStack>
          ) : null}

          {/* Form "proponi altra data" (contro-proposta) */}
          {showCounterForm ? (
            <YStack gap="$3" padding="$3" borderRadius={radiusDoc} backgroundColor={brand.gesso} borderWidth={1} borderColor={brand.filetto}>
              {modeAvailableSlots.length > 0 && !useManualCounterDateTime ? (
                <YStack gap="$2">
                  <select value={counterSlotKey} onChange={(e) => setCounterSlotKey(e.target.value)} style={smallInputStyle}>
                    {modeAvailableSlots.map((sl) => (
                      <option key={slotKey(sl)} value={slotKey(sl)}>
                        {slotLabel(sl)}
                      </option>
                    ))}
                  </select>
                  <Text
                    fontSize={12}
                    fontWeight="600"
                    color={brand.cianografia}
                    cursor="pointer"
                    accessibilityRole="button"
                    onPress={() => setUseManualCounterDateTime(true)}
                  >
                    Inserisci data e orario manualmente
                  </Text>
                </YStack>
              ) : (
                <YStack gap="$2">
                  <XStack gap="$2" flexWrap="wrap">
                    <input type="date" value={manualCounterDate} onChange={(e) => setManualCounterDate(e.target.value)} style={{ ...smallInputStyle, flex: 1, minWidth: 130 }} />
                    <input type="time" value={manualCounterStartTime} onChange={(e) => setManualCounterStartTime(e.target.value)} style={{ ...smallInputStyle, flex: 1, minWidth: 100 }} />
                    <input type="time" value={manualCounterEndTime} onChange={(e) => setManualCounterEndTime(e.target.value)} style={{ ...smallInputStyle, flex: 1, minWidth: 100 }} />
                  </XStack>
                  {/* Richiesta esplicita dell'utente: la nuova data può non
                      far parte delle fasce configurate in agenda — comparirà
                      comunque sul calendario "Prenotazioni" come "In attesa"
                      finché il cliente non accetta (stesso principio già
                      seguito per la data manuale del primo preventivo). */}
                  <Text fontSize={11} color={brand.grafite70}>
                    Comparirà in agenda come &quot;In attesa&quot; finché il cliente non accetta.
                  </Text>
                  {modeAvailableSlots.length > 0 ? (
                    <Text
                      fontSize={12}
                      fontWeight="600"
                      color={brand.cianografia}
                      cursor="pointer"
                      accessibilityRole="button"
                      onPress={() => setUseManualCounterDateTime(false)}
                    >
                      Usa un orario dalla mia agenda
                    </Text>
                  ) : null}
                </YStack>
              )}
              <textarea value={counterNote} onChange={(e) => setCounterNote(e.target.value)} placeholder="Nota per il cliente (facoltativa)" rows={2} style={{ ...smallInputStyle, resize: "vertical" }} />
              {counterError ? (
                <Text color={brand.urgenza} fontSize={13}>
                  {counterError}
                </Text>
              ) : null}
              <XStack gap="$2">
                <Button variant="primary" size="$3" disabled={isCountering} onPress={handleCounterPropose}>
                  {isCountering ? "Invio..." : "Invia nuova proposta"}
                </Button>
                <Button variant="ghost" size="$3" onPress={() => setShowCounterForm(false)}>
                  Annulla
                </Button>
              </XStack>
            </YStack>
          ) : null}

          {/* Conferma rifiuto lead */}
          {confirmingDecline ? (
            <YStack gap="$2" padding="$3" borderRadius={radiusDoc} backgroundColor={brand.urgenzaVelo} borderWidth={1} borderColor={brand.urgenza}>
              <textarea
                value={declineNoteDraft}
                onChange={(e) => setDeclineNoteDraft(e.target.value)}
                placeholder="Nota per il cliente (facoltativa)"
                rows={2}
                style={{ ...smallInputStyle, resize: "vertical", backgroundColor: brand.calce }}
              />
              <XStack gap="$2">
                <Button variant="urgent" size="$3" disabled={isDeclining} onPress={handleDecline}>
                  {isDeclining ? "..." : "Conferma rifiuto"}
                </Button>
                <Button variant="ghost" size="$3" onPress={() => setConfirmingDecline(false)}>
                  Annulla
                </Button>
              </XStack>
            </YStack>
          ) : null}
        </YStack>
      ) : null}

      {showClientProfile ? (
        <ClientProfileModal
          name={clientName}
          birthDate={gr.clientBirthDate}
          imageUrl={gr.clientImageUrl}
          reviews={gr.clientReviews}
          token={token}
          onClose={() => setShowClientProfile(false)}
        />
      ) : null}
      {showTimeline && myProfileId ? (
        <TimelineModal
          token={token}
          guidedRequestId={gr.id}
          professionalProfileId={myProfileId}
          viewerRole="PROFESSIONAL"
          otherPartyName={gr.clientName}
          onClose={() => setShowTimeline(false)}
        />
      ) : null}
      {openPhotoIndex !== null ? <PhotoLightbox photos={gr.photoUrls} initialIndex={openPhotoIndex} onClose={() => setOpenPhotoIndex(null)} /> : null}
    </Surface>
  );
}
