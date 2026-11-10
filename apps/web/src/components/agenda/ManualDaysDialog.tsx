"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { formatAppointmentDate, type WeekTemplatePreview, type WeekTemplateSlotTimes } from "@professionisti/shared";
import { useDialogFocus } from "@/lib/useDialogFocus";

/** Giorni mostrati per intero; gli altri si contano in una riga. */
const SHOWN = 5;

const times = (slots: WeekTemplateSlotTimes[]) => (slots.length ? slots.map((s) => `${s.start}–${s.end}`).join(", ") : "giorno libero");

/**
 * Prima di salvare "La tua settimana" per tutti i mesi, se ci sono giorni
 * cambiati a mano che la settimana nuova cambierebbe
 * (docs/changelog/2026-11-10-eccezioni-settimana.md): si sceglie se cambiare
 * anche quelli o lasciarli come sono. I giorni con lavori fissati non si
 * toccano mai. Chiudere la finestra annulla il salvataggio.
 */
export function ManualDaysDialog({
  preview,
  onChoose,
  onClose,
}: {
  preview: WeekTemplatePreview;
  onChoose: (applyToManual: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"apply" | "keep" | null>(null);
  useDialogFocus(ref, () => {
    if (!busy) onClose();
  });
  const days = preview.manualDays;
  const count = days.length;

  async function choose(apply: boolean) {
    setBusy(apply ? "apply" : "keep");
    try {
      await onChoose(apply);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="ag-scrim" onClick={busy ? undefined : onClose} aria-hidden />
      <div ref={ref} className="ag-dialog" role="dialog" aria-modal="true" aria-labelledby="ag-md-title" aria-describedby="ag-md-desc">
        <div className="ag-dialog-top">
          <h2 id="ag-md-title">{count === 1 ? "Hai un giorno cambiato a mano" : `Hai ${count} giorni cambiati a mano`}</h2>
          <button type="button" className="ag-icon-btn" onClick={onClose} disabled={busy !== null} aria-label="Chiudi senza salvare" data-dialog-close>
            <X size={18} aria-hidden />
          </button>
        </div>
        <p id="ag-md-desc" className="ag-muted">
          {count === 1 ? "Ha orari diversi dalla settimana nuova. Vuoi dargli i nuovi orari?" : "Hanno orari diversi dalla settimana nuova. Vuoi dare anche a loro i nuovi orari?"}
        </p>
        <ul className="ag-md-list">
          {days.slice(0, SHOWN).map((day) => (
            <li key={day.date}>
              <b>{formatAppointmentDate(`${day.date}T00:00:00.000Z`, { weekday: "short", day: "numeric", month: "short" })}</b>
              <span>
                <span className="sr-only">ora </span>
                <s>{times(day.current)}</s>
                <span aria-hidden> → </span>
                <span className="sr-only">, diventa </span>
                <span className="ag-md-new">{times(day.wanted)}</span>
              </span>
            </li>
          ))}
          {count > SHOWN ? <li className="ag-muted">e altri {count - SHOWN}</li> : null}
        </ul>
        {preview.bookedDaysKept > 0 ? <p className="ag-muted ag-md-note">I giorni con lavori già fissati restano com&apos;erano.</p> : null}
        <div className="ag-actions">
          <button type="button" className="ag-btn primary" onClick={() => void choose(true)} disabled={busy !== null} data-autofocus>
            {busy === "apply" ? "Salvo..." : count === 1 ? "Cambia anche questo" : "Cambia anche questi"}
          </button>
          <button type="button" className="ag-btn" onClick={() => void choose(false)} disabled={busy !== null}>
            {busy === "keep" ? "Salvo..." : count === 1 ? "Lascialo così" : "Lasciali così"}
          </button>
        </div>
      </div>
    </>
  );
}
