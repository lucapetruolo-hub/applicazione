"use client";

import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";

/** Quanto il pulsante si sposta verso il cursore, al massimo (px). */
const MAX_PULL = 6;

/**
 * Effetto magnete e alone per il pulsante principale della home
 * (docs/CHANGELOG.md §233, scelta dell'utente): con il mouse il pulsante si
 * sposta di poco verso il cursore e una luce lo segue sulla superficie.
 * Solo con un mouse vero (`hover: hover` e `pointer: fine`) e senza "riduci
 * movimento": su telefono e tablet non succede nulla. Lo stile vive in
 * globals.css (`.magnet`), qui si aggiornano solo le variabili CSS.
 */
export function MagneticButton({
  children,
  block = false,
  style,
}: {
  children: ReactNode;
  /** Il pulsante occupa tutta la larghezza disponibile (es. "Cerca" su telefono). */
  block?: boolean;
  /** Stile del contenitore, es. `flexGrow` quando il pulsante sta in una riga con altri. */
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  const enabled = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const onMove = (event: PointerEvent<HTMLSpanElement>) => {
    const el = ref.current;
    if (!el || event.pointerType !== "mouse" || !enabled()) return;
    const rect = el.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const dx = (x / rect.width - 0.5) * 2;
    const dy = (y / rect.height - 0.5) * 2;
    el.style.setProperty("--mx", `${x}px`);
    el.style.setProperty("--my", `${y}px`);
    el.style.setProperty("--tx", `${(dx * MAX_PULL).toFixed(2)}px`);
    el.style.setProperty("--ty", `${(dy * MAX_PULL * 0.6).toFixed(2)}px`);
    el.dataset.active = "true";
  };

  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--tx", "0px");
    el.style.setProperty("--ty", "0px");
    delete el.dataset.active;
  };

  return (
    <span ref={ref} className={block ? "magnet magnet--block" : "magnet"} onPointerMove={onMove} onPointerLeave={onLeave} style={{ ...style, "--tx": "0px", "--ty": "0px" } as CSSProperties}>
      {children}
    </span>
  );
}
