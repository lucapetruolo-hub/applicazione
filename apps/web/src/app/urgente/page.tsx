import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Richiesta urgente",
  description: "Trova subito un professionista disponibile ora per un intervento urgente.",
};

export default function UrgentePage() {
  return (
    <main style={{ padding: "64px 24px", textAlign: "center" }}>
      <h1>Richiesta urgente — presto disponibile</h1>
      <p>Il matching istantaneo con professionisti disponibili ora è in arrivo.</p>
    </main>
  );
}
