// React Compiler e `<style jsx>` non vanno d'accordo (docs/CHANGELOG.md §345):
// un componente compilato perde le classi jsx-... e i suoi stili non si
// applicano più. Ogni componente con `<style jsx>` deve quindi avere la
// direttiva "use no memo". Controllo grezzo ma sufficiente: in ogni file il
// numero di "use no memo" non può essere minore dei componenti con
// `<style jsx>` (funzioni che iniziano con la maiuscola).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../src", import.meta.url).pathname;
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (path.endsWith(".tsx")) files.push(path);
  }
})(root);

const errors = [];
for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  const owners = new Set();
  lines.forEach((line, index) => {
    if (!line.includes("<style jsx")) return;
    for (let i = index; i >= 0; i--) {
      if (/^(export )?(default )?function [A-Z]/.test(lines[i])) {
        owners.add(i);
        break;
      }
    }
  });
  const optOuts = lines.filter((line) => line.trim() === '"use no memo";').length;
  if (owners.size > optOuts) errors.push(`${file.replace(root, "src")}: ${owners.size} componenti con <style jsx>, ${optOuts} "use no memo"`);
}
if (errors.length > 0) {
  console.error('Componenti con <style jsx> senza "use no memo" (docs/CHANGELOG.md §345):\n' + errors.join("\n"));
  process.exit(1);
}
