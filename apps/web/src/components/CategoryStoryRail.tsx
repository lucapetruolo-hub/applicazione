"use client";

import { useRef, useState, type MouseEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { PROFESSIONAL_CATEGORIES, type ProfessionalCategorySlug } from "@professionisti/shared";
import { Icon } from "@professionisti/ui";
import { BleedRail } from "./BleedRail";
import { CategoryIconBadge } from "./CategoryIconBadge";
import { GlowLights } from "./GlowLights";
import { CATEGORY_PHOTOS, CATEGORY_PHOTO_FOCUS } from "@/lib/categoryPhotos";
import { MEGA_MENU_GROUPS, MEGA_MENU_MICRO_DESCRIPTION } from "@/lib/megaMenuGroups";

const ALL = "Tutte";
/** Categorie mostrate da telefono prima di "Mostra tutte" (docs/CHANGELOG.md §271). */
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
 * Filtro e "Mostra tutte" condivisi tra la home e la riga delle categorie.
 * Ordine: prima le categorie con più professionisti iscritti e visibili
 * nella ricerca (`professionalsBySlug`, contati dai profili che la home già
 * riceve), a parità l'ordine fisso di `PROFESSIONAL_CATEGORIES` (richiesta
 * di Luca, docs/changelog/2026-11-02-categorie-telefono.md). Da telefono
 * le prime sei sono quindi quelle dove il cliente trova davvero qualcuno.
 */
export function useCategoryStoryRail(professionalsBySlug: Partial<Record<ProfessionalCategorySlug, number>> = {}) {
  const [group, setGroup] = useState(ALL);
  const [showAll, setShowAll] = useState(false);
  const slugs = group === ALL ? null : new Set<ProfessionalCategorySlug>(MEGA_MENU_GROUPS.find((g) => g.title === group)?.slugs);
  // sort è stabile: a parità di iscritti resta l'ordine di PROFESSIONAL_CATEGORIES.
  const categories = PROFESSIONAL_CATEGORIES.filter((c) => !slugs || slugs.has(c.slug)).sort(
    (a, b) => (professionalsBySlug[b.slug] ?? 0) - (professionalsBySlug[a.slug] ?? 0),
  );
  return { group, setGroup, showAll, setShowAll, categories };
}

export type CategoryStoryRailState = ReturnType<typeof useCategoryStoryRail>;

const RAIL_ID = "categorie-home";

export function CategoryStoryRail({ state }: { state: CategoryStoryRailState }) {
  const { group, setGroup, showAll, setShowAll, categories } = state;
  const hidden = categories.length - MOBILE_VISIBLE;
  const firstExtraRef = useRef<HTMLAnchorElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  // Annuncio per chi usa il lettore di schermo: vuoto finché non si tocca il pulsante.
  const [announcement, setAnnouncement] = useState("");

  function toggleShowAll() {
    const next = !showAll;
    setShowAll(next);
    setAnnouncement(next ? `${hidden} categorie aggiunte all'elenco.` : `Elenco ridotto a ${MOBILE_VISIBLE} categorie.`);
    // Aprendo, il fuoco va alla prima categoria comparsa (chi usa la tastiera
    // o il lettore di schermo continua da lì); chiudendo, il pulsante torna
    // sotto le prime sei e la pagina lo segue invece di restare più in basso.
    requestAnimationFrame(() => {
      if (next) firstExtraRef.current?.focus({ preventScroll: true });
      else toggleRef.current?.scrollIntoView({ block: "nearest" });
    });
  }

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 18 }}>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <div className="story-filters scroll-fade" role="group" aria-label="Filtra le categorie">
        {[ALL, ...MEGA_MENU_GROUPS.map((g) => g.title)].map((title) => (
          <button
            key={title}
            type="button"
            className="story-filter"
            aria-pressed={group === title}
            onClick={() => {
              setGroup(title);
              setShowAll(false);
              setAnnouncement("");
            }}
          >
            {title}
          </button>
        ))}
      </div>

      {/* key: cambiando filtro la riga riparte dall'inizio invece di restare
          scorsa a metà su un elenco più corto. */}
      {/* Da telefono griglia a due colonne con le prime sei e "Mostra altre N categorie" sotto
          (regole CSS in .story-rail, globals.css): la riga da scorrere
          mostrava una scheda alla volta (revisione UX, docs/CHANGELOG.md §271).
          Da computer resta la riga da scorrere. */}
      {/* Da computer riga larga quanto lo schermo, come su apple.com (BleedRail,
          docs/changelog/2026-11-11-home-caroselli-larghi.md). */}
      <BleedRail
        key={group}
        id={RAIL_ID}
        className={`story-rail${showAll ? " show-all" : ""}`}
        previousLabel="Categorie precedenti"
        nextLabel="Categorie successive"
        itemSelector=".story-card"
      >
        {categories.map((c, index) => {
          const photoUrl = CATEGORY_PHOTOS[c.slug];
          return (
            <Link
              key={c.slug}
              ref={index === MOBILE_VISIBLE ? firstExtraRef : undefined}
              href={`/cerca/${c.slug}`}
              className={`story-card${index >= MOBILE_VISIBLE ? " is-extra" : ""}`}
            >
              {photoUrl ? (
                <Image
                  src={photoUrl}
                  alt=""
                  fill
                  // Larghezza della foto, non della scheda: la foto (3:2) riempie una
                  // scheda verticale, quindi è larga 1,5 volte l'altezza (200 px da
                  // telefono, 250 fino a 700 px, 340 da computer).
                  sizes="(max-width: 480px) 300px, (max-width: 700px) 375px, 510px"
                  style={{ objectFit: "cover", objectPosition: CATEGORY_PHOTO_FOCUS[c.slug] ?? "center" }}
                />
              ) : (
                <span className="story-card-icon">
                  <CategoryIconBadge slug={c.slug} size={64} />
                </span>
              )}
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
        {/* Solo da telefono (globals.css): subito sotto l'ultima scheda
            visibile, dove finisce lo sguardo, e a tutta larghezza. Prima era
            un link accanto al titolo e non si notava (richiesta di Luca,
            docs/changelog/2026-11-02-categorie-telefono.md). */}
        {hidden > 0 ? (
          <button
            ref={toggleRef}
            type="button"
            className="story-show-all"
            aria-expanded={showAll}
            aria-controls={RAIL_ID}
            onClick={toggleShowAll}
          >
            {showAll ? "Mostra meno" : `Mostra altre ${hidden} categorie`}
            <Icon name={showAll ? "chevron-up" : "chevron-down"} size={18} color="currentColor" />
          </button>
        ) : null}
        {/* In fondo alla riga: chi non trova il suo mestiere arriva qui
            dopo l'ultima categoria. Per qualche ora è stata la prima scheda
            da computer, ma a Luca non piaceva lì
            (docs/changelog/2026-11-11-home-apertura-piu-alta.md).
            Porta al campo "Cosa è successo?" in cima alla home, con il cursore
            dentro e le frasi d'esempio aperte (scelta di Luca,
            docs/changelog/2026-11-03-luci-che-accelerano.md): prima apriva
            /preventivo, che chiedeva di nuovo la categoria che la persona non
            aveva trovato. Senza il campo (o senza JavaScript) resta il link. */}
        <Link href="/preventivo" className="story-card story-card-other" onClick={goToProblemField}>
          <GlowLights tone="verde" />
          <Icon name="pencil" size={26} color="white" strokeWidth={1.5} />
          <span className="story-card-title">Non trovi il tuo lavoro?</span>
          <span style={{ fontSize: 16, opacity: 0.9 }}>Scrivi il problema, ti diciamo chi chiamare →</span>
        </Link>
      </BleedRail>
    </div>
  );
}

/** Porta al campo "Cosa è successo?" della home e ci mette il cursore; se non c'è, il link apre /preventivo. */
export function goToProblemField(event: MouseEvent<HTMLAnchorElement>) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  const field = document.querySelector<HTMLElement>(".hero-problem-input");
  const input = field?.matches("input") ? field : field?.querySelector<HTMLElement>("input");
  if (!input) return;
  event.preventDefault();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  input.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  input.focus({ preventScroll: true });
}
