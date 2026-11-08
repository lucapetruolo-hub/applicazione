import type { Metadata } from "next";
import type { ReactNode } from "react";

// La pagina è un componente client: titolo della scheda del browser qui.
export const metadata: Metadata = {
  title: "Verifica",
  // Pagina personale o aperta da un link nelle email: mai in Google, anche
  // dopo il lancio (collaudo 08/11 E8-07).
  robots: { index: false, follow: false },
};

export default function VerificaLegaleLayout({ children }: { children: ReactNode }) {
  return children;
}
