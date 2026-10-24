// Avvia l'API finta e `next start` sulla build già fatta, lancia check.mjs e
// chiude tutto (docs/CHANGELOG.md §291). Uso: node run.mjs public|private
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const webDir = join(here, "..", "..");
const mode = process.argv[2];
const port = "3100";
const nextBin = createRequire(join(webDir, "package.json")).resolve("next/dist/bin/next");

const children = [
  spawn(process.execPath, [join(here, "fixture-api.mjs")], { stdio: "inherit" }),
  spawn(process.execPath, [nextBin, "start", "-p", port, "-H", "127.0.0.1"], { cwd: webDir, stdio: ["ignore", "ignore", "inherit"], detached: true }),
];
// next start apre un processo figlio: si chiude tutto il gruppo.
const stop = () =>
  children.forEach((child) => {
    try {
      if (child.spawnargs.includes("start")) process.kill(-child.pid, "SIGTERM");
      else child.kill("SIGTERM");
    } catch {
      // già chiuso
    }
  });

async function waitForSite() {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`http://127.0.0.1:${port}/robots.txt`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error("next start non risponde dopo 60 secondi");
}

try {
  await waitForSite();
  const check = spawn(process.execPath, [join(here, "check.mjs"), mode], { stdio: "inherit" });
  const code = await new Promise((resolve) => check.on("exit", resolve));
  stop();
  process.exit(code ?? 1);
} catch (err) {
  console.error(err);
  stop();
  process.exit(1);
}
