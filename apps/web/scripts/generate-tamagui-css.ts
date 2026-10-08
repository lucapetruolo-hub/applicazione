// Scrive public/tamagui.css con gli stili della config Tamagui (temi, token,
// font) prima di `next dev`/`next build` (docs/CHANGELOG.md §199): il layout
// lo collega con un <link> e il browser lo tiene in cache, invece di
// ricevere gli stessi stili dentro ogni pagina HTML. Gira con tsx e
// scripts/tsconfig.json, che punta "react-native" su "react-native-web"
// (stesso alias del webpack di next.config.mjs), così packages/ui/src/config.ts
// sceglie i font del web come nel sito vero.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tamaguiConfig } from "@professionisti/ui/config";

const outFile = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "tamagui.css");
const css = tamaguiConfig.getCSS();
writeFileSync(outFile, css);
console.log(`tamagui.css: ${Math.round(css.length / 1024)} KB`);
