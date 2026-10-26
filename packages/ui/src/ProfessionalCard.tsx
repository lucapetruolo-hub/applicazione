"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Text, XStack, YStack } from "tamagui";
import { BadgeInfo } from "./BadgeInfo";
import { ProfessionalKindBadge, type ProfessionalKindValue } from "./ProfessionalKindBadge";
import { Icon } from "./Icon";
import { Rating } from "./Rating";
import { Surface } from "./Surface";
import { PriceLine } from "./PriceLine";
import { brand, radiusDoc } from "./tokens";

export type ProfessionalCardService = {
  id: string;
  name: string;
  priceMinEurCents: number | null;
  priceMaxEurCents: number | null;
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

const AGENDA_VISIBLE_DAYS = 4;
// Stesso valore di PUBLIC_AGENDA_DAYS in packages/shared (qui duplicato:
// packages/ui non dipende dal resto del monorepo, vedi formatServicePrice).
const DEFAULT_AGENDA_DAYS = 63;
const WEEKDAY_SHORT_LABELS = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
const MONTH_SHORT_LABELS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

// Duplicata (non importata da @professionisti/shared): packages/ui non
// dipende dal resto del monorepo, resta un design system consumabile da solo
// — vedi formatServicePriceRange in packages/shared/src/professionals.ts per
// la stessa logica lato pagina profilo pubblica.
function formatAmount(cents: number): string {
  const euros = Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return cents % 100 === 0 ? euros : `${euros},${(cents % 100).toString().padStart(2, "0")}`;
}

function formatServicePrice(priceMinEurCents: number | null, priceMaxEurCents: number | null): string {
  if (priceMinEurCents !== null && priceMaxEurCents !== null && priceMaxEurCents > priceMinEurCents) {
    return `${formatAmount(priceMinEurCents)}–${formatAmount(priceMaxEurCents)}\u00A0€`;
  }
  const single = priceMinEurCents ?? priceMaxEurCents;
  return single !== null ? `${formatAmount(single)}\u00A0€` : "Su richiesta";
}

/** Prezzo più basso tra le prestazioni ("da 40 €" sulla scheda chiusa), o null se nessuna ha un prezzo. */
function lowestServicePrice(services: ProfessionalCardService[]): number | null {
  const prices = services.map((service) => service.priceMinEurCents ?? service.priceMaxEurCents).filter((price): price is number => price !== null);
  return prices.length > 0 ? Math.min(...prices) : null;
}

type StopPropagationEvent = { stopPropagation?: () => void } | undefined;

function stop(e: unknown) {
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
  /** Slot opzionale per un'icona/badge categoria (passato da chi consuma il componente, così l'icona custom resta web-only senza sporcare packages/ui). */
  icon?: ReactNode;
  /**
   * Slot opzionale accanto al nome, in alto a destra della colonna dati (es.
   * il cuoricino "salva", docs/CHANGELOG.md §208). Chi lo passa ferma da sé
   * la propagazione del clic, altrimenti si aprirebbe anche il profilo.
   */
  action?: ReactNode;
};

export function ProfessionalCard({
  businessName,
  categoryLabel,
  otherCategoryLabels,
  city,
  distanceKm,
  subTags,
  rating,
  reviewCount,
  completedThisMonth,
  verified,
  stripeVerified,
  professionalKind,
  boosted,
  isNewProfile,
  hasLiabilityInsurance,
  remoteAvailable,
  services,
  availabilityPreview,
  availabilityFrom,
  availabilityDays = DEFAULT_AGENDA_DAYS,
  defaultMode,
  defaultExpanded = false,
  onPress,
  href,
  onSlotPress,
  onAgendaPress,
  icon,
  action,
}: ProfessionalCardProps) {
  // Mestieri in grassetto, specializzazioni dopo in grigio, al massimo due
  // righe (docs/CHANGELOG.md §349): prima era un elenco unico tutto uguale.
  const categoriesLine = [categoryLabel, ...(otherCategoryLabels ?? [])].join(" · ");
  const specialties = subTags && subTags.length > 0 ? subTags.slice(0, 3).join(", ") : null;
  // Richiesta esplicita dell'utente: "dai la possibilità tramite freccetta
  // di far vedere tutte le prestazioni... ora se ne vedono solo 3".
  const [showAllServices, setShowAllServices] = useState(false);
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
  const maxOffset = Math.max(0, totalDays - AGENDA_VISIBLE_DAYS);
  const offset = Math.min(windowOffset, maxOffset);
  const allowsKey = activeMode === "HOME" ? ("allowsHome" as const) : ("allowsOnline" as const);
  const availableKey = activeMode === "HOME" ? ("homeAvailable" as const) : ("onlineAvailable" as const);
  const visibleDaysRaw = allDays.slice(offset, offset + AGENDA_VISIBLE_DAYS);
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
  const firstFree = hasAvailableInWindow ? null : (findFirstFree(offset + AGENDA_VISIBLE_DAYS) ?? findFirstFree(0));
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
  const canGoForward = offset + AGENDA_VISIBLE_DAYS < totalDays;

  const hasAgenda = totalDays > 0;
  const serviceList = services ?? [];
  const hasServices = serviceList.length > 0;
  const lowestPrice = hasServices ? lowestServicePrice(serviceList) : null;
  const detailsLabel = [hasAgenda ? "orari" : null, hasServices ? (lowestPrice !== null ? "prezzi" : "prestazioni") : null]
    .filter(Boolean)
    .join(" e ");

  return (
    // Niente accessibilityLabel personalizzato: la card contiene già come
    // testo visibile nome/categoria/città/rating, un'etichetta diversa da
    // quel testo violerebbe WCAG 2.5.3 "Label in Name" (rilevato da axe/
    // Lighthouse in Fase 6 — un primo tentativo con un aria-label riassuntivo
    // fallisce perché non include tutto il contenuto visibile). Il solo
    // accessibilityRole basta a far annunciare la card come elemento
    // interattivo, leggendo poi il contenuto reale.
    <Surface
      onPress={onPress}
      cursor={onPress ? "pointer" : undefined}
      // Con `href` la tastiera e i lettori di schermo arrivano al profilo dal
      // link del nome: la card non si annuncia anche come pulsante.
      accessibilityRole={onPress && !href ? "button" : undefined}
      padding="$5"
      $xs={{ padding: "$4" }}
      hoverStyle={onPress ? { borderColor: brand.cianografia } : undefined}
      pressStyle={onPress ? { borderColor: brand.cianografiaScuro } : undefined}
    >
      {/* Sotto i 660px meno spazio tra foto e nome: sui telefoni da 360px la
          colonna del nome restava stretta e i bollini (Verificato, Nuovo
          profilo...) e le recensioni toccavano il bordo. */}
      <XStack gap="$4" $xs={{ gap: "$3" }} alignItems="flex-start">
        {icon}
        <YStack gap="$2" flex={1} minWidth={0}>
          <XStack alignItems="flex-start" gap="$2">
            {/* Nome e bollini sulla stessa riga, che va a capo quando non
                c'è spazio (docs/CHANGELOG.md §349): prima, nella colonna
                stretta, i bollini finivano uno sotto l'altro. */}
            <XStack flex={1} minWidth={0} alignItems="center" columnGap="$2" rowGap={6} flexWrap="wrap">
              <Text
                fontFamily="$heading"
                fontWeight="800"
                fontSize={22}
                lineHeight={26}
                color={brand.grafite}
                {...(href
                  ? {
                      tag: "a",
                      href,
                      textDecorationLine: "none" as const,
                      hoverStyle: { textDecorationLine: "underline" as const },
                      // Clic normale: niente ricarica della pagina, apre il
                      // profilo `onPress` della card. Con Ctrl/Cmd/Maiusc il
                      // browser apre un'altra scheda e la card non naviga.
                      onPress: (e: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; preventDefault?: () => void; stopPropagation?: () => void }) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey) e.stopPropagation?.();
                        else e.preventDefault?.();
                      },
                    }
                  : null)}
              >
                {businessName}
              </Text>
              {verified ? (
                // Pillola "Verificato" esplicita accanto al nome: la sola
                // icona non comunica il significato a chi non conosce la
                // piattaforma (principio di riprova sociale leggibile).
                <BadgeInfo info="verified">
                  <XStack
                    alignItems="center"
                    gap={4}
                    paddingHorizontal="$2"
                    paddingVertical={2}
                    borderRadius="$10"
                    backgroundColor={brand.cianografiaVelo}
                  >
                    <Icon name="badge-check" size={14} color={brand.verificato} strokeWidth={2} />
                    <Text fontFamily="$body" fontSize={13} fontWeight="700" color={brand.verificato}>
                      Verificato
                    </Text>
                  </XStack>
                </BadgeInfo>
              ) : null}
              {professionalKind ? <ProfessionalKindBadge kind={professionalKind} /> : null}
              {stripeVerified ? (
                <BadgeInfo info="stripeVerified">
                  <XStack
                    alignItems="center"
                    gap={4}
                    paddingHorizontal="$2"
                    paddingVertical={2}
                    borderRadius="$10"
                    backgroundColor={brand.cianografiaVelo}
                  >
                    <Icon name="shield-check" size={13} color={brand.verificato} strokeWidth={2} />
                    <Text fontFamily="$body" fontSize={13} fontWeight="700" color={brand.verificato}>
                      Identità verificata da Stripe
                    </Text>
                  </XStack>
                </BadgeInfo>
              ) : null}
              {boosted ? (
                <BadgeInfo info="boosted">
                  <XStack alignItems="center" gap={4} paddingHorizontal="$2" paddingVertical={2} borderRadius="$10" backgroundColor={brand.ottoneVelo}>
                    <Icon name="zap" size={13} color={brand.ottone} strokeWidth={2} />
                    <Text fontFamily="$body" fontSize={13} fontWeight="700" color={brand.ottone}>
                      Sponsorizzato
                    </Text>
                  </XStack>
                </BadgeInfo>
              ) : null}
              {isNewProfile ? (
                <BadgeInfo info="newProfile">
                  <XStack alignItems="center" gap={4} paddingHorizontal="$2" paddingVertical={2} borderRadius="$10" backgroundColor={brand.cianografiaVelo}>
                    <Icon name="sprout" size={13} color={brand.cianografiaScuro} strokeWidth={2} />
                    <Text fontFamily="$body" fontSize={13} fontWeight="700" color={brand.cianografiaScuro}>
                      Nuovo profilo
                    </Text>
                  </XStack>
                </BadgeInfo>
              ) : null}
              {hasLiabilityInsurance ? (
                <BadgeInfo info="liabilityInsurance">
                  <XStack alignItems="center" gap={4} paddingHorizontal="$2" paddingVertical={2} borderRadius="$10" backgroundColor={brand.gesso}>
                    <Icon name="shield-check" size={13} color={brand.grafite} strokeWidth={2} />
                    <Text fontFamily="$body" fontSize={13} fontWeight="700" color={brand.grafite}>
                      Assicurazione RC
                    </Text>
                    <Text fontFamily="$body" fontSize={10.5} fontWeight="500" color={brand.grafite70}>
                      dichiarata
                    </Text>
                  </XStack>
                </BadgeInfo>
              ) : null}
            </XStack>
            {action}
          </XStack>
          <Text fontSize={16} lineHeight={22} color={brand.grafite70} numberOfLines={2}>
            <Text fontFamily="$body" fontSize={16} fontWeight="700" color={brand.grafite}>
              {categoriesLine}
            </Text>
            {specialties ? ` · ${specialties}` : null}
          </Text>
          <XStack gap="$3" alignItems="center" flexWrap="wrap">
            {rating !== undefined ? <Rating value={rating} count={reviewCount} size={15} /> : null}
            {remoteAvailable ? (
              <XStack gap="$1" alignItems="center">
                <Icon name="video" size={13} color={brand.cianografiaScuro} strokeWidth={1.5} />
                <Text fontFamily="$body" fontSize={13} color={brand.cianografiaScuro} fontWeight="700">
                  Offre consulenza online
                </Text>
              </XStack>
            ) : null}
          </XStack>
          <XStack gap="$1" alignItems="center">
            <Icon name="map-pin" size={13} color={brand.grafite70} strokeWidth={1.5} />
            <Text fontSize={16} color={brand.grafite70}>
              {distanceKm !== undefined ? `${city} · a ${distanceKm.toString().replace(".", ",")} km` : city}
            </Text>
          </XStack>
          {/* In grigio (docs/CHANGELOG.md §349): è un dato, non un'azione, e
              nel resto del sito il verde vuol dire "cliccabile". */}
          {completedThisMonth && completedThisMonth > 0 ? (
            <Text fontSize={13} color={brand.grafite70}>
              Ha completato {completedThisMonth} {completedThisMonth === 1 ? "intervento" : "interventi"} questo mese
            </Text>
          ) : null}
        </YStack>
      </XStack>

      {hasAgenda || hasServices ? (
        <YStack
          marginTop="$4"
          paddingTop="$3"
          borderTopWidth={1}
          borderTopColor={brand.filetto}
          gap="$3"
          // Richiesta esplicita dell'utente: "rendi cliccabile solo i vari
          // pulsanti e non tutta l'area dell'agenda". Un clic su uno spazio
          // vuoto qui (tra le pillole, sui trattini "-") non apre il profilo
          // dalla card; i singoli controlli fermano da sé la propagazione. Il
          // clic che porta all'agenda del profilo (`onAgendaPress`) sta solo
          // sulle intestazioni dei giorni e sulle celle senza orario libero.
          onPress={stop}
        >
          <XStack
            tag="button"
            alignItems="center"
            justifyContent="space-between"
            gap="$2"
            minHeight={32}
            padding={0}
            borderWidth={0}
            backgroundColor="transparent"
            cursor="pointer"
            aria-expanded={expanded}
            accessibilityRole="button"
            onPress={(e: unknown) => {
              stop(e);
              setExpanded((prev) => !prev);
            }}
          >
            <Text fontSize={16} color={brand.grafite70} textAlign="left">
              <Text fontFamily="$body" fontSize={16} fontWeight="700" color={brand.cianografiaScuro}>
                {expanded ? `Nascondi ${detailsLabel}` : `Vedi ${detailsLabel}`}
              </Text>
              {!expanded && lowestPrice !== null ? ` · da ${formatAmount(lowestPrice)} €` : null}
            </Text>
            <Icon name={expanded ? "chevron-up" : "chevron-down"} size={18} color={brand.cianografiaScuro} strokeWidth={2} />
          </XStack>

          {expanded && hasAgenda ? (
            <YStack gap="$2">
              <XStack alignItems="center" justifyContent="space-between" gap="$2" flexWrap="wrap">
                {/* Segmentato come la barra di ricerca, con "Orari per:"
                    davanti (docs/CHANGELOG.md §349): le due pillole separate
                    sembravano un interruttore, e "Online" grigio sembrava
                    "non offerto". */}
                <XStack alignItems="center" gap="$2">
                  <Text fontFamily="$body" fontSize={13} fontWeight="600" color={brand.grafite70}>
                    Orari per:
                  </Text>
                  <XStack gap={2} backgroundColor={brand.gesso} borderRadius="$10" padding={2}>
                    {(["HOME", "ONLINE"] as const).map((mode) => {
                      const active = activeMode === mode;
                      return (
                        <XStack
                          key={mode}
                          tag="button"
                          paddingHorizontal="$3"
                          paddingVertical={5}
                          borderWidth={0}
                          borderRadius="$10"
                          backgroundColor={active ? brand.cianografia : "transparent"}
                          cursor="pointer"
                          accessibilityRole="button"
                          aria-pressed={active}
                          onPress={(e: unknown) => {
                            stop(e);
                            setActiveMode(mode);
                            setWindowOffset(0);
                          }}
                        >
                          <Text fontFamily="$body" fontSize={13} fontWeight="700" color={active ? "#FFFFFF" : brand.grafite}>
                            {mode === "HOME" ? "A domicilio" : "Online"}
                          </Text>
                        </XStack>
                      );
                    })}
                  </XStack>
                </XStack>
                {totalDays > AGENDA_VISIBLE_DAYS ? (
                  <XStack gap="$1" alignItems="center">
                    <XStack
                      width={32}
                      height={32}
                      borderRadius="$10"
                      alignItems="center"
                      justifyContent="center"
                      backgroundColor={brand.gesso}
                      opacity={canGoBack ? 1 : 0.3}
                      cursor={canGoBack ? "pointer" : undefined}
                      accessibilityRole={canGoBack ? "button" : undefined}
                      accessibilityLabel="Giorni precedenti"
                      onPress={
                        canGoBack
                          ? (e: unknown) => {
                              stop(e);
                              setWindowOffset(Math.max(0, offset - AGENDA_VISIBLE_DAYS));
                            }
                          : undefined
                      }
                    >
                      <Icon name="chevron-left" size={16} color={brand.grafite} />
                    </XStack>
                    <XStack
                      width={32}
                      height={32}
                      borderRadius="$10"
                      alignItems="center"
                      justifyContent="center"
                      backgroundColor={brand.gesso}
                      opacity={canGoForward ? 1 : 0.3}
                      cursor={canGoForward ? "pointer" : undefined}
                      accessibilityRole={canGoForward ? "button" : undefined}
                      accessibilityLabel="Giorni successivi"
                      onPress={
                        canGoForward
                          ? (e: unknown) => {
                              stop(e);
                              setWindowOffset(offset + AGENDA_VISIBLE_DAYS);
                            }
                          : undefined
                      }
                    >
                      <Icon name="chevron-right" size={16} color={brand.grafite} />
                    </XStack>
                  </XStack>
                ) : null}
              </XStack>
              {/* flexBasis 0 su intestazioni e celle (bug reale segnalato
                  dall'utente): con flex={1} da solo Tamagui usa flexBasis
                  "auto", ogni colonna prendeva la larghezza del suo contenuto e
                  gli orari non stavano più sotto il loro giorno. */}
              <XStack>
                {visibleDays.map((day) => (
                  <YStack
                    key={day.date}
                    flex={1}
                    flexBasis={0}
                    minWidth={0}
                    alignItems="center"
                    gap={2}
                    cursor={openAgendaAt ? "pointer" : undefined}
                    accessibilityRole={openAgendaAt ? "button" : undefined}
                    onPress={openAgendaAt?.(day.date)}
                  >
                    <Text fontFamily="$body" fontSize={13} fontWeight="700" color={brand.grafite}>
                      {day.label}
                    </Text>
                    <Text fontVariant={["tabular-nums"]} fontSize={12} color={brand.grafite70}>
                      {day.dateLabel}
                    </Text>
                  </YStack>
                ))}
              </XStack>

              {timeRows.length > 0 ? (
                <YStack gap="$1">
                  {timeRows.map((time) => (
                    <XStack key={time}>
                      {visibleDays.map((day) => {
                        const slot = day.times.find((s) => s.time === time);
                        if (!slot) {
                          return (
                            <XStack key={day.date} flex={1} flexBasis={0} minWidth={0} alignItems="center" justifyContent="center" paddingVertical={4} onPress={openAgendaAt?.(day.date)}>
                              <Text fontSize={13} color={brand.filetto}>
                                -
                              </Text>
                            </XStack>
                          );
                        }
                        const range = `${slot.time}–${slot.endTime}`;
                        return (
                          <XStack
                            key={day.date}
                            flex={1}
                            flexBasis={0}
                            minWidth={0}
                            alignItems="center"
                            justifyContent="center"
                            paddingVertical={3}
                            cursor={onSlotPress ? "pointer" : undefined}
                            accessibilityRole={onSlotPress ? "button" : undefined}
                            accessibilityLabel={onSlotPress ? `Richiedi un preventivo per ${range} il ${day.label}` : undefined}
                            onPress={
                              onSlotPress
                                ? (e: unknown) => {
                                    stop(e);
                                    onSlotPress(day.date, slot.time, slot.endTime, activeMode);
                                  }
                                : undefined
                            }
                          >
                            <XStack paddingHorizontal={6} paddingVertical={4} $xs={{ paddingHorizontal: 3 }} borderRadius="$10" backgroundColor={brand.cianografiaVelo} maxWidth="100%">
                              <Text
                                fontVariant={["tabular-nums"]}
                                fontSize={12}
                                $xs={{ fontSize: 11, letterSpacing: -0.2 }}
                                fontWeight="700"
                                color={brand.cianografiaScuro}
                                textAlign="center"
                              >
                                {range}
                              </Text>
                            </XStack>
                          </XStack>
                        );
                      })}
                    </XStack>
                  ))}
                </YStack>
              ) : null}

              {hasAvailableInWindow ? null : firstFree ? (
                <YStack gap="$2" padding="$3" borderRadius={radiusDoc} borderWidth={1} borderColor={brand.filetto}>
                  <YStack gap={2}>
                    <Text fontSize={13} color={brand.grafite70}>
                      Nessun orario libero in questi giorni. Primo orario libero:
                    </Text>
                    <Text fontSize={16} fontWeight="700" color={brand.grafite}>
                      {firstFree.day.label === "Oggi" || firstFree.day.label === "Domani" ? `${firstFree.day.label}, ` : ""}
                      {firstFree.day.dateLabel}, {firstFree.slot.time}–{firstFree.slot.endTime}
                    </Text>
                  </YStack>
                  <XStack
                    alignSelf="flex-start"
                    paddingHorizontal="$3"
                    paddingVertical={6}
                    borderRadius="$10"
                    backgroundColor={brand.cianografiaPieno}
                    cursor="pointer"
                    accessibilityRole="button"
                    accessibilityLabel="Mostra orari disponibili"
                    // Porta la finestra della mini-agenda sul giorno del primo
                    // orario libero, che resta cliccabile come ogni altra fascia
                    // per aprire la richiesta di preventivo precompilata.
                    onPress={(e: unknown) => {
                      stop(e);
                      setWindowOffset(firstFree.index);
                    }}
                  >
                    <Text fontFamily="$body" fontSize={13} fontWeight="700" color="#FFFFFF">
                      Mostra orari disponibili →
                    </Text>
                  </XStack>
                </YStack>
              ) : (
                <Text fontSize={13} color={brand.grafite70} paddingVertical="$2">
                  Nessun orario libero nei prossimi due mesi.
                </Text>
              )}
            </YStack>
          ) : null}

          {expanded && hasServices ? (
            // Un clic sulle prestazioni apre il profilo come il resto della
            // scheda (richiesta esplicita dell'utente, docs/CHANGELOG.md
            // §358): l'area qui sopra ferma il clic per l'agenda, non per i
            // prezzi. Da tastiera il profilo si apre dal link del nome.
            <YStack
              gap="$1"
              {...(hasAgenda ? { paddingTop: "$3", borderTopWidth: 1, borderTopColor: brand.filetto } : null)}
              cursor={onPress ? "pointer" : undefined}
              onPress={
                onPress
                  ? (e: unknown) => {
                      stop(e);
                      onPress();
                    }
                  : undefined
              }
            >
              {(showAllServices ? serviceList : serviceList.slice(0, 3)).map((service) => (
                <PriceLine key={service.id} label={service.name} price={formatServicePrice(service.priceMinEurCents, service.priceMaxEurCents)} />
              ))}
              {serviceList.length > 3 ? (
                <XStack
                  alignItems="center"
                  gap="$1"
                  paddingTop="$1"
                  cursor="pointer"
                  onPress={(e: unknown) => {
                    stop(e);
                    setShowAllServices((prev) => !prev);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={showAllServices ? "Mostra meno prestazioni" : "Mostra tutte le prestazioni"}
                >
                  <Text fontSize={16} fontWeight="600" color={brand.cianografiaScuro}>
                    {showAllServices ? "Mostra meno" : `Mostra tutte (${serviceList.length})`}
                  </Text>
                  <Icon name={showAllServices ? "chevron-up" : "chevron-down"} size={14} color={brand.cianografiaScuro} strokeWidth={2} />
                </XStack>
              ) : null}
            </YStack>
          ) : null}
        </YStack>
      ) : null}
    </Surface>
  );
}
