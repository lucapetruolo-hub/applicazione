import type { Metadata } from "next";

/** Titolo della scheda del browser (E7-01 del controllo dell'8/11): le pagine sono client, il titolo sta qui. */
export const metadata: Metadata = { title: "Abbonamento" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
