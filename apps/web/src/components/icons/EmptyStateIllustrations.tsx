import type { SVGProps } from "react";
import { brand } from "@professionisti/ui";

/**
 * Illustrazioni per due stati vuoti reali ad alto traffico (`/le-mie-
 * richieste`, `/professionisti-salvati`) — stesso principio/stessa "spilla"
 * d'angolo (ottone) già introdotto per `HowItWorksIllustrations.tsx`: un
 * linguaggio visivo condiviso tra le due superfici, non un disegno isolato
 * per pagina. `EmptyState` (packages/ui) resta comunque retrocompatibile
 * con la sola `icon` Lucide per ogni altro stato vuoto del sito non
 * toccato in questo giro.
 */
type IllustrationProps = SVGProps<SVGSVGElement> & { size?: number; accentColor?: string };

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

/** "Nessuna richiesta inviata": un blocco appunti ancora vuoto. */
export function EmptyRequestsIllustration(props: IllustrationProps) {
  const { accentColor = brand.ottone } = props;
  return (
    <svg {...base(props)}>
      <rect x="6" y="4" width="12" height="16" rx="2" />
      <rect x="9" y="2.5" width="6" height="3" rx="1" fill="none" />
      <path d="M9 10.5h6" strokeDasharray="1.5 2.5" />
      <path d="M9 14h6" strokeDasharray="1.5 2.5" />
      <circle cx="19" cy="4" r="2" fill={accentColor} stroke="none" />
    </svg>
  );
}

/** "Nessun professionista salvato": un cuore con dentro una casetta. */
export function EmptySavedIllustration(props: IllustrationProps) {
  const { accentColor = brand.ottone } = props;
  return (
    <svg {...base(props)}>
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
      <path d="M9.5 10.3 12 8.3l2.5 2" />
      <path d="M10 10.3v2h4v-2" />
      <circle cx="19" cy="4" r="2" fill={accentColor} stroke="none" />
    </svg>
  );
}
