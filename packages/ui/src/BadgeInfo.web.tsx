/// <reference lib="dom" />
"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BADGE_INFO, type BadgeInfoKey } from "./badgeInfo";
import { brand, motionEasing, motionFast } from "./tokens";

export type BadgeInfoProps = {
  info: BadgeInfoKey;
  children: ReactNode;
};

const GAP = 8;
const EDGE = 16;
const WIDTH = 288;
const OPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 180;

type Place = { left: number; top: number; arrowLeft: number; below: boolean };

// Stile del fumetto e del contorno da tastiera: un solo blocco, aggiunto da
// React nel <head> una volta sola anche con molti badge nella pagina.
const CSS = `
.badge-info{all:unset;display:inline-flex;cursor:help;border-radius:999px;-webkit-tap-highlight-color:transparent}
.badge-info:focus-visible{outline:2px solid ${brand.cianografiaScuro};outline-offset:2px}
.badge-info-pop{position:fixed;z-index:1100;box-sizing:border-box;padding:12px 14px;border-radius:16px;background:${brand.calce};color:${brand.grafite};box-shadow:0 10px 30px rgba(43,32,19,.16),0 1px 3px rgba(43,32,19,.10);font-size:14px;line-height:1.45;text-align:left;animation:badge-info-in ${motionFast} ${motionEasing}}
.badge-info-pop strong{display:block;font-weight:700;margin-bottom:2px}
.badge-info-pop small{display:block;margin-top:6px;font-size:13px;color:${brand.grafite70}}
.badge-info-arrow{position:absolute;width:12px;height:12px;background:${brand.calce};transform:rotate(45deg);border-radius:2px}
@keyframes badge-info-in{from{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.badge-info-pop{animation:none}}
`;

/**
 * Badge del professionista con il suo significato in un fumetto
 * (docs/CHANGELOG.md §331): si apre passando col mouse, toccando il badge
 * da telefono o raggiungendolo col tasto Tab; si chiude con Esc, toccando
 * altrove o allontanando il mouse. Il mouse può spostarsi sul fumetto senza
 * chiuderlo (WCAG 1.4.13). Il clic sul badge non apre la scheda che lo
 * contiene. Il lettore di schermo legge sempre la descrizione, anche a
 * fumetto chiuso.
 */
export function BadgeInfo({ info, children }: BadgeInfoProps) {
  const { title, text, note } = BADGE_INFO[info];
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPointer = useRef<string>("mouse");
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const hide = useCallback(() => {
    clearTimer();
    setOpen(false);
    setPlace(null);
  }, []);
  const later = (next: boolean, ms: number) => {
    clearTimer();
    timer.current = setTimeout(() => (next ? setOpen(true) : hide()), ms);
  };

  const position = useCallback(() => {
    const trigger = triggerRef.current;
    const pop = popRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const width = Math.min(WIDTH, vw - EDGE * 2);
    const height = pop?.offsetHeight ?? 0;
    const center = rect.left + rect.width / 2;
    const left = Math.min(Math.max(center - width / 2, EDGE), vw - EDGE - width);
    const below = rect.bottom + GAP + height <= window.innerHeight - EDGE || rect.top - GAP - height < EDGE;
    setPlace({ left, top: below ? rect.bottom + GAP : rect.top - GAP - height, arrowLeft: Math.min(Math.max(center - left - 6, 14), width - 26), below });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    const onOutside = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !popRef.current?.contains(target)) hide();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onOutside);
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onOutside);
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
    };
  }, [open, position, hide]);

  useEffect(() => clearTimer, []);

  const hoverHandlers = {
    onPointerEnter: (e: { pointerType: string }) => {
      if (e.pointerType === "mouse") later(true, OPEN_DELAY_MS);
    },
    onPointerLeave: (e: { pointerType: string }) => {
      if (e.pointerType === "mouse") later(false, CLOSE_DELAY_MS);
    },
  };

  const popStyle: CSSProperties = place
    ? { left: place.left, top: place.top, width: Math.min(WIDTH, document.documentElement.clientWidth - EDGE * 2) }
    : { left: -9999, top: 0, width: WIDTH, visibility: "hidden" };

  return (
    <>
      <style href="badge-info" precedence="default">
        {CSS}
      </style>
      <button
        ref={triggerRef}
        type="button"
        className="badge-info"
        aria-describedby={id}
        {...hoverHandlers}
        onPointerDown={(e) => {
          lastPointer.current = e.pointerType;
          // Il badge sta spesso dentro una scheda cliccabile: niente pressione della scheda.
          e.stopPropagation();
        }}
        onFocus={(e) => {
          if (!e.currentTarget.matches(":focus-visible")) return;
          clearTimer();
          setOpen(true);
        }}
        onBlur={() => later(false, CLOSE_DELAY_MS)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          clearTimer();
          // Da telefono il tocco apre e richiude; col mouse il clic lo tiene aperto.
          if (lastPointer.current !== "mouse" && open) hide();
          else setOpen(true);
        }}
      >
        {children}
        {/* Nascosta: fuori dal nome del pulsante (altrimenti il lettore la
            legge due volte), ma aria-describedby la legge lo stesso. */}
        <span id={id} hidden>
          {`${text}${note ? ` ${note}` : ""}`}
        </span>
      </button>
      {open
        ? createPortal(
            <div
              ref={(node) => {
                popRef.current = node;
                // Misura il fumetto appena c'è, prima che si veda (parte nascosto).
                if (node && !place) position();
              }}
              className="badge-info-pop" aria-hidden="true" style={popStyle} {...hoverHandlers} onPointerEnter={() => clearTimer()}>
              {place ? <span className="badge-info-arrow" style={{ left: place.arrowLeft, [place.below ? "top" : "bottom"]: -5 }} /> : null}
              <strong>{title}</strong>
              {text}
              {note ? <small>{note}</small> : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
