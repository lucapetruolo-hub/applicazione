"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { PROFESSIONAL_CATEGORIES, type ProfessionalCategorySlug } from "@professionisti/shared";
import { Icon } from "@professionisti/ui";
import { CategoryCarousel } from "./CategoryCarousel";
import { CategoryIconBadge } from "./CategoryIconBadge";
import { CATEGORY_PHOTOS, CATEGORY_PHOTO_FOCUS } from "@/lib/categoryPhotos";
import { MEGA_MENU_GROUPS, MEGA_MENU_MICRO_DESCRIPTION } from "@/lib/megaMenuGroups";

const ALL = "Tutte";
/** Categorie mostrate da telefono prima di "Mostra tutte" (docs/CHANGELOG.md §267). */
const MOBILE_VISIBLE = 6;

/**
 * Categorie della homepage come schede verticali con foto grande, da
 * scorrere come le storie (direzione "C" scelta dall'utente, docs/CHANGELOG.md
 * §219): prima le foto di `CATEGORY_PHOTOS` erano solo un pallino da 44px.
 * I filtri riusano i gruppi del mega-menu "Servizi" (`MEGA_MENU_GROUPS`), così
 * menu e homepage raggruppano i mestieri allo stesso modo; passando sopra una
 * scheda (o col focus da tastiera) compare la descrizione breve del menu.
 * "Disponibile" solo con almeno un professionista reale, mai un numero
 * (stessa regola della vecchia scheda categoria).
 */
/**
 * Filtro e "Mostra tutte" condivisi tra la riga e il pulsante, che sta
 * accanto al titolo della sezione (scelta dell'utente, docs/CHANGELOG.md §267).
 */
export function useCategoryStoryRail() {
  const [group, setGroup] = useState(ALL);
  const [showAll, setShowAll] = useState(false);
  const slugs = group === ALL ? null : new Set<ProfessionalCategorySlug>(MEGA_MENU_GROUPS.find((g) => g.title === group)?.slugs);
  const categories = PROFESSIONAL_CATEGORIES.filter((c) => !slugs || slugs.has(c.slug));
  return { group, setGroup, showAll, setShowAll, categories };
}

export type CategoryStoryRailState = ReturnType<typeof useCategoryStoryRail>;

/** Solo da telefono (globals.css): da computer le categorie stanno in una riga da scorrere. */
export function CategoryShowAllButton({ state }: { state: CategoryStoryRailState }) {
  const { categories, showAll, setShowAll } = state;
  if (categories.length <= MOBILE_VISIBLE) return null;
  return (
    <button type="button" className="story-show-all" aria-expanded={showAll} aria-controls={RAIL_ID} onClick={() => setShowAll(!showAll)}>
      {showAll ? "Meno" : `Tutte (${categories.length})`}
      <Icon name={showAll ? "chevron-up" : "chevron-down"} size={16} color="currentColor" />
    </button>
  );
}

const RAIL_ID = "categorie-home";

export function CategoryStoryRail({ countBySlug, state }: { countBySlug: Map<string, number>; state: CategoryStoryRailState }) {
  const { group, setGroup, showAll, setShowAll, categories } = state;

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="story-filters" role="group" aria-label="Filtra le categorie">
        {[ALL, ...MEGA_MENU_GROUPS.map((g) => g.title)].map((title) => (
          <button
            key={title}
            type="button"
            className="story-filter"
            aria-pressed={group === title}
            onClick={() => {
              setGroup(title);
              setShowAll(false);
            }}
          >
            {title}
          </button>
        ))}
      </div>

      {/* key: cambiando filtro la riga riparte dall'inizio invece di restare
          scorsa a metà su un elenco più corto. */}
      {/* Da telefono griglia a due colonne con le prime sei e "Mostra tutte" accanto al titolo
          (regole CSS in .story-rail, globals.css): la riga da scorrere
          mostrava una scheda alla volta (revisione UX, docs/CHANGELOG.md §267).
          Da computer resta la riga da scorrere. */}
      <CategoryCarousel key={group} id={RAIL_ID} className={`story-rail${showAll ? " show-all" : ""}`}>
        {categories.map((c, index) => {
          const photoUrl = CATEGORY_PHOTOS[c.slug];
          return (
            <Link key={c.slug} href={`/cerca/${c.slug}`} className={`story-card${index >= MOBILE_VISIBLE ? " is-extra" : ""}`}>
              {photoUrl ? (
                <Image
                  src={photoUrl}
                  alt=""
                  fill
                  sizes="(max-width: 700px) 170px, 230px"
                  style={{ objectFit: "cover", objectPosition: CATEGORY_PHOTO_FOCUS[c.slug] ?? "center" }}
                />
              ) : (
                <span className="story-card-icon">
                  <CategoryIconBadge slug={c.slug} size={64} />
                </span>
              )}
              {countBySlug.get(c.slug) ? <span className="story-card-chip">● Disponibile</span> : null}
              <span className="story-card-label">
                <span className="story-card-title">{c.label}</span>
                <span className="story-card-more">
                  {MEGA_MENU_MICRO_DESCRIPTION[c.slug]}
                  <span className="story-card-cta">Vedi chi c'è vicino a te →</span>
                </span>
              </span>
            </Link>
          );
        })}
        <Link href="/preventivo" className="story-card story-card-other">
          <Icon name="sparkles" size={26} color="white" strokeWidth={1.5} />
          <span className="story-card-title">Non trovi il tuo lavoro?</span>
          <span style={{ fontSize: 14, opacity: 0.9 }}>Descrivilo, ci pensiamo noi →</span>
        </Link>
      </CategoryCarousel>
    </div>
  );
}
