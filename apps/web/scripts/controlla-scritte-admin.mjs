// Scritte dell'Admin che capisce anche un bambino (richiesta di Luca del
// 13/11/2026, docs/changelog/2026-11-13-admin-scritte-semplici.md): niente
// sigle, nomi di servizi esterni o nomi delle chiavi nei testi che l'admin
// legge. Controlla solo i testi visibili (testo JSX e stringhe con almeno uno
// spazio), salta commenti e test. Ammessi dentro <TechNote> ("Per il
// tecnico", solo super admin) o su una riga con il commento
// "scritte-admin: ok" (con il motivo).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const repo = new URL("../../..", import.meta.url).pathname;
const dirs = ["apps/web/src/app/admin", "apps/web/src/components/admin"];
const singleFiles = [
  "packages/shared/src/adminQueue.ts",
  "packages/shared/src/adminProposals.ts",
  "packages/shared/src/siteStats.ts",
  "apps/api/src/admin/site-stats.ts",
  "apps/api/src/admin/admin-queue.service.ts",
  "apps/api/src/admin/database-version.service.ts",
  "apps/api/src/admin-proposals/admin-proposals.ts",
  "apps/api/src/admin-proposals/admin-proposals.service.ts",
];

const RULES = [
  [/\bSdI\b/, "Agenzia delle Entrate"],
  [/\bXML\b/, "file della fattura, oppure dentro <TechNote>"],
  [/\bCSV\b/, "Excel"],
  [/\b(Render|Vercel|Openapi|Didit|VIES|PostgreSQL|Cloudinary|Resend|Turnstile)\b/, "parole semplici; il nome del servizio va dentro <TechNote>"],
  [/\bStripe\b/, "il servizio dei pagamenti, la banca, la carta"],
  [/\bdi Meta\b/, "WhatsApp"],
  [/\b[A-Z][A-Z0-9]{2,}_[A-Z0-9_]{2,}\b/, "il nome della chiave va dentro <TechNote>"],
  [/(?<!\()\bDAC7\b(?!\))/, "dati per il fisco (DAC7), con la sigla solo tra parentesi"],
  [/\b[Rr]icors[oi]\b/, "richiesta di rivedere la decisione"],
  [/\b[Mm]isur[ae]\b(?! (il|i|le|la|lo|gli)\b)/, "conseguenza, decisione"],
  [/\b[Aa]ggregazion[ei]\b/, "conti"],
  [/\b[Qq]uadratura\b/, "controllo dei conti"],
  [/\bIA\b|\bdall'IA\b/, "il computer"],
  [/\b[Mm]edian[ao]\b/, "di solito, a metà"],
  [/\b(sandbox|webhook|backend|deploy|token|endpoint|funnel|cron)\b/i, "parole semplici, oppure dentro <TechNote>"],
];

// Email che partono da una decisione admin (richiesta di Luca del 13/11/2026):
// le legge la persona colpita, quindi valgono le stesse regole e la stessa
// soglia di leggibilità. Si controllano solo questi pezzi dei file, non le
// altre email.
const decisionEmails = {
  "apps/api/src/email/templates/notification-emails.ts": [
    "JOB_ISSUE_INFO_REQUESTED", "JOB_ISSUE_RESOLVED", "JOB_ISSUE_APPEAL_DECIDED", "JOB_ISSUE_SANCTION",
    "JOB_REFUND_REJECTED", "CONTENT_REPORT_DECISION", "CONTENT_REPORT_UPHELD", "CONTENT_REPORT_REVERTED",
    "CONTENT_REPORT_APPEAL_REJECTED", "ACCOUNT_SUSPENDED", "ACCOUNT_CLOSURE_SCHEDULED", "ACCOUNT_CLOSED",
    "ACCOUNT_REACTIVATED", "PROFILE_VERIFICATION_REMOVED", "FISCAL_ENTITY_TYPE_CHANGED",
    "accountMeasureReasons", "accountMeasureAfter", "NOT_BINDING",
  ],
  "packages/shared/src/moderation.ts": ["moderationActionOwnerText", "MODERATION_REASON_TEMPLATES"],
  "packages/shared/src/jobIssues.ts": ["JOB_ISSUE_SANCTION_LABEL", "jobIssueOutcomeText"],
};
function insideDecisionEmail(node, names) {
  for (let n = node.parent; n; n = n.parent) {
    const name = (ts.isPropertyAssignment(n) || ts.isFunctionDeclaration(n) || ts.isVariableDeclaration(n)) && n.name ? n.name.getText() : null;
    if (name && names.includes(name)) return true;
  }
  return false;
}

const files = [...singleFiles.map((f) => join(repo, f)), ...Object.keys(decisionEmails).map((f) => join(repo, f))];
for (const dir of dirs) (function walk(path) {
  for (const name of readdirSync(path)) {
    const full = join(path, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.tsx?$/.test(name) && !/\.(test|spec)\./.test(name)) files.push(full);
  }
})(join(repo, dir));

function insideTechNote(node) {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isJsxElement(n) && n.openingElement.tagName.getText() === "TechNote") return true;
  }
  return false;
}

function insideImportOrType(node) {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n) || ts.isTypeNode(n) || ts.isLiteralTypeNode(n)) return true;
  }
  return false;
}

// Leggibilità (versione profonda, analisi/admin-automazione-versione-profonda.md):
// indice Gulpease, la misura fatta per l'italiano. Sotto 60 una frase è
// difficile anche per chi ha la licenza media. Si misurano le frasi di almeno
// 8 parole dei testi delle pagine admin del sito.
const GULPEASE_MIN = 60;
const GULPEASE_MIN_WORDS = 8;
function hardSentences(text) {
  const hard = [];
  // Un pezzo variabile seguito da una maiuscola chiude la frase prima: "${nota} Anche dopo…".
  for (const sentence of text.replace(/ …\s+(?=[A-ZÀ-Ý])/g, ". ").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim().split(/(?<=[.!?;])\s+/)) {
    const words = sentence.match(/[A-Za-zÀ-ÿ']+/g) ?? [];
    if (words.length < GULPEASE_MIN_WORDS) continue;
    const letters = words.join("").replace(/'/g, "").length;
    const score = 89 + (300 - 10 * letters) / words.length;
    if (score < GULPEASE_MIN) hard.push({ score: Math.round(score), sentence });
  }
  return hard;
}
const webAdmin = dirs.map((dir) => join(repo, dir));

const errors = [];
const hardErrors = [];
for (const file of files) {
  const emailNames = decisionEmails[relative(repo, file)];
  const measure = Boolean(emailNames) || webAdmin.some((dir) => file.startsWith(dir));
  const source = readFileSync(file, "utf8");
  const lines = source.split("\n");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const check = (node, text) => {
    if (!/\s/.test(text.trim()) && !ts.isJsxText(node)) return;
    if (insideTechNote(node) || insideImportOrType(node)) return;
    if (emailNames && !insideDecisionEmail(node, emailNames)) return;
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
    if (lines.slice(Math.max(0, line - 3), line + 1).some((l) => l.includes("scritte-admin: ok"))) return;
    for (const [rule, better] of RULES) {
      const match = text.match(rule);
      if (match) errors.push(`${relative(repo, file)}:${line + 1}: "${match[0]}" (usa: ${better})`);
    }
    if (measure) {
      for (const { score, sentence } of hardSentences(text)) hardErrors.push(`${relative(repo, file)}:${line + 1}: ${score} «${sentence.slice(0, 120)}»`);
    }
  };
  (function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) check(node, node.text);
    else if (ts.isTemplateExpression(node)) {
      const parts = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)];
      // Una chiave come `TIPO:${id}` non ha spazi: non è un testo da leggere.
      if (/\s/.test(parts.join("").trim())) check(node, parts.join(" … "));
    }
    else if (ts.isJsxText(node) && node.text.trim()) check(node, node.text);
    ts.forEachChild(node, visit);
  })(sf);
}

if (errors.length > 0) {
  console.error(
    "Scritte dell'Admin con sigle o parole tecniche (docs/changelog/2026-11-13-admin-scritte-semplici.md).\n" +
      "Scrivi in parole semplici; i dettagli tecnici vanno dentro <TechNote>:\n" +
      errors.join("\n"),
  );
}
if (hardErrors.length > 0) {
  console.error(
    `Frasi dell'Admin difficili da leggere (indice Gulpease sotto ${GULPEASE_MIN}). Spezzale in frasi più corte, con parole più brevi:\n` +
      hardErrors.join("\n"),
  );
}
if (errors.length > 0 || hardErrors.length > 0) process.exit(1);
