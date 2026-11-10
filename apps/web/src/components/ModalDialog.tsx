"use client";

import { useRef, type ReactNode } from "react";
import { closeOnBackdrop } from "@/lib/closeOnBackdrop";
import { useDialogFocus } from "@/lib/useDialogFocus";

/**
 * Finestra sopra la pagina con sfondo scuro (E7-02 del controllo dell'8/11):
 * il fuoco entra appena si apre, il Tab resta dentro, Esc o un clic sullo
 * sfondo la chiudono e il fuoco torna sul pulsante che l'ha aperta
 * (`useDialogFocus`). Si monta solo da aperta. Il contenuto porta il suo
 * aspetto (fondo, angoli, spazi).
 */
export function ModalDialog({
  label,
  onClose,
  maxWidth = 420,
  children,
}: {
  label: string;
  onClose: () => void;
  maxWidth?: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, onClose);
  return (
    <div
      role="presentation"
      onClick={closeOnBackdrop(onClose)}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(20,24,30,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
        overflowY: "auto",
      }}
    >
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label} style={{ width: "100%", maxWidth, margin: "24px 0", outline: "none" }}>
        {children}
      </div>
    </div>
  );
}
