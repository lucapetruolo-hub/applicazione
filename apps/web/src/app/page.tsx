import type { ProfessionalSearchResult } from "@professionisti/shared";
import { apiClient } from "../lib/apiClient";
import HomeContent from "./HomeContent";

// ISR: rigenera la lista professionisti ogni 5 minuti, così boost/rating
// restano ragionevolmente aggiornati senza perdere i benefici SSG per SEO.
export const revalidate = 300;

export default async function HomePage() {
  let professionals: ProfessionalSearchResult[] = [];
  try {
    professionals = await apiClient.searchProfessionals({});
  } catch {
    professionals = [];
  }

  return <HomeContent professionals={professionals} />;
}
