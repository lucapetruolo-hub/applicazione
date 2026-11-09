import styles from "./PriceLine.module.css";
import { brand } from "./tokens";

/*
 * Variante per il sito di PriceLine.tsx in HTML semplice
 * (docs/changelog/2026-11-09-pagine-pubbliche-senza-tamagui.md): stesso
 * aspetto, senza il calcolo degli stili di Tamagui. Se cambia l'altro file, va
 * cambiato anche qui.
 */
export function PriceLine({ label, price, unit, labelColor = brand.grafite70 }: { label: string; price: string; unit?: string; labelColor?: string }) {
  const isAmount = /\d/.test(price);
  return (
    <div className={`is_View ${styles.line}`}>
      <span className={`is_Text ${styles.label}`} style={{ color: labelColor }}>
        {label}
      </span>
      <div className={`is_View ${styles.spacer}`} />
      {unit ? <span className={`is_Text ${styles.unit}`}>{unit}</span> : null}
      <span className={`is_Text font_body ${styles.price}${isAmount ? ` ${styles.amount}` : ""}`}>{price}</span>
    </div>
  );
}
