import type { Metadata } from "next";
import { CalendarioScadutoCard } from "./CalendarioScadutoCard";

export const metadata: Metadata = {
  title: "Calendario",
  // Pagina aperta da un link personale: mai in Google, anche dopo il lancio.
  robots: { index: false, follow: false },
};

/**
 * Link di "Altri calendari" scaduto o appuntamento annullato
 * (docs/changelog/2026-11-10-calendario-iphone.md): una frase e la strada
 * per riaverlo aggiornato, invece della risposta tecnica dell'API.
 */
export default async function CalendarioScaduto({ searchParams }: { searchParams: Promise<{ per?: string; riprova?: string }> }) {
  const { per, riprova } = await searchParams;
  return <CalendarioScadutoCard pro={per === "professionista"} retry={riprova === "1"} />;
}
