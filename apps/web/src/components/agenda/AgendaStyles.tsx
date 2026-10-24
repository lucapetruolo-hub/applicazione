"use client";

import { brand } from "@professionisti/ui";

/**
 * Stile della nuova agenda (docs/CHANGELOG.md §288), scelto dall'utente
 * sulle anteprime: regole della skill Taste (niente ombre a riposo, niente
 * maiuscole spaziate, pulsante principale quasi nero, colore solo per stato
 * e dati) ma sfondo pesca del sito. CSS puro come CalendarShell: griglia
 * oraria e pannelli posizionati che Tamagui da solo non rende bene. Tutte le
 * classi iniziano con `ag-` per non toccare il resto del sito.
 */
export function AgendaStyles() {
  return (
    <style jsx global>{`
      .ag {
        --ag-ink: ${brand.grafite};
        --ag-muted: ${brand.grafite70};
        --ag-line: #f3e6d6;
        --ag-line-soft: #f7eee4;
        --ag-green: ${brand.cianografia};
        --ag-green-dark: ${brand.cianografiaScuro};
        --ag-green-veil: ${brand.cianografiaVelo};
        --ag-free: #edf8f2;
        --ag-brass: ${brand.ottone};
        --ag-brass-dark: ${brand.ottoneScuro};
        --ag-brass-veil: ${brand.ottoneVelo};
        --ag-teal: #1aa6a6;
        --ag-teal-veil: #ddf3f3;
        --ag-red: ${brand.urgenza};
        --ag-red-veil: ${brand.urgenzaVelo};
        --ag-closed: #f6ede2;
        --ag-float: 0 12px 32px rgba(43, 32, 19, 0.14);
        color: var(--ag-ink);
        font-family: var(--font-body), system-ui, sans-serif;
        font-variant-numeric: tabular-nums;
        width: 100%;
      }
      .ag h1,
      .ag h2,
      .ag h3 {
        margin: 0;
        font-family: var(--font-body), system-ui, sans-serif;
        font-weight: 600;
        letter-spacing: -0.02em;
        color: var(--ag-ink);
      }
      .ag h1 {
        font-size: 30px;
      }
      .ag h2 {
        font-size: 22px;
      }
      .ag h3 {
        font-size: 15px;
      }
      .ag p {
        margin: 0;
      }
      .ag-muted {
        color: var(--ag-muted);
      }
      .ag-card {
        background: #fff;
        border-radius: 20px;
      }
      .ag-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        height: 44px;
        padding: 0 18px;
        border-radius: 999px;
        font: 600 14px var(--font-body), system-ui, sans-serif;
        border: 1.5px solid var(--ag-ink);
        background: #fff;
        color: var(--ag-ink);
        white-space: nowrap;
        cursor: pointer;
        text-decoration: none;
        transition: background-color 150ms ease, opacity 150ms ease;
      }
      .ag-btn:hover {
        background: #f6f1ec;
      }
      .ag-btn:focus-visible,
      .ag-icon-btn:focus-visible,
      .ag-seg button:focus-visible,
      .ag-link:focus-visible,
      .ag-ev:focus-visible,
      .ag-mini button:focus-visible,
      .ag-strip button:focus-visible {
        outline: 2px solid var(--ag-green);
        outline-offset: 2px;
      }
      .ag-btn.primary {
        background: var(--ag-ink);
        color: #fff;
      }
      .ag-btn.primary:hover {
        background: #463b35;
      }
      .ag-btn.danger {
        border-color: var(--ag-red);
        color: var(--ag-red);
      }
      .ag-btn.danger:hover {
        background: var(--ag-red-veil);
      }
      .ag-btn.sm {
        height: 38px;
        padding: 0 14px;
        font-size: 13px;
      }
      .ag-btn[disabled],
      .ag-btn[aria-disabled="true"] {
        opacity: 0.5;
        cursor: default;
      }
      .ag-btn.done {
        border-color: var(--ag-green-veil);
        background: var(--ag-green-veil);
        color: var(--ag-green-dark);
      }
      .ag-icon-btn {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        background: #fff;
        border: 0;
        display: inline-grid;
        place-items: center;
        cursor: pointer;
        color: var(--ag-ink);
        flex: none;
      }
      .ag-icon-btn:hover {
        background: #f6f1ec;
      }
      .ag-link {
        background: none;
        border: 0;
        padding: 0;
        font: 600 14px var(--font-body), system-ui, sans-serif;
        color: var(--ag-green-dark);
        text-decoration: underline;
        text-underline-offset: 3px;
        cursor: pointer;
      }
      .ag-seg {
        display: inline-flex;
        background: #fff;
        border-radius: 999px;
        padding: 4px;
        gap: 2px;
      }
      .ag-seg button {
        border: 0;
        background: transparent;
        padding: 8px 14px;
        border-radius: 999px;
        font: 600 13px var(--font-body), system-ui, sans-serif;
        color: var(--ag-muted);
        cursor: pointer;
        min-height: 36px;
      }
      .ag-seg button[aria-pressed="true"] {
        background: #ecece8;
        color: var(--ag-ink);
      }
      .ag-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 26px;
        padding: 0 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        background: #f4f1ee;
        color: var(--ag-ink);
        white-space: nowrap;
      }
      .ag-pill.green {
        background: var(--ag-green-veil);
        color: var(--ag-green-dark);
      }
      .ag-pill.brass {
        background: var(--ag-brass-veil);
        color: var(--ag-brass-dark);
      }
      .ag-pill.teal {
        background: var(--ag-teal-veil);
        color: #0d6f6f;
      }
      .ag-pill.red {
        background: var(--ag-red-veil);
        color: var(--ag-red);
      }

      /* Intestazione */
      .ag-head {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 16px;
      }
      .ag-head .ag-head-right {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .ag-tabs {
        margin-bottom: 18px;
      }
      .ag-banner {
        display: flex;
        gap: 12px;
        align-items: center;
        padding: 12px 16px;
        border-radius: 16px;
        margin-bottom: 14px;
        font-size: 14px;
      }
      .ag-banner.info {
        background: var(--ag-green-veil);
      }
      .ag-banner.warn {
        background: var(--ag-brass-veil);
        color: #5e4a24;
      }
      .ag-banner.error {
        background: var(--ag-red-veil);
        color: var(--ag-red);
      }
      .ag-banner .ag-btn {
        margin-left: auto;
      }

      /* Calendario */
      .ag-layout {
        display: grid;
        grid-template-columns: 240px minmax(0, 1fr);
        gap: 20px;
        align-items: start;
      }
      .ag-aside {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .ag-aside .ag-card {
        padding: 16px;
      }
      .ag-toolbar {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 12px;
        flex-wrap: wrap;
      }
      .ag-range {
        font-weight: 600;
        font-size: 18px;
        letter-spacing: -0.02em;
        margin: 0 6px;
      }
      .ag-summary {
        margin-left: auto;
        font-size: 13px;
        color: var(--ag-muted);
      }
      .ag-mini h3 {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }
      .ag-mini-nav {
        display: flex;
        gap: 2px;
      }
      .ag-mini-nav button {
        width: 32px;
        height: 32px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        cursor: pointer;
        color: var(--ag-muted);
        display: grid;
        place-items: center;
      }
      .ag-mini-nav button:hover {
        background: #f6f1ec;
      }
      .ag-mini-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 2px;
        text-align: center;
      }
      .ag-mini-grid > span {
        font-size: 11px;
        font-weight: 600;
        color: var(--ag-muted);
        padding: 4px 0;
      }
      .ag-mini-grid button {
        position: relative;
        border: 0;
        background: transparent;
        border-radius: 8px;
        padding: 6px 0;
        font: 500 12px var(--font-body), system-ui, sans-serif;
        color: var(--ag-ink);
        cursor: pointer;
        min-height: 30px;
      }
      .ag-mini-grid button:hover {
        background: #f6f1ec;
      }
      .ag-mini-grid button.in-range {
        background: var(--ag-green-veil);
      }
      .ag-mini-grid button.today {
        background: var(--ag-ink);
        color: #fff;
        font-weight: 600;
      }
      .ag-mini-grid button.out {
        /* Più chiaro dei giorni del mese ma leggibile, 4,5:1 anche sul verde chiaro (A4, §310). */
        color: #766758;
      }
      .ag-mini-grid button.has::after {
        content: "";
        position: absolute;
        left: 50%;
        bottom: 2px;
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: var(--ag-green);
        transform: translateX(-50%);
      }
      .ag-mini-grid button.today.has::after {
        background: #fff;
      }
      .ag-filter {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        border: 0;
        background: transparent;
        padding: 7px 0;
        font: 500 13.5px var(--font-body), system-ui, sans-serif;
        color: var(--ag-ink);
        cursor: pointer;
        text-align: left;
      }
      .ag-filter[aria-pressed="false"] {
        color: var(--ag-muted);
      }
      .ag-filter[aria-pressed="false"] i {
        opacity: 0.35;
      }
      .ag-filter i {
        width: 16px;
        height: 16px;
        border-radius: 5px;
        flex: none;
      }
      .ag-filter em {
        margin-left: auto;
        font-style: normal;
        color: var(--ag-muted);
        font-size: 12px;
      }
      .ag-swatch-conf {
        background: var(--ag-green);
      }
      .ag-swatch-done {
        background: var(--ag-teal);
      }
      .ag-swatch-wait {
        background: #fff8ea;
        border: 1.5px dashed var(--ag-brass);
      }
      .ag-swatch-ext {
        background: #f4f1ee;
        border: 1.5px dashed var(--ag-muted);
      }
      .ag-swatch-free {
        background: var(--ag-green-veil);
      }
      .ag-cal {
        overflow: hidden;
      }
      .ag-days {
        display: grid;
        border-bottom: 1px solid var(--ag-line);
      }
      .ag-days > div,
      .ag-days > button {
        padding: 10px 4px;
        text-align: center;
        font: 600 12px var(--font-body), system-ui, sans-serif;
        color: var(--ag-muted);
        border: 0;
        background: transparent;
        min-width: 0;
      }
      .ag-days > button {
        cursor: pointer;
      }
      .ag-days > button:hover {
        background: #fbf7f2;
      }
      .ag-day-num {
        display: grid;
        place-items: center;
        margin: 2px auto 0;
        width: 34px;
        height: 34px;
        border-radius: 50%;
        font-size: 18px;
        font-weight: 600;
        color: var(--ag-ink);
        letter-spacing: -0.02em;
      }
      .ag-days .today .ag-day-num {
        background: var(--ag-ink);
        color: #fff;
      }
      .ag-day-note {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        font-size: 11px;
        font-weight: 500;
        margin-top: 3px;
        color: var(--ag-green-dark);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .ag-day-note.full {
        color: var(--ag-red);
      }
      .ag-day-note.off {
        color: var(--ag-muted);
      }
      .ag-weather {
        display: inline-flex;
        vertical-align: middle;
        margin-left: 4px;
        color: #4f6d8f;
      }
      .ag-grid-scroll {
        max-height: 640px;
        overflow-y: auto;
        overscroll-behavior: contain;
      }
      .ag-grid {
        display: grid;
        position: relative;
      }
      .ag-hours > div {
        font-size: 11px;
        color: var(--ag-muted);
        text-align: right;
        padding-right: 8px;
        transform: translateY(-7px);
      }
      .ag-col {
        position: relative;
        border-left: 1px solid var(--ag-line-soft);
        background: #fff;
        min-width: 0;
      }
      .ag-col.closed {
        background: var(--ag-closed);
      }
      .ag-col.past {
        background: #fdfbf8;
      }
      .ag-col .hl {
        position: absolute;
        left: 0;
        right: 0;
        height: 1px;
        background: var(--ag-line-soft);
      }
      .ag-col .closed-label {
        position: absolute;
        top: 40%;
        left: 0;
        right: 0;
        text-align: center;
        font-size: 12px;
        font-weight: 600;
        color: var(--ag-muted);
      }
      .ag-free {
        position: absolute;
        left: 3px;
        right: 3px;
        border-radius: 10px;
        background: var(--ag-free);
      }
      .ag-free span {
        position: absolute;
        top: 4px;
        left: 8px;
        font-size: 10.5px;
        font-weight: 600;
        color: var(--ag-green-dark);
      }
      .ag-ev {
        position: absolute;
        left: 5px;
        right: 5px;
        border-radius: 10px;
        padding: 5px 8px;
        font: 400 12px/1.3 var(--font-body), system-ui, sans-serif;
        overflow: hidden;
        border: 0;
        border-left: 4px solid;
        text-align: left;
        cursor: pointer;
        color: var(--ag-ink);
        z-index: 2;
      }
      .ag-ev b {
        display: block;
        font-weight: 600;
        font-size: 12.5px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .ag-ev span {
        display: block;
        color: var(--ag-muted);
        font-size: 11.5px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .ag-ev.conf {
        background: #e9f7f0;
        border-color: var(--ag-green);
      }
      .ag-ev.pending {
        background: #fff8ea;
        border-color: var(--ag-brass);
      }
      .ag-ev.done {
        background: var(--ag-teal-veil);
        border-color: var(--ag-teal);
      }
      .ag-ev.wait {
        background: #fff8ea;
        border: 1.5px dashed var(--ag-brass);
        border-left: 4px solid var(--ag-brass);
      }
      .ag-ev.ext {
        background: #f4f1ee;
        border: 1.5px dashed var(--ag-muted);
        border-left: 4px solid var(--ag-muted);
      }
      .ag-ev.canceled {
        background: #faf6f2;
        border-color: #d9cfc4;
        opacity: 0.7;
      }
      .ag-ev.canceled b {
        text-decoration: line-through;
      }
      .ag-ev.selected {
        outline: 2px solid var(--ag-ink);
        outline-offset: 1px;
      }
      .ag-now {
        position: absolute;
        right: 0;
        height: 2px;
        background: var(--ag-red);
        z-index: 3;
        pointer-events: none;
      }
      .ag-now::before {
        content: "";
        position: absolute;
        left: -5px;
        top: -4px;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--ag-red);
      }
      .ag-strip-row {
        display: grid;
        grid-template-columns: 40px minmax(0, 1fr) 40px;
        align-items: center;
        gap: 4px;
        margin-bottom: 12px;
      }
      .ag-strip {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 4px;
      }
      .ag-strip-arrow {
        width: 40px;
        height: 56px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--ag-line);
        border-radius: 14px;
        background: #fff;
        color: var(--ag-ink);
        cursor: pointer;
      }
      .ag-strip-arrow:hover {
        background: var(--ag-line-soft);
      }
      .ag-strip-arrow:focus-visible {
        outline: 2px solid var(--ag-ink);
        outline-offset: 2px;
      }
      .ag-strip button {
        border: 0;
        background: transparent;
        text-align: center;
        padding: 8px 0;
        border-radius: 14px;
        font: 600 11px var(--font-body), system-ui, sans-serif;
        color: var(--ag-muted);
        cursor: pointer;
        min-height: 56px;
      }
      .ag-strip button b {
        display: block;
        font-size: 18px;
        color: var(--ag-ink);
        margin-top: 2px;
      }
      .ag-strip button.on {
        background: var(--ag-ink);
        color: #fff;
      }
      .ag-strip button.on b {
        color: #fff;
      }
      .ag-strip button.today:not(.on) b {
        color: var(--ag-green-dark);
      }
      .ag-strip button u {
        display: block;
        height: 4px;
        width: 4px;
        margin: 4px auto 0;
        border-radius: 50%;
        background: var(--ag-green);
      }
      .ag-strip button.on u {
        background: #fff;
      }

      /* Prossimo appuntamento e riquadro */
      .ag-next {
        padding: 14px 16px;
        margin-bottom: 12px;
      }
      .ag-next b {
        display: block;
        font-size: 15px;
      }
      .ag-actions {
        display: flex;
        gap: 8px;
        margin-top: 12px;
        flex-wrap: wrap;
      }
      .ag-scrim {
        position: fixed;
        inset: 0;
        background: rgba(43, 36, 32, 0.35);
        z-index: 1000;
      }
      .ag-sheet {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: 440px;
        max-width: 100%;
        background: #fff;
        z-index: 1001;
        box-shadow: var(--ag-float);
        overflow-y: auto;
        padding: 20px 24px 28px;
        animation: ag-sheet-in 200ms ease-out;
      }
      @keyframes ag-sheet-in {
        from {
          transform: translateX(24px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .ag-sheet {
          animation: none;
        }
      }
      .ag-sheet-top {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .ag-sheet-top .ag-icon-btn {
        margin-left: auto;
        background: #f6f1ec;
        border-radius: 50%;
      }
      .ag-sheet h2 {
        margin-top: 10px;
      }
      .ag-sheet .ag-actions .ag-btn {
        flex: 1 1 0;
        min-width: 0;
      }
      .ag-sec {
        margin-top: 18px;
        padding-top: 16px;
        border-top: 1px solid var(--ag-line);
      }
      .ag-sec h3 {
        font-size: 13px;
        color: var(--ag-muted);
        margin-bottom: 8px;
        letter-spacing: 0;
      }
      .ag-sec p {
        font-size: 14.5px;
        line-height: 1.5;
      }
      .ag-pay {
        display: flex;
        align-items: center;
        gap: 12px;
        border-radius: 14px;
        padding: 12px 14px;
        background: #f6f1ec;
      }
      .ag-pay.paid {
        background: var(--ag-green-veil);
      }
      .ag-pay b {
        display: block;
        font-size: 15px;
      }
      .ag-pay span {
        font-size: 13px;
        color: var(--ag-muted);
      }
      .ag-pay .amt {
        margin-left: auto;
        text-align: right;
        font-weight: 600;
        font-size: 15px;
        white-space: nowrap;
      }
      .ag-note {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid ${brand.filetto};
        border-radius: 12px;
        padding: 10px 12px;
        font: 400 14px var(--font-body), system-ui, sans-serif;
        color: var(--ag-ink);
        resize: none;
        background: #fffcf9;
      }
      .ag-input {
        height: 44px;
        box-sizing: border-box;
        border: 1px solid ${brand.filetto};
        border-radius: 12px;
        padding: 0 12px;
        font: 400 14px var(--font-body), system-ui, sans-serif;
        color: var(--ag-ink);
        background: #fff;
        min-width: 0;
      }
      /* Settimana tipo in tre passi (docs/CHANGELOG.md §320). */
      .ag-wt {
        padding: 20px;
      }
      .ag-wt-body {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 16px;
        margin-top: 16px;
      }
      .ag-wt-steps {
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-width: 0;
      }
      .ag-wt-step {
        border: 1px solid var(--ag-line);
        border-radius: 16px;
        padding: 16px;
        margin: 0;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .ag-wt-step legend {
        float: left;
        width: 100%;
        padding: 0;
        margin-bottom: 2px;
        font-weight: 600;
        font-size: 16px;
      }
      .ag-wt-hint {
        font-size: 14px;
        margin: 0;
      }
      .ag-wt-days {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 6px;
      }
      .ag-wt-day {
        height: 44px;
        border-radius: 999px;
        border: 1.5px solid ${brand.filetto};
        background: #fff;
        color: var(--ag-ink);
        font: 600 14px var(--font-body), system-ui, sans-serif;
        cursor: pointer;
        padding: 0;
        transition: background-color 150ms ease;
      }
      .ag-wt-day:hover {
        background: #f6f1ec;
      }
      .ag-wt-rest {
        font-size: 0;
      }
      .ag-wt-day.is-on {
        background: var(--ag-ink);
        border-color: var(--ag-ink);
        color: #fff;
      }
      .ag-wt-presets {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 8px;
      }
      .ag-wt-preset {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 56px;
        padding: 8px 12px;
        border: 1.5px solid ${brand.filetto};
        border-radius: 12px;
        cursor: pointer;
        font-size: 15px;
      }
      .ag-wt-preset.is-on {
        border-color: var(--ag-ink);
        box-shadow: inset 0 0 0 1px var(--ag-ink);
      }
      .ag-wt-preset input {
        width: 20px;
        height: 20px;
        margin: 0;
        accent-color: var(--ag-ink);
        flex: none;
      }
      .ag-wt-preset > span {
        display: flex;
        flex-direction: column;
      }
      .ag-wt-preset b {
        font-weight: 600;
      }
      .ag-wt-preset:has(input:focus-visible),
      .ag-wt-day:focus-visible,
      .ag-wt-chip:focus-visible,
      .ag-wt-add:focus-visible,
      .ag-wt-remove:focus-visible {
        outline: 2px solid var(--ag-green);
        outline-offset: 2px;
      }
      .ag-wt-ranges {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .ag-wt-range {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .ag-wt-range label {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 15px;
      }
      .ag-wt-time {
        width: 108px;
        padding: 0 8px;
        font-size: 15px;
      }
      .ag-wt-dash {
        display: none;
      }
      .ag-wt-remove {
        width: 44px;
        height: 44px;
        border: 0;
        border-radius: 999px;
        background: none;
        color: var(--ag-muted);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .ag-wt-remove:hover {
        background: var(--ag-line-soft);
      }
      .ag-wt-add {
        align-self: flex-start;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 44px;
        padding: 0 4px;
        border: 0;
        background: none;
        color: var(--ag-ink);
        font: 600 15px var(--font-body), system-ui, sans-serif;
        cursor: pointer;
      }
      .ag-wt-error {
        margin: 0;
        font-size: 14px;
        color: var(--ag-red);
      }
      .ag-wt-mode {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        padding-top: 4px;
        font-size: 14px;
      }
      .ag-wt-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 40px;
        padding: 0 14px;
        border-radius: 999px;
        border: 1.5px solid ${brand.filetto};
        background: #fff;
        color: var(--ag-ink);
        font: 600 14px var(--font-body), system-ui, sans-serif;
        cursor: pointer;
      }
      .ag-wt-chip.is-on {
        border-color: var(--ag-ink);
        background: #f6f1ec;
      }
      .ag-wt-per-slot {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .ag-wt-per-slot select {
        width: 72px;
      }
      .ag-wt-special {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        font-size: 15px;
      }
      .ag-wt-special.is-open {
        flex-direction: column;
        align-items: stretch;
        padding: 12px;
        border-radius: 12px;
        background: #fffaf5;
      }
      .ag-wt-special-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .ag-wt-ghost {
        border-color: transparent;
      }
      .ag-wt-pick {
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-size: 14px;
      }
      .ag-wt-pick .ag-wt-days {
        display: flex;
        flex-wrap: wrap;
      }
      .ag-wt-pick .ag-wt-day {
        width: 56px;
      }
      .ag-wt-aside {
        display: none;
      }
      .ag-wt-aside h3 {
        font-size: 16px;
        font-weight: 600;
        margin: 0 0 12px;
      }
      .ag-wt-preview {
        display: grid;
        grid-template-columns: 28px repeat(7, minmax(0, 1fr));
        gap: 6px;
        height: 420px;
      }
      .ag-wt-preview-hours {
        position: relative;
        margin-top: 22px;
        font-size: 12px;
        color: var(--ag-muted);
      }
      .ag-wt-preview-hours span {
        position: absolute;
        left: 0;
        transform: translateY(-50%);
      }
      .ag-wt-preview-day {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }
      .ag-wt-preview-label {
        height: 18px;
        font-size: 13px;
        font-weight: 600;
        text-align: center;
      }
      .ag-wt-preview-col {
        position: relative;
        flex: 1;
        border-radius: 8px;
        background: #faf3ea;
      }
      .ag-wt-preview-free {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        color: var(--ag-muted);
      }
      .ag-wt-preview-block {
        position: absolute;
        left: 3px;
        right: 3px;
        box-sizing: border-box;
        border-radius: 6px;
        border: 1px solid #9fd0ad;
        background: var(--ag-free);
        font-size: 11px;
        font-weight: 600;
        text-align: center;
        padding-top: 3px;
        overflow: hidden;
        color: var(--ag-green-dark);
      }
      .ag-wt-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid var(--ag-line);
        font-size: 14px;
      }
      /* Tre orari pronti affiancati solo quando la colonna è larga (senza anteprima accanto). */
      @media (min-width: 720px) and (max-width: 1080px) {
        .ag-wt-presets {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }
      @media (min-width: 1081px) {
        .ag-wt-body {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 24px;
        }
        .ag-wt-aside {
          display: block;
        }
      }
      @media (max-width: 640px) {
        .ag-wt {
          padding: 16px;
        }
        .ag-wt-step {
          padding: 12px;
        }
        /* Sul telefono "08:00 – 13:00" in una riga: le scritte Dalle/alle restano per chi usa un lettore di schermo. */
        .ag-wt-word {
          display: none;
        }
        .ag-wt-dash {
          display: inline;
        }
        .ag-wt-range,
        .ag-wt-range label {
          gap: 6px;
        }
        .ag-wt-time {
          width: 104px;
        }
        .ag-wt-footer .ag-btn {
          width: 100%;
        }
      }
      .ag-links {
        display: flex;
        gap: 18px;
        flex-wrap: wrap;
      }
      .ag-fab {
        position: fixed;
        right: 16px;
        bottom: 24px;
        height: 54px;
        padding: 0 20px 0 16px;
        gap: 8px;
        border-radius: 999px;
        background: var(--ag-ink);
        color: #fff;
        border: 0;
        font: 600 15px var(--font-body), system-ui, sans-serif;
        display: none;
        align-items: center;
        box-shadow: var(--ag-float);
        z-index: 50;
        cursor: pointer;
      }

      /* Finestre */
      .ag-dialog-wrap {
        position: fixed;
        inset: 0;
        z-index: 1000;
        background: rgba(43, 36, 32, 0.35);
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 16px;
        overflow-y: auto;
      }
      .ag-dialog {
        width: 100%;
        max-width: 460px;
        margin: 48px 0;
        background: #fff;
        border-radius: 20px;
        padding: 24px;
        box-shadow: var(--ag-float);
      }
      .ag-switch {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        border: 0;
        background: #f6f1ec;
        border-radius: 14px;
        padding: 14px 16px;
        cursor: pointer;
        font: 600 14px var(--font-body), system-ui, sans-serif;
        color: var(--ag-ink);
        text-align: left;
      }
      .ag-switch i {
        margin-left: auto;
        width: 46px;
        height: 28px;
        border-radius: 999px;
        background: #e5d8c8;
        position: relative;
        flex: none;
        transition: background-color 150ms ease;
      }
      .ag-switch i::after {
        content: "";
        position: absolute;
        left: 3px;
        top: 3px;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: #fff;
        transition: transform 150ms ease;
      }
      .ag-switch[aria-checked="true"] i {
        background: var(--ag-green);
      }
      .ag-switch[aria-checked="true"] i::after {
        transform: translateX(18px);
      }

      .ag-day-only-phone {
        margin-bottom: 12px;
      }
      @media (min-width: 1081px) {
        .ag-day-only-phone {
          display: none;
        }
      }
      @media (max-width: 1080px) {
        .ag-layout {
          grid-template-columns: minmax(0, 1fr);
        }
        .ag-aside {
          display: none;
        }
      }
      @media (max-width: 640px) {
        .ag h1 {
          font-size: 26px;
        }
        .ag-toolbar .ag-summary,
        .ag-days-single,
        .ag-hide-phone {
          display: none;
        }
        .ag-fab {
          display: inline-flex;
        }
        /* Sul telefono la giornata scorre con la pagina: lo scorrimento interno
           nascondeva i lavori della sera (T5, docs/CHANGELOG.md §311). */
        .ag-grid-scroll {
          max-height: none;
          overflow: visible;
        }
        .ag-sheet {
          width: 100%;
          box-shadow: none;
          padding: 16px 16px 28px;
        }
      }
    `}</style>
  );
}
