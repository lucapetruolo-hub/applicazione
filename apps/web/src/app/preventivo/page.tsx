import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Preventivo gratuito",
  description: "Descrivi il lavoro con una foto e ricevi un preventivo gratuito dai professionisti in zona.",
};

export default function PreventivoPage() {
  return (
    <main style={{ padding: "64px 24px", textAlign: "center" }}>
      <h1>Richiesta guidata — presto disponibile</h1>
      <p>Foto + poche domande → categoria e range di prezzo stimato. In arrivo.</p>
    </main>
  );
}
