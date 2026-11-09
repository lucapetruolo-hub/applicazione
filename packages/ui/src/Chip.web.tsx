import type { ChipProps } from "./chipProps";
import styles from "./Chip.module.css";

export type { ChipProps } from "./chipProps";

/*
 * Variante per il sito di Chip.tsx in HTML semplice
 * (docs/changelog/2026-11-09-pagine-pubbliche-senza-tamagui.md): stesso
 * aspetto e stessi tasti (Invio e Spazio), senza il calcolo degli stili di
 * Tamagui. Se cambia l'altro file, va cambiato anche qui.
 */
export function Chip({ children, selected = false, onPress }: ChipProps) {
  return (
    <div
      className={`is_View ${styles.chip} ${selected ? styles.selected : ""} ${onPress ? styles.pressable : ""}`}
      role={onPress ? "button" : undefined}
      tabIndex={onPress ? 0 : undefined}
      aria-pressed={onPress ? selected : undefined}
      onClick={onPress}
      onKeyDown={
        onPress
          ? (event) => {
              if (event.key !== " " && event.key !== "Enter") return;
              event.preventDefault();
              onPress();
            }
          : undefined
      }
    >
      <span className={`is_Text ${styles.text}`}>{children}</span>
    </div>
  );
}
