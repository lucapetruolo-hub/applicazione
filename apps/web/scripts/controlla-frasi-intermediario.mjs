// Il sito resta un intermediario (CLAUDE.md §5 punto 18,
// docs/changelog/2026-11-03-piattaforma-di-intermediazione.md): nei testi
// per clienti e professionisti mai frasi che fanno sembrare noi il fornitore
// del lavoro. Controlla le pagine del sito, i testi condivisi e le email,
// notifiche e messaggi WhatsApp dell'API; salta test e commenti.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const repo = new URL("../../..", import.meta.url).pathname;
const roots = ["apps/web/src", "packages/shared/src", "packages/ui/src", "apps/api/src/email", "apps/api/src/notifications", "apps/api/src/whatsapp"];
const PHRASES = [
  /\b(i|il|dei|ai|coi|con i|tra i|uno dei) nostr[oi] (professionist|artigian|idraulic|elettricist|imbianchin|tecnic|operator)/i,
  /\bgarantiamo (il|i) lavor/i,
  /\blavor[oi] garantit/i,
  /\bti mandiamo (un|il) professionista/i,
];

const files = [];
for (const root of roots) (function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "node_modules" && name !== "dist") walk(path);
    } else if (/\.(tsx?|mjs)$/.test(name) && !/\.(test|spec)\./.test(name)) files.push(path);
  }
})(join(repo, root));

const errors = [];
for (const file of files) {
  readFileSync(file, "utf8").split("\n").forEach((line, index) => {
    const code = line.trim();
    if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*")) return;
    for (const phrase of PHRASES) {
      if (phrase.test(line)) errors.push(`${relative(repo, file)}:${index + 1}: "${line.match(phrase)[0]}"`);
    }
  });
}
if (errors.length > 0) {
  console.error("Frasi che fanno sembrare la piattaforma il fornitore del lavoro (CLAUDE.md §5 punto 18):\n" + errors.join("\n"));
  process.exit(1);
}
