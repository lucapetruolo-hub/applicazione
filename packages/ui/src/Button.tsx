import { Children, cloneElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { Text, XStack, styled } from "tamagui";
import type { FontSizeTokens, SizeTokens } from "tamagui";
import { brand } from "./tokens";

export const BUTTON_HEIGHT = 44;
const PILL = 999;
/** Quasi nero caldo del pulsante di acquisto dell'abbonamento. */
const INCHIOSTRO = "#1A1513";

/*
 * Pulsante del sito e dell'app, fatto da noi su XStack e Text
 * (docs/changelog/2026-11-02-tamagui-3.md). Con Tamagui 3 il `Button` di
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
 * sono quelle usate dalle pagine.
 */
const ButtonFrame = styled(XStack, {
  displayName: "Button",
  className: "is_Button",
  render: "button",
  role: "button",
  justifyContent: "center",
  alignItems: "center",
  flexWrap: "nowrap",
  cursor: "pointer",
  borderWidth: 1,
  borderColor: "transparent",
  outlineColor: "focus-visible:outlineColor",
  outlineStyle: "focus-visible:solid",
  outlineWidth: "focus-visible:2px",
  variants: {
    size: styled.dynamic<SizeTokens>((val, { tokens }) => {
      const key = String(val).replace(/^\$/, "") as keyof typeof tokens.size;
      return {
        height: tokens.size[key],
        paddingHorizontal: tokens.space[key as keyof typeof tokens.space],
        borderRadius: tokens.radius[key as keyof typeof tokens.radius] ?? tokens.radius["4"],
      };
    }),
    // Pulsanti "vivi" (docs/CHANGELOG.md §233, scelta dell'utente): forma a
    // pillola piena e altezza 44 (minimo per il tocco). La pressione (scale
    // .97) è in CSS su `.is_Button` in apps/web/src/app/globals.css, così ha
    // una transizione morbida senza driver di animazione Tamagui.
    tone: {
      default: {
        borderRadius: PILL,
        backgroundColor: "blue10 hover:blue9 press:blue8",
      },
      primary: {
        height: BUTTON_HEIGHT,
        paddingHorizontal: 24,
        borderRadius: PILL,
        backgroundColor: `${brand.cianografiaPieno} hover:${brand.cianografiaScuro} press:${brand.cianografiaScuro}`,
        borderWidth: 0,
        outlineWidth: "focus:2px",
        outlineColor: `focus:${brand.cianografia}`,
        outlineStyle: "focus:solid",
        outlineOffset: "focus:2px",
      },
      secondary: {
        height: BUTTON_HEIGHT,
        paddingHorizontal: 24,
        borderRadius: PILL,
        backgroundColor: `transparent hover:${brand.gesso} press:${brand.filetto}`,
        borderWidth: 1,
        borderColor: brand.grafite,
        outlineWidth: "focus:2px",
        outlineColor: `focus:${brand.cianografia}`,
        outlineStyle: "focus:solid",
        outlineOffset: "focus:2px",
      },
      ghost: {
        height: BUTTON_HEIGHT,
        paddingHorizontal: 24,
        borderRadius: PILL,
        backgroundColor: `transparent hover:${brand.gesso} press:${brand.filetto}`,
        borderWidth: 0,
        outlineWidth: "focus:2px",
        outlineColor: `focus:${brand.cianografia}`,
        outlineStyle: "focus:solid",
        outlineOffset: "focus:2px",
      },
      // Quasi nero delle regole Taste (docs/CHANGELOG.md §288-§289). Dal
      // 24/10/2026 nessuna pagina lo usa più: l'utente ha scelto il verde per
      // tutti i pulsanti principali, anche in accesso e registrazione (§349).
      scuro: {
        height: BUTTON_HEIGHT,
        paddingHorizontal: 24,
        borderRadius: PILL,
        backgroundColor: `${brand.grafite} hover:#463B35 press:#463B35`,
        borderWidth: 0,
        outlineWidth: "focus:2px",
        outlineColor: `focus:${brand.cianografia}`,
        outlineStyle: "focus:solid",
        outlineOffset: "focus:2px",
      },
      // Solo nel flusso urgenza (CLAUDE.md, colore semantico: mai decorativo altrove).
      urgent: {
        height: BUTTON_HEIGHT,
        paddingHorizontal: 24,
        borderRadius: PILL,
        backgroundColor: `${brand.urgenza} hover:#A82A21 press:#A82A21`,
        borderWidth: 0,
        outlineWidth: "focus:2px",
        outlineColor: `focus:${brand.urgenza}`,
        outlineStyle: "focus:solid",
        outlineOffset: "focus:2px",
      },
      // Solo per comprare l'abbonamento (scelta dell'utente, §233): quasi
      // nero con il cerchio rosso della freccia (`ButtonArrow tone="red"`).
      acquisto: {
        height: BUTTON_HEIGHT,
        paddingHorizontal: 24,
        borderRadius: PILL,
        backgroundColor: `${INCHIOSTRO} hover:${brand.grafite} press:${brand.grafite}`,
        borderWidth: 0,
        outlineWidth: "focus:2px",
        outlineColor: `focus:${INCHIOSTRO}`,
        outlineStyle: "focus:solid",
        outlineOffset: "focus:2px",
      },
    },
    disabled: {
      true: { pointerEvents: "none" },
    },
  } as const,
  defaultVariants: {
    size: "4",
    tone: "default",
  },
});

type ButtonVariant = "primary" | "secondary" | "ghost" | "scuro" | "urgent" | "acquisto";

/** Colore, carattere e peso del testo di ogni variante. */
const VARIANT_TEXT: Record<ButtonVariant | "default", { color: string; fontFamily?: "body"; fontWeight?: "600" }> = {
  default: { color: "white" },
  primary: { color: "white", fontFamily: "body", fontWeight: "600" },
  secondary: { color: brand.grafite, fontFamily: "body", fontWeight: "600" },
  ghost: { color: brand.grafite, fontFamily: "body", fontWeight: "600" },
  scuro: { color: "white", fontFamily: "body", fontWeight: "600" },
  urgent: { color: "white", fontFamily: "body", fontWeight: "600" },
  acquisto: { color: "white", fontFamily: "body", fontWeight: "600" },
};

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
    ...VARIANT_TEXT[variant ?? "default"],
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

// Tamagui 1: spazio dopo l'icona = misura del testo (14 px) × 0,66.
const ICON_GAP = 9.24;
