import { config as defaultConfig } from "@tamagui/config";
import { createTamagui, createTokens } from "tamagui";
import { Platform } from "react-native";
import { brand } from "./tokens";

// Config Tamagui unica, compilata sia per apps/web (Next.js) che apps/mobile
// (Expo) — è ciò che garantisce la "stessa interfaccia" richiesta da
// CLAUDE.md, senza duplicare il design system tra le due app.

// Famiglie per ruolo tipografico (Instrument Sans per titoli e testo, IBM
// Plex Mono per le cifre, docs/CHANGELOG.md §303 e §305), diverse per piattaforma sullo stesso token
// Tamagui — su web puntano alle CSS variable esposte da next/font
// (apps/web/src/app/fonts.ts, applicate su <html> in layout.tsx); su
// native al nome esatto caricato via useFonts in apps/mobile
// (@expo-google-fonts/*, vedi app/_layout.tsx). `Platform` risolve qui
// grazie a react-native-web (già dipendenza di questo package): stesso
// modulo, valore diverso a seconda del bundler che lo consuma.
//
// Limite noto: RN non supporta il cambio di peso su un'unica famiglia
// custom come fa il CSS (`font-weight` su un web font variabile) — ogni
// peso è una famiglia caricata a parte. Qui il token porta un solo peso
// rappresentativo per ruolo (heading 700, body 400, mono 500); i pesi
// aggiuntivi caricati in apps/mobile restano disponibili per stili nativi
// più specifici in un secondo momento, non ancora cablati token per token.
const isWeb = Platform.OS === "web";
const displayFamily = isWeb ? "var(--font-display), system-ui, sans-serif" : "InstrumentSans_700Bold";
const bodyFamily = isWeb ? "var(--font-body), system-ui, sans-serif" : "InstrumentSans_400Regular";
const monoFamily = isWeb ? "var(--font-mono), monospace" : "IBMPlexMono_500Medium";

// Titoli in Instrument Sans (docs/CHANGELOG.md §303): interlinea 1,2 e
// spaziatura leggermente stretta. Con l'interlinea di default (circa 1,5) un
// titolo su due righe sembrava due titoli separati, e i titoli larghi
// andavano a capo prima su telefono.
// Scala dei titoli del sistema unico (docs/CHANGELOG.md §304): quella di
// default aveva $5 a 13 px e $6 a 15 px, cioè titoli più piccoli del testo
// (16 px). Nessun titolo sotto i 16 px tranne $1-$2 (13, note).
const HEADING_SIZES: Record<string, number> = { "1": 13, "2": 13, "3": 16, "4": 16, "5": 16, "6": 18, "7": 20, "8": 22, true: 16 };
const headingSize = Object.fromEntries(
  Object.entries(defaultConfig.fonts.heading.size).map(([key, size]) => [key, HEADING_SIZES[key] ?? size]),
) as typeof defaultConfig.fonts.heading.size;
const headingLineHeight = Object.fromEntries(
  Object.entries(headingSize).map(([key, size]) => [key, Math.round(size * 1.2)]),
) as typeof defaultConfig.fonts.heading.lineHeight;
const headingLetterSpacing = Object.fromEntries(
  Object.entries(headingSize).map(([key, size]) => [key, -Math.round(size * 0.2) / 10]),
) as typeof defaultConfig.fonts.heading.letterSpacing;

// Estensione additiva della palette di default (mai rimozione/rinomina dei
// token esistenti: $blue10, $color3, $red10 ecc. sono usati in decine di
// pagine già in produzione, non ancora coinvolte nel redesign). I nuovi
// token brand vivono accanto a quelli, stessa scala `$nome`.
// Arrotondamenti $1-$11 ridotti ai due valori del sistema unico (6 e 12 px,
// docs/CHANGELOG.md §304): prima la scala di default dava 3, 5, 7, 9, 10, 16,
// 19, 22, 26, 34, 42. $12 (50) resta per gli elementi tondi.
const radius = Object.fromEntries(
  Object.entries(defaultConfig.tokens.radius).map(([key, token]) => {
    if (key === "0" || key === "12") return [key, token.val];
    return [key, token.val <= 10 ? 6 : 12];
  }),
) as Record<keyof typeof defaultConfig.tokens.radius, number>;

const customTokens = createTokens({
  ...defaultConfig.tokens,
  radius,
  color: {
    ...defaultConfig.tokens.color,
    gesso: brand.gesso,
    calce: brand.calce,
    grafite: brand.grafite,
    grafite70: brand.grafite70,
    filetto: brand.filetto,
    cianografia: brand.cianografia,
    cianografiaScuro: brand.cianografiaScuro,
    cianografiaVelo: brand.cianografiaVelo,
    verificato: brand.verificato,
    urgenza: brand.urgenza,
    ottone: brand.ottone,
  },
});

// Solo il tema "light" e i suoi sotto-temi di componente (light_Button,
// light_Input, light_alt1...): via "dark" e le varianti a colori (blue, red,
// green...), che il sito non usa mai (nessun <Theme name> né prop `theme`,
// nessun Sheet/Dialog/Tooltip di Tamagui, entrambe le app partono da
// defaultTheme="light"). Con tutti i 1408 temi di default Tamagui scriveva
// circa 9 MB di CSS dentro ogni pagina HTML del sito, ora circa 0,6 MB (bug
// reale misurato sulla pagina dei risultati, docs/CHANGELOG.md §206). I
// token colore ($blue10, $red10...) restano. Per un tema scuro in futuro
// basta rimettere qui i temi "dark".
const COLOR_THEME_SEGMENTS = new Set(["blue", "red", "green", "yellow", "orange", "purple", "pink", "gray"]);
const themes = Object.fromEntries(
  Object.entries(defaultConfig.themes).filter(
    ([name]) => name.split("_")[0] === "light" && !name.split("_").some((segment) => COLOR_THEME_SEGMENTS.has(segment)),
  ),
) as typeof defaultConfig.themes;

export const tamaguiConfig = createTamagui({
  ...defaultConfig,
  themes,
  tokens: customTokens,
  fonts: {
    ...defaultConfig.fonts,
    heading: {
      ...defaultConfig.fonts.heading,
      family: displayFamily,
      size: headingSize,
      lineHeight: headingLineHeight,
      letterSpacing: headingLetterSpacing,
    },
    body: {
      ...defaultConfig.fonts.body,
      family: bodyFamily,
    },
    mono: {
      ...defaultConfig.fonts.mono,
      family: monoFamily,
    },
  },
});

export type AppTamaguiConfig = typeof tamaguiConfig;

declare module "tamagui" {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface TamaguiCustomConfig extends AppTamaguiConfig {}
}
