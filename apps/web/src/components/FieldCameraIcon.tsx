import { useId } from "react";

/**
 * Fotocamera del tasto "Foto" dentro i campi di testo (ricerca in home e
 * "Descrivi il lavoro", docs/changelog/2026-11-13-foto-nel-campo-di-ricerca.md):
 * contorno verde di marca, dentro la sfumatura dello sfondo del sito (pesca,
 * azzurro, menta, senza rosa: scelta di Luca). Decorativa: il nome lo dà il tasto.
 */
export function FieldCameraIcon({ size = 22 }: { size?: number }) {
  const gradient = `camera-${useId().replace(/:/g, "")}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6c39b" />
          <stop offset="0.5" stopColor="#9cc8ec" />
          <stop offset="1" stopColor="#8fd6b0" />
        </linearGradient>
      </defs>
      <path
        d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"
        fill={`url(#${gradient})`}
        stroke="#1e6b6e"
        strokeWidth="1.8"
      />
      <circle
        cx="12"
        cy="13"
        r="3.2"
        fill="#ffffff"
        stroke="#1e6b6e"
        strokeWidth="1.8"
      />
    </svg>
  );
}
