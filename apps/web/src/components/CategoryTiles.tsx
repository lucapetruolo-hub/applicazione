"use client";

import { useEffect, useRef, useState } from "react";
import { PROFESSIONAL_CATEGORIES, type ProfessionalCategorySlug } from "@professionisti/shared";
import { Icon } from "@professionisti/ui";
import { CATEGORY_ACCENT, CategoryIcon } from "@/components/icons/CategoryIcons";
import { apiClient } from "@/lib/apiClient";

/** Oltre questo tempo l'ordine dei più cercati non si applica più: le tessere non devono spostarsi mentre si guarda. */
const POPULAR_ORDER_TIMEOUT_MS = 2000;

/**
 * Tessere delle categorie con l'icona colorata (docs/CHANGELOG.md §278-§279, stile
 * A scelto dall'utente): scelta dei lavori del professionista
 * (`CategoryMultiPicker`) e categorie della richiesta di preventivo.
 * Pulsanti veri con `aria-pressed`; raggiunto `max` le altre si attenuano.
 *
 * Ordine: prima le categorie con più richieste nella città indicata (o in
 * tutta la piattaforma, `GET /categories/popular`). Si applica solo se
 * arriva subito e non è ancora stato scelto nulla, così le tessere non si
 * spostano sotto il dito; altrimenti resta l'ordine del catalogo.
 */
export function CategoryTiles({
  value,
  onToggle,
  max,
  city,
  showPrimary = false,
  ariaLabel,
}: {
  value: ProfessionalCategorySlug[];
  onToggle: (slug: ProfessionalCategorySlug) => void;
  max: number;
  /** Città per l'ordine dei più cercati, letta una volta sola all'apertura. */
  city?: string;
  /** "Principale" sotto la prima scelta (solo per il professionista). */
  showPrimary?: boolean;
  ariaLabel?: string;
}) {
  const [order, setOrder] = useState<ProfessionalCategorySlug[] | null>(null);
  const [initialCity] = useState(city?.trim() || undefined);
  const selectedCount = useRef(value.length);
  selectedCount.current = value.length;

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    apiClient
      .getCategoryPopularity(initialCity)
      .then(({ counts }) => {
        if (cancelled || selectedCount.current > 0 || Date.now() - startedAt > POPULAR_ORDER_TIMEOUT_MS || counts.length === 0) return;
        const bySlug = new Map(counts.map((item) => [item.slug, item.count]));
        setOrder(
          [...PROFESSIONAL_CATEGORIES]
            .sort((a, b) => (bySlug.get(b.slug) ?? 0) - (bySlug.get(a.slug) ?? 0))
            .map((category) => category.slug),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [initialCity]);

  const categories = order
    ? order.map((slug) => PROFESSIONAL_CATEGORIES.find((category) => category.slug === slug)).filter((c): c is (typeof PROFESSIONAL_CATEGORIES)[number] => Boolean(c))
    : PROFESSIONAL_CATEGORIES;
  const isFull = value.length >= max;

  return (
    <div className="cat-tiles" role="group" aria-label={ariaLabel}>
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
              <CategoryIcon slug={category.slug} size={26} />
            </span>
            <span className="cat-tile-label">{category.label}</span>
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
