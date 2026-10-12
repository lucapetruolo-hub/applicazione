import { createContext, useContext, type ReactNode } from "react";
import { H2, Paragraph, YStack } from "tamagui";
import { Eyebrow } from "./Eyebrow";

export type SectionTone = "light" | "dark" | "blueprint";

export type SectionProps = {
  eyebrow?: string;
  title?: string;
  lead?: string;
  tone?: SectionTone;
  maxWidth?: number;
  children?: ReactNode;
};

const TONE_BACKGROUND: Record<SectionTone, string> = {
  light: "$gesso",
  // "blueprint" condivide lo sfondo di "light": il pattern a griglia
  // cianografica vero e proprio (repeating-linear-gradient) è CSS puro,
  // web-only per costruzione (non porta a nulla su React Native) — vive
  // nella classe utility `.bp-grid` di apps/web/src/app/globals.css,
  // applicata dalle pagine (Hero, CTA finale) che la usano, non qui:
  // Section resta un componente portabile al 100%, coerente con la regola
  // di progetto "niente DOM/CSS specifico del web dentro packages/ui"
  // (vedi CLAUDE.md, stessa ragione per cui Leaflet resta in apps/web).
  blueprint: "$gesso",
  dark: "$grafite",
};

/**
 * Wrapper unico per il ritmo verticale delle sezioni (96px desktop / 64px
 * mobile) e per il container centrato (max 1200px, padding laterale 24/40px)
 * — definito una sola volta qui, mai con classi/padding ad-hoc nelle pagine
 * (brief redesign "Scheda Intervento" §1.4).
 */
/**
 * Ritmo verticale più stretto (56px desktop / 40px mobile) per le pagine con
 * molte sezioni in fila, come la homepage: con 96px sopra e sotto ogni
 * sezione restavano grandi spazi vuoti (richiesta dell'utente,
 * docs/CHANGELOG.md §219). Si attiva avvolgendo la pagina in
 * `<SectionDensityProvider value="compact">`; senza, resta il ritmo pieno.
 */
export type SectionDensity = "comfortable" | "compact";

const SectionDensityContext = createContext<SectionDensity>("comfortable");

export const SectionDensityProvider = SectionDensityContext.Provider;

const DENSITY_PADDING: Record<
  SectionDensity,
  { mobile: number; desktop: number }
> = {
  comfortable: { mobile: 64, desktop: 96 },
  compact: { mobile: 40, desktop: 56 },
};

export function Section({
  eyebrow,
  title,
  lead,
  tone = "light",
  maxWidth = 1200,
  children,
}: SectionProps) {
  const isDark = tone === "dark";
  const padding = DENSITY_PADDING[useContext(SectionDensityContext)];

  return (
    <YStack
      width="100%"
      alignItems="center"
      backgroundColor={TONE_BACKGROUND[tone]}
      paddingVertical={padding.mobile}
      paddingHorizontal={24}
      $gtSm={{ paddingVertical: padding.desktop, paddingHorizontal: 40 }}
    >
      <YStack width="100%" maxWidth={maxWidth} gap="$6">
        {eyebrow || title || lead ? (
          <YStack gap="$3">
            {eyebrow ? (
              <Eyebrow tone={isDark ? "dark" : "light"}>{eyebrow}</Eyebrow>
            ) : null}
            {title ? (
              <H2 fontFamily="$heading" color={isDark ? "white" : "$grafite"}>
                {title}
              </H2>
            ) : null}
            {lead ? (
              <Paragraph
                color={isDark ? "$grafite70" : "$grafite70"}
                maxWidth={640}
              >
                {lead}
              </Paragraph>
            ) : null}
          </YStack>
        ) : null}
        {children}
      </YStack>
    </YStack>
  );
}
