// Una parola per ogni momento del lavoro (docs/glossario.md, collaudo del
// 29/10 O-03 e dell'8/11 E6-09): nei testi per clienti e professionisti mai
// "intervento", "prenotazione", "Da quotare", "lavoro completato/ottenuto".
// Controlla le pagine del sito, i testi condivisi e tutta l'API (email,
// notifiche, WhatsApp, errori, e anche le email che partono da un'azione in
// Admin: le leggono clienti e professionisti); salta test, commenti e le
// pagine admin del sito, che legge solo chi gestisce.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const repo = new URL("../../..", import.meta.url).pathname;
const roots = ["apps/web/src", "packages/shared/src", "packages/ui/src", "apps/api/src"];
const webAdmin = new Set(["apps/web/src/app/admin", "apps/web/src/components/admin"].map((dir) => join(repo, dir)));
const PHRASES = [
  [/\b(l'|un |dell'|sull'|all'|nell'|quest'|questo |ogni |nuovo )intervent[oi]\b/i, "lavoro o appuntamento"],
  [/\b(la|una|della|alla|nella|le|delle|nuova|nuove|questa|tua|tue) prenotazion[ei]\b/i, "lavoro o appuntamento"],
  [/\blavor[oi] (completat|ottenut|conclus)[oi]\b/i, "lavoro terminato o fissato"],
  [/\bDa quotare\b/, "Da rispondere"],
];

const files = [];
for (const root of roots) (function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "node_modules" && name !== "dist" && !webAdmin.has(path)) walk(path);
    } else if (/\.(tsx?|mjs)$/.test(name) && !/\.(test|spec)\./.test(name)) files.push(path);
  }
})(join(repo, root));

const errors = [];
for (const file of files) {
  readFileSync(file, "utf8").split("\n").forEach((line, index) => {
    const code = line.trim();
    if (line.includes("glossario: ok")) return;
    if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*") || code.startsWith("{/*")) return;
    // Un commento in coda alla riga non conta.
    const text = line.replace(/\s\/\/\s.*$/, "");
    for (const [phrase, better] of PHRASES) {
      const match = text.match(phrase);
      if (match) errors.push(`${relative(repo, file)}:${index + 1}: "${match[0]}" (usa: ${better})`);
    }
  });
}
if (errors.length > 0) {
  console.error("Parole fuori dal glossario (docs/glossario.md):\n" + errors.join("\n"));
  process.exit(1);
}
