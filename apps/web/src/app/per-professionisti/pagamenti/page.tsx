import type { Metadata } from "next";
import { PagamentiContent } from "./PagamentiContent";

export const metadata: Metadata = {
  title: "Come vieni pagato",
  description: "Pagamento online con Stripe o pagamento diretto: acconto, saldo, accredito e commissioni per i professionisti.",
  alternates: { canonical: "/per-professionisti/pagamenti" },
};

export default function PagamentiProfessionistiPage() {
  return <PagamentiContent />;
}
