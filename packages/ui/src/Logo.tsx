import Svg, { Line, Rect } from "react-native-svg";
import { Text, XStack } from "tamagui";
import { brand } from "./tokens";

export type LogoProps = {
  /** "full" = marchio + wordmark "Professionisti"; "mark" = solo il quadrato, per spazi stretti (favicon, avatar app). */
  variant?: "full" | "mark";
  size?: number;
};

/**
 * Marchio quadrato in blu cianografia con un glifo bianco a due tratti
 * (squadra da disegno, in tema col linguaggio "Scheda Intervento" — brief
 * redesign §2.1). SVG via react-native-svg, così il logo resta portabile su
 * mobile anche se oggi lo consuma solo apps/web (SiteHeader/SiteFooter).
 */
function Mark({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28">
      <Rect width={28} height={28} rx={6} fill={brand.cianografia} />
      <Line x1={9} y1={7} x2={9} y2={21} stroke="white" strokeWidth={2.2} strokeLinecap="round" />
      <Line x1={9} y1={21} x2={21} y2={21} stroke="white" strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
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
