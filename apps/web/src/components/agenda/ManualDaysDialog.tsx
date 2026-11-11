"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { formatAppointmentDate, type WeekTemplatePreview, type WeekTemplateSlotTimes } from "@professionisti/shared";
import { useDialogFocus } from "@/lib/useDialogFocus";

const times = (slots: WeekTemplateSlotTimes[]) => (slots.length ? slots.map((s) => `${s.start}–${s.end}`).join(", ") : "giorno libero");
const dayLabel = (date: string) => formatAppointmentDate(`${date}T00:00:00.000Z`, { weekday: "short", day: "numeric", month: "short" });
const days = (n: number) => (n === 1 ? "1 giorno" : `${n} giorni`);

/**
 * Prima di salvare "La tua settimana", se ci sono giorni cambiati a mano che
 * la settimana nuova cambierebbe (docs/changelog/2026-11-10-eccezioni-settimana.md):
 * l'elenco con gli orari di oggi e quelli nuovi, e si sceglie quali cambiare
 * (tutti spuntati di partenza) o di lasciarli tutti così. I giorni con lavori
 * fissati non si toccano mai. Chiudere la finestra annulla il salvataggio.
 */
export function ManualDaysDialog({
  preview,
  monthLabel = null,
  onChoose,
  onClose,
}: {
  preview: WeekTemplatePreview;
  /** Settimana salvata per un mese solo: il suo nome ("dicembre 2026"). */
  monthLabel?: string | null;
  /** `true` = tutti, `false` = nessuno, altrimenti le date spuntate. */
  onChoose: (applyToManual: boolean | string[]) => Promise<void>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"apply" | "keep" | null>(null);
  const all = preview.manualDays.map((d) => d.date);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(all));
  useDialogFocus(ref, () => {
    if (!busy) onClose();
  });
  const count = all.length;
  const single = count === 1;
  const n = single ? 1 : picked.size;
  const week = monthLabel ? `dalla settimana di ${monthLabel}` : "dalla settimana nuova";

  async function choose(apply: boolean | string[]) {
    setBusy(apply === false ? "keep" : "apply");
    try {
      await onChoose(apply);
    } finally {
      setBusy(null);
    }
  }
  function toggle(date: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }
  const applyPicked = () => void choose(single || picked.size === count ? true : picked.size === 0 ? false : all.filter((d) => picked.has(d)));

  return (
    <>
      <div className="ag-scrim" onClick={busy ? undefined : onClose} aria-hidden />
      <div ref={ref} className="ag-dialog" role="dialog" aria-modal="true" aria-labelledby="ag-md-title" aria-describedby="ag-md-desc">
        <div className="ag-dialog-top">
          <h2 id="ag-md-title">{single ? "Hai un giorno cambiato a mano" : `Hai ${count} giorni cambiati a mano`}</h2>
          <button type="button" className="ag-icon-btn" onClick={onClose} disabled={busy !== null} aria-label="Chiudi senza salvare" data-dialog-close>
            <X size={18} aria-hidden />
          </button>
        </div>
        <p id="ag-md-desc" className="ag-muted">
          {single ? `Ha orari diversi ${week}. Vuoi dargli i nuovi orari?` : `Hanno orari diversi ${week}. Spunta quelli a cui dare i nuovi orari.`}
        </p>

        {single ? (
          <ul className="ag-md-list">
            <li className="ag-md-row">
              <DayText date={all[0]!} current={preview.manualDays[0]!.current} wanted={preview.manualDays[0]!.wanted} />
            </li>
          </ul>
        ) : (
          <fieldset className="ag-md-set">
            <legend className="sr-only">Giorni a cui dare i nuovi orari</legend>
            <div className="ag-md-head">
              <span className="ag-muted" aria-live="polite">
                {picked.size} di {count} {picked.size === 1 ? "scelto" : "scelti"}
              </span>
              <button type="button" className="ag-md-all" onClick={() => setPicked(picked.size === count ? new Set() : new Set(all))} disabled={busy !== null}>
                {picked.size === count ? "Togli tutti" : "Scegli tutti"}
              </button>
            </div>
            <ul className="ag-md-list is-scroll">
              {preview.manualDays.map((day) => (
                <li key={day.date}>
                  <label className={`ag-md-row is-check${picked.has(day.date) ? " is-on" : ""}`}>
                    <input type="checkbox" checked={picked.has(day.date)} onChange={() => toggle(day.date)} disabled={busy !== null} />
                    <DayText date={day.date} current={day.current} wanted={day.wanted} keep={!picked.has(day.date)} />
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}

        {preview.bookedDaysKept > 0 ? (
          <p className="ag-muted ag-md-note">
            {preview.bookedDaysKept === 1 ? "Un giorno con un lavoro fissato resta com'era" : `${preview.bookedDaysKept} giorni con lavori fissati restano com'erano`}: li vedi con &quot;eccezione&quot;.
          </p>
        ) : null}

        <div className="ag-actions">
          <button type="button" className="ag-btn primary" onClick={applyPicked} disabled={busy !== null} data-autofocus>
            {busy === "apply" ? "Salvo..." : single ? "Cambia anche questo" : n === 0 ? "Salva senza cambiarli" : n === count ? `Cambia tutti e ${count}` : `Cambia ${days(n)}`}
          </button>
          {single || n > 0 ? (
            <button type="button" className="ag-btn" onClick={() => void choose(false)} disabled={busy !== null}>
              {busy === "keep" ? "Salvo..." : single ? "Lascialo così" : "Lasciali tutti così"}
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}

function DayText({ date, current, wanted, keep = false }: { date: string; current: WeekTemplateSlotTimes[]; wanted: WeekTemplateSlotTimes[]; keep?: boolean }) {
  return (
    <span className="ag-md-day">
      <b>{dayLabel(date)}</b>
      {keep ? (
        <span>
          <span className="ag-md-old">{times(current)}</span>
          <span className="ag-md-keep"> · resta così</span>
        </span>
      ) : (
        <span>
          <span className="sr-only">ora </span>
          <s className="ag-md-old">{times(current)}</s>
          <span aria-hidden> → </span>
          <span className="sr-only">, diventa </span>
          <span className="ag-md-new">{times(wanted)}</span>
        </span>
      )}
    </span>
  );
}
