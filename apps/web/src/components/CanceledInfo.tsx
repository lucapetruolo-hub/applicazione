"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { CanceledInfoLines } from "@/lib/canceledInfo";
import styles from "./CanceledInfo.module.css";

const GUTTER = 16;

/**
 * Etichetta "Annullata"/"Annullato" che dice chi ha annullato, quando e
 * perché (Luca, docs/changelog/2026-11-24-chi-ha-annullato-e-quando.md).
 * Col mouse si apre passandoci sopra; da telefono e da tastiera con un
 * tocco (resta aperto finché non si tocca fuori, di nuovo l'etichetta o Esc).
 * Il riquadro sta in un portale con posizione fissa: la scheda della
 * richiesta (overflow nascosto) e il pannello dell'Agenda (che scorre) lo
 * taglierebbero. Senza `info` mostra l'etichetta e basta.
 */
export function CanceledInfo({ info, children }: { info: CanceledInfoLines | null; children: ReactNode }) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; arrow: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);
  const id = useId();
  const open = hover || pinned;

  // Sotto l'etichetta, allineato a sinistra, mai fuori dallo schermo.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const width = popRef.current?.offsetWidth ?? 260;
      if (!trigger) return;
      const left = Math.max(GUTTER, Math.min(trigger.left, window.innerWidth - width - GUTTER));
      const arrow = Math.max(12, Math.min(trigger.left + 22 - left, width - 24));
      setPos({ top: trigger.bottom + 8, left, arrow });
    };
    // Al fotogramma dopo: il riquadro è già disegnato e se ne conosce la larghezza.
    const frame = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!pinned) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popRef.current?.contains(target)) return;
      setPinned(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Esc chiude il riquadro, non la finestra dell'appuntamento intorno.
      event.stopImmediatePropagation();
      setPinned(false);
      setHover(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [pinned]);

  if (!info) return <>{children}</>;

  const label = [info.who, info.when, info.late, info.note ? `Motivo: ${info.note}` : null].filter(Boolean).join(". ");
  // Solo il mouse apre al passaggio: su un telefono il tocco manda anche un
  // "passaggio" finto che riaprirebbe subito il riquadro appena chiuso.
  const onEnter = (event: React.PointerEvent) => event.pointerType === "mouse" && setHover(true);
  const onLeave = (event: React.PointerEvent) => event.pointerType === "mouse" && setHover(false);

  return (
    <span className={styles.wrap} onPointerEnter={onEnter} onPointerLeave={onLeave}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        data-testid="canceled-info"
        onClick={(event) => {
          // La scheda si apre e chiude toccando l'intestazione: qui no.
          event.stopPropagation();
          setPinned((value) => !value);
          setHover(false);
        }}
      >
        {children}
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            // Il clic nel riquadro non deve risalire (anche attraverso il portale)
            // fino all'intestazione della scheda, che si aprirebbe o chiuderebbe.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
            <span
              ref={popRef}
              id={id}
              role="status"
              className={styles.pop}
              data-testid="canceled-info-pop"
              style={{ top: open && pos ? pos.top : -9999, left: open && pos ? pos.left : -9999, ["--arrow" as string]: `${pos?.arrow ?? 22}px` }}
              onPointerEnter={onEnter}
              onPointerLeave={onLeave}
              onClick={(event) => event.stopPropagation()}
            >
              <span className={styles.who}>{info.who}</span>
              {info.when ? <span className={styles.when}>{info.when}</span> : null}
              {info.late ? <span className={styles.late}>{info.late}</span> : null}
              {info.note ? (
                <span className={styles.note}>
                  <span className={styles.noteLabel}>Motivo</span>
                  {info.note}
                </span>
              ) : null}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
