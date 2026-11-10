import { Children, cloneElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { Text, XStack, styled } from "tamagui";
import type { FontSizeTokens, SizeTokens } from "tamagui";
import { BUTTON_FRAME_BASE, BUTTON_TEXT, BUTTON_TONES, ICON_GAP, type ButtonVariant } from "./buttonStyle";

export { BUTTON_HEIGHT } from "./buttonStyle";

/*
 * Pulsante dell'app, fatto da noi su XStack e Text
 * (docs/changelog/2026-11-02-tamagui-3.md). Il sito usa Button.web.tsx, in
 * HTML semplice (docs/changelog/2026-11-10-pulsanti-senza-tamagui.md): le
 * varianti stanno in buttonStyle.ts, comuni alle due versioni, e un
 * cambiamento qui va fatto anche lì. Con Tamagui 3 il `Button` di
 * Tamagui è un altro componente (misure "sm/md/lg" come shadcn, tema
 * "level2", niente classe `is_Button`): qui c'è lo stesso pulsante di
 * Tamagui 1, misura per misura, così nessuna pagina cambia aspetto.
 *
 * - `size` ("1"…"5", di serie "4"): altezza dal token `size`, margini
 *   interni dal token `space`, angoli dal token `radius`, e la misura del
 *   testo dal font `body` (come `getButtonSized` di Tamagui 1).
 * - Il testo scritto dentro va in un `ButtonText` su una riga sola, con i
 *   puntini se non ci sta.
 * - `icon`: un'icona prima del testo, staccata come in Tamagui 1.
 * - Classe `is_Button` per le regole di apps/web/src/app/globals.css
 *   (pressione, anello del fuoco, freccia che ruota).
 *
 * `variant` è opzionale: senza di esso il bottone resta quello di sempre
 * (sfondo $blue10). Le varianti ("Scheda Intervento", brief redesign §3)
 * sono quelle usate dalle pagine (`BUTTON_TONES` in buttonStyle.ts).
 */
const ButtonFrame = styled(XStack, {
  displayName: "Button",
  className: "is_Button",
  render: "button",
  role: "button",
  ...BUTTON_FRAME_BASE,
  variants: {
    size: styled.dynamic<SizeTokens>((val, { tokens }) => {
      const key = String(val).replace(/^\$/, "") as keyof typeof tokens.size;
      return {
        height: tokens.size[key],
        paddingHorizontal: tokens.space[key as keyof typeof tokens.space],
        borderRadius: tokens.radius[key as keyof typeof tokens.radius] ?? tokens.radius["4"],
      };
    }),
    // Varianti comuni con il sito in buttonStyle.ts.
    tone: BUTTON_TONES,
    disabled: {
      true: { pointerEvents: "none" },
    },
  } as const,
  defaultVariants: {
    size: "4",
    tone: "default",
  },
});

/*
 * Testo del pulsante: misura dal font `body` come in Tamagui 1, ma 16 px per
 * la misura "3" e senza misura (testo base del sistema unico, docs/CHANGELOG.md
 * §305; prima lo faceva una regola di globals.css sulle classi di Tamagui 1).
 */
const ButtonText = styled(Text, {
  displayName: "ButtonText",
  className: "is_Button",
  render: "span",
  userSelect: "none",
  cursor: "pointer",
  flexGrow: 0,
  flexShrink: 1,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  variants: {
    size: styled.dynamic<FontSizeTokens>((val, { font }) => {
      if (!font) return;
      const key = String(val).replace(/^\$/, "") as keyof typeof font.size;
      return {
        fontSize: font.size[key],
        lineHeight: font.lineHeight?.[key as keyof typeof font.lineHeight],
        fontWeight: font.weight?.[key as keyof typeof font.weight],
        letterSpacing: font.letterSpacing?.[key as keyof typeof font.letterSpacing],
      };
    }),
  } as const,
});

type ButtonFrameProps = ComponentProps<typeof ButtonFrame>;
export type ButtonProps = Omit<ButtonFrameProps, "tone" | "size"> & {
  variant?: ButtonVariant;
  size?: "1" | "2" | "3" | "4" | "5";
  /** Icona prima del testo. */
  icon?: ReactElement;
  /** Colore del testo, al posto di quello della variante. */
  color?: string;
  fontSize?: number;
};

/** Mette il testo scritto dentro il pulsante in `ButtonText`, come Tamagui 1. */
function wrapText(children: ReactNode, textProps: ComponentProps<typeof ButtonText>) {
  const out: ReactNode[] = [];
  let pending: (string | number)[] = [];
  const flush = () => {
    if (!pending.length) return;
    out.push(
      <ButtonText key={`t${out.length}`} className="is_Button" {...textProps}>
        {pending.join("")}
      </ButtonText>,
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

export function Button({ children, variant, icon, size, color, fontSize, className, ...rest }: ButtonProps) {
  const textProps = {
    size: size ?? "4",
    ...(size === undefined || size === "3" ? { fontSize: 16 } : null),
    ...BUTTON_TEXT[variant ?? "default"],
    ...(color !== undefined ? { color } : null),
    ...(fontSize !== undefined ? { fontSize } : null),
  } as ComponentProps<typeof ButtonText>;
  return (
    <ButtonFrame size={size ?? "4"} tone={variant ?? "default"} {...(icon ? { gap: ICON_GAP } : null)} {...rest} className={className ? `is_Button ${className}` : "is_Button"}>
      {icon ?? null}
      {wrapText(children, textProps)}
    </ButtonFrame>
  );
}

