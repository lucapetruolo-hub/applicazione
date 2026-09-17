import type { SVGProps } from "react";
import { brand } from "@professionisti/ui";

/**
 * Piccole illustrazioni disegnate a mano per "Come funziona" (homepage) —
 * richiesta esplicita dell'utente ("rendi più innovativa la homepage"),
 * scelta tra le proposte come alternativa al pattern generico "icona
 * Lucide in un cerchio colorato" usato ovunque nel resto del sito (badge
 * categoria, stati, notifiche): qui un disegno a più tratti, specifico per
 * ciascuno dei tre passaggi, non un singolo glifo intercambiabile. Stesso
 * pattern tecnico già in uso per `CategoryIcons.tsx` (stroke 1.75,
 * `currentColor`, viewBox 24×24) — così restano coerenti con il resto del
 * registro icone del sito, solo più elaborate. Il pallino pieno in alto a
 * destra (`accentColor`, ottone) è lo stesso identico dettaglio su tutte e
 * tre: una "spilla" fissa che lega visivamente il trio come un unico set,
 * non un elemento a caso per icona.
 */
export type IllustrationProps = SVGProps<SVGSVGElement> & { size?: number; accentColor?: string };

function base(props: IllustrationProps) {
  const { size = 24, accentColor, ...rest } = props;
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...rest,
  };
}

/** Passo 1 — "Raccontaci il problema": una foto in una nuvoletta di chat. */
export function RequestPhotoIllustration(props: IllustrationProps) {
  const { accentColor = brand.ottone } = props;
  return (
    <svg {...base(props)}>
      <path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 3v-3H6a2 2 0 0 1-2-2V5Z" />
      <rect x="7.5" y="6.5" width="9" height="6" rx="1.3" />
      <circle cx="10" cy="9" r="1" fill="currentColor" stroke="none" />
      <path d="M8.5 12 11 9.5l2 2 1.5-1.5 2 2" />
      <circle cx="19" cy="4" r="2" fill={accentColor} stroke="none" />
    </svg>
  );
}

/** Passo 2 — "Ricevi preventivi chiari": un documento con le voci separate. */
export function ClearQuoteIllustration(props: IllustrationProps) {
  const { accentColor = brand.ottone } = props;
  return (
    <svg {...base(props)}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 9h8" />
      <path d="M8 12.5h8" />
      <path d="M8 16h5" />
      <circle cx="19" cy="4" r="2" fill={accentColor} stroke="none" />
    </svg>
  );
}

/** Passo 3 — "Scegli e prenota": un calendario con la conferma. */
export function BookConfirmIllustration(props: IllustrationProps) {
  const { accentColor = brand.ottone } = props;
  return (
    <svg {...base(props)}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 9.5h16" />
      <path d="M8 3v3" />
      <path d="M16 3v3" />
      <path d="M9 13.5 11 15.5 15.5 11" />
      <circle cx="19" cy="4" r="2" fill={accentColor} stroke="none" />
    </svg>
  );
}
