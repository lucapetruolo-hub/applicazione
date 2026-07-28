import { config as defaultConfig } from "@tamagui/config";
import { createTamagui, createTokens } from "tamagui";
import { Platform } from "react-native";
import { brand } from "./tokens";

// Config Tamagui unica, compilata sia per apps/web (Next.js) che apps/mobile
// (Expo) — è ciò che garantisce la "stessa interfaccia" richiesta da
// CLAUDE.md, senza duplicare il design system tra le due app.

// Famiglie per ruolo tipografico ("Scheda Intervento": Archivo/Inter
// Tight/IBM Plex Mono), diverse per piattaforma sullo stesso token
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
// rappresentativo per ruolo (heading 800, body 400, mono 500); i pesi
// aggiuntivi caricati in apps/mobile restano disponibili per stili nativi
// più specifici in un secondo momento, non ancora cablati token per token.
const isWeb = Platform.OS === "web";
const displayFamily = isWeb ? "var(--font-display), system-ui, sans-serif" : "Archivo_800ExtraBold";
const bodyFamily = isWeb ? "var(--font-body), system-ui, sans-serif" : "InterTight_400Regular";
const monoFamily = isWeb ? "var(--font-mono), monospace" : "IBMPlexMono_500Medium";

// Estensione additiva della palette di default (mai rimozione/rinomina dei
// token esistenti: $blue10, $color3, $red10 ecc. sono usati in decine di
// pagine già in produzione, non ancora coinvolte nel redesign). I nuovi
// token brand vivono accanto a quelli, stessa scala `$nome`.
const customTokens = createTokens({
  ...defaultConfig.tokens,
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

export const tamaguiConfig = createTamagui({
  ...defaultConfig,
  tokens: customTokens,
  fonts: {
    ...defaultConfig.fonts,
    heading: {
      ...defaultConfig.fonts.heading,
      family: displayFamily,
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
