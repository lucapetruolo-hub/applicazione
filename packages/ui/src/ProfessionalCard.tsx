"use client";

import { Text, XStack, YStack, useMedia } from "tamagui";
import { BadgeInfo } from "./BadgeInfo";
import { ProfessionalKindBadge } from "./ProfessionalKindBadge";
import { Icon } from "./Icon";
import { Rating } from "./Rating";
import { Surface } from "./Surface";
import { PriceLine } from "./PriceLine";
import { brand, radiusDoc } from "./tokens";
import { formatDistanceKm } from "./cardText";
import {
  AGENDA_VISIBLE_DAYS_PHONE,
  formatServicePrice,
  priceUnitLabel,
  stop,
  useProfessionalCardModel,
  type ProfessionalCardProps,
} from "./professionalCardModel";

export type {
  ProfessionalCardAvailabilityDay,
  ProfessionalCardAvailabilitySlot,
  ProfessionalCardPriceUnit,
  ProfessionalCardProps,
  ProfessionalCardService,
} from "./professionalCardModel";
export { formatDistanceKm, priceUnitSuffix } from "./cardText";

// Frecce dei giorni accanto ai giorni (28px, 24 sul telefono) e lo stesso
// spazio ai lati degli orari, che così restano sotto il loro giorno.
const AGENDA_ARROW_SIZE = "28px xs:24px xxs:28px";
const AGENDA_ARROW_SPACE = "32px xs:26px xxs:0px";

/**
 * Scheda del professionista per l'app (Tamagui). Il sito usa
 * ProfessionalCard.web.tsx, in HTML semplice
 * (docs/changelog/2026-11-09-pagine-pubbliche-senza-tamagui.md); i conti
 * stanno in professionalCardModel.ts. Se cambia il disegno qui, va cambiato
 * anche nella variante per il sito.
 */
export function ProfessionalCard(props: ProfessionalCardProps) {
  const {
    businessName,
    city,
    distanceKm,
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
    onPress,
    href,
    onSlotPress,
    icon,
    action,
    reason,
  } = props;
  const media = useMedia();
  const {
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
  } = useProfessionalCardModel(props, media.xs);
  const extraBadgeDisplay = showAllBadges ? "flex" : "flex xs:none";

  // Freccia per scorrere i giorni della mini-agenda.
  const dayArrow = (direction: "back" | "forward") => {
    const enabled = direction === "back" ? canGoBack : canGoForward;
    return (
      <XStack
        width={AGENDA_ARROW_SIZE}
        height={AGENDA_ARROW_SIZE}
        borderRadius="10"
        alignItems="center"
        justifyContent="center"
        backgroundColor={brand.gesso}
        opacity={enabled ? 1 : 0.3}
        className={enabled ? "hover-ring" : undefined}
        cursor={enabled ? "pointer" : undefined}
        // Sempre un pulsante, spento quando non si può andare oltre: un riquadro
        // con un nome e senza ruolo non è permesso (axe, punto 21,
        // docs/changelog/2026-11-08-prova-persone-simulate.md).
        role="button"
        aria-disabled={!enabled}
        tabIndex={enabled ? undefined : -1}
        aria-label={direction === "back" ? "Giorni precedenti" : "Giorni successivi"}
        onPress={
          enabled
            ? (e: unknown) => {
                stop(e);
                goToDays(direction);
              }
            : undefined
        }
      >
        <Icon name={direction === "back" ? "chevron-left" : "chevron-right"} size={16} color={brand.grafite} />
      </XStack>
    );
  };

  // Nome del professionista. Sul telefono (sotto i 660px) va sopra, a tutta
  // larghezza, e la foto sta accanto ai bollini: nella colonna stretta accanto
  // alla foto un nome lungo prendeva 4 righe (Luca,
  // docs/changelog/2026-11-06-filtro-pagamenti-online.md). Uno solo dei due è
  // visibile, l'altro è nascosto anche al lettore di schermo.
  const renderName = (display: string) => (
    <Text
      display={display}
      fontFamily="heading"
      fontWeight="800"
      fontSize={22}
      lineHeight="26px"
      color={brand.grafite}
      {...(href
                      ? {
                          render: "a",
                          href,
                          textDecorationLine: "none hover:underline",
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
    </Text>  );

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
      padding="5 xs:4"
      // Con la riga "Vedi orari e prezzi" in fondo meno margine sotto e
      // sopra la riga (richiesta di Luca: a scheda chiusa sembrava uno
      // spazio troppo largo, docs/changelog/2026-11-04-prezzi-e-foto-profilo.md).
      paddingBottom={hasAgenda || hasServices ? "4 xs:3" : undefined}
      {...(onPress ? { borderColor: `${brand.filetto} hover:${brand.cianografia} press:${brand.cianografiaScuro}` } : null)}
      role={onPress && !href ? "button" : undefined}
    >
      {/* Sotto i 660px meno spazio tra foto e nome: sui telefoni da 360px la
          colonna del nome restava stretta e i bollini (Verificato, Nuovo
          profilo...) e le recensioni toccavano il bordo. */}
      {/* Sul telefono anche il cuore dei salvati e "Scegli" stanno qui, in
          alto a destra accanto al nome (Luca,
          docs/changelog/2026-11-06-filtro-pagamenti-online.md). */}
      <XStack display="none xs:flex" alignItems="flex-start" gap="2" marginBottom="3">
        <YStack flex={1} minWidth={0}>
          {renderName("flex")}
        </YStack>
        {action ? <XStack flexShrink={0}>{action}</XStack> : null}
      </XStack>
      <XStack gap="4 xs:3" alignItems="flex-start">
        {icon}
        <YStack gap="2" flex={1} minWidth={0}>
          {/* Sotto i 660px "Scegli" va sotto nome e bollini: accanto al nome lo
              mandava su tre righe e metteva i bollini uno per riga (prova da
              utente nuovo, docs/changelog/2026-11-05-prova-utente-nuovo.md). */}
          {/* Sul telefono la colonna prende tutta la larghezza (stretch): con
              "flex-start" nome e bollini si allargavano oltre la scheda sui
              telefoni stretti (iPhone SE, docs/changelog/2026-11-06-filtro-pagamenti-online.md). */}
          <XStack alignItems="flex-start xs:stretch" gap="2" flexDirection="xs:column">
            {/* Nome e bollini sulla stessa riga, che va a capo quando non
                c'è spazio (docs/CHANGELOG.md §349): prima, nella colonna
                stretta, i bollini finivano uno sotto l'altro. */}
            <XStack flex={1} minWidth={0} alignItems="center" columnGap="2" rowGap={6} flexWrap="wrap">
              {renderName("flex xs:none")}
              {verified ? (
                // Pillola "Verificato" esplicita accanto al nome: la sola
                // icona non comunica il significato a chi non conosce la
                // piattaforma (principio di riprova sociale leggibile).
                <BadgeInfo info="verified">
                  <XStack
                    alignItems="center"
                    gap={4}
                    paddingHorizontal="2"
                    paddingVertical={2}
                    borderRadius="10"
                    backgroundColor={brand.terracottaVelo}
                  >
                    <Icon name="badge-check" size={14} color={brand.terracotta} strokeWidth={2} />
                    <Text fontFamily="body" fontSize={13} fontWeight="700" color={brand.terracotta}>
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
                    paddingHorizontal="2"
                    paddingVertical={2}
                    borderRadius="10"
                    backgroundColor={brand.cianografiaVelo}
                  >
                    <Icon name="credit-card" size={13} color={brand.verificato} strokeWidth={2} />
                    <Text fontFamily="body" fontSize={13} fontWeight="700" color={brand.verificato}>
                      Pagamenti online
                    </Text>
                  </XStack>
                </BadgeInfo>
              ) : null}
              {boosted ? (
                <BadgeInfo info="boosted">
                  <XStack alignItems="center" gap={4} paddingHorizontal="2" paddingVertical={2} borderRadius="10" backgroundColor={brand.ottoneVelo}>
                    <Icon name="zap" size={13} color={brand.ottone} strokeWidth={2} />
                    <Text fontFamily="body" fontSize={13} fontWeight="700" color={brand.ottone}>
                      Sponsorizzato
                    </Text>
                  </XStack>
                </BadgeInfo>
              ) : null}
              {isNewProfile ? (
                <XStack display={extraBadgeDisplay} maxWidth="100%">
                <BadgeInfo info="newProfile">
                  <XStack alignItems="center" gap={4} paddingHorizontal="2" paddingVertical={2} borderRadius="10" backgroundColor={brand.cianografiaVelo}>
                    <Icon name="sprout" size={13} color={brand.cianografiaScuro} strokeWidth={2} />
                    <Text fontFamily="body" fontSize={13} fontWeight="700" color={brand.cianografiaScuro}>
                      Iscritto da poco
                    </Text>
                  </XStack>
                </BadgeInfo>
                </XStack>
              ) : null}
              {hasLiabilityInsurance ? (
                <XStack display={extraBadgeDisplay} maxWidth="100%">
                <BadgeInfo info="liabilityInsurance">
                  <XStack alignItems="center" columnGap={4} flexWrap="wrap" flexShrink={1} minWidth={0} paddingHorizontal="2" paddingVertical={2} borderRadius="10" backgroundColor={brand.gesso}>
                    <Icon name="shield-check" size={13} color={brand.grafite} strokeWidth={2} />
                    <Text fontFamily="body" fontSize={13} fontWeight="700" color={brand.grafite}>
                      Assicurazione RC
                    </Text>
                    <Text fontFamily="body" fontSize={10.5} fontWeight="500" color={brand.grafite70}>
                      dichiarata
                    </Text>
                  </XStack>
                </BadgeInfo>
                </XStack>
              ) : null}
              {extraBadges > 0 && !showAllBadges ? (
                <XStack
                  // Bersaglio di 44×44 senza ingrandire il bollino (collaudo dell'8/11, E6-19; .hit-44 in globals.css del sito).
                  className="hit-44"
                  display="none xs:flex"
                  alignItems="center"
                  paddingHorizontal="2"
                  paddingVertical={2}
                  borderRadius="10"
                  backgroundColor={brand.gesso}
                  cursor="pointer"
                  role="button"
                  aria-label={extraBadges === 1 ? "Mostra un altro bollino" : `Mostra altri ${extraBadges} bollini`}
                  onPress={(e: unknown) => {
                    stop(e);
                    (e as { preventDefault?: () => void } | undefined)?.preventDefault?.();
                    setShowAllBadges(true);
                  }}
                >
                  <Text fontFamily="body" fontSize={13} fontWeight="700" color={brand.grafite}>
                    +{extraBadges}
                  </Text>
                </XStack>
              ) : null}
            </XStack>
            {action ? <XStack display="flex xs:none">{action}</XStack> : null}
          </XStack>
          <Text fontSize={16} lineHeight="22px" color={brand.grafite70} numberOfLines={2}>
            <Text fontFamily="body" fontSize={16} fontWeight="700" color={brand.grafite}>
              {categoriesLine}
            </Text>
            {specialties ? ` · ${specialties}` : null}
          </Text>
          <XStack gap="3" alignItems="center" flexWrap="wrap">
            {rating !== undefined ? <Rating value={rating} count={reviewCount} size={15} /> : null}
            {remoteAvailable ? (
              <XStack gap="1" alignItems="center">
                <Icon name="video" size={13} color={brand.cianografiaScuro} strokeWidth={1.5} />
                <Text fontFamily="body" fontSize={13} color={brand.cianografiaScuro} fontWeight="700">
                  Offre consulenza online
                </Text>
              </XStack>
            ) : null}
          </XStack>
          <XStack gap="1" alignItems="center">
            <Icon name="map-pin" size={13} color={brand.grafite70} strokeWidth={1.5} />
            <Text fontSize={16} color={brand.grafite70}>
              {distanceKm !== undefined ? `${city} · ${formatDistanceKm(distanceKm)}` : city}
            </Text>
          </XStack>
          {/* In grigio (docs/CHANGELOG.md §349): è un dato, non un'azione, e
              nel resto del sito il verde vuol dire "cliccabile". */}
          {completedThisMonth && completedThisMonth > 0 ? (
            <Text fontSize={13} color={brand.grafite70}>
              Ha terminato {completedThisMonth} {completedThisMonth === 1 ? "lavoro" : "lavori"} questo mese
            </Text>
          ) : null}
          {reason ? (
            <Text fontSize={16} lineHeight="22px" color={brand.grafite}>
              <Text fontFamily="body" fontSize={16} fontWeight="700" color={brand.cianografiaScuro}>
                Perché:{" "}
              </Text>
              {reason}
            </Text>
          ) : null}
        </YStack>
      </XStack>

      {hasAgenda || hasServices ? (
        <YStack
          marginTop="3"
          paddingTop="2"
          borderTopWidth={1}
          borderTopColor={brand.filetto}
          gap="3"
          onPress={stop}
        >
          <XStack
            render="button"
            alignItems="center"
            justifyContent="space-between"
            gap="2"
            minHeight={32}
            padding={0}
            borderWidth={0}
            backgroundColor="transparent"
            cursor="pointer"
            aria-expanded={expanded}
            role="button"
            onPress={(e: unknown) => {
                        stop(e);
                        setExpanded((prev) => !prev);
                      }}
          >
            <Text fontSize={16} color={brand.grafite70} textAlign="left">
              <Text fontFamily="body" fontSize={16} fontWeight="700" color={brand.cianografiaScuro}>
                {expanded ? `Nascondi ${detailsLabel}` : `Vedi ${detailsLabel}`}
              </Text>
              {/* Con una prestazione cercata (§398) il suo prezzo, non il più basso. */}
              {collapsedPrice}
            </Text>
            <Icon name={expanded ? "chevron-up" : "chevron-down"} size={18} color={brand.cianografiaScuro} strokeWidth={2} />
          </XStack>

          {expanded && hasAgenda ? (
            <YStack gap="2">
                {/* Segmentato come la barra di ricerca, con "Orari per:"
                    davanti (docs/CHANGELOG.md §349): le due pillole separate
                    sembravano un interruttore, e "Online" grigio sembrava
                    "non offerto". Le frecce dei giorni stanno ai lati dei
                    giorni (docs/changelog/2026-11-04-prezzi-e-foto-profilo.md). */}
                <XStack alignItems="center" gap="2">
                  <XStack alignItems="center" gap="2" flex={1} minWidth={0}>
                  <Text fontFamily="body" fontSize={13} fontWeight="600" color={brand.grafite70}>
                    Orari per:
                  </Text>
                  <XStack gap={2} backgroundColor={brand.gesso} borderRadius="10" padding={2}>
                    {(["HOME", "ONLINE"] as const).map((mode) => {
                      const active = activeMode === mode;
                      return (
                        <XStack
                          key={mode}
                          render="button"
                          paddingHorizontal="3"
                          paddingVertical={5}
                          borderWidth={0}
                          borderRadius="10"
                          // Verde pieno col testo bianco, come gli altri pulsanti: sul verde chiaro il contrasto era 3,6 (axe, punto 21).
                          backgroundColor={active ? brand.cianografiaPieno : "transparent"}
                          cursor="pointer"
                          role="button"
                          aria-pressed={active}
                          onPress={(e: unknown) => {
                                                    stop(e);
                                                    setActiveMode(mode);
                                                    setWindowOffset(0);
                                                  }}
                        >
                          <Text fontFamily="body" fontSize={13} fontWeight="700" color={active ? "#FFFFFF" : brand.grafite}>
                            {mode === "HOME" ? "A domicilio" : "Online"}
                          </Text>
                        </XStack>
                      );
                    })}
                  </XStack>
                  </XStack>
                  {/* Sui telefoni più stretti (fino a 390px) gli orari non
                      starebbero accanto alle frecce: le frecce vanno qui, in
                      fondo alla riga di "Orari per:". */}
                  {pager ? (
                    <XStack display="none xxs:flex" gap="1">
                      {dayArrow("back")}
                      {dayArrow("forward")}
                    </XStack>
                  ) : null}
                </XStack>
              {/* flexBasis 0 su intestazioni e celle (bug reale segnalato
                  dall'utente): con flex={1} da solo Tamagui usa flexBasis
                  "auto", ogni colonna prendeva la larghezza del suo contenuto e
                  gli orari non stavano più sotto il loro giorno. */}
              <XStack alignItems="center">
                {pager ? <XStack marginRight="4px xs:2px" display="flex xxs:none">{dayArrow("back")}</XStack> : null}
                <XStack flex={1} minWidth={0}>
                  {visibleDays.map((day, index) => (
                    <YStack
                      key={day.date}
                      // La quarta colonna resta nascosta sul telefono anche prima che la pagina sappia la larghezza.
                      display={index >= AGENDA_VISIBLE_DAYS_PHONE ? "xs:none" : undefined}
                      flex={1}
                      flexBasis={0}
                      minWidth={0}
                      alignItems="center"
                      gap={2}
                      cursor={openAgendaAt ? "pointer" : undefined}
                      role={openAgendaAt ? "button" : undefined}
                      onPress={openAgendaAt?.(day.date)}
                    >
                      <Text fontFamily="body" fontSize={13} fontWeight="700" color={brand.grafite}>
                        {day.label}
                      </Text>
                      <Text fontVariant={["tabular-nums"]} fontSize={12} color={brand.grafite70}>
                        {day.dateLabel}
                      </Text>
                    </YStack>
                  ))}
                </XStack>
                {pager ? <XStack marginLeft="4px xs:2px" display="flex xxs:none">{dayArrow("forward")}</XStack> : null}
              </XStack>

              {timeRows.length > 0 ? (
                <YStack gap="1" paddingHorizontal={pager ? AGENDA_ARROW_SPACE : 0}>
                  {timeRows.map((time) => (
                    <XStack key={time}>
                      {visibleDays.map((day, index) => {
                        const slot = day.times.find((s) => s.time === time);
                        const phoneHidden = index >= AGENDA_VISIBLE_DAYS_PHONE ? "xs:none" : undefined;
                        if (!slot) {
                          return (
                            <XStack key={day.date} display={phoneHidden} flex={1} flexBasis={0} minWidth={0} alignItems="center" justifyContent="center" paddingVertical={4} onPress={openAgendaAt?.(day.date)}>
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
                            display={phoneHidden}
                            flex={1}
                            flexBasis={0}
                            minWidth={0}
                            alignItems="center"
                            justifyContent="center"
                            paddingVertical={3}
                            // Bordo che si riempie al passaggio del mouse
                            // (apps/web/src/app/globals.css, `.hover-ring-host`).
                            className={onSlotPress ? "hover-ring-host" : undefined}
                            cursor={onSlotPress ? "pointer" : undefined}
                            role={onSlotPress ? "button" : undefined}
                            aria-label={onSlotPress ? `Richiedi un preventivo per ${range} il ${day.label}` : undefined}
                            onPress={
                              onSlotPress
                                ? (e: unknown) => {
                                    stop(e);
                                    onSlotPress(day.date, slot.time, slot.endTime, activeMode);
                                  }
                                : undefined
                            }
                          >
                            <XStack className="hover-ring-target" paddingHorizontal="6px xs:2px xxs:3px" paddingVertical={4} borderRadius="10" backgroundColor={brand.cianografiaVelo} maxWidth="100%">
                              <Text
                                fontVariant={["tabular-nums"]}
                                // 14px (prima 12, 10,5 sul telefono): se la fascia non sta su una riga va a capo
                                // dopo il trattino (punto 22, docs/changelog/2026-11-08-prova-persone-simulate.md).
                                fontSize={14}
                                fontWeight="700"
                                color={brand.cianografiaScuro}
                                textAlign="center"
                              >
                                {range.replace("–", "–\u200B")}
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
                <YStack gap="2" padding="3" borderRadius={radiusDoc} borderWidth={1} borderColor={brand.filetto}>
                  <YStack gap={2}>
                    <Text fontSize={13} color={brand.grafite70}>
                      Nessun orario libero in questi giorni. Primo orario libero:
                    </Text>
                    <Text fontSize={16} fontWeight="700" color={brand.grafite}>
                      {firstFreeLabel}
                    </Text>
                  </YStack>
                  <XStack
                    alignSelf="flex-start"
                    paddingHorizontal="3"
                    paddingVertical={6}
                    borderRadius="10"
                    backgroundColor={brand.cianografiaPieno}
                    cursor="pointer"
                    role="button"
                    aria-label="Mostra orari disponibili"
                    onPress={(e: unknown) => {
                                        stop(e);
                                        setWindowOffset(firstFree.index);
                                      }}
                  >
                    <Text fontFamily="body" fontSize={13} fontWeight="700" color="#FFFFFF">
                      Mostra orari disponibili →
                    </Text>
                  </XStack>
                </YStack>
              ) : (
                <Text fontSize={13} color={brand.grafite70} paddingVertical="2">
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
              gap="1"
              {...(hasAgenda ? { paddingTop: "3", borderTopWidth: 1, borderTopColor: brand.filetto } : null)}
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
              {(showAllServices ? serviceList : serviceList.slice(0, 3)).map((service) =>
                service === highlighted ? (
                  <YStack key={service.id} backgroundColor={brand.cianografiaVelo} borderRadius={10} paddingHorizontal="2" marginHorizontal={-8}>
                    <PriceLine label={service.name} labelColor={brand.grafite} price={formatServicePrice(service.priceMinEurCents, service.priceMaxEurCents)} unit={priceUnitLabel(service)} />
                  </YStack>
                ) : (
                  <PriceLine key={service.id} label={service.name} price={formatServicePrice(service.priceMinEurCents, service.priceMaxEurCents)} unit={priceUnitLabel(service)} />
                ),
              )}
              {serviceList.length > 3 ? (
                <XStack
                  alignItems="center"
                  gap="1"
                  paddingTop="1"
                  cursor="pointer"
                  onPress={(e: unknown) => {
                                    stop(e);
                                    setShowAllServices((prev) => !prev);
                                  }}
                  role="button"
                  aria-label={showAllServices ? "Mostra meno prestazioni" : "Mostra tutte le prestazioni"}
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
