import type { Metadata } from "next";
import type { ReactNode } from "react";

// "Rispondi" dalla bacheca "Lavori cercati": pagina di passaggio, mai su Google.
export const metadata: Metadata = {
  title: "Rispondi alla richiesta",
  robots: { index: false, follow: false },
};

export default function RispondiLayout({ children }: { children: ReactNode }) {
  return children;
}
