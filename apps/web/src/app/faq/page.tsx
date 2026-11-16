import type { Metadata } from "next";
import FaqContent from "./FaqContent";
import { BRAND, type FounderSpots } from "@professionisti/shared";
import { API_URL } from "@/lib/apiUrl";

export const metadata: Metadata = {
  title: "Domande frequenti",
  description: `Le domande più comuni su ${BRAND.name}, per chi cerca un professionista e per chi offre i suoi servizi: costi, preventivi, pagamenti, annullamenti, abbonamento.`,
  alternates: { canonical: "/faq" },
};

// Mesi gratis dell'offerta attiva, per la domanda dei professionisti: stessa
// lettura di /per-professionisti, aggiornata ogni 10 minuti.
export const revalidate = 600;

async function loadFounderSpots(): Promise<FounderSpots | null> {
  try {
    const res = await fetch(`${API_URL}/subscriptions/founders`, {
      next: { revalidate },
      signal: AbortSignal.timeout(3000),
    });
    return res.ok ? ((await res.json()) as FounderSpots) : null;
  } catch {
    // API addormentata o irraggiungibile: la domanda dei mesi gratis non compare.
    return null;
  }
}

/**
 * Domande frequenti per clienti e professionisti (docs/changelog/2026-11-16-domande-frequenti.md),
 * testi in packages/shared/src/faq.ts. `FaqContent` è un componente client
 * separato: renderizzare Tamagui direttamente in questo Server Component
 * fallisce in build ("createContext is not a function").
 */
export default async function FaqPage() {
  return <FaqContent founders={await loadFounderSpots()} />;
}
