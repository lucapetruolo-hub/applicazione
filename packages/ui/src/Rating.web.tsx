import { Icon } from "./Icon";
import type { RatingProps } from "./ratingProps";
import { brand } from "./tokens";
import styles from "./Rating.module.css";

export type { RatingProps } from "./ratingProps";

/**
 * Variante per il sito di `Rating` (Rating.tsx) in HTML semplice
 * (docs/changelog/2026-11-09-pagine-pubbliche-senza-tamagui.md): stesso
 * aspetto, senza il calcolo degli stili di Tamagui. Se cambia Rating.tsx, va
 * cambiato anche qui.
 */
export function Rating({ value, count, size = 16, textSize = 16 }: RatingProps) {
  return (
    <div className={`is_View ${styles.row}`}>
      <div className={`is_View ${styles.stars}`}>
        {[1, 2, 3, 4, 5].map((position) => (
          <Icon
            key={position}
            name="star"
            size={size}
            color={position <= Math.round(value) ? brand.ottone : brand.filetto}
            fill={position <= Math.round(value) ? brand.ottone : "none"}
          />
        ))}
      </div>
      <span className={`is_Text ${styles.value}`} style={{ fontSize: textSize }}>
        {/* Con la virgola, come in italiano (docs/CHANGELOG.md §342; stessa regola di formatRating in shared). */}
        {value.toFixed(1).replace(".", ",")}
      </span>
      {count !== undefined ? (
        <span className={`is_Text ${styles.count}`} style={{ fontSize: textSize }}>
          ({count} recension{count === 1 ? "e" : "i"})
        </span>
      ) : null}
    </div>
  );
}
