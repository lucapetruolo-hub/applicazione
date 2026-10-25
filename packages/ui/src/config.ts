import { createTamagui, createTokens } from "tamagui";
import { Platform } from "react-native";
import { animations } from "./animations";
import { defaultFonts, defaultMedia, defaultSettings, defaultShorthands, defaultThemes, defaultTokens } from "./tamaguiDefaults";
import { brand } from "./tokens";

// Config Tamagui unica, compilata sia per apps/web (Next.js) che apps/mobile
// (Expo) — è ciò che garantisce la "stessa interfaccia" richiesta da
// CLAUDE.md, senza duplicare il design system tra le due app.
//
// Parte dai valori di default di Tamagui copiati in tamaguiDefaults.ts
// (generato, docs/CHANGELOG.md §345) e non da `@tamagui/config`, che in ogni
// pagina del sito creava 1408 temi per poi tenerne 5 e portava le
// animazioni di React Native: circa 230 KB di JavaScript in meno da
// eseguire all'apertura su un telefono lento. Stessi valori: il CSS dei
// temi generato (apps/web/public/tamagui.css) è identico.

// Famiglie per ruolo tipografico (Instrument Sans per titoli e testo, IBM
// Plex Mono per le cifre, docs/CHANGELOG.md §304 e §306), diverse per piattaforma sullo stesso token
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

// Titoli in Instrument Sans (docs/CHANGELOG.md §304): interlinea 1,2 e
// spaziatura leggermente stretta. Con l'interlinea di default (circa 1,5) un
// titolo su due righe sembrava due titoli separati, e i titoli larghi
// andavano a capo prima su telefono.
// Scala dei titoli del sistema unico (docs/CHANGELOG.md §305): quella di
// default aveva $5 a 13 px e $6 a 15 px, cioè titoli più piccoli del testo
// (16 px). Nessun titolo sotto i 16 px tranne $1-$2 (13, note).
const HEADING_SIZES: Record<string, number> = { "1": 13, "2": 13, "3": 16, "4": 16, "5": 16, "6": 18, "7": 20, "8": 22, true: 16 };
const headingSize = Object.fromEntries(
  Object.entries(defaultFonts.heading.size).map(([key, size]) => [key, HEADING_SIZES[key] ?? size]),
) as typeof defaultFonts.heading.size;
const headingLineHeight = Object.fromEntries(
  Object.entries(headingSize).map(([key, size]) => [key, Math.round(size * 1.2)]),
) as typeof defaultFonts.heading.lineHeight;
const headingLetterSpacing = Object.fromEntries(
  Object.entries(headingSize).map(([key, size]) => [key, -Math.round(size * 0.2) / 10]),
) as typeof defaultFonts.heading.letterSpacing;

// Estensione additiva della palette di default (mai rimozione/rinomina dei
// token esistenti: $blue10, $color3, $red10 ecc. sono usati in decine di
// pagine già in produzione, non ancora coinvolte nel redesign). I nuovi
// token brand vivono accanto a quelli, stessa scala `$nome`.
// Arrotondamenti $1-$9 ridotti ai due valori del sistema unico ($1-$2 a 10
// px, $3-$9 a 20 px,
// docs/CHANGELOG.md §305, ammorbiditi nel §317): prima la scala di default dava 3, 5, 7, 9, 10, 16,
// 19, 22, 26, 34, 42. $12 (50) resta per gli elementi tondi; $10 e $11,
// usati solo da interruttori, schede "A domicilio/Online", etichette e
// pulsanti a pillola, tornano tondi pieni come prima (richiesta
// dell'utente, docs/CHANGELOG.md §316).
const radius = Object.fromEntries(
  Object.entries(defaultTokens.radius).map(([key, value]) => {
    if (key === "0" || key === "12") return [key, value];
    if (key === "10" || key === "11") return [key, 999];
    return [key, value <= 5 ? 10 : 20];
  }),
) as Record<keyof typeof defaultTokens.radius, number>;

const customTokens = createTokens({
  ...defaultTokens,
  radius,
  color: {
    ...defaultTokens.color,
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

// Temi: solo quelli usati (src/usedThemes.ts, docs/CHANGELOG.md §206 e §345).
export const tamaguiConfig = createTamagui({
  themes: defaultThemes,
  media: defaultMedia,
  shorthands: defaultShorthands,
  settings: defaultSettings,
  animations,
  selectionStyles: (theme) => (theme.color5 ? { backgroundColor: theme.color5, color: theme.color11 } : null),
  tokens: customTokens,
  fonts: {
    ...defaultFonts,
    heading: {
      ...defaultFonts.heading,
      family: displayFamily,
      size: headingSize,
      lineHeight: headingLineHeight,
      letterSpacing: headingLetterSpacing,
    },
    body: {
      ...defaultFonts.body,
      family: bodyFamily,
    },
    mono: {
      ...defaultFonts.mono,
      family: monoFamily,
    },
  },
});

export type AppTamaguiConfig = typeof tamaguiConfig;

declare module "tamagui" {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface TamaguiCustomConfig extends AppTamaguiConfig {}
}
