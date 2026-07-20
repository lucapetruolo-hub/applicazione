import type { Metadata } from "next";
import { SUBSCRIPTION_PLANS } from "@professionisti/shared";
import { PerProfessionistiContent } from "./PerProfessionistiContent";

export const metadata: Metadata = {
  title: "Per i professionisti",
  description: "Iscriviti come professionista: ricevi richieste di preventivo e gestisci la tua agenda.",
};

export default function PerProfessionistiPage() {
  return <PerProfessionistiContent plans={SUBSCRIPTION_PLANS} />;
}
