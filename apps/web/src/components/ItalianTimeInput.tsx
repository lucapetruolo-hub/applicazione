"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Clock } from "lucide-react";
import { brand } from "@professionisti/ui";
import { completeTypedTime, formatWhileTyping, parseTypedTime, shiftTime } from "@/lib/timeText";

/**
 * Campo ora unico del sito, sempre a 24 ore ("14:00", mai "02:00 PM",
 * docs/CHANGELOG.md §365). Dal 10/11/2026
 * (docs/changelog/2026-11-10-campo-orario-scrivibile.md) non è più il campo
 * ora del browser: su Chrome per computer quello apriva un elenco con le sole
 * ore e minuti del passo (00, 15, 30, 45) e non si capiva come mettere un
 * orario diverso; su iPhone il suo testo si leggeva due volte
 * (docs/changelog/2026-11-09-orari-doppi-iphone.md). Ora:
 * - si scrive l'ora a mano, con i due punti messi da soli ("930" → 09:30);
 * - frecce su e giù cambiano l'ora di `step` (5 minuti se non è dato);
 * - l'orologio (e, al computer, il clic nel campo) apre una rotella a
 *   scorrimento come quella dell'iPhone, ore a sinistra e minuti a destra:
 *   sotto il campo al computer, dal basso dello schermo sul telefono.
 * Valore e onChange come prima ("HH:MM", "" se vuoto).
 */
export function ItalianTimeInput({
  value,
  onChange,
  ariaLabel,
  className,
  wrapperClassName,
  style,
  step,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
  /** Classe del contenitore, per dargli la larghezza da CSS. */
  wrapperClassName?: string;
  style?: CSSProperties;
  /** Passo in secondi delle frecce e dei minuti della rotella (900 = 15 minuti). Di base 5 minuti. */
  step?: number;
}) {
  // Fuori da React Compiler: usa `<style jsx>` (docs/CHANGELOG.md §345).
  "use no memo";
  const minuteStep = step ? Math.max(1, Math.round(step / 60)) : 5;
  const current = /^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : "";
  const [draft, setDraft] = useState(current);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number; up: boolean } | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const { flex, minWidth, width, ...inputStyle } = style ?? {};

  // Il valore cambiato dalla pagina (ora di fine spostata con l'inizio) si vede nel campo.
  const [seen, setSeen] = useState(current);
  if (seen !== current) {
    setSeen(current);
    if (completeTypedTime(draft) !== current) setDraft(current);
  }

  const commit = () => {
    if (draft.trim() === "") {
      if (current !== "") onChange("");
      return;
    }
    const parsed = parseTypedTime(draft);
    if (parsed) {
      setDraft(parsed);
      if (parsed !== current) onChange(parsed);
    } else {
      // Un'ora che non esiste (25:00, 9:75) torna all'ultima buona.
      setDraft(current);
    }
  };

  const place = () => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    const panelHeight = 290;
    const up = box.bottom + panelHeight + 8 > window.innerHeight && box.top > panelHeight + 8;
    const left = Math.max(8, Math.min(box.left, window.innerWidth - 248));
    setAnchor({ top: up ? box.top - 6 : box.bottom + 6, left, up });
  };

  const openWheel = () => {
    place();
    setOpen(true);
  };
  const closeWheel = (focusField: boolean) => {
    setOpen(false);
    if (focusField) inputRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element;
      // Fuori dal campo, o sul fondo scuro dietro la rotella del telefono.
      if (!wrapRef.current?.contains(target) || target.classList.contains("it-wheel-backdrop")) setOpen(false);
    };
    // Esc chiude solo la rotella, non la finestra che contiene il campo:
    // ascoltato in cattura, arriva prima della finestra (useDialogFocus).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      closeWheel(true);
    };
    window.addEventListener("keydown", onKey, true);
    const onMove = () => place();
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const onFieldKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = shiftTime(parseTypedTime(draft) ?? current ?? "", e.key === "ArrowUp" ? minuteStep : -minuteStep);
      setDraft(next);
      onChange(next);
    } else if (e.key === "Enter") {
      commit();
      setOpen(false);
    }
  };

  return (
    <span
      ref={wrapRef}
      className={wrapperClassName ? `it-time ${wrapperClassName}` : "it-time"}
      style={{ flex, minWidth, width }}
      onBlur={(e) => {
        if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="done"
        maxLength={5}
        placeholder="--:--"
        aria-label={ariaLabel}
        className={className}
        value={draft}
        onChange={(e) => {
          const text = formatWhileTyping(e.target.value);
          setDraft(text);
          const complete = completeTypedTime(text);
          if (complete && complete !== current) onChange(complete);
        }}
        onBlur={commit}
        onKeyDown={onFieldKey}
        onClick={(e) => {
          // Al computer il clic nel campo apre anche la rotella; sul telefono
          // il tocco apre la tastiera e la rotella si apre dall'orologio.
          if (!open && e.detail > 0 && window.matchMedia("(pointer: fine)").matches) openWheel();
        }}
        style={{ ...inputStyle, width: "100%", paddingRight: 44 }}
      />
      <button
        type="button"
        className="it-time-btn"
        aria-label="Scegli con la rotella"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? closeWheel(true) : openWheel())}
      >
        <Clock size={18} aria-hidden />
      </button>
      {open ? (
        <TimeWheelPanel
          id={panelId}
          label={ariaLabel ?? "Ora"}
          value={parseTypedTime(draft) ?? current}
          minuteStep={minuteStep}
          anchor={anchor}
          onPick={(next) => {
            setDraft(next);
            if (next !== current) onChange(next);
          }}
          onDone={() => closeWheel(true)}
        />
      ) : null}
      <style jsx global>{`
        .it-time {
          position: relative;
          display: inline-block;
          min-width: 0;
        }
        .it-time input {
          margin: 0;
          font-variant-numeric: tabular-nums;
          box-sizing: border-box;
        }
        .it-time input::placeholder {
          color: ${brand.grafite70};
          opacity: 1;
        }
        .it-time-btn {
          position: absolute;
          top: 50%;
          right: 4px;
          transform: translateY(-50%);
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 10px;
          background: transparent;
          color: ${brand.grafite};
          cursor: pointer;
        }
        .it-time-btn:hover {
          background: ${brand.gesso};
        }
        .it-time-btn:focus-visible {
          outline: 2px solid ${brand.cianografiaScuro};
          outline-offset: 1px;
        }
      `}</style>
    </span>
  );
}

const ITEM = 40;
const VISIBLE = 5;
const pad = (n: number) => String(n).padStart(2, "0");
const HOURS = Array.from({ length: 24 }, (_, i) => i);

/**
 * La rotella: due colonne che scorrono e si fermano a scatti sull'ora al
 * centro, come quella dell'iPhone. Si gira col dito, con la rotella del
 * mouse, con un clic sul numero o con le frecce (ogni colonna è un elenco
 * con l'opzione scelta annunciata dal lettore di schermo).
 */
function TimeWheelPanel({
  id,
  label,
  value,
  minuteStep,
  anchor,
  onPick,
  onDone,
}: {
  id: string;
  label: string;
  value: string;
  minuteStep: number;
  anchor: { top: number; left: number; up: boolean } | null;
  onPick: (value: string) => void;
  onDone: () => void;
}) {
  "use no memo";
  const [h, m] = (value || "09:00").split(":").map(Number) as [number, number];
  const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep);
  if (!minutes.includes(m)) {
    minutes.push(m);
    minutes.sort((a, b) => a - b);
  }
  const pick = (hour: number, minute: number) => onPick(`${pad(hour)}:${pad(minute)}`);

  return (
    <div
      className={anchor?.up ? "it-wheel up" : "it-wheel"}
      style={{ "--pop-top": `${anchor?.top ?? 0}px`, "--pop-left": `${anchor?.left ?? 0}px` } as CSSProperties}
    >
      <div className="it-wheel-backdrop" aria-hidden />
      <div id={id} className="it-wheel-panel" role="dialog" aria-label="Rotella dell'ora">
        <p className="it-wheel-title" aria-hidden>
          {label}
        </p>
        <div className="it-wheel-cols">
          <div className="it-wheel-band" aria-hidden />
          <WheelColumn label="Ore" items={HOURS} selected={h} onSelect={(hour) => pick(hour, m)} />
          <span className="it-wheel-colon" aria-hidden>
            :
          </span>
          <WheelColumn label="Minuti" items={minutes} selected={m} onSelect={(minute) => pick(h, minute)} />
        </div>
        <button type="button" className="it-wheel-done" onClick={onDone}>
          Fatto
        </button>
      </div>
      <style jsx global>{`
        .it-wheel-backdrop {
          display: none;
        }
        .it-wheel-panel {
          position: fixed;
          z-index: 2000;
          top: var(--pop-top);
          left: var(--pop-left);
          width: 240px;
          box-sizing: border-box;
          padding: 12px;
          background: ${brand.calce};
          border: 1px solid ${brand.filetto};
          border-radius: 20px;
          box-shadow: 0 12px 32px rgba(43, 36, 32, 0.18);
          font-family: inherit;
        }
        .it-wheel.up .it-wheel-panel {
          transform: translateY(-100%);
        }
        .it-wheel-title {
          display: none;
          margin: 0 0 8px;
          font-weight: 800;
          font-size: 17px;
          color: ${brand.grafite};
          text-align: center;
        }
        .it-wheel-cols {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }
        .it-wheel-band {
          position: absolute;
          left: 0;
          right: 0;
          top: 50%;
          height: ${ITEM}px;
          transform: translateY(-50%);
          background: ${brand.cianografiaVelo};
          border-radius: 10px;
          pointer-events: none;
        }
        .it-wheel-colon {
          position: relative;
          font-size: 22px;
          font-weight: 700;
          color: ${brand.grafite};
        }
        .it-wheel-col {
          position: relative;
          width: 72px;
          height: ${ITEM * VISIBLE}px;
          overflow-y: auto;
          scroll-snap-type: y mandatory;
          overscroll-behavior: contain;
          scrollbar-width: none;
          border-radius: 10px;
          -webkit-mask-image: linear-gradient(to bottom, transparent, #000 30%, #000 70%, transparent);
          mask-image: linear-gradient(to bottom, transparent, #000 30%, #000 70%, transparent);
        }
        .it-wheel-col::-webkit-scrollbar {
          display: none;
        }
        .it-wheel-col:focus-visible {
          outline: 2px solid ${brand.cianografiaScuro};
          outline-offset: 2px;
          -webkit-mask-image: none;
          mask-image: none;
        }
        .it-wheel-pad {
          height: ${ITEM * Math.floor(VISIBLE / 2)}px;
        }
        .it-wheel-item {
          height: ${ITEM}px;
          display: flex;
          align-items: center;
          justify-content: center;
          scroll-snap-align: center;
          font-size: 20px;
          font-variant-numeric: tabular-nums;
          color: ${brand.grafite70};
          cursor: pointer;
          user-select: none;
        }
        .it-wheel-item[aria-selected="true"] {
          color: ${brand.grafite};
          font-weight: 800;
        }
        .it-wheel-done {
          margin-top: 12px;
          width: 100%;
          min-height: 44px;
          border: 0;
          border-radius: 999px;
          background: ${brand.cianografiaPieno};
          color: #fff;
          font: inherit;
          font-weight: 700;
          font-size: 16px;
          cursor: pointer;
        }
        .it-wheel-done:focus-visible {
          outline: 2px solid ${brand.grafite};
          outline-offset: 2px;
        }
        /* Telefono: la rotella sale dal basso dello schermo, grande da toccare. */
        @media (max-width: 639px) {
          .it-wheel-backdrop {
            display: block;
            position: fixed;
            inset: 0;
            z-index: 1999;
            background: rgba(20, 24, 30, 0.45);
          }
          .it-wheel-panel,
          .it-wheel.up .it-wheel-panel {
            top: auto;
            left: 0;
            right: 0;
            bottom: 0;
            width: auto;
            transform: none;
            padding: 16px 20px calc(16px + env(safe-area-inset-bottom));
            border-radius: 20px 20px 0 0;
          }
          .it-wheel-title {
            display: block;
          }
          .it-wheel-col {
            width: 96px;
          }
        }
      `}</style>
    </div>
  );
}

function WheelColumn({
  label,
  items,
  selected,
  onSelect,
}: {
  label: string;
  items: number[];
  selected: number;
  onSelect: (item: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseId = useId();
  const index = Math.max(0, items.indexOf(selected));

  // La colonna si porta sul valore scelto (all'apertura, o scritto nel campo).
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (Math.round(node.scrollTop / ITEM) !== index) node.scrollTop = index * ITEM;
  }, [index]);

  useEffect(() => () => {
    if (settle.current) clearTimeout(settle.current);
  }, []);

  const go = (i: number, smooth: boolean) => {
    const target = Math.max(0, Math.min(items.length - 1, i));
    const node = ref.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node?.scrollTo({ top: target * ITEM, behavior: smooth && !reduce ? "smooth" : "auto" });
    if (items[target] !== selected) onSelect(items[target]!);
  };

  return (
    <div
      ref={ref}
      className="it-wheel-col"
      role="listbox"
      aria-label={label}
      tabIndex={0}
      aria-activedescendant={`${baseId}-${index}`}
      onScroll={() => {
        if (settle.current) clearTimeout(settle.current);
        settle.current = setTimeout(() => {
          const node = ref.current;
          if (!node) return;
          const i = Math.max(0, Math.min(items.length - 1, Math.round(node.scrollTop / ITEM)));
          if (items[i] !== selected) onSelect(items[i]!);
        }, 120);
      }}
      onClick={(e) => {
        // Clic su un numero: la colonna ci scorre sopra. Il preventDefault
        // serve perché il campo può stare in un <label>, che altrimenti
        // girerebbe il clic al campo togliendo il fuoco alla colonna.
        e.preventDefault();
        const option = (e.target as Element).closest<HTMLElement>("[data-index]");
        if (option) go(Number(option.dataset.index), true);
      }}
      onKeyDown={(e) => {
        const moves: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 4, PageUp: -4 };
        if (e.key in moves) {
          e.preventDefault();
          go(index + moves[e.key]!, false);
        } else if (e.key === "Home") {
          e.preventDefault();
          go(0, false);
        } else if (e.key === "End") {
          e.preventDefault();
          go(items.length - 1, false);
        }
      }}
    >
      <div className="it-wheel-pad" aria-hidden />
      {items.map((item, i) => (
        <div
          key={item}
          id={`${baseId}-${i}`}
          role="option"
          aria-selected={i === index}
          data-index={i}
          className="it-wheel-item"
        >
          {pad(item)}
        </div>
      ))}
      <div className="it-wheel-pad" aria-hidden />
    </div>
  );
}
