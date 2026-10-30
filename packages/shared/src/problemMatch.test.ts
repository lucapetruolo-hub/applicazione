import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { matchProblem } from "./problemMatch";

// Banco di prova (analisi/abbinamento-problema/fase1-numeri.md): 769 frasi
// vere etichettate a mano. Il "mucchio chiuso" non si usa per tarare il
// dizionario, serve solo a misurarlo.
type Row = { id: string; frase: string; mestiere: string; mestiere2: string; sicurezza: string; fuori_servizio: string; non_e_un_lavoro: string; mucchio: string };

function parseCsv(text: string): Row[] {
  const lines: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ";") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      lines.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) lines.push([...row, field]);
  const [header, ...body] = lines;
  return body.filter((cells) => cells.length > 1).map((cells) => Object.fromEntries(header!.map((key, index) => [key, cells[index] ?? ""])) as Row);
}

const rows = parseCsv(readFileSync(join(__dirname, "..", "test-data", "banco-problemi.csv"), "utf8"));

function measure(set: string) {
  const jobs = rows.filter((row) => row.mucchio === set && !row.non_e_un_lavoro && row.mestiere);
  let first = 0;
  let firstTwo = 0;
  let confident = 0;
  let confidentRight = 0;
  for (const row of jobs) {
    const match = matchProblem(row.frase);
    const good = new Set([row.mestiere, row.mestiere2].filter(Boolean));
    const top = match.categories[0]?.slug;
    const right = top !== undefined && good.has(top);
    if (right) first++;
    if (right || match.categories.slice(0, 2).some((c) => good.has(c.slug))) firstTwo++;
    if (match.confident) {
      confident++;
      if (right) confidentRight++;
    }
  }
  const dangerous = rows.filter((row) => row.mucchio === set && row.sicurezza !== "no");
  const missedDanger = dangerous.filter((row) => matchProblem(row.frase).safety === null).map((row) => row.id);
  return { jobs: jobs.length, first: first / jobs.length, firstTwo: firstTwo / jobs.length, confidentRight: confidentRight / confident, missedDanger };
}

test("banco di prova: il banco c'è tutto", () => {
  assert.equal(rows.length, 769);
});

test("mucchio di lavoro: mestiere giusto, pericoli, dizionario mai sicuro a torto", () => {
  const result = measure("lavoro");
  assert.ok(result.first >= 0.9, `primo posto ${result.first}`);
  assert.ok(result.firstTwo >= 0.95, `primi due ${result.firstTwo}`);
  assert.ok(result.confidentRight >= 0.99, `sicuro e giusto ${result.confidentRight}`);
  assert.deepEqual(result.missedDanger, []);
});

test("mucchio chiuso: nessun pericolo senza avviso, il resto non peggiora", () => {
  const result = measure("chiuso");
  assert.deepEqual(result.missedDanger, []);
  assert.ok(result.first >= 0.88, `primo posto ${result.first}`);
  assert.ok(result.confidentRight >= 0.98, `sicuro e giusto ${result.confidentRight}`);
});

test("casi tipici", () => {
  assert.equal(matchProblem("Il rubinetto della cucina gocciola").categories[0]?.slug, "idraulico");
  assert.equal(matchProblem("Mi è rimasta la chiave dentro e la porta blindata non si apre").categories[0]?.slug, "fabbro");
  assert.equal(matchProblem("sento puzza di gas in cucina").safety, "gas");
  assert.equal(matchProblem("la presa fa scintille").safety, "elettrico");
  assert.equal(matchProblem("sento un rumore strano nel muro quando piove e c'è una macchia scura vicino alla presa").safety, "acqua-elettrico");
  assert.equal(matchProblem("la lavatrice non scarica e dà errore E21").outOfService, "elettrodomestici");
  assert.equal(matchProblem("devo installare la lavatrice nuova").outOfService, null);
  assert.equal(matchProblem("macchia di umido sul soffitto del bagno").question?.id, "macchia");
});
