"use client";

import { useSyncExternalStore, type MouseEvent } from "react";
import { BadgeInfo } from "./BadgeInfo";
import { ProfessionalKindBadge } from "./ProfessionalKindBadge";
import { Icon } from "./Icon";
import { Rating } from "./Rating";
import { PriceLine } from "./PriceLine";
import { brand } from "./tokens";
import { formatDistanceKm } from "./cardText";
import {
  AGENDA_VISIBLE_DAYS_PHONE,
  formatServicePrice,
  priceUnitLabel,
  stop,
  useProfessionalCardModel,
  type ProfessionalCardProps,
} from "./professionalCardModel";
import styles from "./ProfessionalCard.module.css";

export type {
  ProfessionalCardAvailabilityDay,
  ProfessionalCardAvailabilitySlot,
  ProfessionalCardPriceUnit,
  ProfessionalCardProps,
  ProfessionalCardService,
} from "./professionalCardModel";
export { formatDistanceKm, priceUnitSuffix } from "./cardText";

/*
 * Variante per il sito di `ProfessionalCard` (ProfessionalCard.tsx) in HTML
 * semplice (docs/changelog/2026-11-09-pagine-pubbliche-senza-tamagui.md):
 * stesso aspetto, senza il calcolo degli stili di Tamagui per ogni scheda
 * delle pagine città. I conti stanno in professionalCardModel.ts, comuni alle
 * due varianti; se cambia il disegno di ProfessionalCard.tsx, va cambiato
 * anche qui.
 */

const PHONE_QUERY = "(max-width: 660px)";

function subscribePhone(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Telefono (fino a 660px): 3 giorni nella mini-agenda invece di 4. Prima di
 * conoscere la larghezza vale "telefono", come `useMedia` di Tamagui
 * (`mediaQueryDefaultActive`), così la pagina preparata dal server è la stessa.
 */
function useIsPhone() {
  return useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => true,
  );
}

function cx(...names: (string | false | null | undefined)[]) {
  return names.filter(Boolean).join(" ");
}

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
  } = useProfessionalCardModel(props, useIsPhone());
  // Sul telefono "Iscritto da poco" e "Assicurazione RC" dietro un "+N" (vedi professionalCardModel.ts).
  const extraBadgeClass = showAllBadges ? styles.extraBadgeShown : styles.extraBadge;

  // Freccia per scorrere i giorni della mini-agenda.
  const dayArrow = (direction: "back" | "forward") => {
    const enabled = direction === "back" ? canGoBack : canGoForward;
    return (
      <div
        className={cx("is_View", styles.dayArrow, enabled ? `hover-ring ${styles.dayArrowOn}` : styles.dayArrowOff)}
        // Sempre un pulsante, spento quando non si può andare oltre: un riquadro
        // con un nome e senza ruolo non è permesso (axe, punto 21,
        // docs/changelog/2026-11-08-prova-persone-simulate.md).
        role="button"
        aria-disabled={!enabled}
        tabIndex={enabled ? 0 : -1}
        aria-label={direction === "back" ? "Giorni precedenti" : "Giorni successivi"}
        onClick={
          enabled
            ? (e) => {
                stop(e);
                goToDays(direction);
              }
            : undefined
        }
      >
        <Icon name={direction === "back" ? "chevron-left" : "chevron-right"} size={16} color={brand.grafite} />
      </div>
    );
  };

  // Nome del professionista. Sul telefono (sotto i 660px) va sopra, a tutta
  // larghezza, e la foto sta accanto ai bollini: nella colonna stretta accanto
  // alla foto un nome lungo prendeva 4 righe (Luca,
  // docs/changelog/2026-11-06-filtro-pagamenti-online.md). Uno solo dei due è
  // visibile, l'altro è nascosto anche al lettore di schermo.
  const renderName = (displayClass: string) =>
    href ? (
      <a
        className={cx("is_Text font_heading", styles.name, styles.nameLink, displayClass)}
        href={href}
        // Clic normale: niente ricarica della pagina, apre il profilo `onPress`
        // della card. Con Ctrl/Cmd/Maiusc il browser apre un'altra scheda e la
        // card non naviga.
        onClick={(e: MouseEvent) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey) e.stopPropagation();
          else e.preventDefault();
        }}
      >
        {businessName}
      </a>
    ) : (
      <span className={cx("is_Text font_heading", styles.name, displayClass)}>{businessName}</span>
    );

  return (
    // Niente aria-label personalizzato: la card contiene già come testo
    // visibile nome/categoria/città/rating (WCAG 2.5.3 "Label in Name").
    <div
      className={cx(
        "is_View",
        styles.card,
        (hasAgenda || hasServices) && styles.cardWithDetails,
        onPress && styles.cardPressable,
      )}
      role={onPress && !href ? "button" : undefined}
      tabIndex={onPress && !href ? 0 : undefined}
      onClick={onPress ? () => onPress() : undefined}
    >
      {/* Sul telefono il nome, il cuore dei salvati e "Scegli" stanno qui, in
          alto, a tutta larghezza (docs/changelog/2026-11-06-filtro-pagamenti-online.md). */}
      <div className={cx("is_View", styles.phoneTop)}>
        <div className={cx("is_View", styles.grow)}>{renderName(styles.nameOnPhone!)}</div>
        {action ? <div className={cx("is_View", styles.row, styles.noShrink)}>{action}</div> : null}
      </div>
      <div className={cx("is_View", styles.head)}>
        {icon}
        <div className={cx("is_View", styles.info)}>
          {/* Sotto i 660px "Scegli" va sotto nome e bollini (docs/changelog/2026-11-05-prova-utente-nuovo.md). */}
          <div className={cx("is_View", styles.nameRow)}>
            {/* Nome e bollini sulla stessa riga, che va a capo quando non c'è spazio (docs/CHANGELOG.md §349). */}
            <div className={cx("is_View", styles.badges)}>
              {renderName(styles.nameOnDesktop!)}
              {verified ? (
                <BadgeInfo info="verified">
                  <div className={cx("is_View", styles.badge, styles.badgeVerificato)}>
                    <Icon name="badge-check" size={14} color={brand.verificato} strokeWidth={2} />
                    <span className={cx("is_Text font_body", styles.badgeText, styles.textVerificato)}>Verificato</span>
                  </div>
                </BadgeInfo>
              ) : null}
              {professionalKind ? <ProfessionalKindBadge kind={professionalKind} /> : null}
              {stripeVerified ? (
                <BadgeInfo info="stripeVerified">
                  <div className={cx("is_View", styles.badge, styles.badgeGreen)}>
                    <Icon name="credit-card" size={13} color={brand.verificato} strokeWidth={2} />
                    <span className={cx("is_Text font_body", styles.badgeText, styles.textVerified)}>Pagamenti online</span>
                  </div>
                </BadgeInfo>
              ) : null}
              {boosted ? (
                <BadgeInfo info="boosted">
                  <div className={cx("is_View", styles.badge, styles.badgeBrass)}>
                    <Icon name="zap" size={13} color={brand.ottone} strokeWidth={2} />
                    <span className={cx("is_Text font_body", styles.badgeText, styles.textBrass)}>Sponsorizzato</span>
                  </div>
                </BadgeInfo>
              ) : null}
              {isNewProfile ? (
                <div className={cx("is_View", styles.row, extraBadgeClass, styles.fullWidthMax)}>
                  <BadgeInfo info="newProfile">
                    <div className={cx("is_View", styles.badge, styles.badgeGreen)}>
                      <Icon name="sprout" size={13} color={brand.cianografiaScuro} strokeWidth={2} />
                      <span className={cx("is_Text font_body", styles.badgeText, styles.textGreenDark)}>Iscritto da poco</span>
                    </div>
                  </BadgeInfo>
                </div>
              ) : null}
              {hasLiabilityInsurance ? (
                <div className={cx("is_View", styles.row, extraBadgeClass, styles.fullWidthMax)}>
                  <BadgeInfo info="liabilityInsurance">
                    <div className={cx("is_View", styles.badgeInsurance)}>
                      <Icon name="shield-check" size={13} color={brand.grafite} strokeWidth={2} />
                      <span className={cx("is_Text font_body", styles.badgeText, styles.textGrafite)}>Assicurazione RC</span>
                      <span className={cx("is_Text font_body", styles.badgeNote)}>dichiarata</span>
                    </div>
                  </BadgeInfo>
                </div>
              ) : null}
              {extraBadges > 0 && !showAllBadges ? (
                <div
                  className={cx("is_View", styles.moreBadges)}
                  role="button"
                  tabIndex={0}
                  aria-label={extraBadges === 1 ? "Mostra un altro bollino" : `Mostra altri ${extraBadges} bollini`}
                  onClick={(e) => {
                    stop(e);
                    e.preventDefault();
                    setShowAllBadges(true);
                  }}
                >
                  <span className={cx("is_Text font_body", styles.badgeText, styles.textGrafite)}>+{extraBadges}</span>
                </div>
              ) : null}
            </div>
            {action ? <div className={cx("is_View", styles.row, styles.actionOnDesktop)}>{action}</div> : null}
          </div>
          <span className={cx("is_Text", styles.categories)}>
            <span className={cx("is_Text font_body", styles.categoriesStrong)}>{categoriesLine}</span>
            {specialties ? ` · ${specialties}` : null}
          </span>
          <div className={cx("is_View", styles.ratingRow)}>
            {rating !== undefined ? <Rating value={rating} count={reviewCount} size={15} /> : null}
            {remoteAvailable ? (
              <div className={cx("is_View", styles.iconLine)}>
                <Icon name="video" size={13} color={brand.cianografiaScuro} strokeWidth={1.5} />
                <span className={cx("is_Text font_body", styles.remote)}>Offre consulenza online</span>
              </div>
            ) : null}
          </div>
          <div className={cx("is_View", styles.iconLine)}>
            <Icon name="map-pin" size={13} color={brand.grafite70} strokeWidth={1.5} />
            <span className={cx("is_Text", styles.city)}>
              {distanceKm !== undefined ? `${city} · ${formatDistanceKm(distanceKm)}` : city}
            </span>
          </div>
          {/* In grigio (docs/CHANGELOG.md §349): è un dato, non un'azione. */}
          {completedThisMonth && completedThisMonth > 0 ? (
            <span className={cx("is_Text", styles.small)}>
              Ha terminato {completedThisMonth} {completedThisMonth === 1 ? "lavoro" : "lavori"} questo mese
            </span>
          ) : null}
          {reason ? (
            <span className={cx("is_Text", styles.reason)}>
              <span className={cx("is_Text font_body", styles.reasonLabel)}>Perché: </span>
              {reason}
            </span>
          ) : null}
        </div>
      </div>

      {hasAgenda || hasServices ? (
        <div className={cx("is_View", styles.details)} onClick={stop}>
          <button
            className={cx("is_View", styles.toggle)}
            role="button"
            aria-expanded={expanded}
            onClick={(e) => {
              stop(e);
              setExpanded((prev) => !prev);
            }}
          >
            <span className={cx("is_Text", styles.toggleText)}>
              <span className={cx("is_Text font_body", styles.toggleLabel)}>
                {expanded ? `Nascondi ${detailsLabel}` : `Vedi ${detailsLabel}`}
              </span>
              {/* Con una prestazione cercata (§398) il suo prezzo, non il più basso. */}
              {collapsedPrice}
            </span>
            <Icon name={expanded ? "chevron-up" : "chevron-down"} size={18} color={brand.cianografiaScuro} strokeWidth={2} />
          </button>

          {expanded && hasAgenda ? (
            <div className={cx("is_View", styles.agenda)}>
              {/* Segmentato come la barra di ricerca, con "Orari per:" davanti
                  (docs/CHANGELOG.md §349); le frecce dei giorni ai lati dei giorni
                  (docs/changelog/2026-11-04-prezzi-e-foto-profilo.md). */}
              <div className={cx("is_View", styles.modeRow)}>
                <div className={cx("is_View", styles.modeLeft)}>
                  <span className={cx("is_Text font_body", styles.modeLabel)}>Orari per:</span>
                  <div className={cx("is_View", styles.segmented)}>
                    {(["HOME", "ONLINE"] as const).map((mode) => {
                      const active = activeMode === mode;
                      return (
                        <button
                          key={mode}
                          role="button"
                          className={cx("is_View", styles.modeButton, active && styles.modeButtonActive)}
                          aria-pressed={active}
                          onClick={(e) => {
                            stop(e);
                            setActiveMode(mode);
                            setWindowOffset(0);
                          }}
                        >
                          <span className={cx("is_Text font_body", styles.badgeText, active ? styles.textWhite : styles.textGrafite)}>
                            {mode === "HOME" ? "A domicilio" : "Online"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* Sui telefoni più stretti (fino a 390px) le frecce vanno in fondo alla riga di "Orari per:". */}
                {pager ? (
                  <div className={cx("is_View", styles.arrowsNarrow)}>
                    {dayArrow("back")}
                    {dayArrow("forward")}
                  </div>
                ) : null}
              </div>
              {/* flexBasis 0 su intestazioni e celle: gli orari restano sotto il loro giorno (bug reale segnalato dall'utente). */}
              <div className={cx("is_View", styles.dayRow)}>
                {pager ? <div className={cx("is_View", styles.row, styles.arrowBefore)}>{dayArrow("back")}</div> : null}
                <div className={cx("is_View", styles.days)}>
                  {visibleDays.map((day, index) => (
                    <div
                      key={day.date}
                      // La quarta colonna resta nascosta sul telefono anche prima che la pagina sappia la larghezza.
                      className={cx("is_View", styles.dayHead, index >= AGENDA_VISIBLE_DAYS_PHONE && styles.hideOnPhone, openAgendaAt && styles.pointer)}
                      role={openAgendaAt ? "button" : undefined}
                      tabIndex={openAgendaAt ? 0 : undefined}
                      onClick={openAgendaAt?.(day.date)}
                    >
                      <span className={cx("is_Text font_body", styles.badgeText, styles.textGrafite)}>{day.label}</span>
                      <span className={cx("is_Text", styles.dayDate)}>{day.dateLabel}</span>
                    </div>
                  ))}
                </div>
                {pager ? <div className={cx("is_View", styles.row, styles.arrowAfter)}>{dayArrow("forward")}</div> : null}
              </div>

              {timeRows.length > 0 ? (
                <div className={cx("is_View", styles.times, pager && styles.timesWithPager)}>
                  {timeRows.map((time) => (
                    <div key={time} className={cx("is_View", styles.row)}>
                      {visibleDays.map((day, index) => {
                        const slot = day.times.find((s) => s.time === time);
                        const phoneHidden = index >= AGENDA_VISIBLE_DAYS_PHONE && styles.hideOnPhone;
                        if (!slot) {
                          return (
                            <div key={day.date} className={cx("is_View", styles.cell, styles.cellEmpty, phoneHidden)} onClick={openAgendaAt?.(day.date)}>
                              <span className={cx("is_Text", styles.dash)}>-</span>
                            </div>
                          );
                        }
                        const range = `${slot.time}–${slot.endTime}`;
                        return (
                          <div
                            key={day.date}
                            // Bordo che si riempie al passaggio del mouse (apps/web/src/app/globals.css, `.hover-ring-host`).
                            className={cx("is_View", onSlotPress && "hover-ring-host", styles.cell, styles.cellSlot, phoneHidden, onSlotPress && styles.pointer)}
                            role={onSlotPress ? "button" : undefined}
                            tabIndex={onSlotPress ? 0 : undefined}
                            aria-label={onSlotPress ? `Richiedi un preventivo per ${range} il ${day.label}` : undefined}
                            onClick={
                              onSlotPress
                                ? (e) => {
                                    stop(e);
                                    onSlotPress(day.date, slot.time, slot.endTime, activeMode);
                                  }
                                : undefined
                            }
                          >
                            <div className={cx("is_View hover-ring-target", styles.slot)}>
                              {/* 14px: se la fascia non sta su una riga va a capo dopo il trattino
                                  (punto 22, docs/changelog/2026-11-08-prova-persone-simulate.md). */}
                              <span className={cx("is_Text", styles.slotText)}>{range.replace("–", "–​")}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ) : null}

              {hasAvailableInWindow ? null : firstFree ? (
                <div className={cx("is_View", styles.firstFree)}>
                  <div className={cx("is_View", styles.firstFreeText)}>
                    <span className={cx("is_Text", styles.small)}>Nessun orario libero in questi giorni. Primo orario libero:</span>
                    <span className={cx("is_Text", styles.firstFreeWhen)}>{firstFreeLabel}</span>
                  </div>
                  <div
                    className={cx("is_View", styles.firstFreeButton)}
                    role="button"
                    tabIndex={0}
                    aria-label="Mostra orari disponibili"
                    onClick={(e) => {
                      stop(e);
                      setWindowOffset(firstFree.index);
                    }}
                  >
                    <span className={cx("is_Text font_body", styles.badgeText, styles.textWhite)}>Mostra orari disponibili →</span>
                  </div>
                </div>
              ) : (
                <span className={cx("is_Text", styles.small, styles.noSlots)}>Nessun orario libero nei prossimi due mesi.</span>
              )}
            </div>
          ) : null}

          {expanded && hasServices ? (
            // Un clic sulle prestazioni apre il profilo come il resto della
            // scheda (docs/CHANGELOG.md §358): l'area qui sopra ferma il clic
            // per l'agenda, non per i prezzi. Da tastiera il profilo si apre dal
            // link del nome.
            <div
              className={cx("is_View", styles.services, hasAgenda && styles.servicesAfterAgenda, onPress && styles.pointer)}
              onClick={
                onPress
                  ? (e) => {
                      stop(e);
                      onPress();
                    }
                  : undefined
              }
            >
              {(showAllServices ? serviceList : serviceList.slice(0, 3)).map((service) =>
                service === highlighted ? (
                  <div key={service.id} className={cx("is_View", styles.serviceHighlighted)}>
                    <PriceLine label={service.name} labelColor={brand.grafite} price={formatServicePrice(service.priceMinEurCents, service.priceMaxEurCents)} unit={priceUnitLabel(service)} />
                  </div>
                ) : (
                  <PriceLine key={service.id} label={service.name} price={formatServicePrice(service.priceMinEurCents, service.priceMaxEurCents)} unit={priceUnitLabel(service)} />
                ),
              )}
              {serviceList.length > 3 ? (
                <div
                  className={cx("is_View", styles.moreServices)}
                  role="button"
                  tabIndex={0}
                  aria-label={showAllServices ? "Mostra meno prestazioni" : "Mostra tutte le prestazioni"}
                  onClick={(e) => {
                    stop(e);
                    setShowAllServices((prev) => !prev);
                  }}
                >
                  <span className={cx("is_Text", styles.moreServicesText)}>
                    {showAllServices ? "Mostra meno" : `Mostra tutte (${serviceList.length})`}
                  </span>
                  <Icon name={showAllServices ? "chevron-up" : "chevron-down"} size={14} color={brand.cianografiaScuro} strokeWidth={2} />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
