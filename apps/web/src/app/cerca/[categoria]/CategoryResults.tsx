import type { Metadata } from "next";
import {
  PROFESSIONAL_CATEGORIES,
  comuneSlug,
  findComuneByName,
  type ProfessionalCategorySlug,
  type ProfessionalSearchResult,
} from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";
import { SITE_INDEXABLE } from "@/lib/siteIndexing";
import { PopularServicesLinks } from "@/components/PopularServicesLinks";
import { SearchHeader } from "@/components/SearchHeader";
import { CategoryContent } from "./CategoryContent";

type Category = (typeof PROFESSIONAL_CATEGORIES)[number];
export type CategorySearchParams = { citta?: string; online?: string; urgente?: string };

export function findCategory(slug: ProfessionalCategorySlug): Category {
  return PROFESSIONAL_CATEGORIES.find((c) => c.slug === slug)!;
}

/**
 * Titolo/descrizione/canonical condivisi da /cerca/[categoria] e dalla
 * pagina indicizzabile categoria+città /cerca/[categoria]/[citta]
 * (docs/CHANGELOG.md §132, SEO locale — CLAUDE.md §7.6).
 */
/** Oltre questo tempo la pagina non aspetta i più richiesti: resta l'ordine del catalogo. */
const POPULAR_TIMEOUT_MS = 1500;

/** Ordine dei servizi più richiesti (docs/CHANGELOG.md §282); vuoto se l'API non risponde in tempo. */
async function popularOrder(city?: string): Promise<string[]> {
  const timeout = new Promise<string[]>((resolve) => setTimeout(() => resolve([]), POPULAR_TIMEOUT_MS));
  const fetched = apiClient
    .getCategoryPopularity(city)
    .then(({ counts }) => counts.map((item) => item.slug))
    .catch(() => []);
  return Promise.race([fetched, timeout]);
}

/**
 * Categorie con almeno un professionista nella città (docs/CHANGELOG.md §282):
 * si collegano solo pagine con risultati, come nella sitemap. Dal lancio
 * (sito indicizzabile) contano solo i professionisti veri, non i profili demo.
 * `null` se la ricerca non risponde: meglio nessun link che link a pagine vuote.
 */
async function categoriesInCity(city: string): Promise<string[] | null> {
  try {
    const list = await apiClient.searchProfessionals({ city, excludeDemo: SITE_INDEXABLE });
    return [...new Set(list.flatMap((pro) => pro.categories.map((item) => item.slug)))];
  } catch {
    return null;
  }
}

export function categoryMetadata(category: Category, city?: string): Metadata {
  const comune = city ? findComuneByName(city) : undefined;
  if (comune) {
    return {
      title: `${category.label} a ${comune.name}`,
      description: `Trova e contatta ${category.label.toLowerCase()} a ${comune.name}: confronta profili, prezzi e recensioni e chiedi un preventivo gratis.`,
      alternates: { canonical: `/cerca/${category.slug}/${comuneSlug(comune.name)}` },
    };
  }
  return {
    title: `${category.label} vicino a te`,
    description: `Trova e contatta ${category.label.toLowerCase()} nella tua zona.`,
    alternates: { canonical: `/cerca/${category.slug}` },
  };
}

/** Risultati di ricerca per categoria (e città facoltativa), server-rendered. */
export async function CategoryResults({
  category,
  city,
  searchParams,
}: {
  category: Category;
  city?: string;
  searchParams: CategorySearchParams;
}) {
  // La città resta un filtro valido anche in modalità "Online" (vedi stessa
  // nota in /cerca/page.tsx).
  const isOnline = searchParams.online === "1";
  // Solo un comune vero ha la sua pagina categoria+città a cui collegarsi.
  const comune = city ? findComuneByName(city) : undefined;
  // In parallelo alla ricerca, così non allunga il caricamento.
  const popularPromise = popularOrder(comune?.name);
  const availablePromise = comune ? categoriesInCity(comune.name) : Promise.resolve(undefined);

  // Fetch server-side: contenuto SEO-critico deve essere presente nell'HTML
  // già al primo render, non caricato via client-side fetch (CLAUDE.md §5.4).
  let professionals: ProfessionalSearchResult[] = [];
  try {
    professionals = await apiClient.searchProfessionals({ category: category.slug, city, remote: isOnline, track: true });
  } catch {
    professionals = [];
  }

  // Tutti i professionisti della categoria (nessun filtro città, ma stesso
  // filtro online): alimenta i puntini sulla mappa così, allontanando lo
  // zoom, ne compaiono altri oltre a quelli della città cercata — la colonna
  // a sinistra si aggiorna di conseguenza in base a cosa è visibile sulla
  // mappa (ResultsListWithMap). La mappa è mostrata anche in modalità
  // "Online", quindi serve calcolarla in entrambe le modalità.
  let allProfessionals: ProfessionalSearchResult[] = professionals;
  try {
    allProfessionals = await apiClient.searchProfessionals({ category: category.slug, remote: isOnline });
  } catch {
    allProfessionals = professionals;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <SearchHeader initialQuery={category.label} initialCity={city ?? ""} initialMode={isOnline ? "online" : "domicilio"} />
      {/* Key che cambia con i search params: forza il remount completo del
          contenuto quando si cambia modalita'/citta', cosi' la lista si
          aggiorna sempre anche navigando verso lo stesso percorso. */}
      <CategoryContent
        key={`${category.slug}-${isOnline}-${city ?? ""}`}
        category={category}
        city={city}
        online={isOnline}
        professionals={professionals}
        allProfessionals={allProfessionals}
        initialUrgentOnly={searchParams.urgente === "1"}
      />
      <PopularServicesLinks
        currentSlug={category.slug}
        city={comune?.name}
        order={await popularPromise}
        available={await availablePromise}
      />
    </div>
  );
}
