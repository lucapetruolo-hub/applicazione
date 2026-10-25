import type { Metadata } from "next";
import { UrgenteContent } from "./UrgenteContent";

export const metadata: Metadata = {
  title: "Richiesta urgente",
  description: "Richiesta urgente gratuita: arriva subito ai professionisti della tua zona, segnata come urgente.",
  alternates: { canonical: "/urgente" },
};

export default function UrgentePage() {
  return <UrgenteContent />;
}
