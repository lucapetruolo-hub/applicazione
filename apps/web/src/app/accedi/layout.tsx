import type { Metadata } from "next";
import type { ReactNode } from "react";

// La pagina è un componente client: titolo della scheda del browser qui
// (docs/CHANGELOG.md §279), prima restava quello generico del sito.
export const metadata: Metadata = {
  title: "Accedi",
  description: "Accedi al tuo account.",
};

export default function AccediLayout({ children }: { children: ReactNode }) {
  return children;
}
