// Wrapper di "prisma migrate deploy" usato dallo script "start" di apps/api.
//
// Il database Render di produzione è nato con "prisma db push" (tabelle
// presenti, nessuno storico in _prisma_migrations): lì "migrate deploy"
// fallisce con P3005 ("The database schema is not empty"). In quel caso —
// e solo in quello — la baseline viene marcata come già applicata
// ("migrate resolve --applied", non tocca né dati né schema) e il deploy
// viene rieseguito, così applica solo le migrazioni successive alla
// baseline. Nessun comando manuale da lanciare contro il DB di produzione.
//
// Un database vuoto (es. nuovo Postgres free dopo la scadenza dei 30 giorni)
// non produce P3005: "migrate deploy" applica tutto da zero come al solito.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASELINE_MIGRATION = "20260921212750_baseline";
const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const prismaCli = createRequire(import.meta.url).resolve("prisma/build/index.js");

function prisma(args) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: packageDir,
    encoding: "utf8",
    env: process.env,
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  return { status: result.status ?? 1, output: `${result.stdout}${result.stderr}` };
}

let deploy = prisma(["migrate", "deploy"]);

if (deploy.status !== 0 && deploy.output.includes("P3005")) {
  console.log(
    `\n[migrate-deploy] Database esistente senza storico migrazioni (P3005): ` +
      `marco "${BASELINE_MIGRATION}" come già applicata e riprovo.\n`,
  );
  const baseline = prisma(["migrate", "resolve", "--applied", BASELINE_MIGRATION]);
  if (baseline.status !== 0) process.exit(baseline.status);
  deploy = prisma(["migrate", "deploy"]);
}

process.exit(deploy.status);
