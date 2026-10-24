import { createContext, useContext, type ReactNode } from "react";
import { H2, H3, Paragraph, XStack, YStack } from "tamagui";

export type SectionTone = "light" | "dark" | "blueprint";

// Niente etichetta sopra il titolo né parole colorate dentro il titolo: sono
// tra i segni tipici dei siti fatti con l'IA (docs/CHANGELOG.md §295).
export type SectionProps = {
  title?: string;
  lead?: string;
  /** Comando accanto al titolo, allineato a destra (es. "Mostra tutte"). */
  titleAction?: ReactNode;
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

/**
 * Una `Section` dentro un'altra diventa una sottosezione: niente fondo né
 * spazio verticale proprio e titolo più piccolo. Serve per
 * unire in un solo blocco della homepage sezioni che prima stavano in fila
 * (docs/CHANGELOG.md §219) senza riscriverle. Il valore è il tono del
 * blocco esterno, per scegliere il colore del titolo.
 */
const SectionNestingContext = createContext<SectionTone | null>(null);

function SectionTitle({
  title,
  isDark,
  nested,
}: {
  title: string;
  isDark: boolean;
  nested: boolean;
}) {
  const Heading = nested ? H3 : H2;
  return (
    <Heading
      fontFamily="$heading"
      color={isDark ? "white" : "$grafite"}
      {...(nested ? { fontSize: "$7", lineHeight: "$7" } : null)}
    >
      {title}
    </Heading>
  );
}

export function Section({
  title,
  lead,
  titleAction,
  tone = "light",
  maxWidth = 1200,
  children,
}: SectionProps) {
  const parentTone = useContext(SectionNestingContext);
  const nested = parentTone !== null;
  const isDark = nested ? parentTone === "dark" : tone === "dark";
  const padding = DENSITY_PADDING[useContext(SectionDensityContext)];

  const header =
    title || lead ? (
      <YStack gap="$3">
        {title && titleAction ? (
          // Il titolo può andare a capo, il comando resta sulla stessa riga.
          <XStack alignItems="center" justifyContent="space-between" gap="$3">
            <YStack flex={1} minWidth={0}>
              <SectionTitle
                title={title}
                isDark={isDark}
                nested={nested}
              />
            </YStack>
            <YStack flexShrink={0}>{titleAction}</YStack>
          </XStack>
        ) : title ? (
          <SectionTitle
            title={title}
            isDark={isDark}
            nested={nested}
          />
        ) : null}
        {lead ? (
          <Paragraph
            color={isDark ? "rgba(255,255,255,0.75)" : "$grafite70"}
            maxWidth={640}
          >
            {lead}
          </Paragraph>
        ) : null}
      </YStack>
    ) : null;

  if (nested) {
    return (
      <YStack width="100%" maxWidth={maxWidth} alignSelf="center" gap="$5">
        {header}
        {children}
      </YStack>
    );
  }

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
        {header}
        <SectionNestingContext.Provider value={tone}>
          {children}
        </SectionNestingContext.Provider>
      </YStack>
    </YStack>
  );
}
