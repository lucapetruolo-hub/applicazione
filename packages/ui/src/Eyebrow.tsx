import { Text, XStack } from "tamagui";

export type EyebrowProps = {
  children: string;
  tone?: "light" | "dark";
};

/**
 * Etichetta mono uppercase preceduta da un filetto orizzontale di 24px —
 * introduce ogni sezione, come le intestazioni di campo su un modulo
 * (brief redesign "Scheda Intervento" §1.3). Un solo pattern per tutto il
 * sito: mai testo introduttivo scritto ad-hoc altrove.
 */
export function Eyebrow({ children, tone = "light" }: EyebrowProps) {
  const textColor = tone === "dark" ? "white" : "$cianografia";
  const lineColor = tone === "dark" ? "rgba(255,255,255,0.4)" : "$cianografia";

  return (
    <XStack alignItems="center" gap="$2">
      <XStack width={24} height={1} backgroundColor={lineColor} />
      <Text fontFamily="$mono" fontSize={11} fontWeight="500" letterSpacing={0.9} textTransform="uppercase" color={textColor}>
        {children}
      </Text>
    </XStack>
  );
}
