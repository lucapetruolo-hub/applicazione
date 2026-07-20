import type { Metadata } from "next";
import { PreventivoContent } from "./PreventivoContent";

export const metadata: Metadata = {
  title: "Preventivo gratuito",
  description: "Descrivi il lavoro con una foto e ricevi un preventivo gratuito dai professionisti in zona.",
};

export default function PreventivoPage() {
  return <PreventivoContent />;
}
