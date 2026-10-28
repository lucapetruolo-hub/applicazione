import type { Metadata } from "next";
import {
  isProfessionalCategorySlug,
  matchProblem,
  type ProblemMatchResult,
  type ProfessionalSearchResult,
} from "@professionisti/shared";
import { apiClient } from "../../lib/apiClient";
import { SearchHeader } from "@/components/SearchHeader";

import { shouldCountVisit } from "@/lib/serverCounting";
import { CercaContent, type ProblemSearch } from "./CercaContent";

type PageSearchParams = {
  citta?: string;
  online?: string;
  q?: string;
  urgente?: string;
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
  const filtered = Boolean(searchParams.online || searchParams.citta || searchParams.q || searchParams.urgente || searchParams.problema);
  const seo: Metadata = {
    alternates: { canonical: "/cerca" },
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  };
  if (searchParams.problema) {
    return { ...seo, title: "Chi ti serve", description: "I professionisti adatti al problema che hai descritto." };
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
  return { ...seo, title: "Tutti i professionisti", description: "Trova professionisti vicino a te." };
}

export default async function CercaPage(props: { searchParams: Promise<PageSearchParams> }) {
  const searchParams = await props.searchParams;
  const isOnline = searchParams.online === "1";
  // La città resta un filtro valido anche in modalità "Online": permette di
  // trovare professionisti che offrono consulenza da remoto ma sono radicati
  // in una zona specifica, invece di scartarla del tutto — richiesta esplicita
  // dell'utente ("dai la possibilità di selezionare un luogo" anche online).
  const city = searchParams.citta;

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
    professionals = await apiClient.searchProfessionals({ city, q: searchParams.q, remote: isOnline, track: Boolean(city?.trim() || searchParams.q?.trim()) && (await shouldCountVisit()) });
  } catch {
    loadFailed = true;
  }

  // Tutti i professionisti (nessun filtro città, ma stesso filtro online):
  // alimenta i puntini sulla mappa così, allontanando lo zoom, ne compaiono
  // altri oltre a quelli della città cercata — vedi stessa logica in
  // /cerca/[categoria]. La mappa è mostrata anche in modalità "Online" (un
  // professionista che offre consulenza da remoto resta comunque radicato in
  // una zona), quindi serve calcolarla in entrambe le modalità.
  let allProfessionals: ProfessionalSearchResult[];
  try {
    allProfessionals = await apiClient.searchProfessionals({ q: searchParams.q, remote: isOnline });
  } catch {
    allProfessionals = professionals;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <SearchHeader initialQuery={searchParams.q ?? ""} initialCity={city ?? ""} initialMode={isOnline ? "online" : "domicilio"} />
      {/* Key che cambia con i search params: forza il remount completo del
          contenuto quando si cambia modalita'/citta'/testo, cosi' la lista si
          aggiorna sempre anche navigando verso lo stesso percorso. */}
      <CercaContent
        key={`${isOnline}-${city ?? ""}-${searchParams.q ?? ""}`}
        city={city}
        online={isOnline}
        q={searchParams.q}
        professionals={professionals}
        allProfessionals={allProfessionals}
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
  let allProfessionals: ProfessionalSearchResult[] = [];
  let loadFailed = false;
  if (chosen || offers) {
    const base = { category: chosen ?? undefined, offers, remote: isOnline, merit: true };
    try {
      professionals = await apiClient.searchProfessionals({ ...base, city, track: Boolean(chosen && city?.trim()) && (await shouldCountVisit()) });
    } catch {
      loadFailed = true;
    }
    try {
      allProfessionals = await apiClient.searchProfessionals(base);
    } catch {
      allProfessionals = professionals;
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <SearchHeader initialQuery={description} initialCity={city ?? ""} initialMode={isOnline ? "online" : "domicilio"} />
      <CercaContent
        key={`${isOnline}-${city ?? ""}-${description}-${chosen ?? ""}-${searchParams.domanda ?? ""}`}
        city={city}
        online={isOnline}
        professionals={professionals}
        allProfessionals={allProfessionals}
        loadFailed={loadFailed}
        initialUrgentOnly={searchParams.urgente === "1"}
        problem={problem}
      />
    </div>
  );
}
