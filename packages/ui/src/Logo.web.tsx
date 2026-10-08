import { Text, XStack } from "tamagui";
import { brand } from "./tokens";

export type LogoProps = {
  /** Nome del marchio scritto accanto al quadrato: arriva da `BRAND.name` (`packages/shared/src/brand.ts`). */
  name: string;
  /** "full" = marchio + nome; "mark" = solo il quadrato, per spazi stretti (favicon, avatar app). */
  variant?: "full" | "mark";
  size?: number;
};

/**
 * Variante web del logo: SVG DOM piatto invece di react-native-svg — il suo
 * shim per il web importa a sua volta @react-native/assets-registry
 * (sintassi Flow non parsabile dal webpack di Next.js, anche passando dal
 * suo entry point ".web.js"). Stessa resa visiva della variante nativa
 * (Logo.tsx), nessuna dipendenza in comune. Vedi icons.tsx/icons.web.tsx
 * per lo stesso pattern di split già usato per le icone Lucide.
 */
function Mark({ size, label }: { size: number; label?: string }) {
  // Da solo (variant "mark", telefoni) il quadrato è l'unico segno del
  // marchio: gli screen reader lo leggono col nome. Accanto al nome scritto
  // è decorativo e viene saltato, per non leggerlo due volte.
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" {...a11y}>
      <rect width={28} height={28} rx={9} fill={brand.cianografia} />
      <line x1={9} y1={7} x2={9} y2={21} stroke="white" strokeWidth={2.2} strokeLinecap="round" />
      <line x1={9} y1={21} x2={21} y2={21} stroke="white" strokeWidth={2.2} strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ name, variant = "full", size = 28 }: LogoProps) {
  if (variant === "mark") {
    return <Mark size={size} label={name} />;
  }

  return (
    <XStack alignItems="center" gap="$2">
      <Mark size={size} />
      <Text fontFamily="$heading" fontWeight="800" fontSize={size * 0.7} letterSpacing={-0.5} color={brand.grafite}>
        {name}
      </Text>
    </XStack>
  );
}
