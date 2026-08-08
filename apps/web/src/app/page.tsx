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

  // Numeri reali per la striscia "social proof" (richiesta esplicita
  // dell'utente) — se l'API non risponde, la striscia semplicemente non
  // compare invece di mostrare uno zero fuorviante (vedi PlatformStats).
  let platformStats: { totalUsers: number; totalProfessionals: number } | null = null;
  try {
    platformStats = await apiClient.platformStats();
  } catch {
    platformStats = null;
  }

  return <HomeContent professionals={professionals} platformStats={platformStats} />;
}
