// Scrive src/tamaguiDefaults.ts con i valori della config di default di
// Tamagui che il sito usa (docs/CHANGELOG.md §325): token, font, media,
// abbreviazioni e i soli temi usati. Prima `@tamagui/config` si importava
// nel sito: 1408 temi creati e poi scartati e le animazioni di React Native
// (con FlatList e VirtualizedList dentro) in ogni pagina, circa 230 KB di
// JavaScript che un telefono lento eseguiva all'apertura. Da rilanciare solo
// se si aggiorna Tamagui o si aggiunge un tema in USED_THEMES:
//   pnpm --filter @professionisti/ui genera-default-tamagui
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "@tamagui/config";
import { USED_THEMES } from "../src/usedThemes";

type TokenGroup = Record<string, { val: unknown } | unknown>;
const rawTokens = Object.fromEntries(
  Object.entries(config.tokens as Record<string, TokenGroup>).map(([group, values]) => [
    group,
    Object.fromEntries(
      Object.entries(values).map(([key, token]) => [key, token && typeof token === "object" && "val" in token ? token.val : token]),
    ),
  ]),
);
const themes = Object.fromEntries(Object.entries(config.themes).filter(([name]) => USED_THEMES.includes(name)));
const missing = USED_THEMES.filter((name) => !(name in themes));
if (missing.length) throw new Error(`Temi inesistenti in @tamagui/config: ${missing.join(", ")}`);

const configVersion = JSON.parse(readFileSync(createRequire(import.meta.url).resolve("@tamagui/config/package.json"), "utf8")).version;
const json = (value: unknown) => JSON.stringify(value, null, 2);
const out = `// File generato da scripts/genera-default-tamagui.ts: non modificarlo a mano.
// Valori di @tamagui/config ${configVersion} (docs/CHANGELOG.md §325).
/* eslint-disable */

export const defaultTokens = ${json(rawTokens)};

export const defaultThemes = ${json(themes)};

export const defaultFonts = ${json(config.fonts)} as const;

export const defaultMedia = ${json(config.media)} as const;

export const defaultShorthands = ${json(config.shorthands)} as const;

export const defaultSettings = ${json(config.settings)} as const;
`;
const outFile = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "tamaguiDefaults.ts");
writeFileSync(outFile, out);
console.log(`tamaguiDefaults.ts: ${Math.round(out.length / 1024)} KB, ${Object.keys(themes).length} temi`);
