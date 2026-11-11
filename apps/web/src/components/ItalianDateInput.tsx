"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { brand } from "@professionisti/ui";
import {
  PickerFieldStyles,
  PickerPanel,
  isFinePointer,
  usePicker,
  type PickerAnchor,
} from "@/components/PickerPopover";
import {
  MONTHS,
  WEEKDAYS,
  addDays,
  addMonths,
  completeTypedDate,
  formatDateWhileTyping,
  isoOf,
  longDate,
  parseTypedDate,
  shownDate,
  todayIso,
} from "@/lib/dateText";

/**
 * Campo data unico del sito, sempre gg/mm/aaaa (docs/CHANGELOG.md §291).
 * Dall'11/11/2026 (docs/changelog/2026-11-11-campo-data-scrivibile.md) non è
 * più il campo data del browser, come il campo ora
 * (docs/changelog/2026-11-10-campo-orario-scrivibile.md):
 * - si scrive la data a mano, con le barre messe da sole ("101126" →
 *   10/11/2026; "10/11" vale quest'anno); se la data non esiste o è fuori
 *   da `min`/`max` lo dice sotto il campo, senza cambiare il valore;
 * - frecce su e giù: un giorno avanti o indietro;
 * - il calendario (e, al computer, il clic nel campo) apre un calendarietto
 *   del mese, con mese e anno da scegliere: sotto il campo al computer, dal
 *   basso dello schermo sul telefono.
 * Valore e onChange come prima ("AAAA-MM-GG", "" se vuoto).
 */
export function ItalianDateInput({
  value,
  onChange,
  min,
  max,
  ariaLabel,
  className,
  style,
}: {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}) {
  // Fuori da React Compiler: usa `<style jsx>` (docs/CHANGELOG.md §345).
  "use no memo";
  const current = /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
  const [draft, setDraft] = useState(shownDate(current));
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const errorId = useId();
  const { open, anchor, openPicker, closePicker, onWrapperBlur, setOpen } =
    usePicker({ wrapRef, inputRef, width: CALENDAR_WIDTH, height: 400 });
  const { flex, minWidth, width, ...inputStyle } = style ?? {};

  // Il valore cambiato dalla pagina si vede nel campo.
  const [seen, setSeen] = useState(current);
  if (seen !== current) {
    setSeen(current);
    if (completeTypedDate(draft) !== current) {
      setDraft(shownDate(current));
      setError(null);
    }
  }

  const outOfRange = (iso: string): string | null => {
    if (min && iso < min) return `Scegli una data dal ${shownDate(min)} in poi`;
    if (max && iso > max) return `Scegli una data fino al ${shownDate(max)}`;
    return null;
  };

  const accept = (iso: string) => {
    setDraft(shownDate(iso));
    setError(null);
    if (iso !== current) onChange(iso);
  };

  const commit = () => {
    if (draft.trim() === "") {
      setError(null);
      if (current !== "") onChange("");
      return;
    }
    const parsed = parseTypedDate(draft, { min, max });
    if (!parsed) {
      setError("Questa data non esiste: scrivila come 10/11/2026");
      return;
    }
    const range = outOfRange(parsed);
    if (range) {
      setDraft(shownDate(parsed));
      setError(range);
      return;
    }
    accept(parsed);
  };

  const onFieldKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const base = parseTypedDate(draft, { min, max }) ?? current ?? "";
      const next = base
        ? addDays(base, e.key === "ArrowUp" ? 1 : -1)
        : todayIso();
      if (!outOfRange(next)) accept(next);
    } else if (e.key === "Enter") {
      commit();
      setOpen(false);
    }
  };

  return (
    <span
      ref={wrapRef}
      className="pk-field it-date"
      style={{ flex, minWidth, width }}
      onBlur={onWrapperBlur}
    >
      {/* Campo e pulsante in un riquadro loro: l'avviso sotto non sposta il pulsante. */}
      <span className="it-date-box">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          maxLength={10}
          placeholder="gg/mm/aaaa"
          aria-label={ariaLabel}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={className}
          value={draft}
          onChange={(e) => {
            const text = formatDateWhileTyping(e.target.value);
            setDraft(text);
            setError(null);
            const complete = completeTypedDate(text);
            if (complete && !outOfRange(complete) && complete !== current)
              onChange(complete);
          }}
          onBlur={commit}
          onKeyDown={onFieldKey}
          onClick={(e) => {
            if (!open && e.detail > 0 && isFinePointer()) openPicker();
          }}
          style={{
            ...inputStyle,
            width: "100%",
            paddingRight: 44,
            ...(error ? { borderColor: brand.urgenza } : null),
          }}
        />
        <button
          type="button"
          className="pk-field-btn"
          aria-label="Scegli dal calendario"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => (open ? closePicker(true) : openPicker())}
        >
          <CalendarDays size={18} aria-hidden />
        </button>
      </span>
      {error ? (
        <span id={errorId} className="it-date-error" role="alert">
          {error}
        </span>
      ) : null}
      {open ? (
        <CalendarPanel
          id={panelId}
          label={ariaLabel ?? "Data"}
          value={parseTypedDate(draft, { min, max }) ?? current}
          min={min}
          max={max}
          anchor={anchor}
          onPick={(iso) => {
            accept(iso);
            closePicker(true);
          }}
          onDone={() => closePicker(true)}
        />
      ) : null}
      <PickerFieldStyles />
      <style jsx global>{`
        .it-date-box {
          position: relative;
          display: block;
        }
        .it-date-error {
          display: block;
          margin-top: 4px;
          font-size: 13px;
          line-height: 1.35;
          color: ${brand.urgenza};
          white-space: normal;
        }
      `}</style>
    </span>
  );
}

const CALENDAR_WIDTH = 312;

/**
 * Il calendarietto: un mese alla volta, settimana da lunedì, con mese e anno
 * da scegliere (per le date lontane, come quella di nascita). Da tastiera:
 * frecce di un giorno o di una settimana, Pagina su/giù di un mese,
 * Inizio/Fine della settimana, Invio sceglie.
 */
function CalendarPanel({
  id,
  label,
  value,
  min,
  max,
  anchor,
  onPick,
  onDone,
}: {
  id: string;
  label: string;
  value: string;
  min?: string;
  max?: string;
  anchor: PickerAnchor | null;
  onPick: (iso: string) => void;
  onDone: () => void;
}) {
  "use no memo";
  const today = todayIso();
  const clamp = (iso: string) =>
    min && iso < min ? min : max && iso > max ? max : iso;
  const [focused, setFocused] = useState(() => clamp(value || today));
  const [byKeyboard, setByKeyboard] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const [year, month] = focused.split("-").map(Number) as [number, number];
  const thisYear = Number(today.slice(0, 4));
  const firstYear = min
    ? Number(min.slice(0, 4))
    : max && max <= today
      ? thisYear - 100
      : thisYear - 5;
  const lastYear = max ? Number(max.slice(0, 4)) : thisYear + 5;
  const years = Array.from(
    { length: Math.max(1, lastYear - firstYear + 1) },
    (_, i) => lastYear - i,
  );
  const allowed = (iso: string) => !(min && iso < min) && !(max && iso > max);

  // Da tastiera il fuoco segue il giorno scelto con le frecce.
  useEffect(() => {
    if (!byKeyboard) return;
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`)
      ?.focus();
  }, [focused, byKeyboard]);

  const goMonth = (y: number, m: number) => {
    const day = Number(focused.slice(8));
    const last = new Date(y, m, 0).getDate();
    setByKeyboard(false);
    setFocused(clamp(isoOf(y, m, Math.min(day, last)) ?? focused));
  };

  const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (string | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => isoOf(year, month, i + 1)),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) =>
    cells.slice(w * 7, w * 7 + 7),
  );

  const onGridKey = (e: ReactKeyboardEvent) => {
    const weekday =
      (new Date(year, month - 1, Number(focused.slice(8))).getDay() + 6) % 7;
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      PageUp: () => addMonths(focused, -1),
      PageDown: () => addMonths(focused, 1),
      Home: () => addDays(focused, -weekday),
      End: () => addDays(focused, 6 - weekday),
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    setByKeyboard(true);
    setFocused(clamp(move()));
  };

  const prevDisabled = Boolean(min && isoOf(year, month, 1)! <= min);
  const nextDisabled = Boolean(max && isoOf(year, month, daysInMonth)! >= max);

  return (
    <PickerPanel
      id={id}
      title={label}
      ariaLabel="Calendario"
      anchor={anchor}
      width={CALENDAR_WIDTH}
      onDone={onDone}
    >
      <div className="it-cal-head">
        <button
          type="button"
          className="it-cal-arrow"
          aria-label="Mese prima"
          disabled={prevDisabled}
          onClick={() =>
            goMonth(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1)
          }
        >
          <ChevronLeft size={18} aria-hidden />
        </button>
        <select
          className="it-cal-select"
          aria-label="Mese"
          value={month}
          onChange={(e) => goMonth(year, Number(e.target.value))}
        >
          {MONTHS.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        <select
          className="it-cal-select"
          aria-label="Anno"
          value={year}
          onChange={(e) => goMonth(Number(e.target.value), month)}
        >
          {years.includes(year) ? null : <option value={year}>{year}</option>}
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="it-cal-arrow"
          aria-label="Mese dopo"
          disabled={nextDisabled}
          onClick={() =>
            goMonth(
              month === 12 ? year + 1 : year,
              month === 12 ? 1 : month + 1,
            )
          }
        >
          <ChevronRight size={18} aria-hidden />
        </button>
      </div>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- le frecce spostano il fuoco fra i pulsanti dei giorni, che sono i comandi veri */}
      <div ref={gridRef} className="it-cal-grid" onKeyDown={onGridKey}>
        <div className="it-cal-row" aria-hidden>
          {WEEKDAYS.map((name) => (
            <span key={name} className="it-cal-wd">
              {name.slice(0, 1).toUpperCase()}
            </span>
          ))}
        </div>
        {weeks.map((week, w) => (
          <div key={w} className="it-cal-row">
            {week.map((iso, d) =>
              iso ? (
                <button
                  key={iso}
                  type="button"
                  data-day={iso}
                  className="it-cal-day"
                  tabIndex={iso === focused ? 0 : -1}
                  disabled={!allowed(iso)}
                  aria-label={longDate(iso)}
                  aria-pressed={iso === value}
                  aria-current={iso === today ? "date" : undefined}
                  onClick={() => onPick(iso)}
                >
                  {Number(iso.slice(8))}
                </button>
              ) : (
                <span
                  key={`v${w}-${d}`}
                  className="it-cal-day empty"
                  aria-hidden
                />
              ),
            )}
          </div>
        ))}
      </div>
      <style jsx global>{`
        .it-cal-head {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 8px;
        }
        .it-cal-arrow {
          flex: none;
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
        @media (hover: hover) {
          .it-cal-arrow:hover:not(:disabled) {
            background: ${brand.gesso};
          }
          .it-cal-day:hover:not(:disabled):not([aria-pressed="true"]) {
            background: ${brand.gesso};
          }
        }
        .it-cal-arrow:disabled {
          opacity: 0.35;
          cursor: default;
        }
        .it-cal-select {
          flex: 1;
          min-width: 0;
          height: 36px;
          padding: 0 8px;
          border: 1px solid ${brand.bordoCampo};
          border-radius: 10px;
          background: ${brand.calce};
          color: ${brand.grafite};
          font: inherit;
          font-size: 15px;
          font-weight: 700;
        }
        .it-cal-select:last-of-type {
          flex: 0 0 84px;
        }
        .it-cal-arrow:focus-visible,
        .it-cal-select:focus-visible,
        .it-cal-day:focus-visible {
          outline: 2px solid ${brand.cianografiaScuro};
          outline-offset: 1px;
        }
        .it-cal-row {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 2px;
        }
        .it-cal-wd {
          text-align: center;
          font-size: 12px;
          font-weight: 700;
          color: ${brand.grafite70};
          padding: 4px 0;
        }
        .it-cal-day {
          height: 40px;
          border: 0;
          border-radius: 999px;
          background: transparent;
          color: ${brand.grafite};
          font: inherit;
          font-size: 15px;
          font-variant-numeric: tabular-nums;
          cursor: pointer;
        }
        .it-cal-day.empty {
          cursor: default;
        }
        .it-cal-day[aria-current="date"] {
          box-shadow: inset 0 0 0 1.5px ${brand.cianografiaScuro};
          font-weight: 700;
        }
        .it-cal-day[aria-pressed="true"] {
          background: ${brand.cianografiaPieno};
          color: #fff;
          font-weight: 800;
        }
        .it-cal-day:disabled {
          color: ${brand.grafite70};
          opacity: 0.45;
          text-decoration: line-through;
          cursor: default;
        }
        @media (max-width: 639px) {
          .it-cal-day {
            height: 44px;
            font-size: 17px;
          }
        }
      `}</style>
    </PickerPanel>
  );
}
