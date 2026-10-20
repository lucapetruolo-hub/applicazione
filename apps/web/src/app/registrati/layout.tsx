import type { Metadata } from "next";
import type { ReactNode } from "react";

// La pagina è un componente client: titolo della scheda del browser qui
// (docs/CHANGELOG.md §272), prima restava quello generico del sito.
export const metadata: Metadata = {
  title: "Registrati",
  description: "Crea il tuo account gratuito, come cliente o come professionista.",
};

export default function RegistratiLayout({ children }: { children: ReactNode }) {
  return children;
}
