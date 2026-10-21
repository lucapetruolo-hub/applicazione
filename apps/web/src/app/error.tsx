"use client";

import { useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Pagina d'errore al posto della schermata generica di Next.js ("Application
 * error: a client-side exception has occurred"): stessa informazione per chi
 * deve diagnosticare (il messaggio dell'errore, visibile senza aprire la
 * console del browser — utile soprattutto da telefono), ma con un modo per
 * riprovare o tornare alla home invece di una pagina bianca.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  useEffect(() => {
    console.error(error);
  }, [error]);

  // Un errore della pagina server (API che non risponde) si ripara solo
  // ricaricando i dati dal server: `reset` da solo ridisegna l'errore.
  function retry() {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }

  return (
    <div style={{ maxWidth: 560, margin: "64px auto", padding: "0 16px", textAlign: "center", fontFamily: "var(--font-body), sans-serif" }}>
      <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Qualcosa è andato storto</h1>
      <p style={{ color: "#6e6459", margin: "0 0 20px" }}>Riprova tra un momento. Se il problema continua, segnalacelo con il dettaglio qui sotto.</p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 24 }}>
        <button
          type="button"
          onClick={retry}
          disabled={isPending}
          style={{ background: "#189a63", color: "#fff", border: "none", borderRadius: 999, padding: "10px 20px", fontWeight: 700, cursor: "pointer" }}
        >
          {isPending ? "Caricamento…" : "Riprova"}
        </button>
        <Link href="/" style={{ padding: "10px 20px", color: "#0e7a4c", fontWeight: 700 }}>
          Torna alla home
        </Link>
      </div>
      <pre
        style={{
          textAlign: "left",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          background: "#f5f1ea",
          borderRadius: 8,
          padding: 12,
          fontSize: 12,
          color: "#6e6459",
        }}
      >
        {error.message || "Errore sconosciuto"}
        {error.digest ? `\nCodice: ${error.digest}` : ""}
      </pre>
    </div>
  );
}
