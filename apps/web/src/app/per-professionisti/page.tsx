import type { Metadata } from "next";
import type { FounderSpots } from "@professionisti/shared";
import { PerProfessionistiContent } from "./PerProfessionistiContent";

export const metadata: Metadata = {
  title: "Per i professionisti",
  description: "Iscriviti come professionista: ricevi richieste di preventivo dai clienti della tua zona e gestisci la tua agenda.",
  alternates: { canonical: "/per-professionisti" },
};

// Posti dell'offerta di lancio aggiornati ogni 10 minuti (docs/CHANGELOG.md
// §358): letti dal server così la banda non compare dopo, spostando i prezzi.
export const revalidate = 600;

async function loadFounderSpots(): Promise<FounderSpots | null> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/subscriptions/founders`, {
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
