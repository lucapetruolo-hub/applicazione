"use client";

import { useState } from "react";
import { Icon } from "@professionisti/ui";

/**
 * Orari liberi una settimana alla volta, un giorno per riga con le fasce
 * affiancate (docs/changelog/2026-11-10-date-del-preventivo.md, soluzione A
 * scelta da Luca): prima il preventivo mostrava fino a sessanta pillole
 * "giorno · fascia" di fila. Si apre sulla settimana dell'orario già scelto.
 */
export interface WeekSlot {
  date: string; // AAAA-MM-GG
  startTime: string;
  endTime: string;
}

interface Week<S extends WeekSlot> {
  key: string;
  days: { date: string; slots: S[] }[];
}

/** Lunedì della settimana di una data AAAA-MM-GG. */
function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const shift = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

function groupByWeek<S extends WeekSlot>(slots: S[]): Week<S>[] {
  const weeks: Week<S>[] = [];
  // In ordine: la richiesta del cliente mette in testa l'orario del link anche se è più avanti.
  const sorted = [...slots].sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
  for (const slot of sorted) {
    const key = mondayOf(slot.date);
    let week = weeks[weeks.length - 1];
    if (!week || week.key !== key) {
      week = { key, days: [] };
      weeks.push(week);
    }
    const day = week.days[week.days.length - 1];
    if (day && day.date === slot.date) day.slots.push(slot);
    else week.days.push({ date: slot.date, slots: [slot] });
  }
  return weeks;
}

function utcDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

/** "10 – 15 novembre", "30 novembre – 5 dicembre". */
function weekRangeLabel(first: string, last: string): string {
  const a = utcDate(first);
  const b = utcDate(last);
  const month = (d: Date) => d.toLocaleDateString("it-IT", { month: "long", timeZone: "UTC" });
  if (first === last) return `${a.getUTCDate()} ${month(a)}`;
  if (a.getUTCMonth() === b.getUTCMonth()) return `${a.getUTCDate()} – ${b.getUTCDate()} ${month(b)}`;
  return `${a.getUTCDate()} ${month(a)} – ${b.getUTCDate()} ${month(b)}`;
}

function todayIso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
}

export function WeekSlotPicker<S extends WeekSlot>({
  slots,
  selectedKey,
  keyOf,
  onSelect,
  label,
  marked,
}: {
  slots: S[];
  selectedKey: string;
  keyOf: (slot: S) => string;
  onSelect: (key: string) => void;
  /** Nome del gruppo per il lettore di schermo, es. "Orario dall'agenda". */
  label: string;
  /**
   * Fascia chiesta o proposta dall'altra parte, segnata con un pallino e una
   * legenda anche quando se ne sceglie un'altra (miglioria approvata da Luca
   * il 10/11/2026), es. { key, text: "chiesto dal cliente" }.
   */
  marked?: { key: string; text: string };
}) {
  const weeks = groupByWeek(slots);
  const selected = selectedKey ? slots.find((slot) => keyOf(slot) === selectedKey) : undefined;
  const selectedWeek = selected ? mondayOf(selected.date) : null;
  const [weekKey, setWeekKey] = useState(selectedWeek ?? weeks[0]?.key ?? "");
  // Se l'orario scelto cambia da fuori (modulo riaperto con un'altra data)
  // la settimana lo segue; scegliendo nella settimana in vista non si muove.
  const [seenKey, setSeenKey] = useState(selectedKey);
  if (seenKey !== selectedKey) {
    setSeenKey(selectedKey);
    if (selectedWeek && selectedWeek !== weekKey) setWeekKey(selectedWeek);
  }

  const index = Math.max(0, weeks.findIndex((week) => week.key === weekKey));
  const week = weeks[index];
  if (!week) return null;
  const today = todayIso();
  const tomorrow = todayIso(1);
  const first = week.days[0]?.date ?? week.key;
  const last = week.days[week.days.length - 1]?.date ?? first;
  const markedInWeek = marked ? week.days.some((day) => day.slots.some((slot) => keyOf(slot) === marked.key)) : false;

  return (
    <div className="week-slots">
      <div className="week-slots-nav">
        <button type="button" className="week-slots-arrow" aria-label="Settimana prima" disabled={index === 0} onClick={() => setWeekKey(weeks[index - 1]?.key ?? weekKey)}>
          <Icon name="chevron-left" size={18} color="currentColor" />
        </button>
        <span className="week-slots-range" aria-live="polite">
          {weekRangeLabel(first, last)}
        </span>
        <button type="button" className="week-slots-arrow" aria-label="Settimana dopo" disabled={index === weeks.length - 1} onClick={() => setWeekKey(weeks[index + 1]?.key ?? weekKey)}>
          <Icon name="chevron-right" size={18} color="currentColor" />
        </button>
      </div>
      <div className="week-slots-days" role="group" aria-label={label}>
        {week.days.map((day) => {
          const d = utcDate(day.date);
          const weekday = d.toLocaleDateString("it-IT", { weekday: "short", timeZone: "UTC" });
          const dayMonth = d.toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });
          const named = day.date === today ? "Oggi" : day.date === tomorrow ? "Domani" : null;
          const full = `${weekday} ${dayMonth}`;
          return (
            <div key={day.date} className="week-slots-day">
              <span className={`week-slots-label${named === "Oggi" ? " is-today" : ""}`}>
                <span className="week-slots-weekday">{named ?? weekday}</span> <span className="week-slots-date">{dayMonth}</span>
              </span>
              <div className="slot-pills" role="radiogroup" aria-label={`Orari di ${full}`}>
                {day.slots.map((slot) => {
                  const key = keyOf(slot);
                  const on = key === selectedKey;
                  const isMarked = marked?.key === key;
                  const time = `${slot.startTime}–${slot.endTime}`;
                  return (
                    <button key={key} type="button" role="radio" aria-checked={on} className={`slot-pill${on ? " is-on" : ""}`}
                      // Nome intero in un solo attributo: con un testo nascosto a parte Chromium aggiunge uno spazio prima della virgola.
                      aria-label={isMarked ? `${time}, ${marked.text}` : undefined}
                      onClick={() => onSelect(key)}
                    >
                      {isMarked ? <span className="week-slots-dot" aria-hidden /> : null}
                      {time}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {markedInWeek && marked ? (
        <span className="week-slots-legend" aria-hidden>
          <span className="week-slots-dot" /> {marked.text.charAt(0).toUpperCase() + marked.text.slice(1)}
        </span>
      ) : null}
    </div>
  );
}
