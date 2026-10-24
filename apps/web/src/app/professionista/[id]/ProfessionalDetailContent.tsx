"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BRAND, PROFESSIONAL_CATEGORIES, STRIPE_VERIFIED_BADGE, TRADER_STATUS_COPY, formatServicePriceRange, subTagLabel, type ProfessionalAgenda, type ProfessionalDetail } from "@professionisti/shared";
import { Badge, BadgeInfo, Button, ProfessionalKindBadge, Chip, EmptyState, Icon, PriceLine, Rating, Surface, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { IconActionButton } from "@/components/IconActionButton";
import { ProfessionalAvatar } from "@/components/ProfessionalAvatar";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { ProfileQuoteCta } from "@/components/ProfileQuoteCta";
import { MediaPreview } from "@/components/MediaPreview";
import { ReportContentModal } from "@/components/ReportContentModal";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { hasRecentlyReported, markReported } from "@/lib/reportedContent";

// Colonne fisse Oggi + 3 giorni (stessa griglia della mini-agenda di ricerca,
// vedi ProfessionalCard in packages/ui) — qui costruita a partire dai giorni
// già disponibili in agenda.days (circa due mesi, PUBLIC_AGENDA_DAYS), senza
// bisogno di una ricerca aggiuntiva se non c'è disponibilità nella finestra:
// il primo orario libero è cercato nello stesso payload già scaricato.
const AGENDA_PREVIEW_DAYS = 4;
// Larghezza MASSIMA di una colonna: le colonne si dividono lo spazio in parti
// uguali (flex 1 + flexBasis 0) senza superare questo valore. Bug reali
// corretti: con colonne fisse da 90px la griglia usciva dallo schermo dei
// telefoni stretti; con colonne fisse da 78px gli orari andavano su due
// righe e la fascia barrata usciva dalla scheda (docs/CHANGELOG.md §227).
const AGENDA_COLUMN_WIDTH = 96;
const WEEKDAY_SHORT_LABELS = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
const MONTH_SHORT_LABELS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

function agendaDayLabel(offset: number, dayOfWeek: number): string {
  if (offset === 0) return "Oggi";
  if (offset === 1) return "Domani";
  return WEEKDAY_SHORT_LABELS[dayOfWeek]!;
}

function agendaDateLabel(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  return `${date.getUTCDate()} ${MONTH_SHORT_LABELS[date.getUTCMonth()]}`;
}

/**
 * "Risponde in genere entro..." (CEO, consiglio esperti — CPO: segnale di
 * fiducia già calcolato in `ProfessionalMetrics.avgResponseTimeMinutes` per
 * il solo ranking interno, mai mostrato prima al cliente). Arrotonda alla
 * granularità più leggibile invece di mostrare sempre minuti grezzi (es.
 * "entro 2 giorni", non "entro 2880 minuti").
 */
function formatResponseTime(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} minuti`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} ${Math.round(minutes / 60) === 1 ? "ora" : "ore"}`;
  const days = Math.round(minutes / (24 * 60));
  return `${days} ${days === 1 ? "giorno" : "giorni"}`;
}

/** Data relativa per le recensioni — stesso principio già in uso in
 * `NotificationBell.tsx`, non condiviso da lì (granularità diversa: qui
 * basta il giorno, mai i minuti/ore di una notifica). */
function reviewTimeAgo(iso: string): string {
  const diffDays = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (diffDays < 1) return "oggi";
  if (diffDays === 1) return "ieri";
  if (diffDays < 30) return `${diffDays} giorni fa`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths} ${diffMonths === 1 ? "mese" : "mesi"} fa`;
  return new Date(iso).toLocaleDateString("it-IT", { month: "short", year: "numeric" });
}

/**
 * `preview`: anteprima del proprio profilo in "Profilo pubblico"
 * (docs/CHANGELOG.md §252). Si vede come la vede un cliente, ma senza le sue
 * azioni (salva, condividi, segnala, richiedi preventivo) e senza contare la
 * visita.
 */
export function ProfessionalDetailContent({
  professional,
  preview = false,
  breadcrumbs,
}: {
  professional: ProfessionalDetail;
  preview?: boolean;
  /** Percorso "Home › Categoria › Città › Nome" sopra la scheda (solo pagina pubblica). */
  breadcrumbs?: ReactNode;
}) {
  const { user, token, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();
  const [isSaved, setIsSaved] = useState(false);

  // Visita al profilo (CLAUDE.md §8, dati comparativi in Home "Oggi",
  // docs/CHANGELOG.md §147): una sola per scheda del browser e per profilo.
  // Si aspetta la sessione così il server riconosce il titolare che guarda
  // il proprio profilo e non la conta. Mai bloccante: errori ignorati.
  useEffect(() => {
    if (isAuthLoading || preview) return;
    const key = `profile_view:${professional.id}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // sessionStorage non disponibile: si conta comunque una volta per montaggio.
    }
    apiClient.recordProfileView(professional.id, token ?? undefined).catch(() => undefined);
  }, [isAuthLoading, preview, professional.id, token]);
  const [isSaving, setIsSaving] = useState(false);
  const [agenda, setAgenda] = useState<ProfessionalAgenda | null>(null);
  const [lightbox, setLightbox] = useState<{ photos: string[]; index: number } | null>(null);
  // Segnalazione contenuti (richiesta esplicita dell'utente, "Verbale di
  // Conformità" — notice-and-action, DSA art. 16): profilo o singola
  // recensione, uno stato solo (mai due modali aperti insieme).
  const [reportTarget, setReportTarget] = useState<{ targetType: "PROFESSIONAL_PROFILE" | "REVIEW"; targetId: string; label: string } | null>(null);
  // Tasti "Segnala" già usati da questo browser nelle ultime 24 ore
  // (richiesta esplicita dell'utente: "disabilita il tasto per evitare
  // abusi di spam") — chiave composita `targetType:targetId`, letta una
  // sola volta da localStorage al mount (profilo + ogni recensione già
  // caricata) e aggiornata subito dopo un invio riuscito, senza aspettare
  // un reload. Il backend (`ContentReportsService.create`, 409) resta
  // comunque l'unica fonte di verità autoritativa: questo stato è solo un
  // feedback immediato lato client, che regge anche browser diversi o
  // localStorage cancellato (il tasto tornerebbe attivo, ma un secondo
  // invio verrebbe comunque rifiutato dal server).
  const [reportedKeys, setReportedKeys] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (typeof window === "undefined") return initial;
    if (hasRecentlyReported("PROFESSIONAL_PROFILE", professional.id)) initial.add(`PROFESSIONAL_PROFILE:${professional.id}`);
    for (const review of professional.reviews) {
      if (hasRecentlyReported("REVIEW", review.id)) initial.add(`REVIEW:${review.id}`);
    }
    return initial;
  });

  // Ogni fascia (esatta o generica) apre sempre la richiesta di preventivo
  // precompilata — richiesta esplicita dell'utente: nessuna prenotazione
  // istantanea da qui, a prescindere dalla capienza impostata dal
  // professionista. `allDays` sono tutti i giorni già scaricati (circa due
  // mesi, getPublicAgenda): la griglia ne mostra AGENDA_PREVIEW_DAYS alla
  // volta, con frecce avanti/indietro per scorrere senza una richiesta di
  // rete aggiuntiva (richiesta esplicita dell'utente).
  // Tab "A domicilio"/"Online" (richiesta esplicita dell'utente, stesso
  // pattern della mini-agenda di ricerca): filtrano gli orari mostrati sotto
  // in base alla modalità offerta su ogni fascia (slot.home/slot.online,
  // null quando quel tipo non è offerto). Preselezionato da "Online" quando
  // si arriva da una ricerca già impostata su quella modalità (`?modalita=
  // ONLINE`, aggiunto da ResultsListWithMap al click sulla card — richiesta
  // esplicita dell'utente: "una volta che si clicca sul profilo, fai
  // visualizzare l'agenda già nella sezione online"), altrimenti "A
  // domicilio" come sempre. Resta comunque modificabile con i due tab.
  const searchParams = useSearchParams();
  const initialAgendaMode: "HOME" | "ONLINE" = searchParams.get("modalita") === "ONLINE" ? "ONLINE" : "HOME";
  const [agendaMode, setAgendaMode] = useState<"HOME" | "ONLINE">(initialAgendaMode);

  const agendaPreview = useMemo(() => {
    if (!agenda) return null;
    const allDays = agenda.days.map((day, offset) => ({
      date: day.date,
      label: agendaDayLabel(offset, day.dayOfWeek),
      dateLabel: agendaDateLabel(day.date),
      slots: [...day.slots].sort((a, b) => a.startTime.localeCompare(b.startTime)),
    }));
    const hasAnySlot = allDays.some((day) => day.slots.length > 0);
    return { allDays, hasAnySlot };
  }, [agenda]);

  const isSlotAvailable = (slot: ProfessionalAgenda["days"][number]["slots"][number]) => {
    const mode = agendaMode === "HOME" ? slot.home : slot.online;
    return mode !== null && mode.bookedCount < mode.maxBookings;
  };

  const [agendaWindowOffset, setAgendaWindowOffset] = useState(0);

  // Arrivo dalla scheda nei risultati di ricerca con un clic sull'agenda
  // (`?data=AAAA-MM-GG`, richiesta esplicita dell'utente, docs/CHANGELOG.md
  // §206): la griglia parte da quel giorno e la pagina scorre fino
  // all'agenda. Fatto qui e non con il solo `#agenda` perché l'agenda arriva
  // dopo il caricamento della pagina e il browser non trova ancora l'ancora.
  const requestedAgendaDate = searchParams.get("data");
  const [appliedAgendaDate, setAppliedAgendaDate] = useState<string | null>(null);
  if (agendaPreview && requestedAgendaDate && appliedAgendaDate !== requestedAgendaDate) {
    setAppliedAgendaDate(requestedAgendaDate);
    const index = agendaPreview.allDays.findIndex((day) => day.date === requestedAgendaDate);
    if (index >= 0) setAgendaWindowOffset(index);
  }
  useEffect(() => {
    if (!appliedAgendaDate) return;
    window.requestAnimationFrame(() => document.getElementById("agenda")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [appliedAgendaDate]);

  const totalAgendaDays = agendaPreview?.allDays.length ?? 0;
  const maxAgendaOffset = Math.max(0, totalAgendaDays - AGENDA_PREVIEW_DAYS);
  const agendaOffset = Math.min(agendaWindowOffset, maxAgendaOffset);
  const agendaWindowDaysRaw = agendaPreview?.allDays.slice(agendaOffset, agendaOffset + AGENDA_PREVIEW_DAYS) ?? [];
  // Filtrati alla sola modalità attiva: le fasce che non offrono quel tipo
  // di intervento restano fuori, come se non esistessero per questo tab.
  const agendaWindowDays = agendaWindowDaysRaw.map((day) => ({
    ...day,
    slots: day.slots.filter((slot) => (agendaMode === "HOME" ? slot.home : slot.online) !== null),
  }));
  const agendaHasAvailableInWindow = agendaWindowDays.some((day) => day.slots.some(isSlotAvailable));
  // Righe sempre visibili, anche quando è tutto al completo (orari barrati):
  // prima la griglia spariva e restavano le sole intestazioni dei giorni.
  const agendaTimeRows = Array.from(new Set(agendaWindowDays.flatMap((day) => day.slots.map((slot) => slot.startTime)))).sort();
  // Primo orario libero per "Mostra orari disponibili": prima dopo i giorni
  // visibili, poi dall'inizio se si è già andati oltre (richiesta esplicita
  // dell'utente: deve portare al primo orario disponibile).
  const findFirstFreeAgendaSlot = (fromIndex: number) => {
    const days = agendaPreview?.allDays ?? [];
    for (let index = fromIndex; index < days.length; index++) {
      const slot = days[index]!.slots.find(isSlotAvailable);
      if (slot) return { index, day: days[index]!, slot };
    }
    return null;
  };
  const agendaFirstFree = agendaHasAvailableInWindow
    ? null
    : (findFirstFreeAgendaSlot(agendaOffset + AGENDA_PREVIEW_DAYS) ?? findFirstFreeAgendaSlot(0));
  const agendaCanGoBack = agendaOffset > 0;
  const agendaCanGoForward = agendaOffset + AGENDA_PREVIEW_DAYS < totalAgendaDays;

  // `?salva=1`: il visitatore ha toccato il cuoricino senza essere entrato
  // ed è tornato qui dopo l'accesso, quindi il profilo si salva da solo
  // (docs/CHANGELOG.md §208).
  const saveAfterLogin = searchParams.get("salva") === "1";
  useEffect(() => {
    if (!token || user?.role !== "CLIENT") return;
    apiClient
      .mySavedProfessionals(token)
      .then(async (saved) => {
        const alreadySaved = saved.some((p) => p.id === professional.id);
        if (!alreadySaved && saveAfterLogin) {
          await apiClient.saveProfessional(token, professional.id);
          setIsSaved(true);
        } else {
          setIsSaved(alreadySaved);
        }
      })
      .catch(() => {});
  }, [token, user, professional.id, saveAfterLogin]);

  useEffect(() => {
    apiClient
      .getProfessionalAgenda(professional.id)
      .then((res) => {
        // L'agenda è un widget accessorio (mai bloccare l'apertura del
        // profilo per colpa sua): valida la forma della risposta prima di
        // usarla invece di fidarsi ciecamente del tipo dichiarato — un API
        // API non ancora allineata all'ultimo deploy del frontend (i due
        // servizi si deployano indipendentemente) potrebbe rispondere ancora
        // con la vecchia forma, e `agenda.days.some(...)` su un valore senza
        // `days` mandava in crash l'intera pagina (bug reale segnalato
        // dall'utente: "Application error" aprendo un profilo).
        if (res && Array.isArray(res.days)) setAgenda(res);
      })
      .catch(() => {});
  }, [professional.id]);

  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  async function handleShare() {
    const url = window.location.href;
    const shareData = {
      title: `${professional.businessName} — ${professional.categoryLabel} a ${professional.city}`,
      text: `${professional.businessName}: ${professional.categoryLabel.toLowerCase()} a ${professional.city} su ${BRAND.name}.`,
      url,
    };
    try {
      if (typeof navigator.share === "function") {
        await navigator.share(shareData);
        return; // condivisione nativa completata o annullata: nessun feedback
      }
      throw new Error("share-non-disponibile");
    } catch {
      // Fallback: copia il link negli appunti (desktop senza Web Share API)
      try {
        await navigator.clipboard.writeText(url);
        setShareFeedback("Link copiato");
      } catch {
        setShareFeedback("Copia il link dalla barra degli indirizzi");
      }
      window.setTimeout(() => setShareFeedback(null), 3000);
    }
  }

  async function handleToggleSave() {
    if (!token) {
      router.push(`/accedi?redirect=${encodeURIComponent(`/professionista/${professional.id}?salva=1`)}`);
      return;
    }
    setIsSaving(true);
    try {
      if (isSaved) {
        await apiClient.unsaveProfessional(token, professional.id);
        setIsSaved(false);
      } else {
        await apiClient.saveProfessional(token, professional.id);
        setIsSaved(true);
      }
    } catch {
      // silenzioso: non è un'azione critica, l'utente può riprovare
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <YStack width="100%" alignItems="center" backgroundColor="transparent">
      <YStack width="100%" maxWidth={860} paddingHorizontal="$4" paddingVertical="$6" gap="$6">
        {/* Più vicino alla scheda del gap standard: il percorso ne è l'intestazione. */}
        {breadcrumbs ? <YStack style={{ marginTop: -8, marginBottom: -12 }}>{breadcrumbs}</YStack> : null}
        {/* Scheda identità — richiesta esplicita dell'utente ("migliora la
            visualizzazione di un profilo pubblico"): prima nome/badge/
            rating/bio/sottotag/azioni fluttuavano direttamente sullo sfondo
            pesca della pagina, senza alcun trattamento a card, mentre ogni
            altra sezione sotto (Agenda/Prestazioni/Recensioni) era già
            avvolta in una `Surface` — incoerenza visiva mai risolta prima
            d'ora. Un solo blocco coeso invece di elementi sparsi. */}
        <Surface gap="$4">
        <XStack gap="$3" alignItems="flex-start">
          {/* Su telefono il nome va sotto la foto: accanto restava una
              colonna stretta, con il nome spezzato su più righe
              (docs/CHANGELOG.md §252). */}
          <XStack gap="$3" alignItems="flex-start" flex={1} minWidth={0} $xs={{ flexDirection: "column" }}>
            <YStack
              cursor={professional.imageUrl ? "pointer" : undefined}
              onPress={() => {
                if (professional.imageUrl) setLightbox({ photos: [professional.imageUrl], index: 0 });
              }}
              accessibilityRole={professional.imageUrl ? "button" : undefined}
              accessibilityLabel={professional.imageUrl ? "Ingrandisci la foto profilo" : undefined}
            >
              {/* Foto ingrandita ulteriormente su richiesta esplicita
                  dell'utente (64px iniziali → 104px → 140px): chi apre la
                  pagina pubblica deve riconoscere bene di chi si tratta, non
                  solo intuirne un'icona piccola accanto al nome. */}
              <ProfessionalAvatar imageUrl={professional.imageUrl} categorySlug={professional.categorySlug} size={140} />
            </YStack>
            <YStack gap="$2" flex={1} minWidth={0}>
              <XStack alignItems="center" gap="$2" flexWrap="wrap">
                <Text tag="h1" margin={0} fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite} style={{ overflowWrap: "anywhere" }}>
                  {professional.businessName}
                </Text>
                {/* Il significato di ogni badge in un fumetto (docs/CHANGELOG.md §330). */}
                {professional.verified ? (
                  <BadgeInfo info="verified">
                    <Badge variant="verificato">Verificato</Badge>
                  </BadgeInfo>
                ) : null}
                {professional.professionalKind ? <ProfessionalKindBadge kind={professional.professionalKind} size="md" /> : null}
                {/* Verifica di identità di Stripe, distinta dal "Verificato" del nostro team (docs/CHANGELOG.md §241). */}
                {professional.stripeVerified ? (
                  <BadgeInfo info="stripeVerified">
                    <Badge variant="verificato">{STRIPE_VERIFIED_BADGE.label}</Badge>
                  </BadgeInfo>
                ) : null}
                {professional.boosted ? (
                  <BadgeInfo info="boosted">
                    <Badge variant="pro">Sponsorizzato</Badge>
                  </BadgeInfo>
                ) : null}
                {professional.isNewProfile ? (
                  <BadgeInfo info="newProfile">
                    <Badge variant="nuovo">Nuovo profilo</Badge>
                  </BadgeInfo>
                ) : null}
                {professional.hasLiabilityInsurance ? (
                  <BadgeInfo info="liabilityInsurance">
                    <span className="rc-badge">
                      <span>
                        <Icon name="shield-check" size={13} strokeWidth={2} color={brand.grafite} />
                        Assicurazione RC
                      </span>
                      <small>dichiarata</small>
                    </span>
                  </BadgeInfo>
                ) : null}
              </XStack>
              {/* Categorie (da 1 a 3, docs/CHANGELOG.md §217) su una riga loro,
                  separate dalla città (docs/CHANGELOG.md §259). */}
              <XStack flexWrap="wrap" gap="$2">
                {(professional.categories?.length
                  ? professional.categories
                  : [{ slug: professional.categorySlug, label: professional.categoryLabel }]
                ).map((category) => {
                  const icon = PROFESSIONAL_CATEGORIES.find((c) => c.slug === category.slug)?.icon;
                  return (
                    <XStack
                      key={category.slug}
                      alignItems="center"
                      gap={6}
                      paddingHorizontal={10}
                      paddingVertical={4}
                      borderRadius={999}
                      backgroundColor={brand.cianografiaVelo}
                    >
                      {icon ? <Icon name={icon} size={13} color={brand.cianografiaScuro} /> : null}
                      <Text fontFamily="$body" fontWeight="700" fontSize={16} color={brand.cianografiaScuro}>
                        {category.label}
                      </Text>
                    </XStack>
                  );
                })}
              </XStack>
              <XStack alignItems="center" gap={4}>
                <Icon name="map-pin" size={13} color={brand.grafite70} />
                <Text fontFamily="$body" fontWeight="700" fontSize={16} color={brand.grafite70}>
                  {professional.city}
                </Text>
              </XStack>
              {/* Privato o professionista (Codice del consumo art. 49-bis, docs/CHANGELOG.md §241): il tipo è
                  nel badge accanto al nome (§330); per un privato l'avviso sui diritti del consumatore resta
                  sempre scritto, non solo nel fumetto. */}
              {professional.traderStatus === "PRIVATE" ? (
                <Text fontSize={13} color={brand.grafite70}>
                  {TRADER_STATUS_COPY.PRIVATE.note}
                </Text>
              ) : null}
              {professional.rating !== null ? (
                <Rating value={professional.rating} count={professional.reviewCount} size={16} />
              ) : (
                <Text color={brand.grafite70}>Nessuna recensione ancora</Text>
              )}
              {professional.completedThisMonth > 0 ? (
                <Text fontSize={16} color={brand.verificato} fontWeight="600">
                  Ha completato {professional.completedThisMonth} {professional.completedThisMonth === 1 ? "intervento" : "interventi"} questo
                  mese
                </Text>
              ) : null}
              {/* Segnali di fiducia aggiuntivi (CEO, consiglio esperti —
                  CPO: "esporre completedJobs + tempo medio di risposta sul
                  profilo pubblico... massimo ritorno per minimo sforzo").
                  Mai uno zero fuorviante: un professionista senza ancora
                  dati misurati non mostra questa riga, non "0 lavori". */}
              {professional.completedJobsTotal > 0 || professional.avgResponseTimeMinutes !== null ? (
                <XStack alignItems="center" gap="$3" flexWrap="wrap">
                  {professional.completedJobsTotal > 0 ? (
                    <XStack alignItems="center" gap={4} flexShrink={1} minWidth={0}>
                      <Icon name="check" size={13} strokeWidth={2} color={brand.grafite70} />
                      <Text fontSize={13} color={brand.grafite70} flexShrink={1}>
                        {professional.completedJobsTotal} {professional.completedJobsTotal === 1 ? "lavoro completato" : "lavori completati"} in
                        totale
                      </Text>
                    </XStack>
                  ) : null}
                  {professional.avgResponseTimeMinutes !== null ? (
                    <XStack alignItems="center" gap={4} flexShrink={1} minWidth={0}>
                      <Icon name="clock" size={13} strokeWidth={1.5} color={brand.grafite70} />
                      <Text fontSize={13} color={brand.grafite70} flexShrink={1}>
                        Risponde in genere entro {formatResponseTime(professional.avgResponseTimeMinutes)}
                      </Text>
                    </XStack>
                  ) : null}
                </XStack>
              ) : null}
            </YStack>
          </XStack>
        </XStack>

        {/* Passaparola: per i lavori di casa la raccomandazione gira su
            WhatsApp, quindi il bottone apre la condivisione nativa del
            dispositivo (che su mobile include WhatsApp/contatti) e ripiega
            sulla copia del link dove l'API non esiste (desktop senza
            navigator.share). */}
        {/* Solo icone, con la descrizione al passaggio del mouse (richiesta
            esplicita dell'utente, docs/CHANGELOG.md §206). */}
        {preview ? null : (
        <XStack gap="$2" alignItems="center">
          {/* Cuoricino visibile anche a chi non è entrato (docs/CHANGELOG.md
              §208): prima compariva solo a un cliente già entrato, e per
              tutti gli altri sembrava sparito. Al tocco porta all'accesso.
              Nascosto solo a professionisti e admin, che non salvano profili. */}
          {!user || user.role === "CLIENT" ? (
            <IconActionButton label={isSaved ? "Salvato" : "Salva"} active={isSaved} disabled={isSaving} onPress={handleToggleSave}>
              <Icon name="heart" size={17} strokeWidth={1.5} color={isSaved ? "white" : brand.grafite} fill={isSaved ? "white" : "none"} />
            </IconActionButton>
          ) : null}
          <IconActionButton label={shareFeedback ?? "Condividi il profilo"} forceTooltip={shareFeedback !== null} onPress={handleShare}>
            <Icon name="share-2" size={17} strokeWidth={1.5} color={brand.cianografiaScuro} />
          </IconActionButton>
          {user ? (
            <IconActionButton
              label={reportedKeys.has(`PROFESSIONAL_PROFILE:${professional.id}`) ? "Già segnalato" : "Segnala"}
              disabled={reportedKeys.has(`PROFESSIONAL_PROFILE:${professional.id}`)}
              onPress={() => setReportTarget({ targetType: "PROFESSIONAL_PROFILE", targetId: professional.id, label: `il profilo di ${professional.businessName}` })}
            >
              <Icon name="flag" size={17} strokeWidth={1.5} color={brand.grafite70} />
            </IconActionButton>
          ) : null}
        </XStack>
        )}

        {professional.subTags.length > 0 ? (
          <XStack flexWrap="wrap" gap="$2">
            {professional.subTags.map((tag) => (
              <Chip key={tag}>{subTagLabel(tag)}</Chip>
            ))}
          </XStack>
        ) : null}

        {professional.bio ? <Text color={brand.grafite70}>{professional.bio}</Text> : null}

        {/* Lavori svolti subito sotto la descrizione, dentro la scheda
            identità (richiesta esplicita dell'utente, docs/CHANGELOG.md §208).
            `?? []`: stessa cautela dell'agenda/recensioni sopra — un'API non
            ancora allineata all'ultimo deploy potrebbe non includere ancora
            portfolioUrls sul professionista. */}
        {(professional.portfolioUrls ?? []).length > 0 ? (
          <YStack gap="$3">
            <XStack alignItems="center" gap="$2">
              <Icon name="camera" size={16} strokeWidth={1.5} color={brand.cianografiaScuro} />
              <Text fontFamily="$heading" fontWeight="700" fontSize="$5" color={brand.grafite}>
                Lavori svolti
              </Text>
            </XStack>
            {/* Su telefono le foto scorrono in una riga sola invece di andare
                a capo (richiesta esplicita dell'utente, §208). */}
            <div className="portfolio-row">
              {(professional.portfolioUrls ?? []).map((url, photoIndex) => (
                <YStack
                  key={url}
                  width={96}
                  height={96}
                  borderRadius="$3"
                  overflow="hidden"
                  borderWidth={1}
                  borderColor={brand.filetto}
                  cursor="pointer"
                  onPress={() => setLightbox({ photos: professional.portfolioUrls ?? [], index: photoIndex })}
                  accessibilityRole="button"
                  accessibilityLabel={`Ingrandisci foto ${photoIndex + 1} dei lavori svolti`}
                >
                  <MediaPreview url={url} />
                </YStack>
              ))}
            </div>
            <style jsx>{`
              .portfolio-row {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
              }
              @media (max-width: 660px) {
                .portfolio-row {
                  flex-wrap: nowrap;
                  overflow-x: auto;
                  scroll-snap-type: x mandatory;
                  padding-bottom: 4px;
                }
                .portfolio-row > :global(*) {
                  flex-shrink: 0;
                  scroll-snap-align: start;
                }
              }
            `}</style>
          </YStack>
        ) : null}

        {/* Segnali di fiducia dichiarati (CEO, consiglio esperti — CPO),
            mai verificati documentalmente: etichetta "Dichiarato dal
            professionista" invece di un'icona di spunta, per non
            confonderli con `verified` (quello richiederebbe una verifica
            reale, oggi inesistente, CLAUDE.md §10 checklist punto 15). */}
        {professional.yearsOfExperience !== null ||
        professional.spokenLanguages.length > 0 ||
        professional.certifications ||
        professional.hasLiabilityInsurance ? (
          <YStack gap="$2" paddingTop="$2" borderTopWidth={1} borderTopColor={brand.filetto}>
            {professional.yearsOfExperience !== null ? (
              <XStack alignItems="center" gap="$2">
                <Icon name="briefcase" size={14} strokeWidth={1.5} color={brand.grafite70} />
                <Text fontSize={13} color={brand.grafite70}>
                  {professional.yearsOfExperience} {professional.yearsOfExperience === 1 ? "anno" : "anni"} di esperienza
                </Text>
              </XStack>
            ) : null}
            {/* Lingue nello stesso elenco di esperienza, patentini e
                assicurazione (richiesta esplicita dell'utente, §208). */}
            {professional.spokenLanguages.length > 0 ? (
              <XStack alignItems="center" gap="$2">
                <Icon name="message-circle" size={14} strokeWidth={1.5} color={brand.grafite70} />
                <Text fontSize={13} color={brand.grafite70}>
                  Parla {professional.spokenLanguages.join(", ")}
                </Text>
              </XStack>
            ) : null}
            {professional.certifications ? (
              <XStack alignItems="flex-start" gap="$2">
                <Icon name="shield" size={14} strokeWidth={1.5} color={brand.grafite70} />
                <Text fontSize={13} color={brand.grafite70} flex={1}>
                  {professional.certifications}
                </Text>
              </XStack>
            ) : null}
            {professional.hasLiabilityInsurance ? (
              <XStack alignItems="center" gap="$2">
                <Icon name="shield-check" size={14} strokeWidth={1.5} color={brand.grafite70} />
                <Text fontSize={13} color={brand.grafite70}>
                  Assicurazione RC professionale
                </Text>
              </XStack>
            ) : null}
            <Text fontSize={10.5} color={brand.grafite70} fontStyle="italic">
              Dati dichiarati dal professionista, non verificati da {BRAND.name}.
            </Text>
          </YStack>
        ) : null}
        </Surface>

        {professional.acceptingRequests && agendaPreview?.hasAnySlot ? (
          <YStack gap="$3">
            {/* Ancora per il click sulle pillole della mini-agenda nei risultati di ricerca
                (ProfessionalCard): scrollMarginTop compensa l'header sticky. */}
            <div id="agenda" style={{ scrollMarginTop: 96 }} />
            {/* Sezione avvolta in una Surface propria (richiesta esplicita
                dell'utente: "separa meglio la sezione agenda... per farla
                visualizzare meglio rispetto al resto del contesto") — prima
                era un semplice YStack direttamente sullo sfondo pesca della
                pagina, indistinguibile da "Lavori svolti"/eyebrow di
                "Recensioni" sopra e sotto. Stesso trattamento già in uso per
                la "Scheda identità" in cima alla pagina: sfondo bianco
                (brand.calce) + angoli morbidi, nessuna ombra (CLAUDE.md §19). */}
            <Surface gap="$3">
            <XStack alignItems="center" gap="$2">
              <Icon name="calendar" size={18} strokeWidth={1.5} color={brand.cianografiaScuro} />
              <Text fontFamily="$heading" fontWeight="700" fontSize="$6" color={brand.grafite}>
                Agenda
              </Text>
            </XStack>
            <Text fontSize={13} color={brand.grafite70}>
              Tocca un orario libero per richiedere un preventivo per quella fascia. Gli orari barrati sono già al completo.
            </Text>

            {/* Tab "A domicilio"/"Online" (richiesta esplicita dell'utente):
                filtrano gli orari sotto in base alla modalità offerta su
                ogni fascia. */}
            <XStack gap="$2">
              {(["HOME", "ONLINE"] as const).map((mode) => (
                <XStack
                  key={mode}
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                  borderRadius="$10"
                  backgroundColor={agendaMode === mode ? brand.cianografia : brand.gesso}
                  cursor="pointer"
                  accessibilityRole="button"
                  accessibilityLabel={mode === "HOME" ? "A domicilio" : "Online"}
                  onPress={() => {
                    setAgendaMode(mode);
                    setAgendaWindowOffset(0);
                  }}
                >
                  <Text fontFamily="$body" fontSize={16} fontWeight="700" color={agendaMode === mode ? "#FFFFFF" : brand.grafite70}>
                    {mode === "HOME" ? "A domicilio" : "Online"}
                  </Text>
                </XStack>
              ))}
            </XStack>

            {/* Frecce raggruppate a ridosso delle intestazioni giorno
                (`gap="$1"`, molto meno del `gap="$3"` che separa gli altri
                blocchi della sezione) — richiesta esplicita dell'utente:
                prima le frecce e le intestazioni erano alla stessa
                distanza reciproca di ogni altro blocco della sezione (tab
                A domicilio/Online, griglia orari), senza alcun segnale
                visivo che le due frecce si riferiscano proprio ai giorni
                subito sotto e non, ad esempio, ai tab sopra. Restano due
                righe separate (non un'unica riga con le intestazioni) per
                lo stesso motivo di prima — vedi bug qui sotto. Larghezza
                massima pari alla griglia (richiesta esplicita dell'utente,
                docs/CHANGELOG.md §227): su computer le frecce finivano
                all'estremo destro della scheda, lontane dai giorni; ora
                stanno sopra l'ultima colonna. */}
            <YStack gap="$1" width="100%" maxWidth={AGENDA_COLUMN_WIDTH * AGENDA_PREVIEW_DAYS}>
              {totalAgendaDays > AGENDA_PREVIEW_DAYS ? (
                // Frecce su una riga propria, allineate a destra (richiesta
                // esplicita dell'utente: prima condividevano la riga con le
                // intestazioni ed erano soggette allo stesso `flexWrap` di
                // quel blocco, finendo sotto o troppo vicine al bordo su
                // schermi stretti). Un blocco fisso di soli ~88px allineato
                // a destra non compete mai per lo spazio con le 4 colonne
                // della griglia sottostante, quindi non sfora mai il bordo
                // del telefono. Stessa resa già in uso per le frecce del
                // carosello categorie (CategoryCarousel.tsx: 40×40, cerchio
                // pieno brand.calce, nessun bordo/ombra).
                <XStack justifyContent="flex-end" gap="$2" alignItems="center">
                  <XStack
                    width={40}
                    height={40}
                    borderRadius={20}
                    backgroundColor={brand.calce}
                    alignItems="center"
                    justifyContent="center"
                    opacity={agendaCanGoBack ? 1 : 0.3}
                    cursor={agendaCanGoBack ? "pointer" : undefined}
                    accessibilityRole={agendaCanGoBack ? "button" : undefined}
                    accessibilityLabel="Giorni precedenti"
                    onPress={agendaCanGoBack ? () => setAgendaWindowOffset(Math.max(0, agendaOffset - AGENDA_PREVIEW_DAYS)) : undefined}
                  >
                    <Icon name="chevron-left" size={20} color={brand.grafite} />
                  </XStack>
                  <XStack
                    width={40}
                    height={40}
                    borderRadius={20}
                    backgroundColor={brand.calce}
                    alignItems="center"
                    justifyContent="center"
                    opacity={agendaCanGoForward ? 1 : 0.3}
                    cursor={agendaCanGoForward ? "pointer" : undefined}
                    accessibilityRole={agendaCanGoForward ? "button" : undefined}
                    accessibilityLabel="Giorni successivi"
                    onPress={agendaCanGoForward ? () => setAgendaWindowOffset(agendaOffset + AGENDA_PREVIEW_DAYS) : undefined}
                  >
                    <Icon name="chevron-right" size={20} color={brand.grafite} />
                  </XStack>
                </XStack>
              ) : null}

              <XStack>
                {agendaWindowDays.map((day) => (
                  <YStack key={day.date} flex={1} flexBasis={0} minWidth={0} maxWidth={AGENDA_COLUMN_WIDTH} alignItems="center" gap={2}>
                    <Text fontFamily="$body" fontSize={13} fontWeight="700" color={brand.grafite}>
                      {day.label}
                    </Text>
                    <Text fontFamily="$mono" fontSize={13} color={brand.grafite70}>
                      {day.dateLabel}
                    </Text>
                  </YStack>
                ))}
              </XStack>
            </YStack>

            {agendaTimeRows.length > 0 ? (
              <YStack gap="$1.5" width="100%" maxWidth={AGENDA_COLUMN_WIDTH * AGENDA_PREVIEW_DAYS}>
                {agendaTimeRows.map((time) => (
                  <XStack key={time}>
                    {agendaWindowDays.map((day) => {
                      const slot = day.slots.find((s) => s.startTime === time);
                      if (!slot) {
                        return (
                          <XStack
                            key={day.date}
                            flex={1}
                            flexBasis={0}
                            minWidth={0}
                            maxWidth={AGENDA_COLUMN_WIDTH}
                            alignItems="center"
                            justifyContent="center"
                            paddingVertical={4}
                          >
                            <Text fontSize={16} color={brand.filetto}>
                              -
                            </Text>
                          </XStack>
                        );
                      }
                      const range = `${slot.startTime}–${slot.endTime}`;
                      const modeInfo = agendaMode === "HOME" ? slot.home : slot.online;
                      const isFull = !modeInfo || modeInfo.bookedCount >= modeInfo.maxBookings;
                      if (isFull) {
                        return (
                          <XStack
                            key={day.date}
                            flex={1}
                            flexBasis={0}
                            minWidth={0}
                            maxWidth={AGENDA_COLUMN_WIDTH}
                            alignItems="center"
                            justifyContent="center"
                            paddingVertical={4}
                          >
                            <Text
                              fontFamily="$mono"
                              fontSize={10.5}
                              $xs={{ fontSize: 9.5 }}
                              letterSpacing={-0.3}
                              color={brand.grafite70}
                              textDecorationLine="line-through"
                              textAlign="center"
                            >
                              {range}
                            </Text>
                          </XStack>
                        );
                      }
                      // `nomeProfessionista`/`fotoProfessionista`: il
                      // cliente deve capire subito che la richiesta va a
                      // QUESTO professionista, non "ai professionisti
                      // compatibili nella zona" — richiesta esplicita
                      // dell'utente, GuidedRequestForm li usa per mostrare
                      // un riquadro con foto+nome invece del sottotitolo
                      // generico. Nomi distinti da "nome"/"foto" per non
                      // collidere col "nome" del CLIENTE nello stesso form.
                      const href = `/preventivo?categoria=${professional.categorySlug}&professionista=${professional.id}&nomeProfessionista=${encodeURIComponent(professional.businessName)}&fotoProfessionista=${encodeURIComponent(professional.imageUrl ?? "")}&data=${day.date}&fasciaOraria=${slot.startTime}-${slot.endTime}&modalita=${agendaMode}`;
                      return (
                        <XStack
                          key={day.date}
                          flex={1}
                          flexBasis={0}
                          minWidth={0}
                          maxWidth={AGENDA_COLUMN_WIDTH}
                          alignItems="center"
                          justifyContent="center"
                          paddingVertical={3}
                        >
                          <Link href={href} style={{ textDecoration: "none", pointerEvents: preview ? "none" : undefined }} tabIndex={preview ? -1 : undefined}>
                            <XStack paddingHorizontal={6} $xs={{ paddingHorizontal: 4 }} paddingVertical={4} borderRadius="$10" backgroundColor={brand.cianografiaVelo}>
                              <Text fontFamily="$mono" fontSize={10.5} $xs={{ fontSize: 9.5 }} letterSpacing={-0.3} fontWeight="700" color={brand.cianografiaScuro} textAlign="center">
                                {range}
                              </Text>
                            </XStack>
                          </Link>
                        </XStack>
                      );
                    })}
                  </XStack>
                ))}
              </YStack>
            ) : null}

            {agendaHasAvailableInWindow ? null : agendaFirstFree ? (
              <YStack gap="$2" padding="$4" borderRadius={radiusDoc} borderWidth={1} borderColor={brand.filetto} alignSelf="flex-start">
                <YStack gap={2}>
                  <Text fontSize={13} color={brand.grafite70}>
                    Nessun orario libero in questi giorni. Primo orario libero:
                  </Text>
                  <Text fontSize={16} fontWeight="700" color={brand.grafite}>
                    {agendaFirstFree.day.dateLabel}, {agendaFirstFree.slot.startTime}–{agendaFirstFree.slot.endTime}
                  </Text>
                </YStack>
                <XStack
                  alignSelf="flex-start"
                  paddingHorizontal="$4"
                  paddingVertical="$2"
                  borderRadius="$10"
                  backgroundColor={brand.cianografia}
                  cursor="pointer"
                  accessibilityRole="button"
                  // Porta la griglia sul giorno del primo orario libero, che
                  // resta cliccabile lì per aprire /preventivo come ogni altra
                  // fascia — nessuna navigazione diretta da qui.
                  onPress={() => setAgendaWindowOffset(agendaFirstFree.index)}
                >
                  <Text fontFamily="$body" fontSize={16} fontWeight="700" color="#FFFFFF">
                    Mostra orari disponibili →
                  </Text>
                </XStack>
              </YStack>
            ) : (
              <Text fontSize={13} color={brand.grafite70}>
                Nessun orario libero nei prossimi due mesi.
              </Text>
            )}
            </Surface>
          </YStack>
        ) : null}

        {/* Account in pausa per l'abbonamento (docs/CHANGELOG.md §162): il
            profilo resta visibile dal link, ma senza agenda né richieste. */}
        {professional.acceptingRequests ? (
          <ProfileQuoteCta
            href={`/preventivo?categoria=${professional.categorySlug}&professionista=${professional.id}&nomeProfessionista=${encodeURIComponent(professional.businessName)}&fotoProfessionista=${encodeURIComponent(professional.imageUrl ?? "")}`}
            name={professional.businessName}
            preview={preview}
          />
        ) : (
          <Surface gap="$2">
            <Text fontWeight="700" color={brand.grafite}>
              Al momento non accetta nuove richieste
            </Text>
            <Text color={brand.grafite70}>Puoi chiedere un preventivo ad altri professionisti della stessa categoria nella tua zona.</Text>
            <Link href={`/cerca/${professional.categorySlug}`} style={{ textDecoration: "none", alignSelf: "flex-start", pointerEvents: preview ? "none" : undefined }} tabIndex={preview ? -1 : undefined}>
              <Button variant="secondary">{`Cerca altri: ${professional.categoryLabel}`}</Button>
            </Link>
          </Surface>
        )}

        {professional.services.length > 0 ? (
          <YStack gap="$3">
            <XStack alignItems="center" gap="$2">
              <Icon name="receipt-text" size={18} strokeWidth={1.5} color={brand.cianografiaScuro} />
              <Text fontFamily="$heading" fontWeight="700" fontSize="$6" color={brand.grafite}>
                Prestazioni
              </Text>
            </XStack>
            <Surface padding={0} overflow="hidden">
              {professional.services.map((service, index) => (
                <YStack key={service.id} paddingHorizontal="$4" paddingVertical="$3" borderTopWidth={index === 0 ? 0 : 1} borderTopColor={brand.filetto}>
                  <PriceLine
                    label={service.name}
                    labelColor={brand.grafite}
                    price={formatServicePriceRange(service.priceMinEurCents, service.priceMaxEurCents)}
                  />
                </YStack>
              ))}
            </Surface>
          </YStack>
        ) : null}

        <YStack gap="$3">
          <YStack flexDirection="row" alignItems="center" gap="$3" flexWrap="wrap">
            <XStack alignItems="center" gap="$2">
              <Icon name="star" size={18} strokeWidth={1.5} color={brand.cianografiaScuro} />
              <Text fontFamily="$heading" fontWeight="700" fontSize="$6" color={brand.grafite}>
                Recensioni
              </Text>
            </XStack>
            {professional.rating !== null ? <Rating value={professional.rating} count={professional.reviewCount} /> : null}
          </YStack>
          {professional.reviews.length === 0 ? (
            <EmptyState icon="star" title="Nessuna recensione ancora" description="Le recensioni arrivano solo da prenotazioni confermate." />
          ) : (
            professional.reviews.map((review) => (
              <YStack key={review.id} gap="$0">
                {/* Ancora per il deep-link dalla homepage ("Ultime recensioni",
                    RecentReviews.tsx) — stesso pattern già in uso per #agenda
                    sopra: un <div> grezzo con scrollMarginTop, mai un id
                    passato direttamente a un componente Tamagui (non è
                    garantito che lo inoltri al nodo DOM). */}
                <div id={`recensione-${review.id}`} style={{ scrollMarginTop: 96 }} />
                <Surface gap="$2">
                <XStack alignItems="center" justifyContent="space-between" gap="$2" flexWrap="wrap">
                  <XStack alignItems="center" gap="$2" flexWrap="wrap">
                    <XStack alignItems="center" gap="$1">
                      <Icon name="star" size={15} strokeWidth={1.5} color={brand.ottone} fill={brand.ottone} />
                      <Text fontWeight="600" color={brand.grafite}>
                        {review.rating}/5
                      </Text>
                    </XStack>
                    {/* Stesso segnale di fiducia già usato per le recensioni
                        in homepage ("Lavoro confermato", RecentReviews.tsx) —
                        qui era assente, ora coerente su entrambe le
                        superfici: ogni recensione nasce comunque solo da una
                        prenotazione confermata (regola di prodotto
                        invariata), mancava solo di dirlo esplicitamente. */}
                    <BadgeInfo info="confirmedJob">
                      <XStack alignItems="center" gap={4}>
                        <Icon name="badge-check" size={13} strokeWidth={2} color={brand.verificato} />
                        <Text fontSize={13} fontWeight="700" color={brand.verificato}>
                          Lavoro confermato
                        </Text>
                      </XStack>
                    </BadgeInfo>
                    <Text fontSize={13} color={brand.grafite70}>
                      · {reviewTimeAgo(review.createdAt)}
                    </Text>
                  </XStack>
                  {user && !preview ? (
                    <XStack
                      alignItems="center"
                      gap={4}
                      cursor={reportedKeys.has(`REVIEW:${review.id}`) ? "default" : "pointer"}
                      opacity={reportedKeys.has(`REVIEW:${review.id}`) ? 0.5 : 1}
                      onPress={
                        reportedKeys.has(`REVIEW:${review.id}`)
                          ? undefined
                          : () => setReportTarget({ targetType: "REVIEW", targetId: review.id, label: "questa recensione" })
                      }
                      accessibilityRole="button"
                    >
                      <Icon name="flag" size={12} strokeWidth={1.5} color={brand.grafite70} />
                      <Text fontSize={13} color={brand.grafite70}>
                        {reportedKeys.has(`REVIEW:${review.id}`) ? "Già segnalato" : "Segnala"}
                      </Text>
                    </XStack>
                  ) : null}
                </XStack>
                {review.comment ? <Text color={brand.grafite70}>{review.comment}</Text> : null}
                {/* `?? []`: stessa cautela dell'agenda, un'API non ancora allineata all'ultimo deploy
                    potrebbe non includere ancora photoUrls su una recensione. */}
                {(review.photoUrls ?? []).length > 0 ? (
                  <XStack gap="$2" flexWrap="wrap">
                    {(review.photoUrls ?? []).map((url, photoIndex) => (
                      <YStack
                        key={url}
                        width={72}
                        height={72}
                        borderRadius="$3"
                        overflow="hidden"
                        borderWidth={1}
                        borderColor={brand.filetto}
                        cursor="pointer"
                        onPress={() => setLightbox({ photos: review.photoUrls ?? [], index: photoIndex })}
                        accessibilityRole="button"
                        accessibilityLabel={`Ingrandisci foto ${photoIndex + 1} della recensione`}
                      >
                        <MediaPreview url={url} />
                      </YStack>
                    ))}
                  </XStack>
                ) : null}
              </Surface>
              </YStack>
            ))
          )}
        </YStack>
      </YStack>

      {lightbox ? (
        <PhotoLightbox photos={lightbox.photos} initialIndex={lightbox.index} onClose={() => setLightbox(null)} />
      ) : null}

      {reportTarget ? (
        <ReportContentModal
          targetType={reportTarget.targetType}
          targetLabel={reportTarget.label}
          onClose={() => setReportTarget(null)}
          onSubmit={async (input) => {
            if (!token) return;
            await apiClient.createContentReport(token, { targetType: reportTarget.targetType, targetId: reportTarget.targetId, ...input });
            // Solo se la chiamata sopra non ha lanciato (es. 409 "già
            // segnalato nelle ultime 24 ore") il tasto passa a disabilitato.
            markReported(reportTarget.targetType, reportTarget.targetId);
            setReportedKeys((prev) => new Set(prev).add(`${reportTarget.targetType}:${reportTarget.targetId}`));
          }}
        />
      ) : null}
    </YStack>
  );
}
