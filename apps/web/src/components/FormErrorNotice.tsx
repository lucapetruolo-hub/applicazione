"use client";

import { Text, brand } from "@professionisti/ui";

/**
 * Errore sotto un modulo (accesso, registrazione). Se la chiamata non è
 * arrivata al sito (`onRetry`), accanto alla frase c'è "Riprova", che ripete
 * l'invio con gli stessi dati (docs/changelog/2026-11-19-errore-di-rete-in-italiano.md).
 */
export function FormErrorNotice({ message, onRetry, retrying }: { message: string; onRetry?: () => void; retrying?: boolean }) {
  return (
    <Text role="alert" color={brand.urgenza} fontSize={16}>
      {message}
      {onRetry ? (
        <>
          {" "}
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            style={{
              background: "none",
              border: "none",
              padding: "6px 2px",
              margin: 0,
              font: "inherit",
              fontWeight: 700,
              color: brand.cianografiaScuro,
              textDecoration: "underline",
              textUnderlineOffset: 3,
              cursor: retrying ? "default" : "pointer",
            }}
          >
            {retrying ? "Riprovo…" : "Riprova"}
          </button>
        </>
      ) : null}
    </Text>
  );
}
