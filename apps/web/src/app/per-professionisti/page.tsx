import type { Metadata } from "next";
import type { FounderSpots } from "@professionisti/shared";
import { PerProfessionistiContent } from "./PerProfessionistiContent";
import { API_URL } from "@/lib/apiUrl";
import { openGraphFor } from "@/lib/openGraph";

export const metadata: Metadata = {
  // Le parole che cerca un artigiano su Google (docs/changelog/2026-11-12-pagina-per-professionisti.md).
  title: "Lavora come professionista nella tua zona",
  description: "Iscriviti come professionista: ricevi richieste di lavoro dai clienti della tua zona, senza costo per contatto. Preventivi, agenda e recensioni in un posto.",
  alternates: { canonical: "/per-professionisti" },
  openGraph: openGraphFor("/per-professionisti"),
};

// Posti dell'offerta di lancio aggiornati ogni 10 minuti (docs/CHANGELOG.md
// §363): letti dal server così la banda non compare dopo, spostando i prezzi.
export const revalidate = 600;

async function loadFounderSpots(): Promise<FounderSpots | null> {
  try {
    const res = await fetch(`${API_URL}/subscriptions/founders`, {
      next: { revalidate },
      signal: AbortSignal.timeout(3000),
    });
    return res.ok ? ((await res.json()) as FounderSpots) : null;
  } catch {
    // API addormentata o irraggiungibile: niente banda, resta il mese gratuito.
    return null;
  }
}

export default async function PerProfessionistiPage() {
  return <PerProfessionistiContent founders={await loadFounderSpots()} />;
}
