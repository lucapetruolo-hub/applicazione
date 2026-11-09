// Controllo in CI (docs/changelog/2026-11-08-infrastruttura-lancio.md, E9-03):
// ogni variabile d'ambiente letta dall'API deve stare in render.yaml, così un
// servizio ricreato dal Blueprint non la "dimentica" senza che nessuno se ne
// accorga (successo con FISCAL_DATA_KEY e STRIPE_TAX_RATE_IVA). Le variabili
// lette con un nome scritto in una costante ("STRIPE_PRICE_BASE_ANNUAL") le
// trova cercando le stringhe in maiuscolo passate a process.env[...].
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
// Impostate da Render o solo per le prove: non vanno nel Blueprint.
const NOT_IN_BLUEPRINT = new Set(["NODE_ENV", "PORT", "RENDER", "RATE_LIMIT_PER_MINUTE", "E2E_VERIFY_EMAIL_PER_MINUTE", "TZ", "VITEST", "CI"]);

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : files(path);
    return /\.ts$/.test(name) && !/\.(test|spec)\.ts$/.test(name) ? [path] : [];
  });
}

const used = new Set();
for (const file of [...files(join(root, "apps/api/src")), ...files(join(root, "packages/database/src"))]) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) used.add(m[1]);
  for (const m of text.matchAll(/\benv\.([A-Z][A-Z0-9_]*)/g)) used.add(m[1]);
  // Nomi in costanti usati con process.env[...] o new DailyBudget(..., "NOME").
  if (/process\.env\[/.test(text)) {
    for (const m of text.matchAll(/"([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)"/g)) {
      if (/^(STRIPE|GOOGLE|PROBLEM|OPENAPI|WHATSAPP|RESEND|DIDIT|CLOUDINARY|OPENROUTER|ANTHROPIC|SENTRY|TURNSTILE|FISCAL|LAUNCH)_/.test(m[1])) used.add(m[1]);
    }
  }
}
for (const m of readFileSync(join(root, "apps/api/src/problem-match/problem-match.service.ts"), "utf8").matchAll(/"([A-Z][A-Z0-9_]+_DAILY_LIMIT)"/g)) used.add(m[1]);

const blueprint = new Set([...readFileSync(join(root, "render.yaml"), "utf8").matchAll(/^\s*- key: ([A-Z0-9_]+)/gm)].map((m) => m[1]));
const missing = [...used].filter((name) => !NOT_IN_BLUEPRINT.has(name) && !blueprint.has(name)).sort();
if (missing.length > 0) {
  console.error(`Variabili lette dall'API ma assenti da render.yaml: ${missing.join(", ")}.`);
  console.error("Aggiungile a render.yaml (sync: false, con un commento) e a docs/ops/variabili.md.");
  process.exit(1);
}
console.log(`render.yaml in ordine: ${used.size} variabili lette dall'API, tutte nel Blueprint.`);
