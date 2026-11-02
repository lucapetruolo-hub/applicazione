import { forwardRef, type ComponentProps, type ComponentRef } from "react";
import { Input as TamaguiInput, getConfig, getTokens, getVariableValue, isWeb } from "tamagui";

/*
 * Campo di testo del sito e dell'app (docs/changelog/2026-11-02-tamagui-3.md).
 * Con Tamagui 3 l'`Input` di Tamagui ha misure "xs…xl" e senza misura scrive
 * a 13 px senza margini: qui le misure "1"…"10" di Tamagui 1, come faceva il
 * suo `inputSizeVariant`, così nessun campo cambia aspetto.
 *
 * - altezza dal token `size`, angoli dal token `radius`;
 * - margini a destra e sinistra dal token `space` subito più piccolo;
 * - misura, interlinea, peso e spaziatura del testo dal font `body`.
 * Di serie la misura "4". Colori, bordo e anello del fuoco come Tamagui 1.
 */
type InputSize = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10";

type TamaguiInputProps = ComponentProps<typeof TamaguiInput>;
export type InputProps = Omit<TamaguiInputProps, "size"> & { size?: InputSize };

const num = (value: unknown) => {
  const resolved = value === undefined ? undefined : getVariableValue(value);
  return typeof resolved === "number" ? resolved : undefined;
};

const sizeCache = new Map<InputSize, Record<string, number | string>>();

function sizeStyle(size: InputSize) {
  const cached = sizeCache.get(size);
  if (cached) return cached;
  const tokens = getTokens() as unknown as Record<string, Record<string, unknown>>;
  const style: Record<string, number | string> = {};
  const height = num(tokens.size?.[size]);
  if (height !== undefined) style.height = height;
  const radius = num(tokens.radius?.[size]) ?? num(tokens.radius?.["4"]);
  if (radius !== undefined) style.borderRadius = radius;
  // Tamagui 1: getSpace(size, { shift: -1 }), il passo prima nella scala.
  const spaces = Object.entries(tokens.space ?? {})
    .map(([key, value]) => [key, num(value)] as const)
    .filter((entry): entry is readonly [string, number] => entry[1] !== undefined && entry[1] >= 0)
    .sort((a, b) => a[1] - b[1]);
  const index = spaces.findIndex(([key]) => key === size);
  const below = spaces[index - 1];
  if (index > 0 && below) style.paddingHorizontal = below[1];
  const font = getConfig().fontsParsed.body as unknown as Record<string, Record<string, unknown> | undefined> | undefined;
  const fontSize = num(font?.size?.[size]);
  if (fontSize !== undefined) style.fontSize = fontSize;
  const lineHeight = num(font?.lineHeight?.[size]);
  // In Tamagui 3 un numero è un rapporto: l'interlinea in pixel va scritta
  // "px". Sul telefono niente interlinea, come in Tamagui 1 (sfalsa il testo).
  if (lineHeight !== undefined && isWeb) style.lineHeight = `${lineHeight}px`;
  const fontWeight = font?.weight?.[size];
  if (fontWeight !== undefined) style.fontWeight = String(getVariableValue(fontWeight));
  const letterSpacing = num(font?.letterSpacing?.[size]);
  if (letterSpacing) style.letterSpacing = letterSpacing;
  sizeCache.set(size, style);
  return style;
}

export const Input = forwardRef<ComponentRef<typeof TamaguiInput>, InputProps>(function Input({ size, ...props }, ref) {
  return (
    // size={false}: niente misure "xs…xl" di Tamagui 3, valgono le nostre.
    <TamaguiInput
      ref={ref}
      fontFamily="body"
      borderWidth={1}
      color="color"
      backgroundColor="background"
      borderColor="borderColor hover:borderColorHover focus:borderColorFocus"
      outlineWidth="focus-visible:2px"
      outlineColor="focus-visible:outlineColor"
      outlineStyle="focus-visible:solid"
      size={false}
      {...(sizeStyle(size ?? "4") as TamaguiInputProps)}
      {...props}
    />
  );
});
