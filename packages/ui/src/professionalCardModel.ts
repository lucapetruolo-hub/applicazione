import { useMemo, useState, type ReactNode } from "react";
import type { ProfessionalKindValue } from "./professionalKind";
import { priceUnitSuffix, type ProfessionalCardPriceUnit } from "./cardText";

/*
 * Tipi e conti della scheda del professionista, comuni a ProfessionalCard.tsx
 * (Tamagui, app) e ProfessionalCard.web.tsx (HTML semplice per il sito,
 * docs/changelog/2026-11-09-pagine-pubbliche-senza-tamagui.md): le due
 * varianti cambiano solo nel disegno, mai nei conti.
 */

export type ProfessionalCardService = {
  id: string;
  name: string;
  priceMinEurCents: number | null;
  priceMaxEurCents: number | null;
  /** A cosa si riferisce il prezzo (docs/CHANGELOG.md §398); senza, nessuna unità mostrata. */
  priceUnit?: ProfessionalCardPriceUnit;
};

export type { ProfessionalCardPriceUnit } from "./cardText";

// Stesse parole di SERVICE_PRICE_UNIT_LABEL in packages/shared (duplicate per
// lo stesso motivo di formatAmount qui sotto).
// "a lavoro" non si scrive: è il modo normale di leggere un prezzo, l'unità
// compare solo quando è diversa (shownServicePriceUnit in packages/shared,
// docs/changelog/2026-11-04-prezzi-e-foto-profilo.md).
const PRICE_UNIT_LABEL: Record<ProfessionalCardPriceUnit, string | undefined> = {
  JOB: undefined,
  HOUR: "all'ora",
  DAY: "al giorno",
  SQUARE_METER: "al m²",
};

/**
 * Un orario configurato in un giorno della mini-agenda — disponibilità
 * indipendente per modalità (richiesta esplicita dell'utente: tab "A
 * domicilio"/"Online" sopra "Prossima disponibilità", ognuna mostra solo gli
 * orari con quella modalità offerta e la relativa capienza residua).
 * `allowsHome`/`allowsOnline` = il professionista offre quel tipo su questa
 * fascia; `homeAvailable`/`onlineAvailable` = offerto E con capienza ancora
 * residua per quel tipo.
 */
export type ProfessionalCardAvailabilitySlot = {
  time: string;
  /** Fine della fascia: mostrata insieme a `time` come intervallo completo, non solo l'inizio. */
  endTime: string;
  allowsHome: boolean;
  allowsOnline: boolean;
  homeAvailable: boolean;
  onlineAvailable: boolean;
};

/** Un giorno della mini-agenda con almeno una fascia configurata, libera o al completo. */
export type ProfessionalCardAvailabilityDay = {
  date: string;
  times: ProfessionalCardAvailabilitySlot[];
};

export const AGENDA_VISIBLE_DAYS = 4;
/**
 * Sul telefono (fino a 660px) 3 giorni: con gli orari a 14px le fasce andavano
 * su due righe e la scheda diventava alta (Luca, 08/11/2026,
 * docs/changelog/2026-11-08-prova-persone-simulate.md).
 */
export const AGENDA_VISIBLE_DAYS_PHONE = 3;
// Stesso valore di PUBLIC_AGENDA_DAYS in packages/shared (qui duplicato:
// packages/ui non dipende dal resto del monorepo, vedi formatServicePrice).
const DEFAULT_AGENDA_DAYS = 63;
const WEEKDAY_SHORT_LABELS = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
const MONTH_SHORT_LABELS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

// Duplicata (non importata da @professionisti/shared): packages/ui non
// dipende dal resto del monorepo, resta un design system consumabile da solo
// — vedi formatServicePriceRange in packages/shared/src/professionals.ts per
// la stessa logica lato pagina profilo pubblica.
export function formatAmount(cents: number): string {
  const euros = Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return cents % 100 === 0 ? euros : `${euros},${(cents % 100).toString().padStart(2, "0")}`;
}

export function formatServicePrice(priceMinEurCents: number | null, priceMaxEurCents: number | null, unit?: ProfessionalCardPriceUnit): string {
  const label = unit ? PRICE_UNIT_LABEL[unit] : undefined;
  const suffix = label ? ` ${label}` : "";
  if (priceMinEurCents !== null && priceMaxEurCents !== null && priceMaxEurCents > priceMinEurCents) {
    return `${formatAmount(priceMinEurCents)}–${formatAmount(priceMaxEurCents)} €${suffix}`;
  }
  const single = priceMinEurCents ?? priceMaxEurCents;
  return single !== null ? `${formatAmount(single)} €${suffix}` : "Su richiesta";
}

/** Unità da mostrare prima del prezzo nella riga (§399); nessuna senza prezzo. */
export function priceUnitLabel(service: ProfessionalCardService): string | undefined {
  if (!service.priceUnit || (service.priceMinEurCents === null && service.priceMaxEurCents === null)) return undefined;
  return PRICE_UNIT_LABEL[service.priceUnit];
}

/** Prestazione col prezzo più basso ("da 40 €" sulla scheda chiusa), o null se nessuna ha un prezzo. */
function lowestServicePrice(services: ProfessionalCardService[]): { cents: number; unit?: ProfessionalCardPriceUnit } | null {
  let lowest: { cents: number; unit?: ProfessionalCardPriceUnit } | null = null;
  for (const service of services) {
    const cents = service.priceMinEurCents ?? service.priceMaxEurCents;
    if (cents !== null && (lowest === null || cents < lowest.cents)) lowest = { cents, unit: service.priceUnit };
  }
  return lowest;
}

type StopPropagationEvent = { stopPropagation?: () => void } | undefined;

export function stop(e: unknown) {
  (e as StopPropagationEvent)?.stopPropagation?.();
}

export type ProfessionalCardProps = {
  businessName: string;
  categoryLabel: string;
  /** Le altre categorie del professionista (fino a 2), mostrate dopo `categoryLabel`. */
  otherCategoryLabels?: string[];
  city: string;
  /** Distanza in km dal luogo cercato (ricerca per luogo): mostrata accanto alla città. */
  distanceKm?: number;
  /** Sotto-tag di specializzazione (es. "impianti civili"), mostrati accanto alla categoria — fino a 3. */
  subTags?: string[];
  rating?: number;
  reviewCount?: number;
  /** "Ha completato N interventi questo mese" (richiesta esplicita dell'utente) — dato reale (Booking COMPLETED nel mese corrente), 0/assente non mostra nulla. */
  completedThisMonth?: number;
  verified?: boolean;
  /** Identità verificata da Stripe (KYC/KYB, docs/CHANGELOG.md §241): badge distinto da "Verificato". */
  stripeVerified?: boolean;
  /** Come si è iscritto: privato, partita IVA o azienda (docs/CHANGELOG.md §338). */
  professionalKind?: ProfessionalKindValue | null;
  /**
   * Boost di visibilità attivo (richiesta esplicita dell'utente, "Verbale
   * di Conformità" — trasparenza sul ranking sponsorizzato, art. 26 DSA):
   * il profilo pubblico mostra già questa pillola quando boostato, ma i
   * risultati di ricerca — dove il boost altera davvero l'ordine — non la
   * mostravano affatto, lasciando intendere un ordinamento neutro che non
   * lo è. Colore ottone: stesso token già riservato ai soli contesti di
   * pagamento/boost (CLAUDE.md §10).
   */
  boosted?: boolean;
  /**
   * Profilo appena creato, ancora senza bio/prestazioni/portfolio/
   * recensioni — richiesta esplicita dell'utente ("Verbale Cognitivo"
   * F3.1: "creando una sorta di badge con scritto 'Nuovo profilo'"),
   * calcolato lato server (vedi ProfessionalsService) invece che dedotto
   * qui da campi non tutti disponibili su questo tipo leggero.
   */
  isNewProfile?: boolean;
  /**
   * Assicurazione RC professionale dichiarata dal professionista
   * (docs/CHANGELOG.md §157): nessuno la controlla ancora, quindi la pillola
   * dice "dichiarata" e non usa la spunta verde riservata a "Verificato".
   */
  hasLiabilityInsurance?: boolean;
  remoteAvailable?: boolean;
  /** Prestazioni offerte con prezzo facoltativo, mostrate sotto categoria/città. */
  services?: ProfessionalCardService[];
  /**
   * Giorni dell'agenda (circa due mesi), ogni fascia configurata a
   * prescindere dalla capienza: la griglia ne mostra 4 alla volta con le
   * frecce, e qui si cerca il primo orario libero per "Mostra orari
   * disponibili". Vuoto/assente nasconde la mini-agenda.
   */
  availabilityPreview?: ProfessionalCardAvailabilityDay[];
  /**
   * Primo giorno dell'agenda (AAAA-MM-GG, colonna "Oggi"): da qui la card
   * ricostruisce le colonne consecutive, anche quelle senza fasce, che il
   * server non manda per tenere leggera la risposta della ricerca.
   */
  availabilityFrom?: string;
  /** Quanti giorni si possono sfogliare da `availabilityFrom` (default 63). */
  availabilityDays?: number;
  /**
   * Tab di default (richiesta esplicita dell'utente: prescelto in base al
   * tipo di ricerca fatto dalla homepage — "a domicilio" se cercato a
   * domicilio, "online" se cercato online). Default "HOME" se assente.
   */
  defaultMode?: "HOME" | "ONLINE";
  /**
   * Orari e prezzi aperti fin dall'inizio (docs/CHANGELOG.md §349): nelle
   * liste solo la prima scheda li mostra, le altre hanno "Vedi orari e
   * prezzi" e restano tutte della stessa altezza.
   */
  defaultExpanded?: boolean;
  onPress?: () => void;
  /**
   * Indirizzo del profilo (solo web): il nome diventa un link vero, che si
   * apre in un'altra scheda con Ctrl/Cmd+clic o il tasto centrale e che i
   * motori di ricerca seguono (docs/CHANGELOG.md §271). Il clic normale
   * resta gestito da `onPress` della card, come prima.
   */
  href?: string;
  /**
   * Click su una singola cella orario libera: non deve propagare al click
   * della card intera. `endTime`/`mode` inclusi (oltre a data/ora inizio)
   * perché chi consuma il componente porta l'utente direttamente alla
   * richiesta di preventivo precompilata con quella fascia esatta e la
   * modalità (A domicilio/Online) attiva sul tab di questa card — mai una
   * prenotazione diretta da qui.
   */
  onSlotPress?: (date: string, time: string, endTime: string, mode: "HOME" | "ONLINE") => void;
  /**
   * Click sull'agenda fuori dagli orari liberi (intestazione di un giorno,
   * orario al completo, spazio vuoto): richiesta esplicita dell'utente, porta
   * all'agenda della pagina profilo già posizionata su quel giorno
   * (docs/CHANGELOG.md §206).
   */
  onAgendaPress?: (date: string, mode: "HOME" | "ONLINE") => void;
  /**
   * Prestazione cercata (voce di "Quanto costa in media", docs/CHANGELOG.md
   * §398): prima nell'elenco, in evidenza, e il suo prezzo al posto di
   * "da … €" sulla scheda chiusa.
   */
  highlightServiceId?: string;
  /**
   * Quante prestazioni in cima a `services` sono del mestiere cercato: il
   * "da … €" usa solo quelle (se sono almeno una con un prezzo).
   */
  priceFromFirst?: number;
  /** Slot opzionale per un'icona/badge categoria (passato da chi consuma il componente, così l'icona custom resta web-only senza sporcare packages/ui). */
  icon?: ReactNode;
  /**
   * Slot opzionale accanto al nome, in alto a destra della colonna dati (es.
   * il cuoricino "salva", docs/CHANGELOG.md §208). Chi lo passa ferma da sé
   * la propagazione del clic, altrimenti si aprirebbe anche il profilo.
   */
  action?: ReactNode;
  /** Riga "Perché" quando si arriva dalla descrizione del problema (docs/CHANGELOG.md §392). */
  reason?: string | null;
};

/**
 * Stato e conti della scheda. `isPhone` = fino a 660px (3 giorni invece di 4):
 * l'app lo prende da `useMedia` di Tamagui, il sito da un media query.
 */
export function useProfessionalCardModel(props: ProfessionalCardProps, isPhone: boolean) {
  const {
    categoryLabel,
    otherCategoryLabels,
    subTags,
    isNewProfile,
    hasLiabilityInsurance,
    services,
    priceFromFirst,
    availabilityPreview,
    availabilityFrom,
    availabilityDays = DEFAULT_AGENDA_DAYS,
    defaultMode,
    defaultExpanded = false,
    onAgendaPress,
    highlightServiceId,
  } = props;
  // Mestieri in grassetto, specializzazioni dopo in grigio, al massimo due
  // righe (docs/CHANGELOG.md §349): prima era un elenco unico tutto uguale.
  const categoriesLine = [categoryLabel, ...(otherCategoryLabels ?? [])].join(" · ");
  const specialties = subTags && subTags.length > 0 ? subTags.slice(0, 3).join(", ") : null;
  // Richiesta esplicita dell'utente: "dai la possibilità tramite freccetta
  // di far vedere tutte le prestazioni... ora se ne vedono solo 3".
  const [showAllServices, setShowAllServices] = useState(false);
  // Sul telefono (sotto i 660px) "Nuovo profilo" e "Assicurazione RC" stanno
  // dietro un "+N": con tutti i bollini la scheda ne metteva 6 in colonna.
  // Restano sempre in vista Verificato, Privato/Partita IVA, Pagamenti online
  // e Sponsorizzato, che la legge vuole riconoscibile (Luca,
  // docs/changelog/2026-11-06-filtro-pagamenti-online.md).
  const [showAllBadges, setShowAllBadges] = useState(false);
  const extraBadges = (isNewProfile ? 1 : 0) + (hasLiabilityInsurance ? 1 : 0);
  // Orari e prezzi sotto il blocco del nome, a tutta larghezza, chiusi tranne
  // che nella prima scheda della lista (docs/CHANGELOG.md §349): prima la
  // mini-agenda stava a destra e schiacciava nome, mestiere e voto in una
  // colonna di 150 px, e nella stessa lista convivevano due formati di scheda.
  const [expanded, setExpanded] = useState(defaultExpanded);

  // Tab "A domicilio"/"Online" (richiesta esplicita dell'utente): filtrano
  // gli orari mostrati in base alla modalità offerta su quella fascia — "A
  // domicilio" mostra le fasce con la spunta domicilio (sola o insieme a
  // online), "Online" quelle con la spunta online (sola o insieme a
  // domicilio). Prescelto in base al tipo di ricerca del cliente.
  const [activeMode, setActiveMode] = useState<"HOME" | "ONLINE">(defaultMode ?? "HOME");

  // Finestra di AGENDA_VISIBLE_DAYS colonne che scorre sui giorni già
  // scaricati (circa due mesi, vedi ProfessionalsService.buildAvailabilityPreviews)
  // — richiesta esplicita dell'utente di poter navigare anche ai giorni
  // successivi senza una richiesta di rete per pagina.
  const [windowOffset, setWindowOffset] = useState(0);
  const visibleCount = isPhone ? AGENDA_VISIBLE_DAYS_PHONE : AGENDA_VISIBLE_DAYS;
  // Colonne giorno consecutive da `availabilityFrom`, con "-" dove il
  // professionista non ha fasce (riferimento miodottore.it).
  const allDays = useMemo(() => {
    if (!availabilityPreview || availabilityPreview.length === 0) return [];
    const timesByDate = new Map(availabilityPreview.map((day) => [day.date, day.times]));
    const start = new Date(`${availabilityFrom ?? availabilityPreview[0]!.date}T00:00:00Z`);
    return Array.from({ length: availabilityDays }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + index);
      const iso = date.toISOString().slice(0, 10);
      return {
        date: iso,
        label: index === 0 ? "Oggi" : index === 1 ? "Domani" : WEEKDAY_SHORT_LABELS[date.getUTCDay()]!,
        dateLabel: `${date.getUTCDate()} ${MONTH_SHORT_LABELS[date.getUTCMonth()]}`,
        times: timesByDate.get(iso) ?? [],
      };
    });
  }, [availabilityPreview, availabilityFrom, availabilityDays]);
  const totalDays = allDays.length;
  const maxOffset = Math.max(0, totalDays - visibleCount);
  const offset = Math.min(windowOffset, maxOffset);
  const allowsKey = activeMode === "HOME" ? ("allowsHome" as const) : ("allowsOnline" as const);
  const availableKey = activeMode === "HOME" ? ("homeAvailable" as const) : ("onlineAvailable" as const);
  const visibleDaysRaw = allDays.slice(offset, offset + visibleCount);
  // Solo gli orari liberi della modalità scelta (docs/CHANGELOG.md §349): in
  // una lista serve sapere quando il professionista è libero, gli orari al
  // completo (prima barrati) restano nell'agenda della pagina profilo.
  const visibleDays = visibleDaysRaw.map((day) => ({ ...day, times: day.times.filter((slot) => slot[allowsKey] && slot[availableKey]) }));
  const hasAvailableInWindow = visibleDays.some((day) => day.times.length > 0);
  // Primo orario libero per "Mostra orari disponibili" (richiesta esplicita
  // dell'utente: deve portare davvero al primo orario disponibile). Cercato
  // prima dopo i giorni visibili, poi dall'inizio se si è già andati oltre.
  // Prima veniva dal server e poteva cadere oltre i giorni scaricati: il
  // pulsante allora non faceva nulla (bug reale, docs/CHANGELOG.md §206).
  const findFirstFree = (fromIndex: number) => {
    const days = allDays;
    for (let index = fromIndex; index < days.length; index++) {
      const slot = days[index]!.times.find((s) => s[availableKey]);
      if (slot) return { index, day: days[index]!, slot };
    }
    return null;
  };
  const firstFree = hasAvailableInWindow ? null : (findFirstFree(offset + visibleCount) ?? findFirstFree(0));
  // Unione degli orari liberi dei giorni visibili, ordinata: righe della
  // griglia. Un giorno senza quell'orario libero mostra "-".
  const timeRows = Array.from(new Set(visibleDays.flatMap((day) => day.times.map((slot) => slot.time)))).sort();
  const openAgendaAt = onAgendaPress
    ? (date: string) => (e: unknown) => {
        stop(e);
        onAgendaPress(date, activeMode);
      }
    : undefined;
  const canGoBack = offset > 0;
  const canGoForward = offset + visibleCount < totalDays;
  const goToDays = (direction: "back" | "forward") =>
    setWindowOffset(direction === "back" ? Math.max(0, offset - visibleCount) : offset + visibleCount);

  const hasAgenda = totalDays > 0;
  const pager = totalDays > visibleCount;
  const highlighted = services?.find((service) => service.id === highlightServiceId);
  // La prestazione cercata in cima: si vede anche con l'elenco ridotto a 3.
  const serviceList = highlighted ? [highlighted, ...(services ?? []).filter((service) => service !== highlighted)] : (services ?? []);
  const hasServices = serviceList.length > 0;
  const lowestPrice = hasServices
    ? ((priceFromFirst ? lowestServicePrice((services ?? []).slice(0, priceFromFirst)) : null) ?? lowestServicePrice(serviceList))
    : null;
  const detailsLabel = [hasAgenda ? "orari" : null, hasServices ? (lowestPrice !== null ? "prezzi" : "prestazioni") : null]
    .filter(Boolean)
    .join(" e ");
  // Riga chiusa: con una prestazione cercata (§398) il suo prezzo, non il più basso.
  const collapsedPrice =
    !expanded && highlighted
      ? ` · ${highlighted.name.trim()}: ${formatServicePrice(highlighted.priceMinEurCents, highlighted.priceMaxEurCents, highlighted.priceUnit).toLowerCase()}`
      : !expanded && lowestPrice !== null
        ? ` · da ${formatAmount(lowestPrice.cents)} €${priceUnitSuffix(lowestPrice.unit)}`
        : null;
  const firstFreeLabel = firstFree
    ? `${firstFree.day.label === "Oggi" || firstFree.day.label === "Domani" ? `${firstFree.day.label}, ` : ""}${firstFree.day.dateLabel}, ${firstFree.slot.time}–${firstFree.slot.endTime}`
    : null;

  return {
    categoriesLine,
    specialties,
    showAllServices,
    setShowAllServices,
    showAllBadges,
    setShowAllBadges,
    extraBadges,
    expanded,
    setExpanded,
    activeMode,
    setActiveMode,
    setWindowOffset,
    visibleDays,
    hasAvailableInWindow,
    firstFree,
    firstFreeLabel,
    timeRows,
    openAgendaAt,
    canGoBack,
    canGoForward,
    goToDays,
    hasAgenda,
    pager,
    highlighted,
    serviceList,
    hasServices,
    detailsLabel,
    collapsedPrice,
  };
}
