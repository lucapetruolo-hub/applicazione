import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Password dimenticata",
  description: "Recupera l'accesso al tuo account.",
};

export default function PasswordDimenticataPage() {
  return (
    <main style={{ padding: "64px 24px", textAlign: "center" }}>
      <h1>Recupero password — presto disponibile</h1>
      <p>L&apos;invio del link di reset via email è in arrivo. Nel frattempo scrivi a supporto@professionisti.it.</p>
    </main>
  );
}
