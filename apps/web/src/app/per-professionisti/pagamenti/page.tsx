import type { Metadata } from "next";
import { PagamentiContent } from "./PagamentiContent";

export const metadata: Metadata = {
  // Le parole che cerca chi valuta i pagamenti online (docs/changelog/2026-11-12-pagina-per-professionisti.md).
  title: "Come vieni pagato: acconto online e pagamento diretto",
  description: "Pagamento online con Stripe o pagamento diretto: acconto, saldo, accredito e commissioni per i professionisti.",
  alternates: { canonical: "/per-professionisti/pagamenti" },
};

export default function PagamentiProfessionistiPage() {
  return <PagamentiContent />;
}
