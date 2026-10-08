"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Text, XStack, YStack } from "tamagui";
import { Icon } from "./Icon";
import { Rating } from "./Rating";
import { Surface } from "./Surface";
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

const AGENDA_COLUMN_WIDTH = 78;
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
function formatServicePrice(priceMinEurCents: number | null, priceMaxEurCents: number | null): string {
  const format = (cents: number) => `${(cents / 100).toFixed(2)} €`;
  if (priceMinEurCents !== null && priceMaxEurCents !== null && priceMaxEurCents > priceMinEurCents) {
    return `${format(priceMinEurCents)} - ${format(priceMaxEurCents)}`;
  }
  const single = priceMinEurCents ?? priceMaxEurCents;
  return single !== null ? format(single) : "Su richiesta";
}

export type ProfessionalCardProps = {
  businessName: string;
  categoryLabel: string;
  city: string;
  /** Sotto-tag di specializzazione (es. "impianti civili"), mostrati accanto alla categoria — fino a 3. */
  subTags?: string[];
  rating?: number;
  reviewCount?: number;
  /** "Ha completato N interventi questo mese" (richiesta esplicita dell'utente) — dato reale (Booking COMPLETED nel mese corrente), 0/assente non mostra nulla. */
  completedThisMonth?: number;
  verified?: boolean;
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
  onPress?: () => void;
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
   * (docs/CHANGELOG.md §204).
   */
  onAgendaPress?: (date: string, mode: "HOME" | "ONLINE") => void;
  /** Slot opzionale per un'icona/badge categoria (passato da chi consuma il componente, così l'icona custom resta web-only senza sporcare packages/ui). */
  icon?: ReactNode;
};

export function ProfessionalCard({
  businessName,
  categoryLabel,
  city,
  subTags,
  rating,
  reviewCount,
  completedThisMonth,
  verified,
  boosted,
  isNewProfile,
  hasLiabilityInsurance,
  remoteAvailable,
  services,
  availabilityPreview,
  availabilityFrom,
  availabilityDays = DEFAULT_AGENDA_DAYS,
  defaultMode,
  onPress,
  onSlotPress,
  onAgendaPress,
  icon,
}: ProfessionalCardProps) {
  const specialtyLine = subTags && subTags.length > 0 ? `${categoryLabel} · ${subTags.slice(0, 3).join(", ")}` : categoryLabel;
  // Richiesta esplicita dell'utente: "dai la possibilità tramite freccetta
  // di far vedere tutte le prestazioni... ora se ne vedono solo 3".
  const [showAllServices, setShowAllServices] = useState(false);

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
  // Filtrate alla sola modalità attiva: un giorno mostra solo le fasce che
  // offrono quel tipo di intervento, le altre restano "-" come se non
  // esistessero per questo tab.
  const visibleDays = visibleDaysRaw.map((day) => ({ ...day, times: day.times.filter((slot) => slot[allowsKey]) }));
  const hasAvailableInWindow = visibleDays.some((day) => day.times.some((slot) => slot[availableKey]));
  // Primo orario libero per "Mostra orari disponibili" (richiesta esplicita
  // dell'utente: deve portare davvero al primo orario disponibile). Cercato
  // prima dopo i giorni visibili, poi dall'inizio se si è già andati oltre.
  // Prima veniva dal server e poteva cadere oltre i giorni scaricati: il
  // pulsante allora non faceva nulla (bug reale, docs/CHANGELOG.md §204).
  const findFirstFree = (fromIndex: number) => {
    const days = allDays;
    for (let index = fromIndex; index < days.length; index++) {
      const slot = days[index]!.times.find((s) => s[availableKey]);
      if (slot) return { index, day: days[index]!, slot };
    }
    return null;
  };
  const firstFree = hasAvailableInWindow ? null : (findFirstFree(offset + AGENDA_VISIBLE_DAYS) ?? findFirstFree(0));
  // Unione di tutti gli orari configurati su almeno un giorno della finestra
  // visibile, ordinata: righe della griglia. Un giorno senza quell'orario
  // mostra "-". Sempre visibile, anche quando è tutto al completo (orari
  // barrati): prima in quel caso la griglia spariva e restavano solo le
  // intestazioni dei giorni (bug reale segnalato dall'utente).
  const timeRows = Array.from(new Set(visibleDays.flatMap((day) => day.times.map((slot) => slot.time)))).sort();
  const openAgendaAt = onAgendaPress
    ? (date: string) => (e: unknown) => {
        (e as { stopPropagation?: () => void } | undefined)?.stopPropagation?.();
        onAgendaPress(date, activeMode);
      }
    : undefined;
  const canGoBack = offset > 0;
  const canGoForward = offset + AGENDA_VISIBLE_DAYS < totalDays;

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
      accessibilityRole={onPress ? "button" : undefined}
      padding="$5"
      hoverStyle={onPress ? { borderColor: brand.cianografia } : undefined}
      pressStyle={onPress ? { borderColor: brand.cianografiaScuro } : undefined}
    >
      <XStack gap="$5" alignItems="flex-start" flexWrap="wrap">
        {/* flexBasis 0 (non "auto", il default di flex={1} da solo): senza,
            il calcolo del wrap dell'XStack esterno usa la larghezza "a
            contenuto" del nome attività come ipotesi iniziale — un nome
            lungo (bug reale osservato: "Rossi Idraulica 194621734" vs "Rossi
            Idraulica Test") faceva andare a capo l'intera mini-agenda sotto
            invece che a fianco, pur restando spazio a sufficienza una volta
            che il testo si spezza correttamente su più righe. */}
        {/* Sotto i 660px meno spazio tra foto e nome: sui telefoni da 360px la
            colonna del nome restava di circa 170px e i bollini (Verificato,
            Nuovo profilo...) e le recensioni toccavano il bordo. */}
        <XStack gap="$4" $xs={{ gap: "$3" }} flex={1} flexBasis={0} minWidth={260} alignItems="flex-start">
          {icon}
          <YStack gap="$2" flex={1} minWidth={0}>
            <XStack alignItems="center" gap="$2" flexWrap="wrap">
              <Text fontFamily="$heading" fontWeight="800" fontSize={22} lineHeight={26} color={brand.grafite}>
                {businessName}
              </Text>
              {verified ? (
                // Pillola "Verificato" esplicita accanto al nome: la sola
                // icona non comunica il significato a chi non conosce la
                // piattaforma (principio di riprova sociale leggibile).
                <XStack
                  alignItems="center"
                  gap={4}
                  paddingHorizontal="$2"
                  paddingVertical={2}
                  borderRadius="$10"
                  backgroundColor={brand.cianografiaVelo}
                >
                  <Icon name="badge-check" size={14} color={brand.verificato} strokeWidth={2} />
                  <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.verificato}>
                    Verificato
                  </Text>
                </XStack>
              ) : null}
              {boosted ? (
                <XStack alignItems="center" gap={4} paddingHorizontal="$2" paddingVertical={2} borderRadius="$10" backgroundColor={brand.ottoneVelo}>
                  <Icon name="zap" size={13} color={brand.ottone} strokeWidth={2} />
                  <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.ottone}>
                    In evidenza
                  </Text>
                </XStack>
              ) : null}
              {isNewProfile ? (
                <XStack alignItems="center" gap={4} paddingHorizontal="$2" paddingVertical={2} borderRadius="$10" backgroundColor={brand.cianografiaVelo}>
                  <Icon name="sparkles" size={13} color={brand.cianografiaScuro} strokeWidth={2} />
                  <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.cianografiaScuro}>
                    Nuovo profilo
                  </Text>
                </XStack>
              ) : null}
              {hasLiabilityInsurance ? (
                <XStack alignItems="center" gap={4} paddingHorizontal="$2" paddingVertical={2} borderRadius="$10" backgroundColor={brand.calce} borderWidth={1} borderColor={brand.filetto}>
                  <Icon name="shield-check" size={13} color={brand.grafite} strokeWidth={2} />
                  <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.grafite}>
                    Assicurazione RC
                  </Text>
                  <Text fontFamily="$body" fontSize={10.5} fontWeight="500" color={brand.grafite70}>
                    dichiarata
                  </Text>
                </XStack>
              ) : null}
            </XStack>
            <Text fontSize={15} color={brand.grafite70} fontWeight="500">
              {specialtyLine}
            </Text>
            <XStack gap="$3" alignItems="center" flexWrap="wrap" paddingTop="$1">
              {rating !== undefined ? <Rating value={rating} count={reviewCount} size={15} /> : null}
              {remoteAvailable ? (
                <XStack gap="$1" alignItems="center">
                  <Icon name="video" size={13} color={brand.cianografiaScuro} strokeWidth={1.5} />
                  <Text fontFamily="$body" fontSize={11} color={brand.cianografiaScuro} fontWeight="700">
                    Offre consulenza online
                  </Text>
                </XStack>
              ) : null}
            </XStack>
            <XStack gap="$1" alignItems="center">
              <Icon name="map-pin" size={13} color={brand.grafite70} strokeWidth={1.5} />
              <Text fontSize={13} color={brand.grafite70}>
                {city}
              </Text>
            </XStack>
            {completedThisMonth && completedThisMonth > 0 ? (
              <Text fontSize={12.5} color={brand.verificato} fontWeight="600">
                Ha completato {completedThisMonth} {completedThisMonth === 1 ? "intervento" : "interventi"} questo mese
              </Text>
            ) : null}
          </YStack>
        </XStack>

        {totalDays > 0 ? (
          <YStack
            gap="$2"
            minWidth={AGENDA_COLUMN_WIDTH * visibleDays.length}
            paddingLeft="$4"
            borderLeftWidth={1}
            // Telefono (bug reale, docs/CHANGELOG.md §204): 4 colonne fisse da
            // 78px più il margine sinistro superavano la larghezza della card
            // e "Dom" usciva dal bordo. Sotto 800px il blocco va a tutta
            // larghezza senza filetto e le colonne si dividono lo spazio.
            $sm={{ minWidth: 0, width: "100%", paddingLeft: 0, borderLeftWidth: 0 }}
            borderLeftColor={brand.filetto}
            // Su una riga stretta il blocco cade sotto (flexWrap sul contenitore):
            // il bordo verticale sinistro non avrebbe più senso, si toglie da solo
            // (borderLeftWidth resta 0 solo se non c'è spazio, gestito dal wrap).
            //
            // stopPropagation qui, sull'intero blocco agenda — richiesta
            // esplicita dell'utente: "rendi cliccabile solo i vari pulsanti e
            // non tutta l'area dell'agenda". La card ha un onPress proprio
            // che porta al profilo (vedi Surface più sopra): senza questo
            // stop, un click su uno spazio vuoto della mini-agenda (tra le
            // pillole, sulle intestazioni giorno, sui trattini "-" di una
            // fascia non configurata) faceva comunque da bubbling fino alla
            // card e navigava al profilo, anche se l'utente non aveva
            // toccato nulla di realmente interattivo. I singoli controlli
            // (tab, frecce, pillole orario) hanno già ciascuno il proprio
            // stopPropagation più sotto — restano invariati e continuano a
            // funzionare, qui si aggiunge solo una rete di sicurezza per il
            // resto dell'area. Il clic che porta all'agenda del profilo
            // (`onAgendaPress`) sta solo sulle intestazioni dei giorni e
            // sulle celle senza orario libero, non sull'intero blocco: un
            // onPress qui scatterebbe anche cliccando frecce e pulsanti.
            onPress={(e: { stopPropagation: () => void }) => e.stopPropagation()}
          >
            {/* Tab "A domicilio"/"Online" (richiesta esplicita dell'utente,
                stesso pattern a pillola di SearchBar): filtrano gli orari
                mostrati sotto in base alla modalità offerta su ogni fascia. */}
            <XStack
              gap={4}
              onPress={(e: { stopPropagation: () => void }) => e.stopPropagation()}
            >
              {(["HOME", "ONLINE"] as const).map((mode) => (
                <XStack
                  key={mode}
                  paddingHorizontal="$2"
                  paddingVertical={4}
                  borderRadius="$10"
                  backgroundColor={activeMode === mode ? brand.cianografia : brand.gesso}
                  cursor="pointer"
                  accessibilityRole="button"
                  accessibilityLabel={mode === "HOME" ? "A domicilio" : "Online"}
                  onPress={(e: { stopPropagation: () => void }) => {
                    e.stopPropagation();
                    setActiveMode(mode);
                    setWindowOffset(0);
                  }}
                >
                  <Text fontFamily="$body" fontSize={10.5} fontWeight="700" color={activeMode === mode ? "#FFFFFF" : brand.grafite70}>
                    {mode === "HOME" ? "A domicilio" : "Online"}
                  </Text>
                </XStack>
              ))}
            </XStack>
            <XStack alignItems="center" justifyContent="space-between" gap="$2">
              <Text fontFamily="$body" fontSize={10.5} fontWeight="700" color={brand.grafite70}>
                Prossima disponibilità
              </Text>
              {totalDays > AGENDA_VISIBLE_DAYS ? (
                <XStack gap="$1" alignItems="center">
                  <XStack
                    width={28}
                    height={28}
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
                            (e as { stopPropagation?: () => void } | undefined)?.stopPropagation?.();
                            setWindowOffset(Math.max(0, offset - AGENDA_VISIBLE_DAYS));
                          }
                        : undefined
                    }
                  >
                    <Icon name="chevron-left" size={16} color={brand.grafite} />
                  </XStack>
                  <XStack
                    width={28}
                    height={28}
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
                            (e as { stopPropagation?: () => void } | undefined)?.stopPropagation?.();
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
            <XStack>
              {visibleDays.map((day) => (
                <YStack
                  key={day.date}
                  flex={1}
                  minWidth={0}
                  alignItems="center"
                  gap={2}
                  cursor={openAgendaAt ? "pointer" : undefined}
                  accessibilityRole={openAgendaAt ? "button" : undefined}
                  onPress={openAgendaAt?.(day.date)}
                >
                  <Text fontFamily="$body" fontSize={10.5} fontWeight="700" color={brand.grafite}>
                    {day.label}
                  </Text>
                  <Text fontFamily="$mono" fontSize={9.5} color={brand.grafite70}>
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
                          <XStack key={day.date} flex={1} minWidth={0} alignItems="center" justifyContent="center" paddingVertical={4} onPress={openAgendaAt?.(day.date)}>
                            <Text fontSize={12} color={brand.filetto}>
                              -
                            </Text>
                          </XStack>
                        );
                      }
                      const range = `${slot.time}–${slot.endTime}`;
                      if (!slot[availableKey]) {
                        return (
                          <XStack key={day.date} flex={1} minWidth={0} alignItems="center" justifyContent="center" paddingVertical={4} onPress={openAgendaAt?.(day.date)}>
                            <Text
                              fontFamily="$mono"
                              fontSize={10}
                              color={brand.grafite70}
                              textDecorationLine="line-through"
                              textAlign="center"
                            >
                              {range}
                            </Text>
                          </XStack>
                        );
                      }
                      return (
                        <XStack
                          key={day.date}
                          flex={1}
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
                                  (e as { stopPropagation?: () => void } | undefined)?.stopPropagation?.();
                                  onSlotPress(day.date, slot.time, slot.endTime, activeMode);
                                }
                              : undefined
                          }
                        >
                          <XStack paddingHorizontal={5} paddingVertical={3} borderRadius="$10" backgroundColor={brand.cianografiaVelo} maxWidth="100%">
                            <Text fontFamily="$mono" fontSize={10} fontWeight="700" color={brand.cianografiaScuro} textAlign="center">
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
                  <Text fontSize={11.5} color={brand.grafite70}>
                    Nessun orario libero in questi giorni. Primo orario libero:
                  </Text>
                  <Text fontSize={13} fontWeight="700" color={brand.grafite}>
                    {firstFree.day.label === "Oggi" || firstFree.day.label === "Domani" ? `${firstFree.day.label}, ` : ""}
                    {firstFree.day.dateLabel}, {firstFree.slot.time}–{firstFree.slot.endTime}
                  </Text>
                </YStack>
                <XStack
                  alignSelf="flex-start"
                  paddingHorizontal="$3"
                  paddingVertical={6}
                  borderRadius="$10"
                  backgroundColor={brand.cianografia}
                  cursor="pointer"
                  accessibilityRole="button"
                  accessibilityLabel="Mostra orari disponibili"
                  // Porta la finestra della mini-agenda sul giorno del primo
                  // orario libero, che resta cliccabile come ogni altra fascia
                  // per aprire la richiesta di preventivo precompilata.
                  onPress={(e: unknown) => {
                    (e as { stopPropagation?: () => void } | undefined)?.stopPropagation?.();
                    setWindowOffset(firstFree.index);
                  }}
                >
                  <Text fontFamily="$body" fontSize={12} fontWeight="700" color="#FFFFFF">
                    Mostra orari disponibili →
                  </Text>
                </XStack>
              </YStack>
            ) : (
              <Text fontSize={12} color={brand.grafite70} paddingVertical="$2">
                Nessun orario libero nei prossimi due mesi.
              </Text>
            )}
          </YStack>
        ) : null}
      </XStack>
      {/* Prestazioni a tutta larghezza sotto la riga profilo + agenda
          (richiesta esplicita dell'utente): dentro la colonna del nome,
          stretta quando c'è la mini-agenda, i nomi andavano a capo e
          lasciavano vuoto lo spazio sotto la foto e sotto l'agenda. */}
      {services && services.length > 0 ? (
        <YStack gap="$1" paddingTop="$3" borderTopWidth={1} borderTopColor={brand.filetto} marginTop="$4">
          {(showAllServices ? services : services.slice(0, 3)).map((service, index, shown) => (
            // Linea molto leggera sotto ogni riga, fino al prezzo (richiesta
            // esplicita dell'utente): aiuta a collegare a colpo d'occhio
            // ogni prestazione al suo prezzo. Niente linea sotto l'ultima.
            <XStack
              key={service.id}
              justifyContent="space-between"
              gap="$2"
              paddingVertical={3}
              borderBottomWidth={index < shown.length - 1 ? 1 : 0}
              borderBottomColor={brand.gesso}
            >
              <Text fontSize={14} color={brand.grafite70} flex={1}>
                {service.name}
              </Text>
              <Text fontSize={14} color={brand.grafite} fontWeight="600" flexShrink={0} numberOfLines={1}>
                {formatServicePrice(service.priceMinEurCents, service.priceMaxEurCents)}
              </Text>
            </XStack>
          ))}
          {services.length > 3 ? (
            <XStack
              alignItems="center"
              gap="$1"
              paddingTop="$1"
              cursor="pointer"
              onPress={(e: { stopPropagation: () => void }) => {
                e.stopPropagation();
                setShowAllServices((prev) => !prev);
              }}
              accessibilityRole="button"
              accessibilityLabel={showAllServices ? "Mostra meno prestazioni" : "Mostra tutte le prestazioni"}
            >
              <Text fontSize={13} fontWeight="600" color={brand.cianografiaScuro}>
                {showAllServices ? "Mostra meno" : `Mostra tutte (${services.length})`}
              </Text>
              <Icon name={showAllServices ? "chevron-up" : "chevron-down"} size={14} color={brand.cianografiaScuro} strokeWidth={2} />
            </XStack>
          ) : null}
        </YStack>
      ) : null}
    </Surface>
  );
}
