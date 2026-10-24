"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonthsUtc, isSameDateUtc, monthGridDays, monthLabel, startOfMonthUtc, toIsoDate } from "@/lib/calendarDates";

/** Calendarietto del mese nella colonna dell'agenda: il periodo mostrato evidenziato, un punto sui giorni con appuntamenti. */
export function AgendaMiniMonth({
  selected,
  rangeDates,
  busyDates,
  today,
  onPick,
}: {
  selected: Date;
  rangeDates: Set<string>;
  busyDates: Set<string>;
  today: Date;
  onPick: (date: Date) => void;
}) {
  const [anchor, setAnchor] = useState(() => startOfMonthUtc(selected));
  const [lastSelected, setLastSelected] = useState(toIsoDate(selected));
  // Navigando nel calendario grande il mese del calendarietto lo segue.
  if (toIsoDate(selected) !== lastSelected) {
    setLastSelected(toIsoDate(selected));
    setAnchor(startOfMonthUtc(selected));
  }
  const month = anchor.getUTCMonth();
  return (
    <div className="ag-card ag-mini">
      <h3>
        <span style={{ textTransform: "capitalize" }}>
          {monthLabel(anchor)} {anchor.getUTCFullYear()}
        </span>
        <span className="ag-mini-nav">
          <button type="button" onClick={() => setAnchor(addMonthsUtc(anchor, -1))} aria-label="Mese precedente">
            <ChevronLeft size={16} aria-hidden />
          </button>
          <button type="button" onClick={() => setAnchor(addMonthsUtc(anchor, 1))} aria-label="Mese successivo">
            <ChevronRight size={16} aria-hidden />
          </button>
        </span>
      </h3>
      <div className="ag-mini-grid">
        {["L", "M", "M", "G", "V", "S", "D"].map((label, i) => (
          <span key={i} aria-hidden>
            {label}
          </span>
        ))}
        {monthGridDays(anchor).map((date) => {
          const dateStr = toIsoDate(date);
          const classes = [
            date.getUTCMonth() !== month ? "out" : "",
            rangeDates.has(dateStr) ? "in-range" : "",
            isSameDateUtc(date, today) ? "today" : "",
            busyDates.has(dateStr) ? "has" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button key={dateStr} type="button" className={classes} onClick={() => onPick(date)} aria-label={`${date.getUTCDate()} ${monthLabel(date)}`}>
              {date.getUTCDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
