"use client";

/**
 * Ultima rete di sicurezza per un errore nel layout radice (header, footer,
 * provider), che `error.tsx` non copre: stesso scopo, mostrare il messaggio
 * invece della schermata generica di Next.js.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="it">
      <body style={{ fontFamily: "sans-serif", textAlign: "center", padding: "64px 16px" }}>
        <h1 style={{ fontSize: 22 }}>Qualcosa è andato storto</h1>
        <button type="button" onClick={reset} style={{ padding: "10px 20px", borderRadius: 999, border: "none", background: "#189a63", color: "#fff", fontWeight: 700 }}>
          Riprova
        </button>
        <pre style={{ maxWidth: 560, margin: "24px auto", textAlign: "left", whiteSpace: "pre-wrap", fontSize: 12, color: "#6e6459" }}>
          {error.message || "Errore sconosciuto"}
          {error.digest ? `\nCodice: ${error.digest}` : ""}
        </pre>
      </body>
    </html>
  );
}
