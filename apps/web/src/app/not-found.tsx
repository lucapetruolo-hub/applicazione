import type { Metadata } from "next";
import { NotFoundContent } from "@/components/NotFoundContent";

export const metadata: Metadata = {
  title: "Pagina non trovata",
  robots: { index: false, follow: true },
};

/**
 * Pagina "non trovata" del sito (docs/CHANGELOG.md §295): prima compariva
 * quella di Next.js in inglese. Risponde sempre 404.
 */
export default function NotFound() {
  return <NotFoundContent />;
}
