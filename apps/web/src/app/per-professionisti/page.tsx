import type { Metadata } from "next";
import { PerProfessionistiContent } from "./PerProfessionistiContent";

export const metadata: Metadata = {
  title: "Per i professionisti",
  description: "Iscriviti come professionista: ricevi richieste di preventivo dai clienti della tua zona e gestisci la tua agenda.",
};

export default function PerProfessionistiPage() {
  return <PerProfessionistiContent />;
}
