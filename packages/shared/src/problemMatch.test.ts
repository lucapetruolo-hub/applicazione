import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { matchProblem, serviceMatchingProblem } from "./problemMatch";
import { DEFAULT_PROBLEM_EXAMPLES, describeProblemExample, orderProblemExamples } from "./problemExamples";

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
  // Quadro e interruttori che si muovono o scaldano (docs/changelog/2026-11-13-pericoli-dalla-foto.md).
  assert.equal(matchProblem("il quadro elettrico è tutto allentato").safety, "elettrico");
  assert.equal(matchProblem("l'interruttore della cucina scotta").safety, "elettrico");
  assert.equal(matchProblem("il salvavita ronza da ieri sera").safety, "elettrico");
  assert.equal(matchProblem("voglio spostare il quadro elettrico in corridoio").safety, null);
  assert.equal(matchProblem("la presa fa scintille").safety, "elettrico");
  assert.equal(matchProblem("sento un rumore strano nel muro quando piove e c'è una macchia scura vicino alla presa").safety, "acqua-elettrico");
  assert.equal(matchProblem("devo installare la lavatrice nuova").outOfService, null);
  assert.equal(matchProblem("macchia di umido sul soffitto del bagno").question?.id, "macchia");
  // Domande aggiunte il 9/11 (docs/changelog/2026-11-09-domande-preventivo.md).
  assert.equal(matchProblem("la caldaia non riparte dopo che è saltata la corrente").question?.id, "caldaia-corrente");
  assert.equal(matchProblem("sigillare il box doccia").question?.id, "perde-acqua");
  assert.equal(matchProblem("rifare la recinzione").question?.id, "recinzione");
  // Un mestiere che stacca l'altro non fa domande.
  assert.equal(matchProblem("montare il box doccia").question, null);
});

test("guasti degli elettrodomestici al mestiere Elettrodomestici", () => {
  // Prima erano "fuori servizio" (docs/changelog/2026-11-06-mestiere-elettrodomestici.md).
  for (const text of [
    "la lavatrice non scarica e dà errore E21",
    "il frigorifero non raffredda più",
    "la lavastoviglie non lava bene i piatti",
    "il forno non scalda",
    "lavatrice Candy rotta",
    "riparazione elettrodomestici",
    "cerco un tecnico per la lavatrice",
    "il microonde non si accende",
  ]) {
    const match = matchProblem(text);
    assert.equal(match.categories[0]?.slug, "elettrodomestici", text);
    assert.equal(match.outOfService, null, text);
  }
  // Installarli o collegarli resta agli altri mestieri.
  assert.notEqual(matchProblem("devo installare la lavatrice nuova").categories[0]?.slug, "elettrodomestici");
  assert.notEqual(matchProblem("collegare lo scarico della lavastoviglie").categories[0]?.slug, "elettrodomestici");
  // Il pericolo resta del dizionario.
  assert.equal(matchProblem("il microonde fa fumo e puzza di bruciato").safety, "elettrico");
  // La prestazione di Elettricista e Tutto Fare porta al mestiere nuovo: così
  // compaiono in "Potrebbero fare anche questo lavoro".
  assert.equal(matchProblem("Riparazione elettrodomestici").categories[0]?.slug, "elettrodomestici");
  assert.equal(serviceMatchingProblem([{ name: "Riparazione elettrodomestici" }, { name: "Impianto elettrico civile" }], "la lavatrice non scarica")?.name, "Riparazione elettrodomestici");
});

test("tende da sole e zanzariere al loro mestiere", () => {
  // Prima "fuori servizio" (docs/changelog/2026-11-06-mestiere-elettrodomestici.md).
  for (const text of ["tende da sole", "il motore della tenda da sole non va", "installazione pergotenda su balcone", "il vento ha strappato il telo della tenda", "cerco un tendista", "zanzariere su misura per tre finestre"]) {
    const match = matchProblem(text);
    assert.equal(match.categories[0]?.slug, "tende-da-sole", text);
    assert.equal(match.outOfService, null, text);
  }
  // Il Tutto Fare resta tra i possibili per le zanzariere.
  assert.ok(matchProblem("montare le zanzariere").categories.some((c) => c.slug === "tuttofare"));
});

test("ricerche frequenti su Google che il dizionario prima non capiva", () => {
  // analisi/servizi-piu-cercati.md (06/11/2026).
  assert.equal(matchProblem("rifare il tetto").categories[0]?.slug, "muratore");
  assert.equal(matchProblem("tegole rotte sul tetto").categories[0]?.slug, "muratore");
  assert.equal(matchProblem("svuota cantine").categories[0]?.slug, "traslochi");
  assert.equal(matchProblem("stiratura a domicilio").categories[0]?.slug, "pulizie");
  assert.equal(matchProblem("cerco un montatore di mobili").categories[0]?.slug, "tuttofare");
  assert.equal(matchProblem("lattoniere per le grondaie").categories[0]?.slug, "muratore");
});

test("prestazione che corrisponde al problema", () => {
  const services = [{ name: "Riparazione perdite" }, { name: "Sostituzione rubinetto" }, { name: "Lucidatura parquet" }, { name: "Spurgo scarichi" }];
  assert.equal(serviceMatchingProblem(services, "Il rubinetto della cucina perde")?.name, "Sostituzione rubinetto");
  assert.equal(serviceMatchingProblem(services, "Lo scarico del lavandino è intasato")?.name, "Spurgo scarichi");
  // Parole generiche e parole corte simili non bastano.
  assert.equal(serviceMatchingProblem(services, "Serve una riparazione, manca la luce"), undefined);
  assert.equal(serviceMatchingProblem([], "Il rubinetto perde"), undefined);
});

test("frasi d'esempio della home: tutte riconosciute con sicurezza", () => {
  for (const text of DEFAULT_PROBLEM_EXAMPLES) {
    assert.notEqual(describeProblemExample(text).categorySlug, null, text);
  }
});

test("frasi d'esempio della home: prima una per mestiere, nell'ordine delle ricerche", () => {
  const { examples, trades } = orderProblemExamples(DEFAULT_PROBLEM_EXAMPLES, ["pulizie", "idraulico"]);
  assert.equal(examples[0]?.categorySlug, "pulizie");
  assert.equal(examples[1]?.categorySlug, "idraulico");
  assert.deepEqual(trades.map((t) => t.slug), ["pulizie", "idraulico", "elettricista"]);
});

test("frasi d'esempio della home: senza ricerche l'ordine di Google, i mestieri del lancio nelle prime cinque", () => {
  const { examples } = orderProblemExamples(DEFAULT_PROBLEM_EXAMPLES, []);
  assert.deepEqual(
    examples.slice(0, 5).map((e) => e.categorySlug),
    ["idraulico", "elettricista", "pulizie", "falegname", "climatizzazione"],
  );
});

test("nomi dei mestieri: termoidraulico e simili portano subito alle categorie giuste", () => {
  const cases: [string, string[]][] = [
    ["termoidraulico", ["idraulico", "climatizzazione"]],
    ["Termoidraulica Rossi", ["idraulico", "climatizzazione"]],
    ["stagnino", ["idraulico"]],
    ["caldaista", ["climatizzazione"]],
    ["frigorista", ["climatizzazione"]],
    ["manutentore caldaie", ["climatizzazione"]],
    ["impiantista", ["idraulico", "elettricista", "climatizzazione"]],
    ["piastrellista", ["muratore"]],
    ["fabbri", ["fabbro"]],
    ["giardinaggio", ["giardiniere"]],
    ["petsitter", ["dogsitter"]],
    ["installatore fotovoltaico", ["elettricista"]],
    ["installatore di pannelli solari", ["elettricista"]],
  ];
  for (const [text, expected] of cases) {
    const match = matchProblem(text);
    assert.deepEqual(match.categories.map((category) => category.slug), expected, text);
    assert.equal(match.confident, true, text);
    assert.equal(match.question, null, text);
  }
  // La caldaia scritta accanto al nome passa davanti.
  assert.equal(matchProblem("termoidraulico per la caldaia in blocco").categories[0]?.slug, "climatizzazione");
  // "fabbricato" non è il fabbro.
  assert.equal(matchProblem("fabbricato").categories.length, 0);
});

test("fotovoltaico: impianto, accumulo e wallbox all'elettricista, pulizia alle pulizie, solare termico a caldaie e idraulico", () => {
  const cases: [string, string][] = [
    ["vorrei installare i pannelli fotovoltaici sul tetto", "elettricista"],
    ["fotovoltaico", "elettricista"],
    ["preventivo per pannelli solari da 6 kW", "elettricista"],
    ["aggiungere una batteria di accumulo all'impianto", "elettricista"],
    ["installare una wallbox in garage per l'auto elettrica", "elettricista"],
    ["l'inverter del fotovoltaico segna errore", "elettricista"],
    ["pulizia dei pannelli solari sul tetto", "pulizie"],
    ["pannelli solari termici per l'acqua calda", "climatizzazione"],
    ["il solare termico non scalda più l'acqua", "climatizzazione"],
  ];
  for (const [text, expected] of cases) {
    assert.equal(matchProblem(text).categories[0]?.slug, expected, text);
  }
  // "Inverter" da solo è anche il condizionatore.
  assert.equal(matchProblem("il condizionatore inverter non raffredda").categories[0]?.slug, "climatizzazione");
});
