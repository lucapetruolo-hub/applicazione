import type { Metadata } from "next";
import {
  findComuneByName,
  isProfessionalCategorySlug,
  matchProblem,
  type ProblemMatchResult,
  type ProfessionalSearchResult,
} from "@professionisti/shared";
import { apiClient } from "../../lib/apiClient";
import { SearchHeader } from "@/components/SearchHeader";

import { shouldCountVisit } from "@/lib/serverCounting";
import type { MapPoolQuery } from "@/components/ResultsListWithMap";
import { CercaContent, type ProblemSearch } from "./CercaContent";

type PageSearchParams = {
  citta?: string;
  online?: string;
  q?: string;
  urgente?: string;
  /** Prestazione di "Quanto costa in media" (docs/CHANGELOG.md §398). */
  servizio?: string;
  /** Descrizione del problema scritta nella barra (docs/CHANGELOG.md §392). */
  problema?: string;
  /** Mestiere scelto dal cliente (risposta alla domanda, "Oppure"). */
  mestiere?: string;
  /** "Non lo so" alla domanda. */
  domanda?: string;
};

/** Se il server non risponde resta il dizionario: la pagina non deve mai fallire. */
async function loadProblemMatch(description: string, city: string | undefined): Promise<ProblemMatchResult> {
  try {
    return await apiClient.matchProblem({ description, city });
  } catch {
    const match = matchProblem(description);
    return {
      categories: match.outOfService ? [] : match.categories.slice(0, 3).map((category) => category.slug),
      safety: match.safety,
      outOfService: match.outOfService,
      question: match.question,
      reason: null,
      source: "dizionario",
    };
  }
}

// Pagina "tutti i professionisti": raggiunta quando la ricerca non riconosce
// una categoria specifica (solo città, solo modalità online, o nome libero).
// Dinamica (non SSG) perché le combinazioni città/online/q sono troppe per
// pre-generarle, ma resta server-rendered per lo stesso motivo SEO delle
// pagine categoria (CLAUDE.md §5.4).
export const dynamic = "force-dynamic";

export async function generateMetadata(props: { searchParams: Promise<PageSearchParams> }): Promise<Metadata> {
  const searchParams = await props.searchParams;
  // Le varianti con filtri (città libera, online, nome) sono ricerche, non
  // pagine da indicizzare: canonical sulla pagina base e fuori da Google. Le
  // pagine città indicizzabili sono /cerca/[categoria]/[citta].
  const filtered = Boolean(
    searchParams.online || searchParams.citta || searchParams.q || searchParams.urgente || searchParams.servizio || searchParams.problema,
  );
  const seo: Metadata = {
    alternates: { canonical: "/cerca" },
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  };
  if (searchParams.problema) {
    return { ...seo, title: "Chi ti serve", description: "I professionisti adatti al problema che hai descritto." };
  }
  if (searchParams.servizio) {
    return { ...seo, title: `Chi offre "${searchParams.servizio}"`, description: `Professionisti che offrono ${searchParams.servizio}.` };
  }
  if (searchParams.online === "1") {
    return { ...seo, title: "Consulenze online", description: "Professionisti disponibili per consulenza online." };
  }
  if (searchParams.citta) {
    return {
      ...seo,
      title: `Professionisti a ${searchParams.citta}`,
      description: `Trova professionisti a ${searchParams.citta}.`,
    };
  }
  return { ...seo, title: "Tutti i professionisti", description: "Idraulici, elettricisti, imprese di pulizie e altri professionisti vicino a te: confronta profili, prezzi e recensioni e chiedi un preventivo gratis." };
}

export default async function CercaPage(props: { searchParams: Promise<PageSearchParams> }) {
  const searchParams = await props.searchParams;
  const isOnline = searchParams.online === "1";
  // La città resta un filtro valido anche in modalità "Online": permette di
  // trovare professionisti che offrono consulenza da remoto ma sono radicati
  // in una zona specifica, invece di scartarla del tutto — richiesta esplicita
  // dell'utente ("dai la possibilità di selezionare un luogo" anche online).
  const city = searchParams.citta;
  // Voce di "Quanto costa in media" in homepage (docs/CHANGELOG.md §398).
  const service = searchParams.servizio?.trim() || undefined;

  const description = searchParams.problema?.trim().slice(0, 1000) || undefined;
  if (description) {
    return <ProblemResults description={description} searchParams={searchParams} isOnline={isOnline} city={city} />;
  }

  let professionals: ProfessionalSearchResult[] = [];
  // API non raggiungibile ≠ nessun risultato: si mostra "Riprova", non
  // "nessun professionista" (docs/CHANGELOG.md §284).
  let loadFailed = false;
  try {
    // Contata solo con una città o una parola scritta, mai il testo (§370).
    professionals = await apiClient.searchProfessionals({ city, q: searchParams.q, remote: isOnline, service, track: Boolean(city?.trim() || searchParams.q?.trim()) && (await shouldCountVisit()) });
  } catch {
    loadFailed = true;
  }

  // Tutti i professionisti (nessun filtro città, ma stesso filtro online):
  // alimenta i puntini sulla mappa così, allontanando lo zoom, ne compaiono
  // altri oltre a quelli della città cercata — vedi stessa logica in
  // /cerca/[categoria]. Li chiede il browser quando apre la mappa (collaudo
  // N-02, docs/changelog/2026-10-30-velocita-telefono.md); senza città la
  // ricerca è già quella.
  const comune = city ? findComuneByName(city) : undefined;
  const mapPool: MapPoolQuery | undefined = city?.trim() ? { q: searchParams.q, remote: isOnline, service } : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <SearchHeader initialQuery={searchParams.q ?? service ?? ""} initialCity={city ?? ""} initialMode={isOnline ? "online" : "domicilio"} service={service} />
      {/* Key che cambia con i search params: forza il remount completo del
          contenuto quando si cambia modalita'/citta'/testo, cosi' la lista si
          aggiorna sempre anche navigando verso lo stesso percorso. */}
      <CercaContent
        key={`${isOnline}-${city ?? ""}-${searchParams.q ?? ""}-${service ?? ""}`}
        city={city}
        cityCenter={comune ? [comune.lat, comune.lon] : undefined}
        online={isOnline}
        q={searchParams.q}
        service={service}
        professionals={professionals}
        mapPool={mapPool}
        loadFailed={loadFailed}
        initialUrgentOnly={searchParams.urgente === "1"}
      />
    </div>
  );
}

/**
 * Risultati dalla descrizione del problema (docs/CHANGELOG.md §392): stessa
 * pagina dei risultati, con la banda in cima, ordinati senza boost.
 */
async function ProblemResults({
  description,
  searchParams,
  isOnline,
  city,
}: {
  description: string;
  searchParams: PageSearchParams;
  isOnline: boolean;
  city: string | undefined;
}) {
  const result = await loadProblemMatch(description, city);
  const picked = searchParams.mestiere && isProfessionalCategorySlug(searchParams.mestiere) ? searchParams.mestiere : null;
  const chosen = picked ?? (result.outOfService ? null : (result.categories[0] ?? null));
  const offers = !picked && result.outOfService ? result.outOfService : undefined;
  const problem: ProblemSearch = {
    description,
    // Scegliendo un mestiere a mano il "fuori servizio" non vale più.
    result: picked ? { ...result, outOfService: null } : result,
    chosen,
    questionDone: Boolean(picked) || searchParams.domanda === "no",
  };

  let professionals: ProfessionalSearchResult[] = [];
  let mapPool: MapPoolQuery | undefined;
  let loadFailed = false;
  if (chosen || offers) {
    const base = { category: chosen ?? undefined, offers, remote: isOnline, merit: true };
    try {
      professionals = await apiClient.searchProfessionals({ ...base, city, track: Boolean(chosen && city?.trim()) && (await shouldCountVisit()) });
    } catch {
      loadFailed = true;
    }
    // Puntini della mappa oltre la città: li chiede il browser (vedi sopra).
    if (city?.trim()) mapPool = base;
  }
  const comune = city ? findComuneByName(city) : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <SearchHeader initialQuery={description} initialCity={city ?? ""} initialMode={isOnline ? "online" : "domicilio"} />
      <CercaContent
        key={`${isOnline}-${city ?? ""}-${description}-${chosen ?? ""}-${searchParams.domanda ?? ""}`}
        city={city}
        cityCenter={comune ? [comune.lat, comune.lon] : undefined}
        online={isOnline}
        professionals={professionals}
        mapPool={mapPool}
        loadFailed={loadFailed}
        initialUrgentOnly={searchParams.urgente === "1"}
        problem={problem}
      />
    </div>
  );
}
