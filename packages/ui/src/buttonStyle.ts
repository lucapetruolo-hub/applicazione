import type { AriaAttributes, AriaRole, MouseEvent, ReactElement, ReactNode } from "react";
import { brand } from "./tokens";

/*
 * Pulsante: valori comuni alla versione per l'app (Button.tsx, con Tamagui) e
 * a quella per il sito (Button.web.tsx, in HTML semplice,
 * docs/changelog/2026-11-10-pulsanti-senza-tamagui.md). Le varianti si
 * scrivono qui una volta sola, con i valori "piatti" di Tamagui 3
 * (`"verde hover:verdeScuro press:verdeScuro"`): Tamagui li legge così come
 * sono, il sito li traduce in CSS con `resolveButtonStyles`.
 */

export const BUTTON_HEIGHT = 44;
const PILL = 999;
/** Quasi nero caldo del pulsante di acquisto dell'abbonamento. */
const INCHIOSTRO = "#1A1513";
/** Tamagui 1: spazio dopo l'icona = misura del testo (14 px) × 0,66. */
export const ICON_GAP = 9.24;

export type ButtonVariant = "primary" | "secondary" | "ghost" | "scuro" | "urgent" | "acquisto";
export type ButtonSize = "1" | "2" | "3" | "4" | "5";
export type ButtonTone = ButtonVariant | "default";

/** Stili di base del riquadro, prima di misura e variante. */
export const BUTTON_FRAME_BASE = {
  justifyContent: "center",
  alignItems: "center",
  flexWrap: "nowrap",
  cursor: "pointer",
  borderWidth: 1,
  borderColor: "transparent",
  outlineColor: "focus-visible:outlineColor",
  outlineStyle: "focus-visible:solid",
  outlineWidth: "focus-visible:2px",
} as const;

const focusRing = (color: string) =>
  ({
    outlineWidth: "focus:2px",
    outlineColor: `focus:${color}`,
    outlineStyle: "focus:solid",
    outlineOffset: "focus:2px",
  }) as const;

/*
 * Pulsanti "vivi" (docs/CHANGELOG.md §233, scelta dell'utente): forma a
 * pillola piena e altezza 44 (minimo per il tocco). La pressione (scale .97)
 * è in CSS su `.is_Button` in apps/web/src/app/globals.css.
 */
export const BUTTON_TONES = {
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
    ...focusRing(brand.cianografia),
  },
  secondary: {
    height: BUTTON_HEIGHT,
    paddingHorizontal: 24,
    borderRadius: PILL,
    backgroundColor: `transparent hover:${brand.gesso} press:${brand.filetto}`,
    borderWidth: 1,
    borderColor: brand.grafite,
    ...focusRing(brand.cianografia),
  },
  ghost: {
    height: BUTTON_HEIGHT,
    paddingHorizontal: 24,
    borderRadius: PILL,
    backgroundColor: `transparent hover:${brand.gesso} press:${brand.filetto}`,
    borderWidth: 0,
    ...focusRing(brand.cianografia),
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
    ...focusRing(brand.cianografia),
  },
  // Solo nel flusso urgenza (CLAUDE.md, colore semantico: mai decorativo altrove).
  urgent: {
    height: BUTTON_HEIGHT,
    paddingHorizontal: 24,
    borderRadius: PILL,
    backgroundColor: `${brand.urgenza} hover:#A82A21 press:#A82A21`,
    borderWidth: 0,
    ...focusRing(brand.urgenza),
  },
  // Solo per comprare l'abbonamento (scelta dell'utente, §233): quasi nero con
  // il cerchio rosso della freccia (`ButtonArrow tone="red"`).
  acquisto: {
    height: BUTTON_HEIGHT,
    paddingHorizontal: 24,
    borderRadius: PILL,
    backgroundColor: `${INCHIOSTRO} hover:${brand.grafite} press:${brand.grafite}`,
    borderWidth: 0,
    ...focusRing(INCHIOSTRO),
  },
} as const;

/** Colore, carattere e peso del testo di ogni variante. */
export const BUTTON_TEXT: Record<ButtonTone, { color: string; fontFamily?: "body"; fontWeight?: "600" }> = {
  default: { color: "white" },
  primary: { color: "white", fontFamily: "body", fontWeight: "600" },
  secondary: { color: brand.grafite, fontFamily: "body", fontWeight: "600" },
  ghost: { color: brand.grafite, fontFamily: "body", fontWeight: "600" },
  scuro: { color: "white", fontFamily: "body", fontWeight: "600" },
  urgent: { color: "white", fontFamily: "body", fontWeight: "600" },
  acquisto: { color: "white", fontFamily: "body", fontWeight: "600" },
};

/*
 * ---- Sito: dagli stili di Tamagui alle classi di Button.module.css ----
 *
 * Ogni proprietà, in ogni condizione (a riposo, mouse sopra, premuto, fuoco,
 * misure dello schermo), ha una classe che legge il suo valore da una
 * variabile CSS scritta sull'elemento. Così un pulsante ha solo le
 * proprietà che Tamagui gli scriveva (le altre restano quelle del browser),
 * con la stessa forza delle classi di Tamagui (una classe sola) e le stesse
 * regole: vince la prop scritta per ultima, che sostituisce anche gli stati
 * (`backgroundColor={rosso}` toglie il colore col mouse sopra), e una prop
 * `undefined` toglie la proprietà.
 */

export type ButtonCond = "base" | "hover" | "press" | "focus" | "focusVisible" | "md" | "sm" | "xs" | "gtXs" | "gtSm" | "gtMd";

/** Condizioni scritte nei valori (`"44px xs:40px"`), come le chiama Tamagui. */
const COND_PREFIX: Record<string, ButtonCond> = {
  hover: "hover",
  press: "press",
  focus: "focus",
  "focus-visible": "focusVisible",
  md: "md",
  sm: "sm",
  xs: "xs",
  gtXs: "gtXs",
  gtSm: "gtSm",
  gtMd: "gtMd",
};

/** Selettore o media query di ogni condizione (soglie dei media di Tamagui). */
export const COND_CSS: Record<Exclude<ButtonCond, "base">, { pseudo?: string; media?: string }> = {
  hover: { pseudo: ":where(:hover)", media: "(hover: hover)" },
  press: { pseudo: ":where(:active)" },
  focus: { pseudo: ":where(:focus)" },
  focusVisible: { pseudo: ":where(:focus-visible)" },
  md: { media: "(max-width: 1020px)" },
  sm: { media: "(max-width: 800px)" },
  xs: { media: "(max-width: 660px)" },
  gtXs: { media: "(min-width: 661px)" },
  gtSm: { media: "(min-width: 801px)" },
  gtMd: { media: "(min-width: 1021px)" },
};

const STATES: ButtonCond[] = ["base", "hover", "press", "focus", "focusVisible"];
const SCREENS: ButtonCond[] = ["base", "md", "sm", "xs", "gtXs", "gtSm", "gtMd"];

type Unit = "px" | "none" | "space" | "size" | "radius" | "flex";

/** Proprietà del riquadro: nome CSS, unità per i numeri, condizioni possibili. */
export const FRAME_PROPS = {
  cursor: { css: "cursor", unit: "none", conds: ["base"] },
  borderWidth: { css: "border-width", unit: "px", conds: SCREENS },
  borderColor: { css: "border-color", unit: "none", conds: STATES },
  height: { css: "height", unit: "size", conds: SCREENS },
  width: { css: "width", unit: "size", conds: SCREENS },
  minHeight: { css: "min-height", unit: "size", conds: SCREENS },
  minWidth: { css: "min-width", unit: "size", conds: SCREENS },
  paddingHorizontal: { css: "padding-inline", unit: "space", conds: SCREENS },
  paddingVertical: { css: "padding-block", unit: "space", conds: SCREENS },
  borderRadius: { css: "border-radius", unit: "radius", conds: SCREENS },
  backgroundColor: { css: "background-color", unit: "none", conds: STATES },
  opacity: { css: "opacity", unit: "none", conds: STATES },
  alignSelf: { css: "align-self", unit: "none", conds: SCREENS },
  flex: { css: "flex", unit: "flex", conds: SCREENS },
  flexGrow: { css: "flex-grow", unit: "none", conds: SCREENS },
  flexShrink: { css: "flex-shrink", unit: "none", conds: SCREENS },
  flexBasis: { css: "flex-basis", unit: "px", conds: SCREENS },
  gap: { css: "gap", unit: "space", conds: SCREENS },
  outlineColor: { css: "outline-color", unit: "none", conds: STATES },
  outlineStyle: { css: "outline-style", unit: "none", conds: STATES },
  outlineWidth: { css: "outline-width", unit: "px", conds: STATES },
  outlineOffset: { css: "outline-offset", unit: "px", conds: STATES },
} as const satisfies Record<string, { css: string; unit: Unit; conds: readonly ButtonCond[] }>;

/** Proprietà del testo scritto dentro il pulsante (solo a riposo). */
export const TEXT_PROPS = {
  color: { css: "color", unit: "none", conds: ["base"] },
  fontFamily: { css: "font-family", unit: "none", conds: ["base"] },
  fontSize: { css: "font-size", unit: "px", conds: ["base"] },
  lineHeight: { css: "line-height", unit: "none", conds: ["base"] },
  fontWeight: { css: "font-weight", unit: "none", conds: ["base"] },
  letterSpacing: { css: "letter-spacing", unit: "none", conds: ["base"] },
} as const satisfies Record<string, { css: string; unit: Unit; conds: readonly ButtonCond[] }>;

type PropSpec = { css: string; unit: Unit; conds: readonly ButtonCond[] };
export type FrameStyleKey = keyof typeof FRAME_PROPS;
export type ButtonStyleEntry = Partial<Record<ButtonCond, string>>;
export type ButtonStyleMap = Record<string, ButtonStyleEntry>;

/** Valori dei temi di Tamagui usati nelle varianti, come variabili CSS. */
const THEME_VALUE = /^(blue\d+|outlineColor)$/;
const TOKEN = /^\d+$/;

function cssValue(raw: string | number, unit: Unit): string {
  if (typeof raw === "number") {
    if (unit === "none") return String(raw);
    // Tamagui con `styleCompat: "legacy"`: `flex={1}` è "1 1 auto".
    if (unit === "flex") return `${raw} 1 auto`;
    return `${raw}px`;
  }
  if (THEME_VALUE.test(raw)) return `var(--${raw})`;
  if (TOKEN.test(raw) && (unit === "space" || unit === "size" || unit === "radius")) return `var(--t-${unit}-${raw})`;
  return raw;
}

/** Divide un valore piatto di Tamagui ("24px xs:14px") nelle sue condizioni. */
export function parseButtonValue(raw: string | number, unit: Unit): ButtonStyleEntry {
  if (typeof raw === "number") return { base: cssValue(raw, unit) };
  const entry: ButtonStyleEntry = {};
  // Spazi fuori dalle parentesi: "var(--t-size-4)" o "rgba(0, 0, 0, .1)" restano interi.
  const parts = raw.trim().match(/(?:[^\s(]+|\([^)]*\))+/g) ?? [];
  for (const part of parts) {
    const [, prefix = "", value = ""] = /^([a-zA-Z-]+):(.+)$/.exec(part) ?? [];
    const cond = Object.hasOwn(COND_PREFIX, prefix) ? COND_PREFIX[prefix] : undefined;
    if (cond) entry[cond] = cssValue(value, unit);
    else entry.base = cssValue(part, unit);
  }
  return entry;
}

/** Aggiunge le prop allo stile nell'ordine in cui sono scritte, come Tamagui. */
export function mergeButtonStyle(target: ButtonStyleMap, props: Record<string, unknown>, specs: Record<string, PropSpec>) {
  for (const [key, value] of Object.entries(props)) {
    const spec = specs[key];
    if (!spec) continue;
    if (value === undefined || value === null) delete target[key];
    else target[key] = parseButtonValue(value as string | number, spec.unit);
  }
  return target;
}

/** Nome della classe di una proprietà in una condizione, in Button.module.css. */
export const buttonClassName = (prefix: "f" | "t", key: string, cond: ButtonCond) => `${prefix}_${key}_${cond}`;
const varName = (prefix: "f" | "t", key: string, cond: ButtonCond) => `--b${prefix}-${key}-${cond}`;

/** Classi e variabili CSS di uno stile risolto. */
export function buttonStyleOutput(map: ButtonStyleMap, prefix: "f" | "t", classes: Readonly<Record<string, string>>) {
  const names: string[] = [];
  const style: Record<string, string> = {};
  for (const [key, entry] of Object.entries(map)) {
    for (const [cond, value] of Object.entries(entry) as [ButtonCond, string][]) {
      const name = classes[buttonClassName(prefix, key, cond)];
      if (!name) {
        console.error(`Button: "${key}" con la condizione "${cond}" non è previsto (packages/ui/src/buttonStyle.ts)`);
        continue;
      }
      names.push(name);
      style[varName(prefix, key, cond)] = value;
    }
  }
  return { className: names.join(" "), style };
}

/*
 * Button.module.css: le regole fisse e, generate da qui, una classe per ogni
 * proprietà e condizione (`pnpm --filter @professionisti/ui genera-css-pulsante`;
 * buttonStyle.test.ts controlla che il file sia aggiornato).
 */
const MODULE_HEADER = `/*
 * Pulsante del sito in HTML semplice (Button.web.tsx,
 * docs/changelog/2026-11-10-pulsanti-senza-tamagui.md). FILE GENERATO da
 * buttonModuleCss() in buttonStyle.ts: non modificarlo a mano, ma lì e poi
 * \`pnpm --filter @professionisti/ui genera-css-pulsante\`.
 *
 * Le regole fisse di ButtonFrame e ButtonText; poi, per ogni proprietà e
 * condizione, una classe che legge il valore dalla sua variabile CSS.
 */

.frame {
  position: relative;
  flex-direction: row;
  flex-wrap: nowrap;
  justify-content: center;
  align-items: center;
  border-style: solid;
}

/* Pulsante spento: niente tocco, nemmeno sui figli (come Tamagui). */
.disabled {
  pointer-events: none;
}

:where(.disabled) > * {
  pointer-events: none;
}

.text {
  user-select: none;
  cursor: pointer;
  flex-grow: 0;
  flex-shrink: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

`;

export function buttonModuleCss(): string {
  const lines: string[] = [];
  // A riposo, poi mouse sopra, premuto, fuoco e le misure dello schermo
  // nell'ordine dei media di Tamagui (più avanti vince): come le regole che
  // scriveva Tamagui.
  const order: ButtonCond[] = ["base", "hover", "press", "focus", "focusVisible", "md", "sm", "xs", "gtXs", "gtSm", "gtMd"];
  for (const cond of order) {
    const css = cond === "base" ? undefined : COND_CSS[cond];
    const rules: string[] = [];
    for (const [prefix, specs] of [["f", FRAME_PROPS], ["t", TEXT_PROPS]] as const) {
      for (const [key, spec] of Object.entries(specs as Record<string, PropSpec>)) {
        if (!spec.conds.includes(cond)) continue;
        rules.push(`.${buttonClassName(prefix, key, cond)}${css?.pseudo ?? ""} { ${spec.css}: var(${varName(prefix, key, cond)}); }`);
      }
    }
    if (!css?.media) lines.push(...rules);
    else lines.push(`@media ${css.media} {`, ...rules.map((r) => `  ${r}`), "}");
  }
  return `${MODULE_HEADER}${lines.join("\n")}\n`;
}

/** Prop del pulsante sul sito: le stesse che le pagine usano con Tamagui. */
export type ButtonStyleProps = {
  height?: number | string;
  width?: number | string;
  minHeight?: number | string;
  minWidth?: number | string;
  paddingHorizontal?: number | string;
  paddingVertical?: number | string;
  borderRadius?: number | string;
  backgroundColor?: string;
  borderColor?: string;
  opacity?: number | string;
  alignSelf?: string;
  flex?: number | string;
  flexGrow?: number | string;
  flexShrink?: number | string;
  flexBasis?: number | string;
  cursor?: string;
};

export type WebButtonProps = ButtonStyleProps &
  AriaAttributes & {
    children?: ReactNode;
    variant?: ButtonVariant;
    size?: ButtonSize;
    /** Icona prima del testo. */
    icon?: ReactElement;
    /** Colore del testo, al posto di quello della variante. */
    color?: string;
    fontSize?: number;
    className?: string;
    onPress?: (event: MouseEvent<HTMLButtonElement>) => void;
    disabled?: boolean;
    tabIndex?: number;
    role?: AriaRole;
    id?: string;
  };
