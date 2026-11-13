import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildServiceCatalog } from "@professionisti/shared";
import { systemPrompt } from "./problem-match.service";

// Le frasi di prova servono solo a misurare: non entrano mai nelle istruzioni
// dell'IA, nemmeno come esempio (docs/changelog/2026-11-13-banco-prestazioni-esperto.md).
// Se questo test si ferma, l'esempio va scritto con una frase della pila "lavoro".
const testData = join(__dirname, "..", "..", "..", "..", "packages", "shared", "test-data");

function rows(file: string): Record<string, string>[] {
  const [head, ...body] = readFileSync(join(testData, file), "utf8").split(/\r?\n/).filter(Boolean);
  const keys = head!.split(";");
  return body.map((line) => {
    const values = line.split(";").map((value) => value.trim());
    // L'ultima colonna resta l'ultima anche se la frase contiene un punto e virgola.
    return { ...Object.fromEntries(values.map((value, i) => [keys[i], value])), [keys.at(-1)!]: values.at(-1)! };
  });
}

const words = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

describe("pila di prova separata dalle istruzioni", () => {
  it("nessuna frase di prova compare nelle istruzioni dell'IA, nemmeno a pezzi di 5 parole", () => {
    const serviceIds = new Set(rows("banco-prestazioni.csv").map((row) => row.id));
    const closed = rows("banco-problemi.csv").filter((row) => row.mucchio === "chiuso" || serviceIds.has(row.id!));
    expect(closed.length).toBeGreaterThan(150);
    const prompt = ` ${words(systemPrompt(buildServiceCatalog({})))} `;
    const found: string[] = [];
    for (const row of closed) {
      const list = words(row.frase!).split(" ");
      for (let i = 0; i + 5 <= list.length; i++) {
        const piece = list.slice(i, i + 5).join(" ");
        if (prompt.includes(` ${piece} `)) found.push(`${row.id}: ${piece}`);
      }
    }
    expect(found).toEqual([]);
  });
});
