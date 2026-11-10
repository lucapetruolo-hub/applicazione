import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import styles from "./Button.module.css";
import {
  BUTTON_FRAME_BASE,
  BUTTON_TEXT,
  BUTTON_TONES,
  FRAME_PROPS,
  ICON_GAP,
  TEXT_PROPS,
  buttonStyleOutput,
  mergeButtonStyle,
  type ButtonSize,
  type ButtonStyleMap,
  type WebButtonProps,
} from "./buttonStyle";

export { BUTTON_HEIGHT } from "./buttonStyle";
export type ButtonProps = WebButtonProps;

/*
 * Variante per il sito di Button.tsx in HTML semplice
 * (docs/changelog/2026-11-10-pulsanti-senza-tamagui.md): un `<button>` con le
 * classi di Tamagui (`is_View`, `is_Text`, `font_body`) e Button.module.css,
 * stessi attributi, misure e stati, senza il calcolo degli stili di Tamagui.
 * Le varianti stanno in buttonStyle.ts, comuni alle due versioni.
 */

const SIZE_FRAME = (size: ButtonSize) => ({
  height: `var(--t-size-${size})`,
  paddingHorizontal: `var(--t-space-${size})`,
  borderRadius: `var(--t-radius-${size})`,
});

const SIZE_TEXT = (size: ButtonSize) => ({
  fontSize: `var(--f-size-${size})`,
  lineHeight: `var(--f-lineHeight-${size})`,
  fontWeight: `var(--f-weight-${size})`,
  letterSpacing: `var(--f-letterSpacing-${size})`,
});

// Le prop che non sono stili e vanno così come sono sul `<button>`.
const STYLE_KEYS = new Set(Object.keys(FRAME_PROPS));

export function Button({ children, variant, icon, size, color, fontSize, className, onPress, disabled, ...rest }: WebButtonProps) {
  const tone = variant ?? "default";
  const sizeKey = size ?? "4";

  // Riquadro: base, misura, variante, icona e poi le prop della pagina
  // nell'ordine in cui sono scritte (come ButtonFrame in Button.tsx).
  const frame: ButtonStyleMap = {};
  mergeButtonStyle(frame, BUTTON_FRAME_BASE, FRAME_PROPS);
  mergeButtonStyle(frame, SIZE_FRAME(sizeKey), FRAME_PROPS);
  mergeButtonStyle(frame, BUTTON_TONES[tone], FRAME_PROPS);
  if (icon) mergeButtonStyle(frame, { gap: ICON_GAP }, FRAME_PROPS);
  mergeButtonStyle(frame, rest, FRAME_PROPS);
  const frameOut = buttonStyleOutput(frame, "f", styles);

  const domProps: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) if (!STYLE_KEYS.has(key)) domProps[key] = value;

  // Testo: misura del font `body` come in Tamagui 1, ma 16 px per la misura
  // "3" e senza misura (docs/CHANGELOG.md §305).
  const textStyle: ButtonStyleMap = {};
  const variantText = BUTTON_TEXT[tone];
  mergeButtonStyle(
    textStyle,
    {
      ...SIZE_TEXT(sizeKey),
      ...(size === undefined || size === "3" ? { fontSize: 16 } : null),
      color: variantText.color,
      ...(variantText.fontFamily ? { fontFamily: "var(--f-family)" } : null),
      ...(variantText.fontWeight ? { fontWeight: variantText.fontWeight } : null),
      ...(color !== undefined ? { color } : null),
      ...(fontSize !== undefined ? { fontSize } : null),
    },
    TEXT_PROPS,
  );
  const textOut = buttonStyleOutput(textStyle, "t", styles);
  const textClass = `is_Text${variantText.fontFamily ? " font_body" : ""} ${styles.text} ${textOut.className} is_Button`;

  return (
    <button
      role="button"
      {...domProps}
      {...(disabled ? { "aria-disabled": true, disabled: true } : { onClick: onPress })}
      className={`is_View ${styles.frame} ${frameOut.className}${disabled ? ` ${styles.disabled}` : ""} is_Button${className ? ` ${className}` : ""}`}
      style={frameOut.style}
    >
      {icon ?? null}
      {wrapText(children, textClass, textOut.style)}
    </button>
  );
}

/** Mette il testo scritto dentro il pulsante in uno `span`, come ButtonText di Tamagui 1. */
function wrapText(children: ReactNode, className: string, style: Record<string, string>) {
  const out: ReactNode[] = [];
  let pending: (string | number)[] = [];
  const flush = () => {
    if (!pending.length) return;
    out.push(
      <span key={`t${out.length}`} className={className} style={style}>
        {pending.join("")}
      </span>,
    );
    pending = [];
  };
  Children.forEach(children, (child) => {
    if (typeof child === "string" || typeof child === "number") {
      pending.push(child);
      return;
    }
    flush();
    if (child === null || child === undefined || typeof child === "boolean") return;
    out.push(isValidElement(child) && child.key === null ? cloneElement(child, { key: `e${out.length}` }) : child);
  });
  flush();
  return out;
}
