"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { useJourneyMenuHrefs } from "@/components/verification/SetupJourney";

/**
 * Voci di menu con un pallino "da fare", senza numero (docs/CHANGELOG.md
 * §272-§274): "Agenda" senza disponibilità nei prossimi giorni, e la voce del
 * passo da fare adesso del percorso "Completa il profilo". Lo usano il menu
 * laterale (anche da telefono) e la tendina "Il mio account".
 */
export function useNavAttention(): ReadonlySet<string> {
  const { user, token } = useAuth();
  const pathname = usePathname();
  const professional = Boolean(user?.isProfessional);
  const journeyHrefs = useJourneyMenuHrefs(token, professional, pathname);
  const hrefs = new Set(professional ? journeyHrefs : []);
  if (professional && user?.agendaAttention) hrefs.add("/dashboard/agenda");
  return hrefs;
}
