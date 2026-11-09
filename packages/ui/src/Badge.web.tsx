import type { BadgeProps } from "./badgeProps";
import styles from "./Badge.module.css";

export type { BadgeProps, BadgeVariant } from "./badgeProps";

/*
 * Variante per il sito di Badge.tsx in HTML semplice
 * (docs/changelog/2026-11-09-pagine-pubbliche-senza-tamagui.md): stesso
 * aspetto, senza il calcolo degli stili di Tamagui. Se cambia l'altro file, va
 * cambiato anche qui (i colori delle varianti stanno in Badge.module.css).
 */
export function Badge({ variant, children }: BadgeProps) {
  return (
    <div className={`is_View ${styles.badge} ${styles[variant]}`}>
      <span className={`is_Text font_body ${styles.text}`}>{children}</span>
    </div>
  );
}
