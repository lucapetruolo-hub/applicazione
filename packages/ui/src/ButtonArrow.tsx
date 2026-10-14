import { XStack } from "tamagui";
import { Icon } from "./Icon";
import { brand } from "./tokens";

export type ButtonArrowProps = {
  /** "light": cerchio bianco trasparente su pulsante colorato; "red": il puntino rosso del pulsante di acquisto. */
  tone?: "light" | "red";
  size?: number;
};

/**
 * Freccia in un cerchio alla fine dei pulsanti delle azioni principali
 * (docs/CHANGELOG.md §233). Sul web ruota di 45° in 350ms al passaggio del
 * mouse sul pulsante (`.button-arrow` in apps/web/src/app/globals.css).
 */
export function ButtonArrow({ tone = "light", size = 26 }: ButtonArrowProps) {
  return (
    <XStack
      className="button-arrow"
      width={size}
      height={size}
      borderRadius={999}
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
      marginRight={-12}
      backgroundColor={tone === "red" ? brand.urgenza : "rgba(255,255,255,0.22)"}
      aria-hidden
    >
      <Icon name="arrow-right" size={Math.round(size * 0.58)} color="white" strokeWidth={2.25} />
    </XStack>
  );
}
