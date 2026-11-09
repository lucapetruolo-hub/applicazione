import { Icon } from "./Icon";
import type { EmptyStateProps } from "./emptyStateProps";
import { brand } from "./tokens";
import styles from "./EmptyState.module.css";

export type { EmptyStateProps } from "./emptyStateProps";

/*
 * Variante per il sito di EmptyState.tsx in HTML semplice
 * (docs/changelog/2026-11-09-pagine-pubbliche-senza-tamagui.md): stesso
 * aspetto, senza il calcolo degli stili di Tamagui. Se cambia l'altro file, va
 * cambiato anche qui.
 */
export function EmptyState({ icon, title, description, action, illustration }: EmptyStateProps) {
  return (
    <div className={`is_View ${styles.root}`}>
      <div className={`is_View ${styles.circle}`}>
        {illustration ?? <Icon name={icon} size={26} color={brand.cianografiaScuro} strokeWidth={1.5} />}
      </div>
      <span className={`is_Text font_heading ${styles.title}`}>{title}</span>
      {description ? <p className={`is_Text font_body ${styles.description} tm-paragraph`}>{description}</p> : null}
      {action}
    </div>
  );
}
