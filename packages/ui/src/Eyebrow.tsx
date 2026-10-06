import { Text, XStack } from "tamagui";
import { brand } from "./tokens";

export type EyebrowProps = {
  children: string;
  tone?: "light" | "dark";
};

/**
 * Pillola introduttiva di sezione — sostituisce il filetto+mono maiuscolo
 * di "Scheda Intervento" (CLAUDE.md §19, brief "Vicinato"): un'etichetta
 * da modulo tecnico non si addice più al registro del sito. Un solo
 * pattern per tutto il sito: mai testo introduttivo scritto ad-hoc altrove.
 */
export function Eyebrow({ children, tone = "light" }: EyebrowProps) {
  const bg = tone === "dark" ? "rgba(255,255,255,0.16)" : brand.cianografiaVelo;
  const textColor = tone === "dark" ? "white" : brand.cianografiaScuro;

  return (
    <XStack alignSelf="flex-start" backgroundColor={bg} paddingHorizontal="$3" paddingVertical={6} borderRadius={999}>
      <Text fontFamily="$body" fontSize={12.5} fontWeight="700" color={textColor}>
        {children}
      </Text>
    </XStack>
  );
}
