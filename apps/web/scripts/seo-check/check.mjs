// Controllo SEO delle pagine pubbliche (docs/CHANGELOG.md §295), eseguito in
// CI contro `next start` e l'API finta (fixture-api.mjs).
//   node check.mjs public   sito aperto (NEXT_PUBLIC_SITE_INDEXABLE=true)
//   node check.mjs private  sito privato: tutto in noindex, sitemap vuota
// Per ogni tipo di pagina: un solo H1, canonical assoluto giusto, titolo di
// lunghezza sensata, nessun noindex per sbaglio, dati strutturati leggibili;
// in più redirect dei link vecchi del profilo, 404 vero e sitemap.
import { PROFESSIONALS } from "./fixture-data.mjs";

const BASE = process.env.SEO_CHECK_BASE_URL ?? "http://127.0.0.1:3100";
const SITE_URL = "https://applicazione-web.vercel.app";
const mode = process.argv[2];
if (mode !== "public" && mode !== "private") {
  console.error("Uso: node check.mjs public|private");
  process.exit(2);
}

const pro = PROFESSIONALS[0];
const proPath = `/professionista/idraulica-rossi-latina-${pro.id}`;

/** Pagine da indicizzare, con il canonical atteso. */
const INDEXABLE = [
  ["/", "/"],
  ["/cerca", "/cerca"],
  ["/cerca/idraulico", "/cerca/idraulico"],
  ["/cerca/idraulico/latina", "/cerca/idraulico/latina"],
  [proPath, proPath],
  ["/per-professionisti", "/per-professionisti"],
  ["/per-professionisti/pagamenti", "/per-professionisti/pagamenti"],
  ["/faq", "/faq"],
  ["/contatti", "/contatti"],
  ["/sicurezza", "/sicurezza"],
  ["/preventivo", "/preventivo"],
  ["/urgente", "/urgente"],
  ["/privacy", "/privacy"],
  ["/termini", "/termini"],
  ["/cookie", "/cookie"],
  ["/accessibilita", "/accessibilita"],
  ["/prezzi/idraulico", "/prezzi/idraulico"],
  ["/lavora-con-noi/pulizie", "/lavora-con-noi/pulizie"],
];

/** Pagine che devono restare fuori da Google anche col sito aperto. */
const NOINDEX = [
  "/cerca/pulizie/latina", // meno di 3 professionisti veri
  "/cerca/pulizie", // nessun professionista vero in Italia
  "/cerca?citta=Latina", // ricerca filtrata
];

const failures = [];
const fail = (path, message) => failures.push(`${path}: ${message}`);

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
  return { res, html: res.status >= 300 && res.status < 400 ? "" : await res.text() };
}

function isNoindex(res, html) {
  const header = res.headers.get("x-robots-tag") ?? "";
  const metas = [...html.matchAll(/<meta[^>]+name="robots"[^>]*>/gi)].map((m) => m[0]);
  return /noindex/i.test(header) || metas.some((m) => /noindex/i.test(m));
}

function attr(tag, name) {
  return new RegExp(`${name}="([^"]*)"`, "i").exec(tag)?.[1];
}

function decode(text) {
  return text.replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function checkStructuredData(path, html) {
  for (const match of html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(match[1]);
      if (!data["@context"] || !data["@type"]) fail(path, "dati strutturati senza @context o @type");
    } catch {
      fail(path, "dati strutturati (JSON-LD) non validi");
    }
  }
}

async function checkIndexable(path, canonicalPath) {
  const { res, html } = await get(path);
  if (res.status !== 200) return fail(path, `stato ${res.status}, atteso 200`);
  if (isNoindex(res, html)) fail(path, "noindex su una pagina da indicizzare");
  const h1 = html.match(/<h1[\s>]/gi)?.length ?? 0;
  if (h1 !== 1) fail(path, `${h1} titoli H1, atteso 1`);
  const canonicalTag = /<link[^>]+rel="canonical"[^>]*>/i.exec(html)?.[0];
  const canonical = canonicalTag ? decode(attr(canonicalTag, "href") ?? "") : undefined;
  const expected = canonicalPath === "/" ? SITE_URL : `${SITE_URL}${canonicalPath}`;
  if (canonical !== expected && canonical !== `${expected}/`) fail(path, `canonical "${canonical ?? "mancante"}", atteso "${expected}"`);
  const title = decode(/<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? "").trim();
  if (title.length < 10 || title.length > 70) fail(path, `titolo di ${title.length} caratteri ("${title}"), atteso 10-70`);
  const description = /<meta[^>]+name="description"[^>]*>/i.exec(html)?.[0];
  if (!description || !attr(description, "content")) fail(path, "manca la descrizione (meta description)");
  checkStructuredData(path, html);
}

async function checkNoindex(path, expectedStatus = 200) {
  const { res, html } = await get(path);
  if (res.status !== expectedStatus) fail(path, `stato ${res.status}, atteso ${expectedStatus}`);
  if (!isNoindex(res, html)) fail(path, "manca noindex");
}

if (mode === "public") {
  for (const [path, canonical] of INDEXABLE) await checkIndexable(path, canonical);
  for (const path of NOINDEX) await checkNoindex(path);

  // Link vecchio col solo id: redirect permanente all'indirizzo leggibile.
  const old = await get(`/professionista/${pro.id}?modalita=online`);
  const location = old.res.headers.get("location") ?? "";
  if (old.res.status !== 308) fail(`/professionista/${pro.id}`, `stato ${old.res.status}, atteso 308`);
  if (!location.endsWith(`${proPath}?modalita=online`)) fail(`/professionista/${pro.id}`, `redirect verso "${location}"`);

  // Pagina e profilo inesistenti: 404 vero, fuori da Google.
  await checkNoindex("/pagina-che-non-esiste", 404);
  await checkNoindex("/prezzi/pulizie", 404); // prezzi sotto soglia: la pagina non esiste
  await checkNoindex("/professionista/nessuno-latina-00000000-0000-4000-8000-000000000000", 404);

  const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
  for (const path of ["/cerca/idraulico", "/cerca/idraulico/latina", "/prezzi/idraulico", "/lavora-con-noi/pulizie", proPath]) {
    if (!sitemap.includes(`<loc>${SITE_URL}${path}</loc>`)) fail("/sitemap.xml", `manca ${path}`);
  }
  for (const path of ["/cerca/pulizie/latina", "/cerca/pulizie<", "/prezzi/pulizie"]) {
    if (sitemap.includes(`${SITE_URL}${path}`)) fail("/sitemap.xml", `contiene la pagina vuota ${path.replace("<", "")}`);
  }
  const robots = await (await fetch(`${BASE}/robots.txt`)).text();
  if (!robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`)) fail("/robots.txt", "manca l'indirizzo della sitemap");
} else {
  for (const [path] of INDEXABLE) await checkNoindex(path);
  const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
  if (sitemap.includes("<url>")) fail("/sitemap.xml", "il sito privato non deve segnalare pagine");
}

if (failures.length > 0) {
  console.error(`Controllo SEO (${mode}): ${failures.length} problemi`);
  for (const line of failures) console.error(`  - ${line}`);
  process.exit(1);
}
console.log(`Controllo SEO (${mode}): tutto a posto`);
