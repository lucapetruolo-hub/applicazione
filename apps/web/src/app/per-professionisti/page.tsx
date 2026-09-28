import type { Metadata } from "next";
import { PerProfessionistiContent } from "./PerProfessionistiContent";

export const metadata: Metadata = {
  title: "Per i professionisti",
  description: "Iscriviti come professionista: primo mese gratis, ricevi richieste di preventivo e gestisci la tua agenda.",
};

export default function PerProfessionistiPage() {
  return <PerProfessionistiContent />;
}
