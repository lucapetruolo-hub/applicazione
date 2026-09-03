"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  buildWhatsAppLink,
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
import { unreadGuidedRequestCounts } from "@/lib/notificationSections";
import { UnreadDot } from "@/components/UnreadDot";

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
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
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

// Palette per gli stati — richiesta esplicita dell'utente dopo aver visto la
// pagina reale, con riferimento visivo puntuale (arancione/da quotare,
// blu/in attesa, verde/accettata, rosso/scadute): eccezione deliberata alla
// palette chiusa "Vicinato" (CLAUDE.md §19) solo per questi 6 indicatori di
// stato — stessa logica già usata altrove nel progetto per un'eccezione
// puntuale e circoscritta (es. CLAUDE.md §31, emoji nell'eyebrow home). Hex
// letterali locali a questa pagina, non toccano `packages/ui/tokens.ts` né
// le 4 varianti fisse di `Badge` (quelle restano semantiche "verificato/
// pro/urgente/nuovo" per il resto del sito).
const STAGE_STYLE: Record<RequestStage, { label: string; icon: import("@professionisti/ui").IconName; fg: string; bg: string; border: string }> = {
  da_quotare: { label: "Da quotare", icon: "zap", fg: "#B8860B", bg: "#FFF3D6", border: "#FF6B35" },
  // "In attesa" da solo era ambiguo sulla singola card (segnalato in
  // revisione UX: "il pro ha già inviato il preventivo, in attesa di
  // chi?") — la pillola sulla card ora lo dice esplicitamente, il tab
  // resta "In attesa" (spazio ridotto nella riga a scorrimento, stesso
  // significato).
  in_attesa: { label: "In attesa del cliente", icon: "clock", fg: "#0D6EFD", bg: "#E7F1FF", border: "#0D6EFD" },
  modifica_richiesta: { label: "Modifica richiesta", icon: "rotate-ccw", fg: "#8a5a00", bg: "#FFF4E0", border: brand.ottone },
  accettata: { label: "Accettata", icon: "check", fg: "#28A745", bg: "#E6F4EA", border: "#28A745" },
  completata: { label: "Completata", icon: "check", fg: brand.grafite70, bg: brand.gesso, border: brand.grafite70 },
  scaduta: { label: "Scaduta", icon: "clock", fg: "#DC3545", bg: "#FBEAEA", border: "#DC3545" },
  chiusa: { label: "Chiusa", icon: "x", fg: brand.grafite70, bg: brand.gesso, border: brand.filetto },
};

const TABS: { key: "tutte" | RequestStage; label: string }[] = [
  { key: "tutte", label: "Tutte" },
  { key: "da_quotare", label: "Da quotare" },
  { key: "in_attesa", label: "In attesa" },
  { key: "modifica_richiesta", label: "Modifiche" },
  { key: "accettata", label: "Accettate" },
  { key: "scaduta", label: "Scadute" },
];

type SortMode = "recenti" | "vecchie" | "prezzo";

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
  return <RichiesteContent />;
}

function RichiesteContent() {
  const { token, isLoading, markNotificationsRead } = useAuth();
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

  function reloadLeads() {
    if (!token) return;
    apiClient.myLeads(token).then(setLeads);
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

  useEffect(() => {
    if (!token) return;
    apiClient
      .unreadNotifications(token)
      .then((notifications) => setLeadUnreadCounts(unreadGuidedRequestCounts(notifications)))
      .catch(() => {})
      .finally(() => markNotificationsRead());
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
      list = list.filter((l) => (l.guidedRequest.clientName ?? "").toLowerCase().includes(q) || (l.guidedRequest.address ?? "").toLowerCase().includes(q));
    }
    list = [...list];
    if (sortMode === "vecchie") list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    else if (sortMode === "recenti") list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else if (sortMode === "prezzo") {
      list.sort((a, b) => {
        const ra = a.quote ? quotePriceTotals(a.quote.items) : null;
        const rb = b.quote ? quotePriceTotals(b.quote.items) : null;
        const va = ra && (ra.totalMinEurCents > 0 || ra.totalMaxEurCents > 0) ? ra.totalMinEurCents : Infinity;
        const vb = rb && (rb.totalMinEurCents > 0 || rb.totalMaxEurCents > 0) ? rb.totalMinEurCents : Infinity;
        return va - vb;
      });
    }
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
            <option value="recenti">Ordina: Più recenti</option>
            <option value="vecchie">Più vecchie</option>
            <option value="prezzo">Prezzo crescente</option>
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
              <RequestCard
                key={lead.id}
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
  const [fallbackDate, setFallbackDate] = useState("");
  const [quoteNotes, setQuoteNotes] = useState("");
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isSubmittingQuote, setIsSubmittingQuote] = useState(false);

  const [showCounterForm, setShowCounterForm] = useState(false);
  const [counterSlotKey, setCounterSlotKey] = useState(modeAvailableSlots[0] ? slotKey(modeAvailableSlots[0]) : "");
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

  const [noteDraft, setNoteDraft] = useState(lead.professionalNote ?? "");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const noteChanged = noteDraft !== (lead.professionalNote ?? "");

  const clientName = gr.clientAccountDeleted ? "Account eliminato" : (gr.clientName ?? "Cliente");
  const whatsAppLink = buildWhatsAppLink(gr.clientPhone);
  const quoteWithdrawn = lead.quote?.status === "WITHDRAWN";
  const canDelete = gr.clientAccountDeleted || quoteWithdrawn;

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
    if (modeAvailableSlots.length > 0) {
      const slot = modeAvailableSlots.find((sl) => slotKey(sl) === selectedSlotKey);
      if (!slot) return setQuoteError("Scegli un orario dalla tua agenda.");
      estimatedStartDate = new Date(`${slot.date}T${slot.startTime}:00.000Z`).toISOString();
      estimatedEndDate = new Date(`${slot.date}T${slot.endTime}:00.000Z`).toISOString();
    } else {
      if (!fallbackDate) return setQuoteError("Indica una data di inizio stimata.");
      estimatedStartDate = new Date(fallbackDate).toISOString();
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
    const slot = modeAvailableSlots.find((sl) => slotKey(sl) === counterSlotKey);
    if (!slot) return setCounterError("Scegli un orario dalla tua agenda.");
    setCounterError(null);
    setIsCountering(true);
    try {
      await apiClient.counterProposeQuoteDate(token, lead.quote.id, { date: slot.date, startTime: slot.startTime, endTime: slot.endTime, note: counterNote.trim() || undefined });
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
    setShowClientReviewModal(true);
    onChanged();
  }

  async function handleSubmitClientReview(input: { rating: number; comment?: string; mediaUrls: string[] }) {
    if (!booking) return;
    await apiClient.createClientReview(token, { bookingId: booking.id, ...input });
    setShowClientReviewModal(false);
    onChanged();
  }

  async function handleCancelBooking(note: string | undefined) {
    if (!booking) return;
    await apiClient.cancelBookingByProfessional(token, booking.id, { note });
    setShowCancelModal(false);
    onChanged();
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
            <ServiceBadge online={isOnline} />
            <StagePill stage={stage} />
            {stage === "da_quotare" && leadDeadline ? <DeadlinePill deadline={leadDeadline} /> : null}
          </XStack>
          <YStack alignItems="flex-end">
            <Text fontSize={14} color={brand.grafite70}>
              Ricevuta {formatDate(lead.createdAt)}
            </Text>
            {priceRange && (priceRange.totalMinEurCents > 0 || priceRange.totalMaxEurCents > 0) ? (
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
            {isOnline ? `Zona: ${gr.city}` : gr.address || gr.city}
          </Text>
        </XStack>

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
            {/* Sezione 1 — Dettagli cliente */}
            <YStack flex={1} minWidth={260} gap="$2">
              <Text fontSize={11} fontWeight="800" color={brand.grafite70} textTransform="uppercase">
                Dettagli cliente
              </Text>
              {gr.clientAccountDeleted ? (
                <Text fontSize={13} color={brand.grafite70}>
                  L&apos;account di questo cliente è stato eliminato.
                </Text>
              ) : (
                <>
                  <Text fontSize={13} color={brand.grafite} cursor="pointer" onPress={() => setShowClientProfile(true)}>
                    {clientName}
                  </Text>
                  {gr.clientPhone ? (
                    <Text fontSize={13} color={brand.grafite70}>
                      {gr.clientPhone}
                    </Text>
                  ) : null}
                  {gr.clientEmail ? (
                    <Text fontSize={13} color={brand.grafite70}>
                      {gr.clientEmail}
                    </Text>
                  ) : null}
                  <XStack gap="$2" flexWrap="wrap" paddingTop="$1">
                    {whatsAppLink ? (
                      <a href={whatsAppLink} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                        <XStack paddingHorizontal="$3" paddingVertical={8} borderRadius={8} backgroundColor="#25d366">
                          <Text fontSize={12.5} fontWeight="700" color="white">
                            WhatsApp
                          </Text>
                        </XStack>
                      </a>
                    ) : null}
                    {gr.clientPhone ? (
                      <a href={`tel:${gr.clientPhone}`} style={{ textDecoration: "none" }}>
                        <XStack paddingHorizontal="$3" paddingVertical={8} borderRadius={8} backgroundColor={brand.cianografia}>
                          <Text fontSize={12.5} fontWeight="700" color="white">
                            Chiama
                          </Text>
                        </XStack>
                      </a>
                    ) : null}
                    <XStack paddingHorizontal="$3" paddingVertical={8} borderRadius={8} backgroundColor={brand.cianografiaVelo} cursor="pointer" onPress={() => setShowTimeline(true)}>
                      <Text fontSize={12.5} fontWeight="700" color={brand.cianografiaScuro}>
                        Chat
                      </Text>
                    </XStack>
                  </XStack>
                </>
              )}
              {isOnline ? (
                <YStack paddingTop="$2" gap={2}>
                  <Text fontSize={12.5} color={brand.grafite70}>
                    Zona: {gr.city} (indirizzo nascosto)
                  </Text>
                </YStack>
              ) : gr.address ? (
                <Text fontSize={12.5} color={brand.grafite70} paddingTop="$2">
                  {gr.address}, {gr.city}
                </Text>
              ) : null}
              {booking?.scheduledAt && (stage === "accettata" || stage === "completata") ? (
                <Text fontSize={12.5} fontWeight="700" color={brand.grafite} paddingTop="$1">
                  Intervento: {formatSlotRange(booking.scheduledAt, booking.scheduledEndAt)}
                </Text>
              ) : null}
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
                {stage === "accettata" || stage === "completata" ? "Preventivo accettato" : "Il tuo preventivo"}
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
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={() => noteChanged && handleSaveNote()}
              placeholder="Es. portare il pezzo di ricambio, citofono guasto..."
              rows={2}
              style={{ width: "100%", padding: 8, borderRadius: radiusDoc, border: `1px solid ${brand.filetto}`, fontSize: 13, fontFamily: "inherit", color: brand.grafite, resize: "vertical" }}
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
                <Button variant="ghost" size="$3" onPress={() => setShowTimeline(true)}>
                  Rispondi
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
                <Button
                  variant="ghost"
                  size="$3"
                  onPress={() => {
                    if (!lead.quote) return;
                    setItems(lead.quote.items.map((it) => ({ name: it.name, priceMin: it.priceMinEurCents != null ? (it.priceMinEurCents / 100).toString() : "", priceMax: it.priceMaxEurCents != null ? (it.priceMaxEurCents / 100).toString() : "" })));
                    setQuoteNotes(lead.quote.notes ?? "");
                    setShowQuoteForm(true);
                  }}
                >
                  Modifica preventivo
                </Button>
                <Button variant="primary" size="$3" onPress={() => setShowTimeline(true)}>
                  <XStack alignItems="center" gap="$1">
                    <Text color="white" fontFamily="$body" fontWeight="600" fontSize="$3">
                      Contatta
                    </Text>
                    <UnreadDot count={unreadCount} />
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
                <Button variant="primary" size="$3" onPress={() => setShowTimeline(true)}>
                  Rispondi
                </Button>
                <Button variant="ghost" size="$3" disabled={isRejectingDate} onPress={handleRejectDate}>
                  <Text color={brand.grafite70} fontSize="$3">
                    {isRejectingDate ? "..." : "Rifiuta la proposta"}
                  </Text>
                </Button>
              </XStack>
            ) : null}

            {stage === "accettata" || stage === "completata" ? (
              <XStack gap="$2" flexWrap="wrap">
                {/* Stessi bottoni già in uso in /dashboard (AcceptedJobCard) —
                    richiesta esplicita dell'utente di implementarli identici
                    qui: "Lavoro terminato"/"Annulla intervento" finché la
                    prenotazione è CONFIRMED, "Recensisci il cliente" dopo il
                    completamento se non già recensito. */}
                {booking?.status === "CONFIRMED" ? (
                  <>
                    <Button variant="secondary" size="$3" onPress={() => setShowCompleteModal(true)}>
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
                <Link href="/dashboard/agenda">
                  <Button variant="secondary" backgroundColor={brand.verificato} size="$3">
                    <Text color="white" fontWeight="700" fontSize="$3">
                      Vedi in agenda
                    </Text>
                  </Button>
                </Link>
                <Button variant="ghost" size="$3" onPress={() => setShowTimeline(true)}>
                  <XStack alignItems="center" gap="$1">
                    <Text color={brand.grafite} fontFamily="$body" fontWeight="600" fontSize="$3">
                      Contatta
                    </Text>
                    <UnreadDot count={unreadCount} />
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
                onClose={() => setShowClientReviewModal(false)}
              />
            ) : null}
            {showCancelModal && booking ? <CancelBookingModal onClose={() => setShowCancelModal(false)} onCancel={handleCancelBooking} /> : null}

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

              {modeAvailableSlots.length > 0 ? (
                <select value={selectedSlotKey} onChange={(e) => setSelectedSlotKey(e.target.value)} style={smallInputStyle}>
                  {modeAvailableSlots.map((sl) => (
                    <option key={slotKey(sl)} value={slotKey(sl)}>
                      {slotLabel(sl)}
                    </option>
                  ))}
                </select>
              ) : (
                <input type="date" value={fallbackDate} onChange={(e) => setFallbackDate(e.target.value)} style={smallInputStyle} />
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
              {modeAvailableSlots.length > 0 ? (
                <select value={counterSlotKey} onChange={(e) => setCounterSlotKey(e.target.value)} style={smallInputStyle}>
                  {modeAvailableSlots.map((sl) => (
                    <option key={slotKey(sl)} value={slotKey(sl)}>
                      {slotLabel(sl)}
                    </option>
                  ))}
                </select>
              ) : (
                <Text fontSize={13} color={brand.grafite70}>
                  Nessuna fascia libera nella tua agenda nei prossimi 14 giorni.
                </Text>
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
        <ClientProfileModal name={clientName} phone={gr.clientPhone} email={gr.clientEmail} imageUrl={gr.clientImageUrl} reviews={gr.clientReviews} onClose={() => setShowClientProfile(false)} />
      ) : null}
      {showTimeline && myProfileId ? (
        <TimelineModal token={token} guidedRequestId={gr.id} professionalProfileId={myProfileId} viewerRole="PROFESSIONAL" onClose={() => setShowTimeline(false)} />
      ) : null}
      {openPhotoIndex !== null ? <PhotoLightbox photos={gr.photoUrls} initialIndex={openPhotoIndex} onClose={() => setOpenPhotoIndex(null)} /> : null}
    </Surface>
  );
}
