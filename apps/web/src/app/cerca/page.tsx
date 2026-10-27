import type { Metadata } from "next";
import type { ProfessionalSearchResult } from "@professionisti/shared";
import { apiClient } from "../../lib/apiClient";
import { SearchHeader } from "@/components/SearchHeader";
import { CercaContent } from "./CercaContent";
import { shouldCountVisit } from "@/lib/serverCounting";

type PageSearchParams = { citta?: string; online?: string; q?: string; urgente?: string; servizio?: string };

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
  const filtered = Boolean(searchParams.online || searchParams.citta || searchParams.q || searchParams.urgente || searchParams.servizio);
  const seo: Metadata = {
    alternates: { canonical: "/cerca" },
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  };
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
  // Voce di "Quanto costa in media" in homepage (docs/CHANGELOG.md §383).
  const service = searchParams.servizio?.trim() || undefined;

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
  // /cerca/[categoria]. La mappa è mostrata anche in modalità "Online" (un
  // professionista che offre consulenza da remoto resta comunque radicato in
  // una zona), quindi serve calcolarla in entrambe le modalità.
  let allProfessionals: ProfessionalSearchResult[];
  try {
    allProfessionals = await apiClient.searchProfessionals({ q: searchParams.q, remote: isOnline, service });
  } catch {
    allProfessionals = professionals;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <SearchHeader initialQuery={searchParams.q ?? ""} initialCity={city ?? ""} initialMode={isOnline ? "online" : "domicilio"} serviceLabel={service} />
      {/* Key che cambia con i search params: forza il remount completo del
          contenuto quando si cambia modalita'/citta'/testo, cosi' la lista si
          aggiorna sempre anche navigando verso lo stesso percorso. */}
      <CercaContent
        key={`${isOnline}-${city ?? ""}-${searchParams.q ?? ""}-${service ?? ""}`}
        city={city}
        online={isOnline}
        q={searchParams.q}
        service={service}
        professionals={professionals}
        allProfessionals={allProfessionals}
        loadFailed={loadFailed}
        initialUrgentOnly={searchParams.urgente === "1"}
      />
    </div>
  );
}
