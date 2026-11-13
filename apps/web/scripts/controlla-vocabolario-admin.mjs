// Parole dell'Admin che capiscono quasi tutti (richiesta di Luca del 13/11/2026,
// docs/changelog/2026-11-13-admin-scritte-semplici.md): si contano le parole
// dei testi visibili dell'Admin che stanno nel Nuovo vocabolario di base di
// De Mauro (vocabolario-di-base.txt, circa 7.000 parole capite da quasi tutti
// gli italiani). Il controllo ferma `pnpm lint` se la quota scende sotto
// QUOTA_MIN e, con --elenco, stampa le parole difficili più usate.
// Le parole del sito che l'admin deve conoscere (email, preventivo...) sono in
// PAROLE_DEL_SITO, ognuna con il motivo.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const repo = new URL("../../..", import.meta.url).pathname;
const QUOTA_MIN = 95;

const lemmi = readFileSync(new URL("./vocabolario-di-base.txt", import.meta.url), "utf8")
  .split("\n").map((w) => w.trim().toLowerCase()).filter((w) => w && !w.startsWith("#"));

// Parole che l'admin incontra ogni giorno sul sito o sul telefono.
const PAROLE_DEL_SITO = [
  // nomi che tutti usano già così
  "email", "app", "password", "link", "chat", "online", "whatsapp", "google", "excel", "pdf", "iva", "account",
  "admin", "selfie", "browser", "web", "ok", "euro", "foto", "video", "sms", "internet", "computer", "click", "clic",
  // parole del sito, spiegate nella guida dell'Admin
  "professionista", "professionisti", "preventivo", "preventivi", "recensione", "recensioni", "abbonamento",
  "abbonamenti", "notifica", "notifiche", "promemoria", "saldo", "saldi", "acconto", "acconti", "riepilogo",
  "commercialista", "commercialisti", "trimestre", "trimestri", "riepiloghi", "fisco", "visura", "camerale", "badge",
];

// Forme dei verbi irregolari più comuni che non si ricavano dalle regole sotto.
const IRREGOLARI = `è sei siamo siete sono era erano sarà saranno sarò sarebbe sia siano stato stata stati state
ho hai ha abbiamo avete hanno aveva avrà avrò avrebbe abbia abbiano avuto
posso puoi può possiamo potete possono potrà potrebbe
voglio vuoi vuole vogliamo volete vogliono vorrà vorrebbe
devo devi deve dobbiamo dovete devono dovrà dovrebbe
faccio fai fa facciamo fate fanno farà faranno farebbe fatto fatta fatti fatte rifà rifai rifatto rifatta facendo
dico dici dice diciamo dite dicono dirà detto detta dicendo
vado vai va andiamo andate vanno andrà andrebbe
vengo vieni viene veniamo venite vengono verrà venuto venuta
tengo tieni tiene teniamo tengono terrà
sto stai sta stiamo state stanno starà
so sai sa sappiamo sanno saprà
do dai dà diamo danno darà dato data dati
esce escono esci
tolto tolta tolti tolte tolga tolgono
accolto accolta accolti accolte accolga
messo messa messi messe rimesso
preso presa presi prese ripreso
chiesto chiesta chiesti chieste richiesto richiesta richieste
risposto risposta scritto scritta scritti scritte letto letta letti lette visto vista visti viste
aperto aperta aperti aperte chiuso chiusa chiusi chiuse deciso decisa decisi decise
rimasto rimasta rimasti rimaste emesso emessa emessi emesse
successo successa successi spento spenta spenti acceso accesa accesi
risolto risolta risolti risolte scelto scelta scelti scelte sceglie scelgono
nato nata morto morta corso corsa mosso mossa
compare compaiono appare appaiono parte partono
`.split(/\s+/).filter(Boolean);

const forme = new Set([...IRREGOLARI, ...PAROLE_DEL_SITO]);
const ENCLITICI = ["", "lo", "la", "li", "le", "ne", "si", "ci", "mi", "ti", "gli", "glielo"];
function aggiungiVerbo(lemma) {
  const m = lemma.match(/^(.*)(are|ere|ire)(si)?$/);
  if (!m) return false;
  const [, r, tipo] = m;
  const a = tipo === "are";
  const h = a && /[cg]$/.test(r) ? "h" : ""; // cercare -> cerchi, pagare -> paghi
  const i = /i$/.test(r) ? "" : "i"; // mangiare -> mangi, togliere -> togli
  const isc = tipo === "ire" ? ["isc", ""] : [""];
  const base = [];
  for (const x of isc) {
    base.push(...(a
      ? [`${r}o`, `${r}${h}${i}`, `${r}a`, `${r}${h}${i}amo`, `${r}ate`, `${r}ano`, `${r}${h}${i}no`, `${r}${h}${i}`]
      : [`${r}${x}o`, `${r}${x === "isc" ? "isci" : i}`, `${r}${x === "isc" ? "isce" : "e"}`, `${r}iamo`, `${r}${tipo === "ere" ? "ete" : "ite"}`, `${r}${x}ono`, `${r}${x}a`, `${r}${x}ano`]));
  }
  const v = a ? "a" : tipo === "ere" ? "e" : "i";
  const fut = a ? "e" : v === "e" ? "e" : "i";
  base.push(
    `${r}${v}vo`, `${r}${v}vi`, `${r}${v}va`, `${r}${v}vamo`, `${r}${v}vate`, `${r}${v}vano`,
    ...["ò", "ai", "à", "emo", "ete", "anno", "ei", "ebbe", "emmo", "este", "ebbero"].map((e) => `${r}${h}${fut}r${e}`),
    `${r}${v}i`, `${r}${a ? "ò" : v === "e" ? "é" : "ì"}`, `${r}${v}mmo`, `${r}${v}ste`, `${r}${a ? "arono" : v === "e" ? "erono" : "irono"}`,
    `${r}${v}ssi`, `${r}${v}sse`, `${r}${v}ssero`,
    `${r}${a ? "ando" : "endo"}`, `${r}${a ? "ante" : "ente"}`, `${r}${a ? "anti" : "enti"}`,
  );
  const part = a ? "at" : tipo === "ere" ? "ut" : "it";
  for (const e of ["o", "a", "i", "e"]) base.push(`${r}${part}${e}`);
  const inf = `${r}${tipo.slice(0, 2)}`; // cercar-, veder-, sentir-
  for (const enc of ENCLITICI) {
    forme.add(`${r}${tipo}${enc}`);
    if (enc) { forme.add(`${inf}${enc}`); forme.add(`${r}${a ? "a" : i}${enc}`); forme.add(`${r}${a ? "ando" : "endo"}${enc}`); }
  }
  for (const f of base) forme.add(f);
  return true;
}
for (const lemma of lemmi) {
  forme.add(lemma);
  aggiungiVerbo(lemma); // anche "mestiere" finisce in -ere: si aggiungono pure le forme del nome
  const r = lemma.slice(0, -1);
  const fine = lemma.slice(-1);
  if (/ione$/.test(lemma)) forme.add(`${lemma.slice(0, -1)}i`);
  if (fine === "o") ["a", "i", "e"].forEach((e) => forme.add(r + e));
  if (/io$/.test(lemma)) forme.add(r); // messaggio -> messaggi
  if (fine === "e") forme.add(`${r}i`);
  if (fine === "a") ["e", "i"].forEach((e) => forme.add(r + e));
  if (/[cg][oa]$/.test(lemma)) ["hi", "he", "i"].forEach((e) => forme.add(r + e));
  if (/mente$/.test(lemma) === false && /[oe]$/.test(lemma)) forme.add(`${lemma.replace(/o$/, "a").replace(/le$/, "l")}mente`);
  if (/[oe]$/.test(lemma)) { forme.add(`${r}issimo`); forme.add(`${r}issima`); }
}
const PICCOLE = new Set("del dello della dei degli delle dal dallo dalla dai dagli dalle nel nello nella nei negli nelle sul sullo sulla sui sugli sulle all allo alla ai agli alle dell nell sull dall col coi tuo tua tuoi tue suo sua suoi sue mio mia miei mie nostro nostra nostri nostre vostro loro quel quei quegli quello quella quelle questo questa questi queste nessun nessuno nessuna ogni gli ciò cui far aver buon vuol".split(" "));
// "ri" davanti a una parola comune la lascia comune: riattiva, ricontrolla, riaperta.
const capita = (w) => PICCOLE.has(w) || forme.has(w) || /^\d/.test(w) || (/^ri/.test(w) && forme.has(w.slice(2)));

const files = [];
for (const dir of ["apps/web/src/app/admin", "apps/web/src/components/admin"]) (function walk(path) {
  for (const name of readdirSync(path)) {
    const full = join(path, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.tsx?$/.test(name) && !/\.(test|spec)\./.test(name)) files.push(full);
  }
})(join(repo, dir));

const NON_TESTO = new Set(["className", "style", "id", "href", "key", "type", "name", "src", "rel", "target", "role", "method", "autoComplete", "inputMode", "pattern", "lang"]);
function nascosto(node) {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isJsxAttribute(n) && NON_TESTO.has(n.name.getText())) return true;
    if (ts.isJsxElement(n) && ["style", "TechNote"].includes(n.openingElement.tagName.getText())) return true;
    if (ts.isImportDeclaration(n) || ts.isTypeNode(n)) return true;
    if (ts.isExpressionStatement(n) && n.parent === node.getSourceFile()) return true; // "use client"
  }
  return false;
}

let tot = 0;
const difficili = new Map();
for (const file of files) {
  const source = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const conta = (node, text) => {
    if (!/\s/.test(text.trim()) && !ts.isJsxText(node)) return;
    if (!/[a-zà-ù]{3}/.test(text) || nascosto(node)) return;
    for (const raw of text.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/\S+@\S+|https?:\S+|mailto:\S+/g, "").match(/[A-Za-zÀ-ÿ]+/g) ?? []) {
      if (raw.length < 3 || /^[A-Z0-9]+$/.test(raw)) continue; // sigle: le controlla controlla-scritte-admin
      const w = raw.toLowerCase();
      tot += 1;
      if (!capita(w)) difficili.set(w, (difficili.get(w) ?? 0) + 1);
    }
  };
  (function visit(node) {
    if (ts.isJsxText(node)) conta(node, node.text);
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) conta(node, node.text);
    else if (ts.isTemplateExpression(node)) conta(node, [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(" "));
    ts.forEachChild(node, visit);
  })(sf);
}

const nonCapite = [...difficili.values()].reduce((a, b) => a + b, 0);
const quota = (100 * (tot - nonCapite)) / tot;
const elenco = [...difficili].sort((a, b) => b[1] - a[1]);
if (process.argv.includes("--elenco")) {
  console.log(`${tot} parole, ${quota.toFixed(1)}% nel vocabolario di base`);
  console.log(elenco.map(([w, c]) => `${w}:${c}`).join("  "));
} else if (quota < QUOTA_MIN) {
  console.error(
    `Solo il ${quota.toFixed(1)}% delle parole dell'Admin è nel vocabolario di base (serve almeno il ${QUOTA_MIN}%).\n` +
      `Usa parole più comuni. Le più usate fuori elenco: ${elenco.slice(0, 25).map(([w, c]) => `${w} (${c})`).join(", ")}\n` +
      "Elenco completo: node apps/web/scripts/controlla-vocabolario-admin.mjs --elenco",
  );
  process.exit(1);
}
