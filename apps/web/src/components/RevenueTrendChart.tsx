"use client";

import { useMemo, useRef, useState } from "react";
import { brand } from "@professionisti/ui";
import type { RevenueMonthlyPoint } from "@professionisti/api-client";

/**
 * Grafico "Andamento entrate" per la pagina Statistiche (richiesta esplicita
 * dell'utente: "rendi la tabella in linea con i grafici moderni prendi
 * spunto da grafici di alte prestazioni") — area/linea per il trend
 * temporale (12 mesi, un'unica serie), colore sequenziale unico
 * (`brand.cianografia`, coerente con la palette "Vicinato" già in uso in
 * tutto il sito, CLAUDE.md §19), niente arcobaleno/colori multipli non
 * pertinenti a una singola serie. Costruito seguendo le linee guida della
 * skill `dataviz` di questa sessione: linea 2px, riempimento a "velo" (mai un
 * blocco saturo), griglia recessiva hairline solo orizzontale, crosshair +
 * tooltip al passaggio del mouse/tocco (l'hover layer è parte della
 * consegna, non un extra), marcatore di fine serie con anello di superficie,
 * etichetta diretta solo sul punto finale (mai un numero su ogni punto).
 */
export function RevenueTrendChart({ points }: { points: RevenueMonthlyPoint[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const width = 760;
  const height = 300;
  const paddingLeft = 56;
  const paddingRight = 20;
  const paddingTop = 24;
  const paddingBottom = 36;
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;
  const baselineY = paddingTop + plotHeight;

  const maxValueEurCents = Math.max(...points.map((p) => p.totalEurCents), 1);
  // Arrotonda il massimo a un valore "pulito" per le tacche dell'asse Y
  // (richiesta della skill dataviz: "round to clean numbers"), mai il
  // massimo grezzo dei dati.
  const niceMax = niceCeiling(maxValueEurCents / 100);
  const gridSteps = [0, 0.25, 0.5, 0.75, 1];

  const coords = useMemo(
    () =>
      points.map((point, index) => {
        const x = points.length > 1 ? paddingLeft + (index / (points.length - 1)) * plotWidth : paddingLeft + plotWidth / 2;
        const ratio = niceMax > 0 ? point.totalEurCents / 100 / niceMax : 0;
        const y = baselineY - ratio * plotHeight;
        return { x, y, point };
      }),
    [points, plotWidth, baselineY, plotHeight, niceMax],
  );

  const linePath = useMemo(() => smoothPath(coords.map((c) => ({ x: c.x, y: c.y }))), [coords]);
  const areaPath = useMemo(() => {
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (!first || !last) return "";
    return `${linePath} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
  }, [coords, linePath, baselineY]);

  function handlePointerMove(clientX: number) {
    const svg = svgRef.current;
    if (!svg || coords.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const relativeX = ((clientX - rect.left) / rect.width) * width;
    let nearest = 0;
    let nearestDistance = Infinity;
    coords.forEach((c, index) => {
      const distance = Math.abs(c.x - relativeX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = index;
      }
    });
    setHoverIndex(nearest);
  }

  const activeIndex = hoverIndex ?? coords.length - 1;
  const active = coords[activeIndex];
  const lastIndex = coords.length - 1;

  return (
    <div style={{ width: "100%", position: "relative" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        style={{ display: "block", touchAction: "pan-y" }}
        role="img"
        aria-label="Andamento delle entrate negli ultimi 12 mesi"
        onPointerMove={(e) => handlePointerMove(e.clientX)}
        onPointerLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id="revenue-area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={brand.cianografia} stopOpacity={0.16} />
            <stop offset="100%" stopColor={brand.cianografia} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Griglia orizzontale recessiva + etichette asse Y (valori "puliti", mai il massimo grezzo dei dati) */}
        {gridSteps.map((step) => {
          const y = baselineY - step * plotHeight;
          const value = niceMax * step;
          return (
            <g key={step}>
              <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke={brand.filetto} strokeWidth={1} />
              <text x={paddingLeft - 10} y={y + 4} textAnchor="end" fontSize={11} fill={brand.grafite70}>
                {compactEuro(value)}
              </text>
            </g>
          );
        })}

        {/* Riempimento a velo (mai un blocco saturo) + linea 2px */}
        <path d={areaPath} fill="url(#revenue-area-fill)" stroke="none" />
        <path d={linePath} fill="none" stroke={brand.cianografia} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {/* Etichette mese sull'asse X (una ogni due se ce ne sono 12, per non affollare) */}
        {coords.map((c, index) => {
          if (points.length > 8 && index % 2 !== 0 && index !== lastIndex) return null;
          return (
            <text key={c.point.month} x={c.x} y={height - 12} textAnchor="middle" fontSize={11} fill={brand.grafite70}>
              {c.point.label.split(" ")[0]}
            </text>
          );
        })}

        {/* Crosshair verticale al passaggio del puntatore (trova sempre il punto più vicino) */}
        {hoverIndex !== null && active ? (
          <line x1={active.x} y1={paddingTop} x2={active.x} y2={baselineY} stroke={brand.grafite70} strokeWidth={1} strokeDasharray="3 3" />
        ) : null}

        {/* Marcatore del punto attivo (hover) o, di default, del punto finale — etichetta diretta solo qui, mai su ogni punto */}
        {active ? (
          <>
            <circle cx={active.x} cy={active.y} r={6} fill={brand.calce} />
            <circle cx={active.x} cy={active.y} r={4} fill={brand.cianografia} />
          </>
        ) : null}

        {/* Hit target invisibile, più ampio del solo tracciato, per il tocco */}
        <rect x={paddingLeft} y={paddingTop} width={plotWidth} height={plotHeight} fill="transparent" />
      </svg>

      {active ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: `${(active.x / width) * 100}%`,
            top: `${Math.max((active.y / height) * 100 - 14, 2)}%`,
            transform: active.x > width * 0.72 ? "translate(-100%, -100%)" : "translate(-6%, -100%)",
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
          <div style={{ fontWeight: 700, fontSize: 13 }}>{compactEuro(active.point.totalEurCents / 100, { full: true })}</div>
          <div style={{ opacity: 0.8 }}>
            {active.point.label} · {active.point.jobCount} {active.point.jobCount === 1 ? "lavoro" : "lavori"}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function niceCeiling(value: number): number {
  if (value <= 0) return 100;
  const exponent = Math.floor(Math.log10(value));
  const magnitude = 10 ** exponent;
  const fraction = value / magnitude;
  let niceFraction: number;
  if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 5) niceFraction = 5;
  else niceFraction = 10;
  return niceFraction * magnitude;
}

function compactEuro(euroValue: number, opts?: { full?: boolean }): string {
  if (opts?.full) {
    return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(euroValue);
  }
  if (euroValue >= 1_000_000) return `${(euroValue / 1_000_000).toFixed(1).replace(/\.0$/, "")} M€`;
  if (euroValue >= 1_000) return `${(euroValue / 1_000).toFixed(1).replace(/\.0$/, "")} k€`;
  return `${Math.round(euroValue)} €`;
}

/** Curva morbida (Catmull-Rom semplificata via Bezier a punto medio) — evita gli spigoli di una polilinea senza il rischio di overshoot di una vera interpolazione. */
function smoothPath(points: { x: number; y: number }[]): string {
  const start = points[0];
  if (!start) return "";
  if (points.length === 1) return `M ${start.x} ${start.y}`;
  let d = `M ${start.x} ${start.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    if (!p0 || !p1) continue;
    const midX = (p0.x + p1.x) / 2;
    d += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}
