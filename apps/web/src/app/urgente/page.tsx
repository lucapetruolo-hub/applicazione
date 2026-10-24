import type { Metadata } from "next";
import { UrgenteContent } from "./UrgenteContent";

export const metadata: Metadata = {
  title: "Richiesta urgente",
  description: "Trova subito un professionista disponibile ora per un intervento urgente.",
  alternates: { canonical: "/urgente" },
};

export default function UrgentePage() {
  return <UrgenteContent />;
}
