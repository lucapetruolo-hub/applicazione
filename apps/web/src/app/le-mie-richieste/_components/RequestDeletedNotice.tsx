"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, Text, XStack, brand } from "@professionisti/ui";

const DELETED_EVENT = "request-deleted";
/** Quanto resta "Annulla": abbastanza per accorgersi dell'errore, non tanto da coprire la pagina. */
const UNDO_SECONDS = 8;

/** Da chiamare dopo aver eliminato una richiesta: la sua scheda sparisce subito, la conferma (con "Annulla") resta nella pagina. */
export function announceRequestDeleted(guidedRequestId: string) {
  window.dispatchEvent(new CustomEvent<string>(DELETED_EVENT, { detail: guidedRequestId }));
}

/**
 * "Richiesta eliminata · Annulla" per qualche secondo in basso
 * (docs/CHANGELOG.md §340, decisione dell'utente: prima la conferma, poi
 * anche "Annulla"): fissa allo schermo e non in cima all'elenco, perché chi
 * elimina può essere molto più in basso nella pagina.
 */
export function RequestDeletedNotice({ onUndo }: { onUndo: (guidedRequestId: string) => Promise<void> }) {
  const [state, setState] = useState<{ id: string; phase: "deleted" | "undoing" | "restored" | "error" } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function hideAfter(seconds: number) {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setState(null), seconds * 1000);
  }

  useEffect(() => {
    function handle(event: Event) {
      setState({ id: (event as CustomEvent<string>).detail, phase: "deleted" });
      hideAfter(UNDO_SECONDS);
    }
    window.addEventListener(DELETED_EVENT, handle);
    return () => {
      window.removeEventListener(DELETED_EVENT, handle);
      clearTimeout(timerRef.current);
    };
  }, []);

  async function undo() {
    if (!state || state.phase !== "deleted") return;
    clearTimeout(timerRef.current);
    setState({ id: state.id, phase: "undoing" });
    try {
      await onUndo(state.id);
      setState({ id: state.id, phase: "restored" });
    } catch {
      setState({ id: state.id, phase: "error" });
    }
    hideAfter(4);
  }

  const message =
    state?.phase === "restored" ? "Richiesta ripristinata" : state?.phase === "error" ? "Non è stato possibile annullare" : "Richiesta eliminata";

  return (
    <div
      role="status"
      aria-live="polite"
      style={{ position: "fixed", left: 16, right: 16, bottom: 24, zIndex: 1100, display: "flex", justifyContent: "center", pointerEvents: "none" }}
    >
      {state ? (
        <XStack
          alignItems="center"
          gap="$3"
          backgroundColor={brand.grafite}
          borderRadius="$3"
          paddingVertical="$2"
          paddingLeft="$4"
          paddingRight={state.phase === "deleted" || state.phase === "undoing" ? "$2" : "$4"}
          minHeight={52}
          maxWidth={420}
          style={{ pointerEvents: "auto" }}
        >
          {state.phase === "error" ? null : <Icon name="check" size={16} color="white" strokeWidth={2.5} />}
          <Text fontSize={16} fontWeight="600" color="white">
            {message}
          </Text>
          {state.phase === "deleted" || state.phase === "undoing" ? (
            <button
              type="button"
              onClick={undo}
              disabled={state.phase === "undoing"}
              style={{
                minHeight: 44,
                padding: "0 14px",
                border: "none",
                borderRadius: 8,
                background: "transparent",
                color: brand.ottone,
                fontFamily: "inherit",
                fontSize: 16,
                fontWeight: 700,
                cursor: "pointer",
                opacity: state.phase === "undoing" ? 0.6 : 1,
              }}
            >
              {state.phase === "undoing" ? "Annullo..." : "Annulla"}
            </button>
          ) : null}
        </XStack>
      ) : null}
    </div>
  );
}
