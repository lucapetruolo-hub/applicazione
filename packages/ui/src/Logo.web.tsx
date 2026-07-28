import { Text, XStack } from "tamagui";
import { brand } from "./tokens";

export type LogoProps = {
  /** "full" = marchio + wordmark "Professionisti"; "mark" = solo il quadrato, per spazi stretti (favicon, avatar app). */
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
function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28">
      <rect width={28} height={28} rx={6} fill={brand.cianografia} />
      <line x1={9} y1={7} x2={9} y2={21} stroke="white" strokeWidth={2.2} strokeLinecap="round" />
      <line x1={9} y1={21} x2={21} y2={21} stroke="white" strokeWidth={2.2} strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ variant = "full", size = 28 }: LogoProps) {
  if (variant === "mark") {
    return <Mark size={size} />;
  }

  return (
    <XStack alignItems="center" gap="$2">
      <Mark size={size} />
      <Text fontFamily="$heading" fontWeight="800" fontSize={size * 0.7} letterSpacing={-0.5} color={brand.grafite}>
        Professionisti
      </Text>
    </XStack>
  );
}
