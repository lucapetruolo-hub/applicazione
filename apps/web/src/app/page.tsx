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
    professionals = await apiClient.searchProfessionals({});
  } catch {
    professionals = [];
  }

  return <HomeContent professionals={professionals} />;
}
