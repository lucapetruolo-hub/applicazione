import type { ProfessionalSearchResult } from "@professionisti/shared";
import { apiClient } from "../lib/apiClient";
import HomeContent from "./HomeContent";

// Server-rendered ad ogni richiesta: stesso motivo di /cerca/[categoria],
// niente finestra di cache in cui un professionista eliminato resterebbe
// visibile nella vetrina "Professionisti su Professionisti".
export const dynamic = "force-dynamic";

export default async function HomePage() {
  let professionals: ProfessionalSearchResult[] = [];
  try {
    // excludeDemo: la home dichiara esplicitamente di mostrare conteggi e
    // professionisti reali (redesign "Scheda Intervento" §4.3/§4.6) — i
    // profili del seed (PLACEHOLDER_PROFESSIONALS) non devono contribuire
    // né ai conteggi per categoria né alla vetrina in evidenza.
    professionals = await apiClient.searchProfessionals({ excludeDemo: true });
  } catch {
    professionals = [];
  }

  return <HomeContent professionals={professionals} />;
}
