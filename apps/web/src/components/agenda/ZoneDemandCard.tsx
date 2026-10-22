"use client";

import { TrendingUp } from "lucide-react";
import { DAY_PART_RANGE, weekTemplateCovers, type AgendaWeekTemplate, type DayPart, type ZoneDemand } from "@professionisti/shared";
import { WEEKDAY_FULL_LABELS } from "@/app/dashboard/agenda/_components/agendaHelpers";

/**
 * "Richieste in zona" in Orari di lavoro (docs/CHANGELOG.md §288, scelta
 * dell'utente): i momenti più richiesti dai clienti nel raggio di lavoro,
 * confrontati con la settimana tipo. Con pochi dati dice "in arrivo".
 */
export function ZoneDemandCard({
  demand,
  template,
  onAdd,
}: {
  demand: ZoneDemand | null;
  template: AgendaWeekTemplate | null;
  onAdd: (weekday: number, part: DayPart) => void;
}) {
  if (!demand) return null;
  const tips = demand.status === "ready" ? demand.tips : [];
  const area = demand.status === "ready" ? (demand.radiusKm ? `entro ${demand.radiusKm} km da ${demand.city}` : `a ${demand.city}`) : "";

  return (
    <div className="ag-card" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <TrendingUp size={19} aria-hidden style={{ color: "var(--ag-green-dark)" }} />
        <h2 style={{ fontSize: 19 }}>Richieste in zona</h2>
        {demand.status === "coming" ? <span className="ag-pill">In arrivo</span> : null}
      </div>

      {demand.status === "coming" ? (
        <p className="ag-muted" style={{ fontSize: 13.5, marginTop: 6 }}>
          Quando nel tuo raggio di lavoro ci saranno abbastanza richieste, qui vedrai i giorni e gli orari più cercati dai clienti.
        </p>
      ) : tips.length === 0 ? (
        <p className="ag-muted" style={{ fontSize: 13.5, marginTop: 6 }}>
          {demand.total} richieste {area} nell&apos;ultimo mese, senza un momento più cercato degli altri.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          {tips.map((tip) => {
            const range = DAY_PART_RANGE[tip.part];
            const day = WEEKDAY_FULL_LABELS[tip.weekday] ?? "";
            const covered = template ? weekTemplateCovers(template, tip.weekday, tip.part) : true;
            return (
              <div key={`${tip.weekday}-${tip.part}`} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "#fbf7f2", borderRadius: 14, padding: "12px 14px" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <b style={{ display: "block", fontSize: 14.5 }}>
                    {day} {range.label} è molto richiesto
                  </b>
                  <span className="ag-muted" style={{ fontSize: 13 }}>
                    {tip.count} richieste{demand.categoryLabel ? ` di ${demand.categoryLabel.toLowerCase()}` : ""} {area} nell&apos;ultimo mese.
                    {covered ? " Sei già aperto." : " Tu sei chiuso."}
                  </span>
                </div>
                {!covered ? (
                  <button type="button" className="ag-btn sm" onClick={() => onAdd(tip.weekday, tip.part)}>
                    Aggiungi {range.start}–{range.end} alla settimana tipo
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
