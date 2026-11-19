"use client";

import { useState } from "react";
import { Icon } from "@professionisti/ui";

/**
 * Orari liberi sette giorni alla volta, un giorno per riga con le fasce
 * affiancate (docs/changelog/2026-11-10-date-del-preventivo.md, soluzione A
 * scelta da Luca): prima il preventivo mostrava fino a sessanta pillole
 * "giorno · fascia" di fila. Si apre sui giorni dell'orario già scelto.
 * Stesso aspetto dell'agenda del profilo pubblico (pillole verde chiaro,
 * giorni da oggi, "Mer 18 Nov", al completo in grigio):
 * docs/changelog/2026-11-18-scelta-data-come-profilo.md.
 */
export interface WeekSlot {
  date: string; // AAAA-MM-GG
  startTime: string;
  endTime: string;
}

interface Week<S extends WeekSlot> {
  key: string;
  days: { date: string; slots: S[]; full: WeekSlot[] }[];
}

function utcDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function addDays(date: string, days: number): string {
  const d = utcDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((utcDate(to).getTime() - utcDate(from).getTime()) / 86400000);
}

/**
 * Finestre di 7 giorni a partire da oggi, come l'agenda del profilo pubblico
 * (docs/changelog/2026-11-18-scelta-data-come-profilo.md): prima si andava per
 * settimana da lunedì, e un mercoledì la prima pagina aveva solo 4 giorni.
 * Dentro una finestra ci sono tutti i giorni, anche quelli senza orari (come
 * i trattini del profilo); l'ultima si ferma all'ultimo giorno con orari e le
 * finestre senza nessun orario libero si saltano.
 */
function groupByWindow<S extends WeekSlot>(slots: S[], fullSlots: WeekSlot[], today: string): Week<S>[] {
  const all = [...slots, ...fullSlots];
  if (slots.length === 0) return [];
  const windowStart = (date: string) => addDays(today, Math.floor(daysBetween(today, date) / 7) * 7);
  const lastDate = all.reduce((max, slot) => (slot.date > max ? slot.date : max), all[0]!.date);
  const sort = <T extends WeekSlot>(list: T[]) => [...list].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const keys = [...new Set(slots.map((slot) => windowStart(slot.date)))].sort();
  return keys.map((key) => {
    const days: Week<S>["days"] = [];
    for (let i = 0; i < 7; i += 1) {
      const date = addDays(key, i);
      if (date > lastDate) break;
      days.push({ date, slots: sort(slots.filter((slot) => slot.date === date)), full: sort(fullSlots.filter((slot) => slot.date === date)) });
    }
    return { key, days };
  });
}

/** "18 – 24 novembre", "30 novembre – 6 dicembre". */
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

// Stesse scritte dell'agenda del profilo e delle schede di ricerca: "Ven", "20 Nov".
const WEEKDAY_SHORT = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
const MONTH_SHORT = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

/** "Mer 18 Nov", come le colonne dell'agenda del profilo. */
export function shortDayLabel(date: string): string {
  const d = utcDate(date);
  return `${WEEKDAY_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_SHORT[d.getUTCMonth()]}`;
}

export function WeekSlotPicker<S extends WeekSlot>({
  slots,
  selectedKey,
  keyOf,
  onSelect,
  label,
  marked,
  fullSlots = [],
}: {
  slots: S[];
  /** Fasce al completo, in grigio e non cliccabili come nel profilo pubblico. */
  fullSlots?: WeekSlot[];
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
  const today = todayIso();
  const tomorrow = todayIso(1);
  const weeks = groupByWindow(slots, fullSlots, today);
  const selected = selectedKey ? slots.find((slot) => keyOf(slot) === selectedKey) : undefined;
  const selectedWeek = selected ? (weeks.find((week) => week.days.some((day) => day.date === selected.date))?.key ?? null) : null;
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
  const first = week.days[0]?.date ?? week.key;
  const last = week.days[week.days.length - 1]?.date ?? first;
  const markedInWeek = marked ? week.days.some((day) => day.slots.some((slot) => keyOf(slot) === marked.key)) : false;

  return (
    <div className="week-slots">
      <div className="week-slots-nav">
        <button type="button" className="week-slots-arrow" aria-label="Giorni precedenti" disabled={index === 0} onClick={() => setWeekKey(weeks[index - 1]?.key ?? weekKey)}>
          <Icon name="chevron-left" size={18} color="currentColor" />
        </button>
        <span className="week-slots-range" aria-live="polite">
          {weekRangeLabel(first, last)}
        </span>
        <button type="button" className="week-slots-arrow" aria-label="Giorni successivi" disabled={index === weeks.length - 1} onClick={() => setWeekKey(weeks[index + 1]?.key ?? weekKey)}>
          <Icon name="chevron-right" size={18} color="currentColor" />
        </button>
      </div>
      <div className="week-slots-days" role="group" aria-label={label}>
        {week.days.map((day) => {
          const d = utcDate(day.date);
          const weekday = WEEKDAY_SHORT[d.getUTCDay()]!;
          const dayMonth = `${d.getUTCDate()} ${MONTH_SHORT[d.getUTCMonth()]}`;
          const named = day.date === today ? "Oggi" : day.date === tomorrow ? "Domani" : null;
          const full = `${weekday} ${dayMonth}`;
          // Libere e al completo nello stesso ordine di orario, come le righe del profilo.
          const items = [
            ...day.slots.map((slot) => ({ slot, isFull: false as const })),
            ...day.full.map((slot) => ({ slot, isFull: true as const })),
          ].sort((x, y) => x.slot.startTime.localeCompare(y.slot.startTime));
          return (
            <div key={day.date} className="week-slots-day">
              <span className={`week-slots-label${named === "Oggi" ? " is-today" : ""}`}>
                <span className="week-slots-weekday">{named ?? weekday}</span> <span className="week-slots-date">{dayMonth}</span>
              </span>
              {items.length === 0 ? (
                // Giorno senza orari: c'è come il trattino del profilo, così i giorni restano in fila.
                <span className="week-slots-none">Nessun orario</span>
              ) : (
                <div className="slot-pills" role="radiogroup" aria-label={`Orari di ${full}`}>
                  {items.map(({ slot, isFull }) => {
                    const time = `${slot.startTime}–${slot.endTime}`;
                    if (isFull) {
                      return (
                        // Radio spento come una fascia non sceglibile: il lettore di schermo la legge "non disponibile".
                        <button key={`full-${time}`} type="button" role="radio" aria-checked={false} disabled className="slot-pill is-full" aria-label={`${time}, al completo`}>
                          {time}
                        </button>
                      );
                    }
                    const free = slot as S;
                    const key = keyOf(free);
                    const on = key === selectedKey;
                    const isMarked = marked?.key === key;
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
              )}
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
