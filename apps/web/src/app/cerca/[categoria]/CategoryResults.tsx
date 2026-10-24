import type { Metadata } from "next";
import {
  PROFESSIONAL_CATEGORIES,
  comuneSlug,
  MIN_PROFESSIONALS_TO_INDEX_CITY,
  hasCategoryPrices,
  subTagLabel,
  findComuneByName,
  type ProfessionalCategorySlug,
  type ProfessionalSearchResult,
} from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";
import { SITE_INDEXABLE } from "@/lib/siteIndexing";
import { breadcrumbJsonLd } from "@/lib/jsonLd";
import { JsonLd } from "@/components/JsonLd";
import { PopularServicesLinks } from "@/components/PopularServicesLinks";
import { CityFacts } from "@/components/CityFacts";
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

/**
 * Pagina con troppo pochi professionisti veri: resta uguale per chi la apre,
 * con l'invio della richiesta (§271), ma fuori da Google, che altrimenti
 * indicizzerebbe pagine quasi vuote tutte uguali (docs/CHANGELOG.md §295-§296).
 * Categoria+città: almeno `MIN_PROFESSIONALS_TO_INDEX_CITY`; categoria in
 * tutta Italia: almeno uno. Solo con il sito aperto ai motori di ricerca, così
 * prima del lancio nessuna chiamata in più. Se la ricerca non risponde non si
 * sa: la pagina resta indicizzabile, meglio di un noindex per un errore
 * passeggero.
 */
async function tooFewRealProfessionals(categorySlug: string, city?: string, subTag?: string): Promise<boolean> {
  if (!SITE_INDEXABLE) return false;
  try {
    const list = withSubTag(await apiClient.searchProfessionals({ category: categorySlug, city, excludeDemo: true }), subTag);
    return list.length < (city ? MIN_PROFESSIONALS_TO_INDEX_CITY : 1);
  } catch {
    return false;
  }
}

/** Pagina "Quanto costa" da collegare dalla pagina città, o null se nessuna ha prezzi veri. */
async function pricePageHref(categorySlug: string, city: string): Promise<string | null> {
  const has = (cityName?: string) => apiClient.getCategoryPrices(categorySlug, cityName).then(hasCategoryPrices, () => false);
  if (await has(city)) return `/prezzi/${categorySlug}/${comuneSlug(city)}`;
  return (await has()) ? `/prezzi/${categorySlug}` : null;
}

/** Solo i professionisti con quella specializzazione (pagine per servizio, docs/CHANGELOG.md §296). */
function withSubTag(list: ProfessionalSearchResult[], subTag?: string): ProfessionalSearchResult[] {
  return subTag ? list.filter((pro) => pro.subTags.includes(subTag)) : list;
}

export async function categoryMetadata(category: Category, city?: string, subTag?: string): Promise<Metadata> {
  const comune = city ? findComuneByName(city) : undefined;
  const empty = await tooFewRealProfessionals(category.slug, comune?.name, subTag);
  const robots: Metadata = empty ? { robots: { index: false, follow: true } } : {};
  if (comune && subTag) {
    const service = subTagLabel(subTag);
    return {
      ...robots,
      title: `${category.label} a ${comune.name}: ${service.toLowerCase()}`,
      description: `${category.label} a ${comune.name} per ${service.toLowerCase()}: confronta profili, prezzi e recensioni e chiedi un preventivo gratis.`,
      alternates: { canonical: `/cerca/${category.slug}/${comuneSlug(comune.name)}/${subTag}` },
    };
  }
  if (comune) {
    return {
      ...robots,
      title: `${category.label} a ${comune.name}`,
      description: `Trova e contatta ${category.label.toLowerCase()} a ${comune.name}: confronta profili, prezzi e recensioni e chiedi un preventivo gratis.`,
      alternates: { canonical: `/cerca/${category.slug}/${comuneSlug(comune.name)}` },
    };
  }
  return {
    ...robots,
    title: `${category.label} vicino a te`,
    description: `Trova e contatta ${category.label.toLowerCase()} nella tua zona.`,
    alternates: { canonical: `/cerca/${category.slug}` },
  };
}

/** Risultati di ricerca per categoria (e città facoltativa), server-rendered. */
export async function CategoryResults({
  category,
  city,
  subTag,
  searchParams,
}: {
  category: Category;
  city?: string;
  /** Specializzazione della pagina per servizio (`/cerca/[categoria]/[citta]/[servizio]`). */
  subTag?: string;
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
  // Link alla pagina "Quanto costa" solo se ha prezzi veri (§296): quella
  // della città se la provincia ha abbastanza dati, altrimenti la nazionale.
  const pricePagePromise = comune ? pricePageHref(category.slug, comune.name) : Promise.resolve(null);

  // Fetch server-side: contenuto SEO-critico deve essere presente nell'HTML
  // già al primo render, non caricato via client-side fetch (CLAUDE.md §5.4).
  let professionals: ProfessionalSearchResult[] = [];
  // API non raggiungibile ≠ nessun risultato: si mostra "Riprova", non
  // "nessun professionista" (docs/CHANGELOG.md §284).
  let loadFailed = false;
  try {
    professionals = withSubTag(await apiClient.searchProfessionals({ category: category.slug, city, remote: isOnline, track: true }), subTag);
  } catch {
    loadFailed = true;
  }

  // Tutti i professionisti della categoria (nessun filtro città, ma stesso
  // filtro online): alimenta i puntini sulla mappa così, allontanando lo
  // zoom, ne compaiono altri oltre a quelli della città cercata — la colonna
  // a sinistra si aggiorna di conseguenza in base a cosa è visibile sulla
  // mappa (ResultsListWithMap). La mappa è mostrata anche in modalità
  // "Online", quindi serve calcolarla in entrambe le modalità.
  let allProfessionals: ProfessionalSearchResult[];
  try {
    allProfessionals = withSubTag(await apiClient.searchProfessionals({ category: category.slug, remote: isOnline }), subTag);
  } catch {
    allProfessionals = professionals;
  }

  // Percorso per Google (Home › Idraulico › Latina), senza riquadro visibile:
  // il titolo sopra i risultati era stato tolto (docs/CHANGELOG.md §271, §295).
  const citySlug = comune ? comuneSlug(comune.name) : undefined;
  const breadcrumbs = breadcrumbJsonLd([
    { label: "Home", href: "/" },
    { label: category.label, href: `/cerca/${category.slug}` },
    ...(comune && citySlug ? [{ label: comune.name, href: `/cerca/${category.slug}/${citySlug}` }] : []),
    ...(comune && citySlug && subTag ? [{ label: subTagLabel(subTag), href: `/cerca/${category.slug}/${citySlug}/${subTag}` }] : []),
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <JsonLd data={breadcrumbs} />
      <SearchHeader initialQuery={category.label} initialCity={city ?? ""} initialMode={isOnline ? "online" : "domicilio"} />
      {/* Key che cambia con i search params: forza il remount completo del
          contenuto quando si cambia modalita'/citta', cosi' la lista si
          aggiorna sempre anche navigando verso lo stesso percorso. */}
      <CategoryContent
        key={`${category.slug}-${isOnline}-${city ?? ""}-${subTag ?? ""}`}
        category={category}
        city={city}
        online={isOnline}
        professionals={professionals}
        allProfessionals={allProfessionals}
        loadFailed={loadFailed}
        initialUrgentOnly={searchParams.urgente === "1"}
      />
      {comune && !loadFailed ? (
        <CityFacts
          categorySlug={category.slug}
          categoryLabel={category.label}
          city={comune.name}
          professionals={professionals}
          pricePageHref={await pricePagePromise}
          subTag={subTag}
        />
      ) : null}
      <PopularServicesLinks
        currentSlug={category.slug}
        city={comune?.name}
        order={await popularPromise}
        available={await availablePromise}
      />
    </div>
  );
}
