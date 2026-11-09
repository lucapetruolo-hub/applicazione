import type { CSSProperties } from "react";
import styles from "./PhotoBox.module.css";

/** Classi e variabili del riquadro di PhotoBox.module.css: larghezza, altezza e angoli, con quelli del telefono se ci sono. */
export function photoBox(
  size: { width: number; height: number; radius: number },
  phone?: { width: number; height: number; radius: number },
): { className: string; style: CSSProperties } {
  const style: Record<string, string> = {
    "--box-w": `${size.width}px`,
    "--box-h": `${size.height}px`,
    "--box-r": `${size.radius}px`,
  };
  if (phone) {
    style["--box-phone-w"] = `${phone.width}px`;
    style["--box-phone-h"] = `${phone.height}px`;
    style["--box-phone-r"] = `${phone.radius}px`;
  }
  return { className: `is_View ${styles.box}${phone ? ` ${styles.phone}` : ""}`, style: style as CSSProperties };
}

export { styles as photoBoxStyles };
