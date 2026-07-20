import { config as defaultConfig } from "@tamagui/config";
import { createTamagui } from "tamagui";

// Config Tamagui unica, compilata sia per apps/web (Next.js) che apps/mobile
// (Expo) — è ciò che garantisce la "stessa interfaccia" richiesta da
// CLAUDE.md, senza duplicare il design system tra le due app.
export const tamaguiConfig = createTamagui(defaultConfig);

export type AppTamaguiConfig = typeof tamaguiConfig;

declare module "tamagui" {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface TamaguiCustomConfig extends AppTamaguiConfig {}
}
