"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BRAND, MAX_CHOSEN_PROFESSIONALS, PROFILE_REQUEST_SOURCE_PARAM, formatAppointmentDate, STRIPE_VERIFIED_BADGE, TRADER_STATUS_COPY, shownServicePriceUnit, formatServicePriceRange, serviceCategoryOf, subTagLabel, type ProfessionalAgenda, type ProfessionalCategorySlug, type ProfessionalDetail } from "@professionisti/shared";
import { Badge, BadgeInfo, Button, ProfessionalKindBadge, Chip, EmptyState, Icon, PriceLine, Rating, brand } from "@professionisti/ui";
import { IconActionButton } from "@/components/IconActionButton";
import { CategoryIconBadge } from "@/components/CategoryIconBadge";
import { ProfessionalAvatar } from "@/components/ProfessionalAvatar";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { LearnMore } from "@/components/LearnMore";
import { ProfileQuoteCta } from "@/components/ProfileQuoteCta";
import { ChosenProsBar, chosenRequestHref } from "@/components/ChosenProsBar";
import { requestDescriptionParam } from "@/lib/requestDescription";
import { ProfileChoiceStrip, useProfileChoice } from "@/components/ProfileChoiceStrip";
import { MediaPreview } from "@/components/MediaPreview";
import { ReportContentModal } from "@/components/ReportContentModal";
import { ReviewReply } from "@/components/ReviewReply";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { hasRecentlyReported, markReported } from "@/lib/reportedContent";
import { formatResponseTime, respondsRightAway } from "@/lib/responseTime";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { rememberPersonalLink } from "@/lib/personalLink";
import { countPriceToolProfile, countProfileView, isCountingDisabled } from "@/lib/siteCounts";
import styles from "./ProfessionalDetailContent.module.css";

// Colonne fisse Oggi + 3 giorni (stessa griglia della mini-agenda di ricerca,
// vedi ProfessionalCard in packages/ui) — qui costruita a partire dai giorni
// già disponibili in agenda.days (circa due mesi, PUBLIC_AGENDA_DAYS), senza
// bisogno di una ricerca aggiuntiva se non c'è disponibilità nella finestra:
// il primo orario libero è cercato nello stesso payload già scaricato.
const AGENDA_PREVIEW_DAYS = 4;
// Da computer e tablet una settimana intera (docs/CHANGELOG.md §349): con 4
// giorni la griglia occupava metà scheda e il resto restava vuoto.
const AGENDA_PREVIEW_DAYS_WIDE = 7;
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
  initialAgenda = null,
  preview = false,
  breadcrumbs,
  query = {},
}: {
  professional: ProfessionalDetail;
  /** Agenda già chiesta dal server (pagina pubblica): c'è da subito e non sposta la pagina. */
  initialAgenda?: ProfessionalAgenda | null;
  preview?: boolean;
  /** Percorso "Home › Categoria › Città › Nome" sopra la scheda (solo pagina pubblica). */
  breadcrumbs?: ReactNode;
  /**
   * `?modalita=`, `?data=` e `?salva=` letti dal server e passati qui, non con
   * useSearchParams: quello chiedeva un <Suspense> e il profilo arrivava dopo
   * il piè di pagina, che su una rete lenta saliva in cima e poi scendeva
   * (Lighthouse CLS 0,93, docs/CHANGELOG.md §400).
   */
  query?: { modalita?: string; data?: string; salva?: string; servizio?: string; problema?: string; scelta?: string; link?: string };
}) {
  // Fuori da React Compiler: usa `<style jsx>` (docs/CHANGELOG.md §345).
  "use no memo";
  const { user, token, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();
  const serviceCategories = professional.categories?.length ? professional.categories : [{ slug: professional.categorySlug, label: professional.categoryLabel }];
  const serviceGroups: { slug: ProfessionalCategorySlug | null; label: string; services: ProfessionalDetail["services"] }[] =
    serviceCategories.length > 1
      ? serviceCategories
          .map((category) => ({
            slug: category.slug,
            label: category.label,
            services: professional.services.filter(
              (service) => serviceCategoryOf(service, serviceCategories.map((c) => c.slug)) === category.slug,
            ),
          }))
          .filter((group) => group.services.length > 0)
      : [{ slug: null, label: "", services: professional.services }];
  const [isSaved, setIsSaved] = useState(false);
  // Aperto dai risultati con "Scegli": si torna indietro con la scelta
  // e si può scegliere anche da qui (docs/changelog/2026-11-03-scelti-restano.md).
  const choicePro = { id: professional.id, businessName: professional.businessName, imageUrl: professional.imageUrl ?? null, categorySlug: professional.categorySlug };
  const choice = useProfileChoice(!preview && query.scelta === "1", choicePro);

  // Visita al profilo (CLAUDE.md §8, dati comparativi in Home "Oggi",
  // docs/CHANGELOG.md §147): una sola per scheda del browser e per profilo.
  // Si aspetta la sessione così il server riconosce il titolare che guarda
  // il proprio profilo e non la conta. Mai bloccante: errori ignorati.
  useEffect(() => {
    if (isAuthLoading || preview || isCountingDisabled()) return;
    const key = `profile_view:${professional.id}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // sessionStorage non disponibile: si conta comunque una volta per montaggio.
    }
    // Dal link personale /p/<codice>: conta anche tra le aperture del link (docs/changelog/2026-11-09-passaparola.md).
    apiClient.recordProfileView(professional.id, token ?? undefined, query.link === "1").catch(() => undefined);
    // Andamento del sito: visite per dispositivo, accanto alle richieste per pulsante (§402).
    if (user?.professionalProfileId !== professional.id) countProfileView();
  }, [isAuthLoading, preview, professional.id, token, user?.professionalProfileId, query.link]);
  const [isSaving, setIsSaving] = useState(false);
  const [agenda, setAgenda] = useState<ProfessionalAgenda | null>(initialAgenda);
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
  const initialAgendaMode: "HOME" | "ONLINE" = query.modalita === "ONLINE" ? "ONLINE" : "HOME";
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
  const requestedAgendaDate = query.data ?? null;
  // Arrivati da una voce di "Quanto costa in media" (§398): la richiesta parte
  // con la prestazione già scritta nella descrizione. Arrivati dalla ricerca
  // per problema, con il problema scritto dal cliente
  // (docs/changelog/2026-11-03-preventivo-descrizione-per-prima.md).
  const requestedService = query.servizio?.trim();
  const serviceDescriptionParam = requestDescriptionParam(query.problema, requestedService);
  // Profilo aperto dall'elenco di una voce (§399): contato solo se la scheda del browser è partita da "Quanto costa".
  useEffect(() => {
    if (requestedService) countPriceToolProfile();
  }, [requestedService]);
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

  const agendaVisibleDays = useMediaQuery("(min-width: 661px)") ? AGENDA_PREVIEW_DAYS_WIDE : AGENDA_PREVIEW_DAYS;
  const totalAgendaDays = agendaPreview?.allDays.length ?? 0;
  const maxAgendaOffset = Math.max(0, totalAgendaDays - agendaVisibleDays);
  const agendaOffset = Math.min(agendaWindowOffset, maxAgendaOffset);
  const agendaWindowDaysRaw = agendaPreview?.allDays.slice(agendaOffset, agendaOffset + agendaVisibleDays) ?? [];
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
    : (findFirstFreeAgendaSlot(agendaOffset + agendaVisibleDays) ?? findFirstFreeAgendaSlot(0));
  const agendaCanGoBack = agendaOffset > 0;
  const agendaCanGoForward = agendaOffset + agendaVisibleDays < totalAgendaDays;
  // Lavori completati: il totale non è mai meno di quelli del mese (i due
  // numeri arrivano da conti diversi, docs/CHANGELOG.md §349).
  const completedTotal = Math.max(professional.completedJobsTotal, professional.completedThisMonth);

  // `?salva=1`: il visitatore ha toccato il cuoricino senza essere entrato
  // ed è tornato qui dopo l'accesso, quindi il profilo si salva da solo
  // (docs/CHANGELOG.md §208).
  // Arrivato dal link personale del professionista (`/p/<codice>`): la
  // richiesta che parte da qui sarà di un cliente suo
  // (docs/changelog/2026-11-08-canale-del-professionista.md).
  const fromPersonalLink = !preview && query.link === "1";
  useEffect(() => {
    if (fromPersonalLink) rememberPersonalLink(professional.id);
  }, [fromPersonalLink, professional.id]);

  const saveAfterLogin = query.salva === "1";
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
    if (initialAgenda) return;
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
  }, [professional.id, initialAgenda]);

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

  // HTML semplice con ProfessionalDetailContent.module.css, non le primitive
  // Tamagui: il telefono non calcola gli stili all'apertura del profilo
  // (docs/changelog/2026-11-09-pagine-pubbliche-senza-tamagui.md).
  const savedKey = `PROFESSIONAL_PROFILE:${professional.id}`;
  const agendaGridStyle = { maxWidth: AGENDA_COLUMN_WIDTH * agendaVisibleDays };
  return (
    <div className={`is_View ${styles.page}`}>
      <div className={`is_View ${styles.column}`}>
        {/* Più vicino alla scheda del gap standard: il percorso ne è l'intestazione. */}
        {breadcrumbs ? (
          <div className={`is_View ${styles.stack}`} style={{ marginTop: -8, marginBottom: -12 }}>
            {breadcrumbs}
          </div>
        ) : null}
        {choice.search ? <ProfileChoiceStrip search={choice.search} pro={choicePro} onToggle={choice.toggle} /> : null}
        {/* Arrivato dal link personale: chi lo ha mandato è lui, il cliente
            deve capire subito di essere nel posto giusto
            (docs/changelog/2026-11-08-canale-del-professionista.md). */}
        {fromPersonalLink ? (
          <div className={`is_View ${styles.personalLink}`} style={{ borderRadius: 10 }}>
            <Icon name="badge-check" size={20} color={brand.cianografiaScuro} />
            <span className={`is_Text ${styles.personalLinkText}`}>Sei sul profilo di {professional.businessName}: scrivigli da qui.</span>
          </div>
        ) : null}
        {/* Scheda identità: un solo blocco coeso (nome, bollini, voto, bio,
            specializzazioni, azioni) su una superficie bianca come le sezioni
            sotto. */}
        <div className={`is_View ${styles.surface} ${styles.gap4}`}>
          <div className={`is_View ${styles.identity}`}>
            {/* Foto accanto al nome anche sul telefono, come nelle schede dei
                risultati (docs/changelog/2026-11-04-prezzi-e-foto-profilo.md). */}
            <div className={`is_View ${styles.identityMain}`}>
              {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events -- Invio e Spazio arrivano da KeyboardActivation, come per i riquadri Tamagui di prima */}
              <div
                className={`is_View ${styles.stack}${professional.imageUrl ? ` ${styles.pointer}` : ""}`}
                onClick={() => {
                  if (professional.imageUrl) setLightbox({ photos: [professional.imageUrl], index: 0 });
                }}
                role={professional.imageUrl ? "button" : undefined}
                tabIndex={professional.imageUrl ? 0 : undefined}
                aria-label={professional.imageUrl ? "Ingrandisci la foto profilo" : undefined}
              >
                {/* Foto grande (140px, richiesta esplicita dell'utente): chi apre
                    la pagina deve riconoscere bene di chi si tratta. */}
                <ProfessionalAvatar imageUrl={professional.imageUrl} categorySlug={professional.categorySlug} size={140} mobileSize={96} shape="portrait" />
              </div>
              <div className={`is_View ${styles.identityText}`}>
                {/* Da telefono nome, mestieri e città restano accanto alla foto;
                    bollini, avviso e recensioni scendono sotto a tutta larghezza
                    invece di lasciare un vuoto sotto la foto
                    (docs/changelog/2026-11-10-foto-profilo-telefono.md). */}
                <div className={`is_View ${styles.identityHead}`}>
                  <h1 className={`is_Text font_heading ${styles.name}`} style={{ overflowWrap: "anywhere" }}>
                    {professional.businessName}
                  </h1>
                  {/* Mestieri come testo sotto il nome (da 1 a 3, docs/CHANGELOG.md §217). */}
                  <span className={`is_Text ${styles.categories}`}>
                    {(professional.categories?.length
                      ? professional.categories
                      : [{ slug: professional.categorySlug, label: professional.categoryLabel }]
                    )
                      .map((category) => category.label)
                      .join(" · ")}
                  </span>
                  <div className={`is_View ${styles.cityLine}`}>
                    <Icon name="map-pin" size={13} color={brand.grafite70} />
                    <span className={`is_Text font_body ${styles.city}`}>{professional.city}</span>
                  </div>
                </div>
                <div className={`is_View ${styles.identityDetails}`}>
                  {/* Bollini in una riga che va a capo (docs/CHANGELOG.md §349); il
                      significato di ognuno in un fumetto (§338). */}
                  <div className={`is_View ${styles.badges}`}>
                    {professional.verified ? (
                      <BadgeInfo info="verified">
                        <Badge variant="verificato">Verificato</Badge>
                      </BadgeInfo>
                    ) : null}
                    {professional.professionalKind ? <ProfessionalKindBadge kind={professional.professionalKind} size="md" /> : null}
                    {/* Verifica di identità di Stripe, distinta dal "Verificato" del nostro team (docs/CHANGELOG.md §241). */}
                    {professional.stripeVerified ? (
                      <BadgeInfo info="stripeVerified">
                        <Badge variant="fatto">{STRIPE_VERIFIED_BADGE.label}</Badge>
                      </BadgeInfo>
                    ) : null}
                    {professional.boosted ? (
                      <BadgeInfo info="boosted">
                        <Badge variant="pro">Sponsorizzato</Badge>
                      </BadgeInfo>
                    ) : null}
                    {professional.isNewProfile ? (
                      <BadgeInfo info="newProfile">
                        <Badge variant="nuovo">Iscritto da poco</Badge>
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
                  </div>
                  {/* Privato o professionista (Codice del consumo art. 49-bis, docs/CHANGELOG.md §241): per un privato
                      l'avviso sui diritti del consumatore resta sempre scritto, non solo nel fumetto: una riga breve
                      e il testo intero dietro "Scopri di più" (docs/changelog/2026-11-10-foto-profilo-telefono.md). */}
                  {professional.traderStatus === "PRIVATE" ? (
                    <LearnMore summary={TRADER_STATUS_COPY.PRIVATE.short}>
                      <span className={`is_Text ${styles.small}`}>{TRADER_STATUS_COPY.PRIVATE.note}</span>
                    </LearnMore>
                  ) : null}
                  {professional.rating !== null ? (
                    <Rating value={professional.rating} count={professional.reviewCount} size={16} />
                  ) : (
                    <span className={`is_Text ${styles.muted}`}>Nessuna recensione ancora</span>
                  )}
                  {/* Una riga sola, in grigio (docs/CHANGELOG.md §349). Il totale non
                      è mai meno dei lavori del mese; mai uno zero. */}
                  {completedTotal > 0 || professional.avgResponseTimeMinutes !== null ? (
                    <span className={`is_Text ${styles.mutedLarge}`}>
                      {[
                        completedTotal > 0 ? `${completedTotal} ${completedTotal === 1 ? "lavoro terminato" : "lavori terminati"}` : null,
                        professional.avgResponseTimeMinutes !== null
                          ? respondsRightAway(professional.avgResponseTimeMinutes)
                            ? "Risponde subito"
                            : `Risponde entro ${formatResponseTime(professional.avgResponseTimeMinutes)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            {/* Salva, condividi e segnala in alto a destra della scheda
                (docs/CHANGELOG.md §349), solo icone con la descrizione al
                passaggio del mouse (§206). Da telefono in colonna a destra del
                nome. Condividi apre la condivisione del dispositivo e ripiega
                sulla copia del link. */}
            {preview ? null : (
              <div className={`is_View ${styles.actions}`}>
                {/* Cuoricino visibile anche a chi non è entrato (docs/CHANGELOG.md
                    §208): al tocco porta all'accesso. Nascosto solo a
                    professionisti e admin, che non salvano profili. */}
                {!user || user.role === "CLIENT" ? (
                  <IconActionButton label={isSaved ? "Salvato" : "Salva"} active={isSaved} disabled={isSaving} celebrate onPress={handleToggleSave} tooltipAlign="end">
                    <Icon name="heart" size={17} strokeWidth={1.5} color={isSaved ? "white" : brand.grafite} fill={isSaved ? "white" : "none"} />
                  </IconActionButton>
                ) : null}
                <IconActionButton label={shareFeedback ?? "Condividi il profilo"} forceTooltip={shareFeedback !== null} onPress={handleShare} tooltipAlign="end">
                  <Icon name="share-2" size={17} strokeWidth={1.5} color={brand.cianografiaScuro} />
                </IconActionButton>
                {user ? (
                  <IconActionButton
                    label={reportedKeys.has(savedKey) ? "Già segnalato" : "Segnala"}
                    disabled={reportedKeys.has(savedKey)}
                    onPress={() => setReportTarget({ targetType: "PROFESSIONAL_PROFILE", targetId: professional.id, label: `il profilo di ${professional.businessName}` })}
                    tooltipAlign="end"
                  >
                    <Icon name="flag" size={17} strokeWidth={1.5} color={brand.grafite70} />
                  </IconActionButton>
                ) : null}
              </div>
            )}
          </div>

          {professional.subTags.length > 0 ? (
            <div className={`is_View ${styles.chips}`}>
              {professional.subTags.map((tag) => (
                <Chip key={tag}>{subTagLabel(tag)}</Chip>
              ))}
            </div>
          ) : null}

          {professional.bio ? <span className={`is_Text ${styles.muted}`}>{professional.bio}</span> : null}

          {/* Lavori svolti subito sotto la descrizione, dentro la scheda
              identità (docs/CHANGELOG.md §208). `?? []`: un'API non ancora
              allineata all'ultimo deploy potrebbe non mandare portfolioUrls. */}
          {(professional.portfolioUrls ?? []).length > 0 ? (
            <div className={`is_View ${styles.stack} ${styles.gap3}`}>
              <div className={`is_View ${styles.titleRow}`}>
                <Icon name="camera" size={16} strokeWidth={1.5} color={brand.cianografiaScuro} />
                <span className={`is_Text font_heading ${styles.subTitle}`}>Lavori svolti</span>
              </div>
              {/* Su telefono le foto scorrono in una riga sola invece di andare a capo (§208). */}
              <div className="portfolio-row scroll-fade">
                {(professional.portfolioUrls ?? []).map((url, photoIndex) => (
                  // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- Invio e Spazio arrivano da KeyboardActivation, come per i riquadri Tamagui di prima
                  <div
                    key={url}
                    className={`is_View ${styles.photo} ${styles.photo96}`}
                    onClick={() => setLightbox({ photos: professional.portfolioUrls ?? [], index: photoIndex })}
                    role="button"
                    tabIndex={0}
                    aria-label={`Ingrandisci foto ${photoIndex + 1} dei lavori svolti`}
                  >
                    <MediaPreview url={url} />
                  </div>
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
                /* Da computer le foto vanno a capo: niente sfumatura, che
                   taglierebbe anche il contorno del focus. */
                @media (min-width: 661px) {
                  .portfolio-row {
                    -webkit-mask-image: none;
                    mask-image: none;
                    animation: none;
                  }
                }
              `}</style>
            </div>
          ) : null}

          {/* Segnali di fiducia dichiarati, mai verificati documentalmente: si
              dice che li scrive il professionista, per non confonderli con
              `verified`. */}
          {professional.yearsOfExperience !== null ||
          professional.spokenLanguages.length > 0 ||
          professional.certifications ||
          professional.hasLiabilityInsurance ? (
            <div className={`is_View ${styles.facts}`}>
              {professional.yearsOfExperience !== null ? (
                <div className={`is_View ${styles.fact}`}>
                  <Icon name="briefcase" size={14} strokeWidth={1.5} color={brand.grafite70} />
                  <span className={`is_Text ${styles.small}`}>
                    {professional.yearsOfExperience} {professional.yearsOfExperience === 1 ? "anno" : "anni"} di esperienza
                  </span>
                </div>
              ) : null}
              {/* Lingue nello stesso elenco di esperienza, patentini e assicurazione (§208). */}
              {professional.spokenLanguages.length > 0 ? (
                <div className={`is_View ${styles.fact}`}>
                  <Icon name="message-circle" size={14} strokeWidth={1.5} color={brand.grafite70} />
                  <span className={`is_Text ${styles.small}`}>Parla {professional.spokenLanguages.join(", ")}</span>
                </div>
              ) : null}
              {professional.certifications ? (
                <div className={`is_View ${styles.fact} ${styles.factTop}`}>
                  <Icon name="shield" size={14} strokeWidth={1.5} color={brand.grafite70} />
                  <span className={`is_Text ${styles.small} ${styles.grow}`}>{professional.certifications}</span>
                </div>
              ) : null}
              {professional.hasLiabilityInsurance ? (
                <div className={`is_View ${styles.fact}`}>
                  <Icon name="shield-check" size={14} strokeWidth={1.5} color={brand.grafite70} />
                  <span className={`is_Text ${styles.small}`}>Assicurazione RC professionale</span>
                </div>
              ) : null}
              {/* Cosa abbiamo controllato e cosa no, senza contraddire "Verificato" (collaudo B-11, E-10). */}
              <span className={`is_Text ${styles.small} ${styles.italic}`}>
                {professional.verified
                  ? "Abbiamo verificato l'identità. Esperienza, lingue, qualifiche e assicurazione le scrive il professionista."
                  : "Esperienza, lingue, qualifiche e assicurazione le scrive il professionista."}
              </span>
            </div>
          ) : null}
        </div>

        {professional.acceptingRequests && agendaPreview?.hasAnySlot ? (
          <div className={`is_View ${styles.stack} ${styles.gap3}`}>
            {/* Ancora per il click sulle pillole della mini-agenda nei risultati
                di ricerca: scrollMarginTop compensa l'intestazione fissa. */}
            <div id="agenda" style={{ scrollMarginTop: 96 }} />
            {/* Agenda su una superficie sua (richiesta esplicita dell'utente),
                come la scheda identità in cima. */}
            <div className={`is_View ${styles.surface} ${styles.gap3}`}>
              <div className={`is_View ${styles.titleRow}`}>
                <Icon name="calendar" size={18} strokeWidth={1.5} color={brand.cianografiaScuro} />
                <span className={`is_Text font_heading ${styles.sectionTitle}`}>Agenda</span>
              </div>
              {/* Una riga sola (docs/CHANGELOG.md §349): gli orari al completo sono grigi. */}
              <span className={`is_Text ${styles.small}`}>Scegli un orario libero per chiedere un preventivo.</span>

              {/* Larghezza massima pari alla griglia (docs/CHANGELOG.md §227):
                  le frecce stanno sopra l'ultima colonna. */}
              <div className={`is_View ${styles.agendaHead}`} style={agendaGridStyle}>
                {/* Tab "A domicilio"/"Online" e frecce dei giorni sulla stessa
                    riga, subito sopra i giorni (docs/changelog/2026-11-04-prezzi-e-foto-profilo.md);
                    fino a 390px pulsanti e frecce un po' più stretti. */}
                <div className={`is_View ${styles.modeRow}`}>
                  <span className={`is_Text font_body ${styles.modeLabel}`}>Orari per:</span>
                  <div className={`is_View ${styles.segmented}`}>
                    {(["HOME", "ONLINE"] as const).map((mode) => {
                      const active = agendaMode === mode;
                      return (
                        <button
                          key={mode}
                          className={`is_View ${styles.modeButton}${active ? ` ${styles.modeButtonActive}` : ""}`}
                          aria-pressed={active}
                          onClick={() => {
                            setAgendaMode(mode);
                            setAgendaWindowOffset(0);
                          }}
                        >
                          <span className={`is_Text font_body ${styles.modeText}${active ? ` ${styles.white}` : ""}`}>
                            {mode === "HOME" ? "A domicilio" : "Online"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {totalAgendaDays > agendaVisibleDays ? (
                    <div className={`is_View ${styles.arrows}`}>
                      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events -- Invio e Spazio arrivano da KeyboardActivation, come per i riquadri Tamagui di prima */}
                      <div
                        className={`is_View ${styles.arrow} ${agendaCanGoBack ? `hover-ring ${styles.arrowOn}` : styles.arrowOff}`}
                        // Sempre un pulsante, spento all'inizio: un riquadro con un nome e senza ruolo non si legge (collaudo L-11).
                        role="button"
                        aria-disabled={!agendaCanGoBack}
                        tabIndex={agendaCanGoBack ? 0 : -1}
                        aria-label="Giorni precedenti"
                        onClick={agendaCanGoBack ? () => setAgendaWindowOffset(Math.max(0, agendaOffset - agendaVisibleDays)) : undefined}
                      >
                        <Icon name="chevron-left" size={20} color={brand.grafite} />
                      </div>
                      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events -- Invio e Spazio arrivano da KeyboardActivation, come per i riquadri Tamagui di prima */}
                      <div
                        className={`is_View ${styles.arrow} ${agendaCanGoForward ? `hover-ring ${styles.arrowOn}` : styles.arrowOff}`}
                        role="button"
                        aria-disabled={!agendaCanGoForward}
                        tabIndex={agendaCanGoForward ? 0 : -1}
                        aria-label="Giorni successivi"
                        onClick={agendaCanGoForward ? () => setAgendaWindowOffset(agendaOffset + agendaVisibleDays) : undefined}
                      >
                        <Icon name="chevron-right" size={20} color={brand.grafite} />
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className={`is_View ${styles.row}`}>
                  {agendaWindowDays.map((day) => (
                    <div key={day.date} className={`is_View ${styles.dayHead}`}>
                      <span className={`is_Text font_body ${styles.dayLabel}`}>{day.label}</span>
                      <span className={`is_Text ${styles.dayDate}`}>{day.dateLabel}</span>
                    </div>
                  ))}
                </div>
              </div>

              {agendaTimeRows.length > 0 ? (
                <div className={`is_View ${styles.times}`} style={agendaGridStyle}>
                  {agendaTimeRows.map((time) => (
                    <div key={time} className={`is_View ${styles.row}`}>
                      {agendaWindowDays.map((day) => {
                        const slot = day.slots.find((s) => s.startTime === time);
                        if (!slot) {
                          return (
                            <div key={day.date} className={`is_View ${styles.cell} ${styles.cellPadded}`}>
                              <span className={`is_Text ${styles.dash}`}>-</span>
                            </div>
                          );
                        }
                        const range = `${slot.startTime}–${slot.endTime}`;
                        const modeInfo = agendaMode === "HOME" ? slot.home : slot.online;
                        const isFull = !modeInfo || modeInfo.bookedCount >= modeInfo.maxBookings;
                        if (isFull) {
                          return (
                            <div key={day.date} className={`is_View ${styles.cell} ${styles.cellPadded}`}>
                              {/* Al completo: grigio chiaro, senza barra (docs/CHANGELOG.md §349). */}
                              <span className={`is_Text ${styles.full}`} aria-label={`${range}, al completo`}>
                                {range.replace("–", "–​")}
                              </span>
                            </div>
                          );
                        }
                        // `nomeProfessionista`/`fotoProfessionista`: il cliente
                        // deve capire subito che la richiesta va a QUESTO
                        // professionista (richiesta esplicita dell'utente). Nomi
                        // distinti da "nome"/"foto" per non collidere col "nome"
                        // del CLIENTE nello stesso modulo.
                        const href = `/preventivo?categoria=${professional.categorySlug}&professionista=${professional.id}&nomeProfessionista=${encodeURIComponent(professional.businessName)}&fotoProfessionista=${encodeURIComponent(professional.imageUrl ?? "")}&data=${day.date}&fasciaOraria=${slot.startTime}-${slot.endTime}&modalita=${agendaMode}${serviceDescriptionParam}&da=${PROFILE_REQUEST_SOURCE_PARAM.AGENDA}`;
                        return (
                          <div key={day.date} className={`is_View ${styles.cell} ${styles.cellSlot}`}>
                            <Link href={href} className="hover-ring-host" style={{ textDecoration: "none", pointerEvents: preview ? "none" : undefined }} tabIndex={preview ? -1 : undefined}>
                              {/* Orari a 14px: se la fascia non sta su una riga va a capo dopo il trattino
                                  (punto 22, docs/changelog/2026-11-08-prova-persone-simulate.md). */}
                              <div className={`is_View hover-ring-target ${styles.slot}`}>
                                <span className={`is_Text ${styles.slotText}`}>{range.replace("–", "–​")}</span>
                              </div>
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ) : null}

              {agendaHasAvailableInWindow ? null : agendaFirstFree ? (
                <div className={`is_View ${styles.firstFree}`}>
                  <div className={`is_View ${styles.firstFreeText}`}>
                    <span className={`is_Text ${styles.small}`}>Nessun orario libero in questi giorni. Primo orario libero:</span>
                    <span className={`is_Text ${styles.firstFreeWhen}`}>
                      {agendaFirstFree.day.dateLabel}, {agendaFirstFree.slot.startTime}–{agendaFirstFree.slot.endTime}
                    </span>
                  </div>
                  {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events -- Invio e Spazio arrivano da KeyboardActivation, come per i riquadri Tamagui di prima */}
                  <div className={`is_View ${styles.firstFreeButton}`} role="button" tabIndex={0} onClick={() => setAgendaWindowOffset(agendaFirstFree.index)}>
                    <span className={`is_Text font_body ${styles.firstFreeButtonText}`}>Mostra orari disponibili →</span>
                  </div>
                </div>
              ) : (
                <span className={`is_Text ${styles.small}`}>Nessun orario libero nei prossimi due mesi.</span>
              )}
            </div>
          </div>
        ) : null}

        {/* Con dei professionisti scelti la barra in basso è quella dei risultati. */}
        {choice.search && choice.search.chosen.length > 0 ? (
          <ChosenProsBar
            chosen={choice.search.chosen}
            max={MAX_CHOSEN_PROFESSIONALS}
            href={chosenRequestHref(choice.search.chosen, choice.search.category, choice.search.description, choice.search.city)}
          />
        ) : null}
        {/* Account in pausa per l'abbonamento (docs/CHANGELOG.md §162): il
            profilo resta visibile dal link, ma senza agenda né richieste. */}
        {professional.acceptingRequests ? (
          <ProfileQuoteCta
            href={`/preventivo?categoria=${professional.categorySlug}&professionista=${professional.id}&nomeProfessionista=${encodeURIComponent(professional.businessName)}&fotoProfessionista=${encodeURIComponent(professional.imageUrl ?? "")}${serviceDescriptionParam}`}
            name={professional.businessName}
            preview={preview}
            withBar={user?.professionalProfileId !== professional.id && !(choice.search && choice.search.chosen.length > 0)}
            summary={
              <div className={`is_View ${styles.barSummary}`}>
                <ProfessionalAvatar imageUrl={professional.imageUrl} categorySlug={professional.categorySlug} size={40} />
                {/* Sul telefono resta solo la foto: il nome accanto al pulsante non ci starebbe. */}
                <div className="profile-cta-bar-text">
                  <div className={`is_View ${styles.barText}`}>
                    <span className={`is_Text ${styles.barName}`}>{professional.businessName}</span>
                    <div className={`is_View ${styles.barMeta}`}>
                      {professional.rating !== null ? <Rating value={professional.rating} count={professional.reviewCount} size={13} textSize={13} /> : null}
                      {professional.avgResponseTimeMinutes !== null ? (
                        <span className={`is_Text ${styles.small}`}>
                          {professional.rating !== null ? "· " : ""}
                          {respondsRightAway(professional.avgResponseTimeMinutes)
                            ? "Risponde subito"
                            : `Risponde entro ${formatResponseTime(professional.avgResponseTimeMinutes)}`}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            }
          />
        ) : (
          <div className={`is_View ${styles.surface} ${styles.gap2}`}>
            <span className={`is_Text ${styles.strong}`}>
              {/* Pausa scelta da lui (collaudo C-16): si dice quando torna. */}
              {professional.awayUntil ? `In pausa: torna ${formatAppointmentDate(professional.awayUntil, { weekday: "long", day: "numeric", month: "long" })}` : "Al momento non accetta nuove richieste"}
            </span>
            <span className={`is_Text ${styles.muted}`}>Puoi chiedere un preventivo ad altri professionisti della stessa categoria nella tua zona.</span>
            <Link href={`/cerca/${professional.categorySlug}`} style={{ textDecoration: "none", alignSelf: "flex-start", pointerEvents: preview ? "none" : undefined }} tabIndex={preview ? -1 : undefined}>
              <Button tabIndex={-1} variant="secondary">{`Cerca altri: ${professional.categoryLabel}`}</Button>
            </Link>
          </div>
        )}

        {professional.services.length > 0 ? (
          <div className={`is_View ${styles.stack} ${styles.gap3}`}>
            <div className={`is_View ${styles.titleRow}`}>
              <Icon name="receipt-text" size={18} strokeWidth={1.5} color={brand.cianografiaScuro} />
              <span className={`is_Text font_heading ${styles.sectionTitle}`}>Prestazioni</span>
            </div>
            {/* Divise per mestiere quando sono più d'uno (docs/changelog/2026-11-05-registrazione-colonna-unica.md). */}
            {serviceGroups.map((group) => (
              <div key={group.slug ?? "tutte"} className={`is_View ${styles.stack} ${styles.gap2}`}>
                {serviceGroups.length > 1 && group.slug ? (
                  <div className={`is_View ${styles.titleRow}`}>
                    <CategoryIconBadge slug={group.slug} size={28} />
                    <span className={`is_Text ${styles.strong}`}>{group.label}</span>
                  </div>
                ) : null}
                <div className={`is_View ${styles.surface} ${styles.servicesList}`}>
                  {group.services.map((service, index) => (
                    <div key={service.id} className={`is_View ${styles.serviceRow}${index === 0 ? ` ${styles.serviceFirst}` : ""}`}>
                      <PriceLine
                        label={service.name}
                        labelColor={brand.grafite}
                        price={formatServicePriceRange(service.priceMinEurCents, service.priceMaxEurCents)}
                        unit={service.priceMinEurCents !== null || service.priceMaxEurCents !== null ? shownServicePriceUnit(service.priceUnit) : undefined}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* "Lavori fatti" (docs/changelog/2026-11-08-lavori-fatti.md): foto di
            fine lavoro, solo con l'ok del cliente dato recensendo, con le
            stelle di quel lavoro. */}
        {(professional.finishedJobs ?? []).length > 0 ? (
          <div className={`is_View ${styles.stack} ${styles.gap3}`}>
            <div className={`is_View ${styles.titleRow}`}>
              <Icon name="badge-check" size={18} strokeWidth={1.5} color={brand.cianografiaScuro} />
              <span className={`is_Text font_heading ${styles.sectionTitle}`}>Lavori fatti tramite il sito</span>
            </div>
            <div className="finished-jobs-row scroll-fade" role="list">
              {(professional.finishedJobs ?? []).map((job) => (
                <div key={job.id} role="listitem" className="finished-job">
                  {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events -- Invio e Spazio arrivano da KeyboardActivation, come per i riquadri Tamagui di prima */}
                  <div
                    className={`is_View ${styles.photo} ${styles.jobPhoto}`}
                    onClick={() => setLightbox({ photos: job.photoUrls, index: 0 })}
                    role="button"
                    tabIndex={0}
                    aria-label={`Ingrandisci le foto del lavoro: ${job.label}`}
                  >
                    <MediaPreview url={job.photoUrls[0] ?? ""} />
                    {job.photoUrls.length > 1 ? (
                      <div className={`is_View ${styles.photoCount}`}>
                        <span className={`is_Text ${styles.photoCountText}`}>{job.photoUrls.length} foto</span>
                      </div>
                    ) : null}
                  </div>
                  <div className={`is_View ${styles.jobText}`}>
                    <span className={`is_Text ${styles.jobLabel}`}>{job.label}</span>
                    <div className={`is_View ${styles.jobMeta}`}>
                      <Icon name="star" size={13} strokeWidth={1.5} color={brand.ottone} fill={brand.ottone} />
                      <span className={`is_Text ${styles.small}`}>
                        {job.rating}/5 · {[job.city, new Date(job.doneAt).toLocaleDateString("it-IT", { month: "long", year: "numeric", timeZone: "Europe/Rome" })].filter(Boolean).join(", ")}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Ancora per le stelle accanto al nome nelle schede del cliente (§342), come #agenda. */}
        <div id="recensioni" style={{ scrollMarginTop: 96 }} />
        <div className={`is_View ${styles.stack} ${styles.gap3}`}>
          <div className={`is_View ${styles.reviewsHead}`}>
            <div className={`is_View ${styles.titleRow}`}>
              <Icon name="star" size={18} strokeWidth={1.5} color={brand.cianografiaScuro} />
              <span className={`is_Text font_heading ${styles.sectionTitle}`}>Recensioni</span>
            </div>
            {professional.rating !== null ? <Rating value={professional.rating} count={professional.reviewCount} /> : null}
          </div>
          {professional.reviews.length === 0 ? (
            <EmptyState icon="star" title="Nessuna recensione ancora" description="Le recensioni arrivano solo da lavori fatti tramite il sito." />
          ) : (
            professional.reviews.map((review) => (
              <div key={review.id} className={`is_View ${styles.stack} ${styles.gap0}`}>
                {/* Ancora per il link dalla home ("Ultime recensioni", RecentReviews.tsx), come #agenda sopra. */}
                <div id={`recensione-${review.id}`} style={{ scrollMarginTop: 96 }} />
                <div className={`is_View ${styles.surface} ${styles.gap2}`}>
                  <div className={`is_View ${styles.reviewTop}`}>
                    <div className={`is_View ${styles.reviewInfo}`}>
                      <div className={`is_View ${styles.reviewLine}`}>
                        <div className={`is_View ${styles.reviewStars}`}>
                          <Icon name="star" size={15} strokeWidth={1.5} color={brand.ottone} fill={brand.ottone} />
                          <span className={`is_Text ${styles.reviewRating}`}>{review.rating}/5</span>
                        </div>
                        {/* Ogni recensione nasce solo da un lavoro confermato sul sito: lo si dice (come in home). */}
                        <BadgeInfo info="confirmedJob">
                          <div className={`is_View ${styles.confirmed}`}>
                            <Icon name="badge-check" size={13} strokeWidth={2} color={brand.verificato} />
                            <span className={`is_Text ${styles.confirmedText}`}>Lavoro fatto tramite il sito</span>
                          </div>
                        </BadgeInfo>
                      </div>
                      {/* Chi l'ha scritta e per quale lavoro (docs/CHANGELOG.md §349):
                          il servizio solo se il professionista fa più mestieri. */}
                      <span className={`is_Text ${styles.small}`}>
                        <span className={`is_Text ${styles.reviewAuthor}`}>{review.clientName ?? "Cliente"}</span>
                        {review.jobLabel && (professional.categories?.length ?? 1) > 1 ? ` · ${review.jobLabel}` : ""} · {reviewTimeAgo(review.createdAt)}
                      </span>
                    </div>
                    {user && !preview ? (
                      // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- Invio e Spazio arrivano da KeyboardActivation, come per i riquadri Tamagui di prima
                      <div
                        className={`is_View ${styles.reportReview}${reportedKeys.has(`REVIEW:${review.id}`) ? ` ${styles.reportReviewDone}` : ""}`}
                        onClick={
                          reportedKeys.has(`REVIEW:${review.id}`)
                            ? undefined
                            : () => setReportTarget({ targetType: "REVIEW", targetId: review.id, label: "questa recensione" })
                        }
                        role="button"
                        tabIndex={0}
                      >
                        <Icon name="flag" size={12} strokeWidth={1.5} color={brand.grafite70} />
                        <span className={`is_Text ${styles.small}`}>{reportedKeys.has(`REVIEW:${review.id}`) ? "Già segnalato" : "Segnala"}</span>
                      </div>
                    ) : null}
                  </div>
                  {review.comment ? <span className={`is_Text ${styles.muted}`}>{review.comment}</span> : null}
                  {review.updatedAfterIssueAt ? (
                    <span className={`is_Text ${styles.small}`}>
                      Aggiornata il {new Date(review.updatedAfterIssueAt).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })} dopo una
                      segnalazione a lavoro chiuso
                    </span>
                  ) : null}
                  {/* `?? []`: un'API non ancora allineata all'ultimo deploy potrebbe non mandare photoUrls. */}
                  {(review.photoUrls ?? []).length > 0 ? (
                    <div className={`is_View ${styles.chips}`}>
                      {(review.photoUrls ?? []).map((url, photoIndex) => (
                        // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- Invio e Spazio arrivano da KeyboardActivation, come per i riquadri Tamagui di prima
                        <div
                          key={url}
                          className={`is_View ${styles.photo} ${styles.photo72}`}
                          onClick={() => setLightbox({ photos: review.photoUrls ?? [], index: photoIndex })}
                          role="button"
                          tabIndex={0}
                          aria-label={`Ingrandisci foto ${photoIndex + 1} della recensione`}
                        >
                          <MediaPreview url={url} />
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <ReviewReply
                    reviewId={review.id}
                    businessName={professional.businessName}
                    reply={review.professionalReply ?? null}
                    canEdit={!preview && !!token && user?.professionalProfileId === professional.id}
                    token={token}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

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
    </div>
  );
}
