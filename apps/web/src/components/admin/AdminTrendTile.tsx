"use client";

import { useState } from "react";

const ACCENT = "#189A63";
const MUTED = "#BFE3D1";

/**
 * Riquadro con andamento settimanale (docs/CHANGELOG.md §145): valore della
 * settimana in corso, differenza con la precedente, 12 barre (settimane
 * passate nel verde chiaro, quella in corso nel verde pieno) con il dato
 * della singola settimana al passaggio del mouse. Una serie per riquadro:
 * metriche diverse non condividono mai un asse.
 */
export function AdminTrendTile({ label, values, weekStarts }: { label: string; values: number[]; weekStarts: string[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const current = values[values.length - 1] ?? 0;
  const previous = values[values.length - 2] ?? 0;
  const delta = current - previous;
  const max = Math.max(1, ...values);
  const width = 240;
  const height = 56;
  const gap = 2;
  const barWidth = (width - gap * (values.length - 1)) / values.length;
  const weekLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });
  const summary = values.map((v, i) => `${weekLabel(weekStarts[i] ?? "")}: ${v}`).join(", ");

  return (
    <div className="admin-kpi">
      <span className="admin-kpi-label">{label}</span>
      <span className="admin-kpi-value">{current}</span>
      {/* Al passaggio sulle barre questa riga mostra il dato della settimana
          puntata, così il valore non copre mai il titolo del riquadro. */}
      <span role="status" style={{ fontSize: 12, color: hover !== null ? "#2b2420" : "#6e6459", fontWeight: hover !== null ? 700 : 600 }}>
        {hover !== null
          ? `Settimana del ${weekLabel(weekStarts[hover] ?? "")}: ${values[hover]}`
          : delta === 0
            ? "Come la settimana scorsa"
            : `${delta > 0 ? "+" : "−"}${Math.abs(delta)} rispetto alla settimana scorsa`}
      </span>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        role="img"
        aria-label={`${label}, ultime 12 settimane: ${summary}`}
        onMouseLeave={() => setHover(null)}
        style={{ display: "block", marginTop: 6, height: "auto" }}
      >
        <line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} stroke="#F0DCC0" strokeWidth={1} />
        {values.map((value, i) => {
          const h = value === 0 ? 0 : Math.max(3, (value / max) * (height - 4));
          const x = i * (barWidth + gap);
          const isCurrent = i === values.length - 1;
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              {/* Area di passaggio più grande della barra. */}
              <rect x={x} y={0} width={barWidth + gap} height={height} fill="transparent" />
              {h > 0 ? (
                <path
                  d={roundedTopBar(x, height - 1 - h, barWidth, h, Math.min(4, barWidth / 2, h))}
                  fill={isCurrent ? ACCENT : MUTED}
                  opacity={hover === null || hover === i ? 1 : 0.6}
                />
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Barra con angoli arrotondati solo in alto, appoggiata sulla linea di base. */
function roundedTopBar(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}
