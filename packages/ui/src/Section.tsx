import type { ReactNode } from "react";
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
export function Section({ eyebrow, title, lead, tone = "light", maxWidth = 1200, children }: SectionProps) {
  const isDark = tone === "dark";

  return (
    <YStack
      width="100%"
      alignItems="center"
      backgroundColor={TONE_BACKGROUND[tone]}
      paddingVertical={64}
      paddingHorizontal={24}
      $gtSm={{ paddingVertical: 96, paddingHorizontal: 40 }}
    >
      <YStack width="100%" maxWidth={maxWidth} gap="$6">
        {eyebrow || title || lead ? (
          <YStack gap="$3">
            {eyebrow ? <Eyebrow tone={isDark ? "dark" : "light"}>{eyebrow}</Eyebrow> : null}
            {title ? (
              <H2 fontFamily="$heading" color={isDark ? "white" : "$grafite"}>
                {title}
              </H2>
            ) : null}
            {lead ? (
              <Paragraph color={isDark ? "$grafite70" : "$grafite70"} maxWidth={640}>
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
