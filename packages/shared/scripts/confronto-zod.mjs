// Confronto delle validazioni prima/dopo un aggiornamento di zod
// (docs/CHANGELOG.md §324): passa gli stessi dati di prova, generati a caso
// dalla forma di ogni schema, agli schemi di `packages/shared` di un commit
// precedente con la sua versione di zod e a quelli attuali, e segnala dove
// cambiano l'esito, i dati in uscita o il messaggio mostrato all'utente (il
// primo errore, che mostrano i moduli, e il primo di `fieldErrors`, che
// mostra `ApiError` di `packages/api-client`).
//
//   pnpm --filter @professionisti/shared confronto-zod [opzioni]
//
//   --prima <commit>    commit o ramo di partenza (predefinito: HEAD)
//   --zod-prima <ver>   versione di zod di partenza (predefinito: quella
//                       installata a quel commit, scaricata da npm)
//   --prove <n>         dati di prova per schema (predefinito: 1000)
//   --tutti             confronta tutti gli errori, non solo quello mostrato
//   --solo-se-cambia    non fa nulla se zod è alla stessa versione (lo usa la
//                       CI, .github/workflows/zod.yml)
//
// Esce con codice 1 se trova differenze: ognuna va spiegata nel registro o
// sistemata (es. con i messaggi di `src/zod.ts`).
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const esbuild = require("esbuild");

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_DIR = resolve(PACKAGE_DIR, "../..");

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
// Il commit di partenza, risolto subito in un hash: niente nomi passati alla shell o presi per opzioni.
const REF = execFileSync("git", ["rev-parse", "--verify", "--end-of-options", `${option("--prima", "HEAD")}^{commit}`], { cwd: REPO_DIR, encoding: "utf8" }).trim();
const RUNS = Number(option("--prove", "1000"));
const ALL_ISSUES = args.includes("--tutti");

const work = mkdtempSync(join(tmpdir(), "confronto-zod-"));
const git = (...a) => execFileSync("git", a, { cwd: REPO_DIR, encoding: "utf8", maxBuffer: 1 << 28 });

// Schemi di partenza, dal commit indicato.
const beforeSrc = join(work, "prima");
mkdirSync(beforeSrc);
const beforeTar = join(work, "prima.tar");
execFileSync("git", ["archive", `--output=${beforeTar}`, REF, "--", "packages/shared/src"], { cwd: REPO_DIR });
execFileSync("tar", ["-xf", beforeTar, "-C", beforeSrc]);
/** La versione di zod installata a quel commit (pnpm-lock.yaml), o in mancanza quella del package.json. */
function lockedZod(ref) {
  const lock = git("show", `${ref}:pnpm-lock.yaml`);
  const match = /\n {2}packages\/shared:\n {4}dependencies:\n(?: {6}[^\n]*\n)*? {6}zod:\n {8}specifier: [^\n]*\n {8}version: ([^\s(]+)/.exec(lock);
  return match?.[1] ?? JSON.parse(git("show", `${ref}:packages/shared/package.json`)).dependencies.zod;
}
const zodBefore = option("--zod-prima", lockedZod(REF));
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(zodBefore)) throw new Error(`Versione di zod non valida: ${zodBefore}`);
const zodAfterVersion = require(require.resolve("zod/package.json", { paths: [PACKAGE_DIR] })).version;
if (args.includes("--solo-se-cambia") && zodBefore === zodAfterVersion) {
  console.log(`zod resta alla ${zodAfterVersion}: nessun confronto da fare.`);
  process.exit(0);
}

// zod di partenza, scaricato da npm in una cartella a parte.
const zodDir = join(work, "zod-prima");
mkdirSync(zodDir);
const tarball = execFileSync("npm", ["pack", `zod@${zodBefore}`, "--silent"], { cwd: zodDir, encoding: "utf8" }).trim().split("\n").pop();
execFileSync("tar", ["-xzf", tarball, "-C", zodDir], { cwd: zodDir });
const zodBeforeDir = join(zodDir, "package");
const zodBeforeVersion = JSON.parse(readFileSync(join(zodBeforeDir, "package.json"), "utf8")).version;

const bundle = (entry, outfile, alias) => esbuild.buildSync({ entryPoints: [entry], bundle: true, platform: "node", format: "cjs", outfile, logLevel: "warning", ...(alias ? { alias: { zod: alias } } : {}), nodePaths: [join(PACKAGE_DIR, "node_modules"), join(REPO_DIR, "node_modules")] });
bundle(join(beforeSrc, "packages/shared/src/index.ts"), join(work, "prima.cjs"), zodBeforeDir);
bundle(join(PACKAGE_DIR, "src/index.ts"), join(work, "dopo.cjs"));
const before = require(join(work, "prima.cjs"));
const after = require(join(work, "dopo.cjs"));
console.log(`Prima: ${REF} con zod ${zodBeforeVersion}. Dopo: cartella attuale con zod ${zodAfterVersion}.`);

// Generatore di dati a caso dalla forma dello schema (zod 3: `_def.typeName`,
// zod 4: `_zod.def.type`), con sequenza fissa per avere ogni volta gli
// stessi dati.
let seed = 12345;
const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (list) => list[Math.floor(random() * list.length)];
const JUNK = [undefined, null, "", " ", "abc", "x".repeat(300), 0, -1, 1.5, 42, NaN, true, false, [], {}, "2026-10-24", "2026-10-24T10:00:00Z", "2026-10-24T10:00:00+02:00", "10:30", "25:00", "mario@example.com", "mario@", "https://example.com/a.jpg", "ftp://x", "not a url", "00000000-0000-0000-0000-000000000001", "3f8c2a9e-1b2c-4d3e-8f9a-0b1c2d3e4f50", "123456", "12 34 56", "+39 333 1234567", "3331234567", "RSSMRA85T10A562S", "12345678901", "Password1", "password", "HOME", "ONLINE", "idraulico", "Latina"];
const STRINGS = JUNK.filter((v) => typeof v === "string");

/** La forma di uno schema, uguale per zod 3 e zod 4. */
function describe(schema) {
  const v4 = schema._zod?.def;
  if (v4) {
    const checks = (v4.checks ?? []).map((c) => c._zod.def);
    const get = (kind) => checks.find((c) => c.check === kind);
    switch (v4.type) {
      case "optional": case "nullable": case "default": case "prefault": case "catch": case "readonly": case "nonoptional":
        return { kind: v4.type === "prefault" ? "default" : v4.type, inner: v4.innerType };
      case "pipe": return { kind: "wrap", inner: v4.in };
      case "lazy": return { kind: "wrap", inner: v4.getter() };
      case "string": return { kind: "string", min: get("min_length")?.minimum, max: get("max_length")?.maximum, regex: checks.find((c) => c.format === "regex")?.pattern };
      case "number": return { kind: "number", min: get("greater_than")?.value, max: get("less_than")?.value };
      case "boolean": return { kind: "boolean" };
      case "literal": return { kind: "literal", value: v4.values[0] };
      case "enum": return { kind: "enum", values: Object.values(v4.entries) };
      case "array": return { kind: "array", element: v4.element };
      case "object": return { kind: "object", shape: v4.shape };
      case "union": return { kind: "union", options: v4.options };
      case "record": return { kind: "record", value: v4.valueType };
      case "tuple": return { kind: "tuple", items: v4.items };
      default: return { kind: "other" };
    }
  }
  const d = schema._def;
  const check = (kind) => d.checks?.find((c) => c.kind === kind);
  switch (d?.typeName) {
    case "ZodOptional": return { kind: "optional", inner: d.innerType };
    case "ZodNullable": return { kind: "nullable", inner: d.innerType };
    case "ZodDefault": return { kind: "default", inner: d.innerType };
    case "ZodEffects": return { kind: "wrap", inner: d.schema };
    case "ZodPipeline": return { kind: "wrap", inner: d.in };
    case "ZodBranded": case "ZodReadonly": case "ZodCatch": return { kind: "wrap", inner: d.innerType ?? d.type };
    case "ZodLazy": return { kind: "wrap", inner: d.getter() };
    case "ZodString": return { kind: "string", min: check("min")?.value, max: check("max")?.value, regex: check("regex")?.regex };
    case "ZodNumber": return { kind: "number", min: check("min")?.value, max: check("max")?.value };
    case "ZodBoolean": return { kind: "boolean" };
    case "ZodLiteral": return { kind: "literal", value: d.value };
    case "ZodEnum": return { kind: "enum", values: d.values };
    case "ZodNativeEnum": return { kind: "enum", values: Object.values(d.values) };
    case "ZodArray": return { kind: "array", element: d.type };
    case "ZodObject": return { kind: "object", shape: d.shape() };
    case "ZodUnion": return { kind: "union", options: d.options };
    case "ZodRecord": return { kind: "record", value: d.valueType };
    case "ZodTuple": return { kind: "tuple", items: d.items };
    default: return { kind: "other" };
  }
}

function generate(schema, depth = 0) {
  if (random() < 0.12 || depth > 4) return pick(JUNK);
  const s = describe(schema);
  switch (s.kind) {
    case "optional": return random() < 0.3 ? undefined : generate(s.inner, depth);
    case "nullable": return random() < 0.2 ? null : generate(s.inner, depth);
    case "default": return random() < 0.4 ? undefined : generate(s.inner, depth);
    case "catch": case "readonly": case "nonoptional": case "wrap": return generate(s.inner, depth);
    case "string": {
      const r = random();
      if (r < 0.15 && s.min !== undefined) return "a".repeat(Math.max(0, s.min - 1));
      if (r < 0.3 && s.max !== undefined) return "a".repeat(s.max + (random() < 0.5 ? 0 : 1));
      if (r < 0.45 && s.min !== undefined) return "a".repeat(s.min);
      if (s.regex) {
        const matching = STRINGS.filter((v) => s.regex.test(v));
        if (matching.length && random() < 0.6) return pick(matching);
      }
      return pick(STRINGS);
    }
    case "number": {
      const r = random();
      if (r < 0.2 && s.min !== undefined) return s.min - (random() < 0.5 ? 0 : 1);
      if (r < 0.4 && s.max !== undefined) return s.max + (random() < 0.5 ? 0 : 1);
      return pick([0, 1, 5, 20, 100, 1000, 1.5, -3, 2500, 99999999, NaN, "5"]);
    }
    case "boolean": return pick([true, false, "true", 1]);
    case "literal": return random() < 0.7 ? s.value : pick(JUNK);
    case "enum": return random() < 0.8 ? pick(s.values) : pick(JUNK);
    case "array": return Array.from({ length: Math.floor(random() * 4) }, () => generate(s.element, depth + 1));
    case "object": {
      const value = {};
      for (const key of Object.keys(s.shape)) {
        const v = generate(s.shape[key], depth + 1);
        if (v !== undefined || random() < 0.2) value[key] = v;
      }
      if (random() < 0.05) value.extraKey = 1;
      return value;
    }
    case "union": return generate(pick(s.options), depth);
    case "record": return { a: generate(s.value, depth + 1) };
    case "tuple": return s.items.map((item) => generate(item, depth + 1));
    default: return pick(JUNK);
  }
}

const copy = (value) => (value === undefined ? undefined : structuredClone(value));
function outcome(schema, input) {
  let result;
  try {
    result = schema.safeParse(copy(input));
  } catch (error) {
    return { eccezione: String(error) };
  }
  if (result.success) return { ok: true, dati: JSON.stringify(result.data) };
  const issues = result.error.issues;
  if (ALL_ISSUES) return { ok: false, errori: issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const fieldErrors = {};
  for (const issue of issues) if (issue.path.length > 0) (fieldErrors[String(issue.path[0])] ??= []).push(issue.message);
  return { ok: false, primo: issues[0] && `${issues[0].path.join(".")}: ${issues[0].message}`, api: Object.values(fieldErrors).flat()[0] ?? null };
}

// Differenze già spiegate nel registro, che non fermano la CI: lo schema e
// l'inizio del primo errore di prima.
const ACCEPTED = [
  // zod 4 controlla prima i valori e poi la lunghezza dell'elenco (§324).
  { schema: "agendaWeekTemplateSchema", before: "days: Array must contain exactly 7 element(s)" },
];
const accepted = (name, d) => ACCEPTED.some((a) => a.schema === name && typeof d.prima.primo === "string" && d.prima.primo.startsWith(a.before));

const isSchema = (value) => value && typeof value.safeParse === "function";
const names = Object.keys(after).filter((name) => isSchema(after[name]));
const missing = names.filter((name) => !isSchema(before[name]));
let tests = 0;
let acceptedCount = 0;
const differences = new Map();
for (const name of names.filter((n) => isSchema(before[n]))) {
  for (let i = 0; i < RUNS; i++) {
    const input = generate(before[name]);
    const a = JSON.stringify(outcome(before[name], input));
    const b = JSON.stringify(outcome(after[name], input));
    tests++;
    if (a === b) continue;
    const difference = { input, prima: JSON.parse(a), dopo: JSON.parse(b) };
    if (!ALL_ISSUES && accepted(name, difference)) {
      acceptedCount++;
      continue;
    }
    const list = differences.get(name) ?? [];
    list.push(difference);
    differences.set(name, list);
  }
}

const total = [...differences.values()].reduce((n, list) => n + list.length, 0);
console.log(`${names.length - missing.length} schemi, ${tests} prove, ${total} differenze (più ${acceptedCount} già spiegate nel registro).`);
if (missing.length) console.log(`Schemi nuovi, senza confronto: ${missing.join(", ")}`);
for (const [name, list] of differences) {
  console.log(`\n${name}: ${list.length} differenze, per esempio`);
  for (const d of list.slice(0, 2)) console.log(JSON.stringify(d, null, 1).slice(0, 1200));
}
process.exitCode = total > 0 ? 1 : 0;
