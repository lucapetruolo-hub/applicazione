// Riscrive src/Button.module.css da buttonModuleCss() di src/buttonStyle.ts
// (docs/changelog/2026-11-10-pulsanti-senza-tamagui.md):
//   pnpm --filter @professionisti/ui genera-css-pulsante
// src/buttonStyle.test.ts controlla che il file sia aggiornato.
import { writeFileSync } from "node:fs";
import { buttonModuleCss } from "../src/buttonStyle";

writeFileSync(new URL("../src/Button.module.css", import.meta.url), buttonModuleCss());
console.log("src/Button.module.css aggiornato");
