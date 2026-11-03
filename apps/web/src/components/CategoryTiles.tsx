"use client";

import { useEffect, useState } from "react";
import { PROFESSIONAL_CATEGORIES, type ProfessionalCategorySlug } from "@professionisti/shared";
import { Icon } from "@professionisti/ui";
import { CATEGORY_ACCENT, CategoryIcon } from "@/components/icons/CategoryIcons";
import { cachedPopularOrder, loadPopularOrder, type CategoryOrderBy, type PopularOrder } from "@/lib/categoryOrder";

/**
 * Oltre questo tempo si mostrano le tessere nell'ordine del catalogo: meglio
 * un ordine meno preciso che un'attesa lunga (l'API gratuita può essere
 * lenta al risveglio).
 */
const POPULAR_ORDER_TIMEOUT_MS = 1200;

/**
 * Nomi lunghi accorciati solo nelle tessere da 3 per riga del telefono, dove
 * andavano a capo su tre righe; il nome intero resta per i lettori di schermo
 * (docs/changelog/2026-11-02-registrazione-pro-migliorie.md).
 */
const COMPACT_LABELS: Partial<Record<ProfessionalCategorySlug, string>> = {
  climatizzazione: "Clima e caldaie",
  muratore: "Muratore",
};

/**
 * Tessere delle categorie con l'icona colorata (docs/CHANGELOG.md §279-§280, stile
 * A scelto dall'utente): scelta dei lavori del professionista
 * (`CategoryMultiPicker`) e categorie della richiesta di preventivo.
 * Pulsanti veri con `aria-pressed`; raggiunto `max` le altre si attenuano.
 *
 * Ordine: in cima le categorie già scelte all'apertura (nella richiesta, la
 * categoria cercata, docs/CHANGELOG.md §281), poi le più cercate nella città
 * indicata o in tutta la piattaforma (`GET /categories/popular`); con
 * `orderBy="professionals"` quelle con più professionisti iscritti
 * (`GET /professionals/category-counts`, scelta dei lavori del professionista). Le tessere
 * compaiono una volta sola, già nell'ordine giusto (richiesta dell'utente,
 * docs/CHANGELOG.md §324: non si deve vedere il riordino): finché l'ordine
 * non arriva si vedono tessere vuote della stessa misura, al massimo per
 * `POPULAR_ORDER_TIMEOUT_MS`, poi l'ordine del catalogo. Mostrate, non si
 * spostano più.
 */
export function CategoryTiles({
  value,
  onToggle,
  max,
  city,
  showPrimary = false,
  ariaLabel,
  orderBy = "searches",
  compact = false,
  only,
}: {
  value: ProfessionalCategorySlug[];
  onToggle: (slug: ProfessionalCategorySlug) => void;
  max: number;
  /** Città per l'ordine dei più cercati, letta una volta sola all'apertura. */
  city?: string;
  /** "Principale" sotto la prima scelta (solo per il professionista). */
  showPrimary?: boolean;
  ariaLabel?: string;
  /** Più cercati (di serie) o con più professionisti iscritti (scelta dei lavori del professionista). */
  orderBy?: CategoryOrderBy;
  /** Sul telefono 3 per riga e più basse (docs/changelog/2026-11-02-registrazione-pro-grafica.md). */
  compact?: boolean;
  /**
   * Solo queste tessere, in questo ordine e senza attese: le categorie suggerite
   * dalla descrizione nella richiesta di preventivo
   * (docs/changelog/2026-11-03-preventivo-descrizione-per-prima.md).
   */
  only?: ProfessionalCategorySlug[];
}) {
  const gridClass = compact ? "cat-tiles is-compact" : "cat-tiles";
  const [initialCity] = useState(city?.trim() || undefined);
  // Ordine già in memoria (seconda apertura): niente attesa.
  const [popularOrder, setPopularOrder] = useState<PopularOrder | undefined>(() => cachedPopularOrder(initialCity, orderBy));
  const ready = only !== undefined || popularOrder !== undefined;
  // Scelte già fatte all'apertura: restano in cima per tutta la visita.
  const [pinned] = useState(value);

  useEffect(() => {
    if (ready) return;
    let settled = false;
    const settle = (order: PopularOrder) => {
      if (settled) return;
      settled = true;
      setPopularOrder(order);
    };
    const timer = setTimeout(() => settle(null), POPULAR_ORDER_TIMEOUT_MS);
    void loadPopularOrder(initialCity, orderBy).promise.then(settle);
    return () => {
      settled = true;
      clearTimeout(timer);
    };
  }, [initialCity, orderBy, ready]);

  if (!ready) {
    return (
      <div className={gridClass} role="group" aria-label={ariaLabel} aria-busy="true">
        {PROFESSIONAL_CATEGORIES.map((category) => (
          <div key={category.slug} className="cat-tile cat-tile-placeholder" aria-hidden="true">
            <span className="cat-tile-icon skeleton-shimmer" />
            <span className="cat-tile-placeholder-label skeleton-shimmer" />
          </div>
        ))}
      </div>
    );
  }

  const baseOrder = popularOrder ?? PROFESSIONAL_CATEGORIES.map((category) => category.slug);
  const order = only ?? [...pinned.filter((slug) => baseOrder.includes(slug)), ...baseOrder.filter((slug) => !pinned.includes(slug))];
  const categories = order
    .map((slug) => PROFESSIONAL_CATEGORIES.find((category) => category.slug === slug))
    .filter((c): c is (typeof PROFESSIONAL_CATEGORIES)[number] => Boolean(c));
  const isFull = value.length >= max;

  return (
    <div className={`${gridClass} cat-tiles-ready`} role="group" aria-label={ariaLabel}>
      {categories.map((category) => {
        const active = value.includes(category.slug);
        const isPrimary = showPrimary && value[0] === category.slug;
        const disabled = !active && isFull;
        const accent = CATEGORY_ACCENT[category.slug];
        return (
          <button
            key={category.slug}
            type="button"
            className={`cat-tile${active ? " is-on" : ""}`}
            onClick={() => onToggle(category.slug)}
            aria-pressed={active}
            disabled={disabled}
            aria-label={isPrimary ? `${category.label}, principale` : category.label}
          >
            <span className="cat-tile-icon" style={{ background: accent.bg, color: accent.fg }} aria-hidden="true">
              <CategoryIcon slug={category.slug} size={compact ? 22 : 26} />
            </span>
            {compact && COMPACT_LABELS[category.slug] ? (
              <span className="cat-tile-label">
                <span className="cat-tile-label-full">{category.label}</span>
                <span className="cat-tile-label-short" aria-hidden="true">
                  {COMPACT_LABELS[category.slug]}
                </span>
              </span>
            ) : (
              <span className="cat-tile-label">{category.label}</span>
            )}
            {isPrimary ? <span className="cat-tile-primary">Principale</span> : null}
            {active ? (
              <span className="cat-tile-check" aria-hidden="true">
                <Icon name="check" size={14} color="white" strokeWidth={3} />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
