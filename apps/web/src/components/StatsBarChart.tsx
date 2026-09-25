"use client";

import { useEffect, useRef, useState } from "react";
import { brand } from "@professionisti/ui";

export type StatsBarPoint = { key: string; label: string; value: number };

/**
 * Grafico a barre di una sola metrica nel tempo (Statistiche del
 * professionista, docs/CHANGELOG.md §149). Una metrica alla volta, un solo
 * asse e un solo colore: la metrica si sceglie dalle tessere sopra, mai due
 * scale sovrapposte. Barre sottili con estremità arrotondata, griglia
 * recessiva, tooltip al passaggio del mouse o al tocco su tutta la colonna
 * (bersaglio più largo della barra), etichette dell'asse X diradate.
 */
export function StatsBarChart({
  points,
  formatValue,
  ariaLabel,
}: {
  points: StatsBarPoint[];
  formatValue: (value: number) => string;
  ariaLabel: string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Disegnato alla larghezza reale del contenitore (non un viewBox fisso
  // rimpicciolito): su telefono le etichette dell'asse restano a 11px
  // leggibili invece di scalare a 4-5px.
  const [width, setWidth] = useState(760);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(280, Math.round(el.clientWidth)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const height = width < 500 ? 220 : 280;
  const paddingLeft = 52;
  const paddingRight = 12;
  const paddingTop = 16;
  const paddingBottom = 32;
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;
  const baselineY = paddingTop + plotHeight;

  const maxValue = Math.max(...points.map((p) => p.value), 0);
  const niceMax = niceCeiling(maxValue);
  const gridSteps = [0, 0.25, 0.5, 0.75, 1];

  const slot = points.length > 0 ? plotWidth / points.length : plotWidth;
  // 2px di spazio tra barre adiacenti, barre mai più larghe di 28px.
  const barWidth = Math.max(Math.min(slot - 2, 28), 1);
  const labelEvery = Math.max(1, Math.ceil(points.length / (width < 500 ? 4 : 8)));

  function indexAt(clientX: number): number | null {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return null;
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * width - paddingLeft;
    if (x < 0 || x > plotWidth) return null;
    return Math.min(points.length - 1, Math.max(0, Math.floor(x / slot)));
  }

  const active = hoverIndex !== null ? points[hoverIndex] : undefined;
  const activeCenterX = hoverIndex !== null ? paddingLeft + slot * hoverIndex + slot / 2 : 0;

  return (
    <div ref={containerRef} style={{ width: "100%", position: "relative" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        style={{ display: "block", touchAction: "pan-y" }}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={(e) => setHoverIndex(indexAt(e.clientX))}
        onPointerDown={(e) => setHoverIndex(indexAt(e.clientX))}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {gridSteps.map((step) => {
          const y = baselineY - step * plotHeight;
          return (
            <g key={step}>
              <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke={brand.filetto} strokeWidth={1} />
              <text x={paddingLeft - 8} y={y + 4} textAnchor="end" fontSize={11} fill={brand.grafite70}>
                {formatValue(niceMax * step)}
              </text>
            </g>
          );
        })}

        {hoverIndex !== null ? (
          <rect x={paddingLeft + slot * hoverIndex} y={paddingTop} width={slot} height={plotHeight} fill={brand.gesso} />
        ) : null}

        {points.map((point, index) => {
          const barHeight = niceMax > 0 ? (point.value / niceMax) * plotHeight : 0;
          if (barHeight <= 0) return null;
          const x = paddingLeft + slot * index + (slot - barWidth) / 2;
          const y = baselineY - barHeight;
          const r = Math.min(4, barWidth / 2, barHeight);
          // Solo gli angoli in alto arrotondati: la barra resta ancorata alla linea di base.
          const d = `M ${x} ${baselineY} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} L ${x + barWidth - r} ${y} Q ${x + barWidth} ${y} ${x + barWidth} ${y + r} L ${x + barWidth} ${baselineY} Z`;
          return <path key={point.key} d={d} fill={index === hoverIndex ? brand.cianografiaScuro : brand.cianografia} />;
        })}

        <line x1={paddingLeft} y1={baselineY} x2={width - paddingRight} y2={baselineY} stroke={brand.grafite70} strokeWidth={1} />

        {points.map((point, index) => {
          if (index % labelEvery !== 0) return null;
          return (
            <text key={point.key} x={paddingLeft + slot * index + slot / 2} y={height - 10} textAnchor="middle" fontSize={11} fill={brand.grafite70}>
              {point.label}
            </text>
          );
        })}
      </svg>

      {active ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: `${(activeCenterX / width) * 100}%`,
            top: 0,
            transform: activeCenterX > width * 0.7 ? "translateX(-100%)" : "translateX(8px)",
            pointerEvents: "none",
            background: brand.grafite,
            color: brand.calce,
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 12,
            whiteSpace: "nowrap",
            boxShadow: "0 6px 16px rgba(43,32,19,0.18)",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 13 }}>{formatValue(active.value)}</div>
          <div style={{ opacity: 0.8 }}>{active.label}</div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Massimo dell'asse = 4 tacche di passo "pulito" (1, 2, 5 × potenza di 10):
 * con i conteggi le tacche restano numeri interi (mai "2,5 richieste").
 */
function niceCeiling(value: number): number {
  const rawStep = Math.max(value / 4, 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const fraction = rawStep / magnitude;
  const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * magnitude;
  return step * 4;
}
