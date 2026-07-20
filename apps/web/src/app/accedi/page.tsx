import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Accedi",
  description: "Accedi al tuo account professionista o cliente.",
};

export default function AccediPage() {
  return (
    <main style={{ padding: "64px 24px", textAlign: "center" }}>
      <h1>Accesso — presto disponibile</h1>
      <p>Il login via OTP telefonico è in arrivo.</p>
    </main>
  );
}
