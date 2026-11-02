// Controlla src/tamaguiDefaults.ts, i valori di base della config Tamagui del
// sito e dell'app: token, font, media, abbreviazioni e i soli temi usati
// (docs/CHANGELOG.md §345).
//
// Fino a Tamagui 1 il file si generava da `@tamagui/config` (config "v4").
// Tamagui 3 ha solo le config "v5" e "v6", con altri colori, misure e temi:
// rigenerare da lì cambierebbe l'aspetto di ogni pagina. Per questo i valori
// di Tamagui 1.144.4 restano fissati nel file e sono ormai i nostri
// (docs/changelog/2026-11-02-tamagui-3.md). Un tema nuovo si aggiunge a mano
// in `defaultThemes`, con gli stessi nomi di colore dei temi che ci sono, e
// in src/usedThemes.ts; poi:
//   pnpm --filter @professionisti/ui genera-default-tamagui
// controlla che ogni tema di USED_THEMES esista, che un tema principale abbia
// tutti i colori di "light", e che accanto alla chiave "true" dei token
// (vietata da Tamagui 3, la toglie src/config.ts) ci sia la "4".
import { defaultThemes, defaultTokens } from "../src/tamaguiDefaults";
import { USED_THEMES } from "../src/usedThemes";

const themes = defaultThemes as Record<string, Record<string, string>>;
const errors: string[] = [];
const missing = USED_THEMES.filter((name) => !(name in themes));
if (missing.length) errors.push(`Temi mancanti in src/tamaguiDefaults.ts: ${missing.join(", ")}`);
const base = Object.keys(themes.light ?? {});
// I sotto-temi dei componenti (light_Input...) cambiano solo alcuni colori.
for (const name of USED_THEMES.filter((theme) => !theme.includes("_"))) {
  const theme = themes[name];
  if (!theme) continue;
  const lacking = base.filter((key) => !(key in theme));
  if (lacking.length) errors.push(`Il tema ${name} non ha: ${lacking.join(", ")}`);
}
const extra = Object.keys(themes).filter((name) => !USED_THEMES.includes(name));
if (extra.length) errors.push(`Temi in src/tamaguiDefaults.ts non elencati in src/usedThemes.ts: ${extra.join(", ")}`);
// La chiave "true" nei token resta nel file (era di Tamagui 1) e la toglie
// src/config.ts: qui si controlla solo che ci sia sempre anche la "4".
for (const group of ["size", "space", "radius", "zIndex"] as const) {
  const scale = (defaultTokens as Record<string, Record<string, unknown>>)[group];
  if (scale && "true" in scale && !("4" in scale)) errors.push(`Token ${group}: c'è "true" ma manca "4"`);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`tamaguiDefaults.ts: ${USED_THEMES.length} temi, tutto a posto`);
