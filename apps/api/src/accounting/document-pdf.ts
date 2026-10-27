import { StreamableFile } from "@nestjs/common";
import PDFDocument from "pdfkit";
import { EMAIL_BRAND, frontendUrl } from "../email/email-brand";

/**
 * PDF dei documenti fatto dal nostro server (decisione dell'utente del
 * 27/10/2026, docs/CHANGELOG.md §375), al posto della stampa del browser:
 * stesso aspetto su telefono e computer, e si allega alle email. Un modello
 * a blocchi (totale grande, "Da" e "Per", righe, totali, tabella, riquadri)
 * con gli stessi colori delle pagine di "Fatture e documenti". Caratteri
 * standard del PDF (Helvetica): niente file di font da portarsi dietro.
 */

export type PdfParty = { label: string; name: string; lines: string[] };
export type PdfRow = { label: string; detail?: string | null; value: string } | { group: string };

export type PdfBlock =
  | { type: "highlight"; label: string; value: string; detail?: string | null; badge?: string | null }
  | { type: "meta"; items: { label: string; value: string }[] }
  | { type: "parties"; parties: PdfParty[] }
  | { type: "tiles"; tiles: { label: string; value: string }[] }
  | { type: "rows"; rows: PdfRow[] }
  | { type: "totals"; rows: { label: string; value: string }[]; total: { label: string; value: string; detail?: string | null } }
  | { type: "table"; columns: { label: string; width: number; align?: "left" | "right" }[]; rows: { cells: string[]; details?: (string | null)[] }[] }
  | { type: "note"; lines: string[]; tone: "green" | "sand" }
  | { type: "text"; lines: string[]; muted?: boolean }
  | { type: "signature"; label: string };

export type PdfDocumentModel = { title: string; subtitle?: string | null; blocks: PdfBlock[] };

const COLORS = {
  text: EMAIL_BRAND.colors.text,
  muted: EMAIL_BRAND.colors.muted,
  border: EMAIL_BRAND.colors.border,
  panel: EMAIL_BRAND.colors.background,
  green: EMAIL_BRAND.colors.primaryDark,
  greenTint: EMAIL_BRAND.colors.primaryTint,
  // ottoneVelo della palette "Vicinato" (packages/ui/src/tokens.ts).
  sandTint: "#F6ECD9",
};

const FONT = "Helvetica";
const BOLD = "Helvetica-Bold";
const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;
/** Fin dove si scrive: sotto resta il numero di pagina. */
const BOTTOM = PAGE.height - 64;
const GAP = 16;

// Caratteri che i font standard del PDF sanno scrivere (WinAnsi): il resto
// diventerebbe un simbolo sbagliato, quindi si sostituisce prima.
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
const REPLACEMENTS: Record<string, string> = { "−": "-", " ": " ", " ": " ", "→": "->", "←": "<-", "…": "…", "­": "" };

/** Il testo come lo scrivono i font standard del PDF. */
export function pdfText(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (REPLACEMENTS[char] !== undefined) out += REPLACEMENTS[char];
    else if (char === "\n" || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(char)) out += char;
    else if (code > 0xff) out += char.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e\xa0-\xff]/g, "");
  }
  return out;
}

class Writer {
  readonly doc: PDFKit.PDFDocument;
  y = MARGIN;

  constructor(title: string) {
    this.doc = new PDFDocument({
      size: "A4",
      // Il margine sotto è più stretto del nostro limite (BOTTOM): così pdfkit
      // non aggiunge pagine da solo, le decidiamo noi con ensure().
      margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: 20 },
      bufferPages: true,
      lang: "it-IT",
      info: { Title: pdfText(title), Author: EMAIL_BRAND.name, Creator: EMAIL_BRAND.name },
    });
    this.header();
  }

  private header(): void {
    this.doc.font(BOLD).fontSize(12).fillColor(COLORS.green).text(pdfText(EMAIL_BRAND.name), MARGIN, MARGIN, { width: CONTENT_WIDTH, lineBreak: false });
    this.y = MARGIN + 30;
  }

  /** Porta su una pagina nuova se quello che segue non ci sta. */
  ensure(height: number): void {
    if (this.y + height <= BOTTOM) return;
    this.doc.addPage();
    this.header();
  }

  height(text: string, font: string, size: number, width: number): number {
    return this.doc.font(font).fontSize(size).heightOfString(pdfText(text), { width, lineGap: 1.5 });
  }

  write(text: string, x: number, y: number, width: number, opts: { font?: string; size?: number; color?: string; align?: "left" | "right" | "center" } = {}): number {
    const font = opts.font ?? FONT;
    const size = opts.size ?? 10.5;
    this.doc
      .font(font)
      .fontSize(size)
      .fillColor(opts.color ?? COLORS.text)
      .text(pdfText(text), x, y, { width, align: opts.align ?? "left", lineGap: 1.5 });
    return this.height(text, font, size, width);
  }

  line(y: number, color: string, width = 0.75): void {
    this.doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).lineWidth(width).strokeColor(color).stroke();
  }

  box(x: number, y: number, w: number, h: number, color: string): void {
    this.doc.roundedRect(x, y, w, h, 8).fill(color);
  }
}

function caps(text: string): string {
  return text.toLocaleUpperCase("it-IT");
}

function titleBlock(w: Writer, model: PdfDocumentModel): void {
  const titleHeight = w.height(model.title, BOLD, 22, CONTENT_WIDTH);
  w.write(model.title, MARGIN, w.y, CONTENT_WIDTH, { font: BOLD, size: 22 });
  w.y += titleHeight + 4;
  if (model.subtitle) {
    w.y += w.write(model.subtitle, MARGIN, w.y, CONTENT_WIDTH, { size: 11, color: COLORS.muted });
  }
  w.y += GAP + 4;
}

function highlight(w: Writer, block: Extract<PdfBlock, { type: "highlight" }>): void {
  const detailHeight = block.detail ? w.height(block.detail, FONT, 10.5, CONTENT_WIDTH) + 6 : 0;
  w.ensure(14 + 34 + detailHeight);
  w.write(caps(block.label), MARGIN, w.y, CONTENT_WIDTH / 2, { font: BOLD, size: 8.5, color: COLORS.muted });
  if (block.badge) {
    const badge = caps(block.badge);
    const width = w.doc.font(BOLD).fontSize(8.5).widthOfString(pdfText(badge)) + 16;
    w.box(MARGIN + CONTENT_WIDTH - width, w.y - 4, width, 18, COLORS.greenTint);
    w.write(badge, MARGIN + CONTENT_WIDTH - width, w.y + 1, width, { font: BOLD, size: 8.5, color: COLORS.green, align: "center" });
  }
  w.y += 16;
  w.write(block.value, MARGIN, w.y, CONTENT_WIDTH, { font: BOLD, size: 28 });
  w.y += 36;
  if (block.detail) w.y += w.write(block.detail, MARGIN, w.y, CONTENT_WIDTH, { size: 10.5, color: COLORS.muted }) + 6;
  w.y += GAP - 6;
}

function meta(w: Writer, block: Extract<PdfBlock, { type: "meta" }>): void {
  w.ensure(34);
  const width = CONTENT_WIDTH / Math.max(1, block.items.length);
  block.items.forEach((item, index) => {
    const align = index === block.items.length - 1 && block.items.length > 1 ? "right" : "left";
    w.write(caps(item.label), MARGIN + width * index, w.y, width, { font: BOLD, size: 8.5, color: COLORS.muted, align });
    w.write(item.value, MARGIN + width * index, w.y + 13, width, { font: BOLD, size: 12, align });
  });
  w.y += 30 + GAP;
}

function parties(w: Writer, block: Extract<PdfBlock, { type: "parties" }>): void {
  const gap = 12;
  const width = (CONTENT_WIDTH - gap * (block.parties.length - 1)) / block.parties.length;
  const inner = width - 20;
  const heights = block.parties.map((p) => 10 + 14 + w.height(p.name || "—", BOLD, 11, inner) + p.lines.reduce((sum, line) => sum + w.height(line, FONT, 10, inner), 0) + 10);
  const height = Math.max(...heights);
  w.ensure(height);
  block.parties.forEach((party, index) => {
    const x = MARGIN + (width + gap) * index;
    w.box(x, w.y, width, height, COLORS.panel);
    let y = w.y + 10;
    w.write(caps(party.label), x + 10, y, inner, { font: BOLD, size: 8.5, color: COLORS.muted });
    y += 14;
    y += w.write(party.name || "—", x + 10, y, inner, { font: BOLD, size: 11 });
    for (const line of party.lines) y += w.write(line, x + 10, y, inner, { size: 10 });
  });
  w.y += height + GAP;
}

function tiles(w: Writer, block: Extract<PdfBlock, { type: "tiles" }>): void {
  const gap = 10;
  const width = (CONTENT_WIDTH - gap * (block.tiles.length - 1)) / block.tiles.length;
  const height = 48;
  w.ensure(height);
  block.tiles.forEach((tile, index) => {
    const x = MARGIN + (width + gap) * index;
    w.box(x, w.y, width, height, COLORS.panel);
    w.write(tile.label, x + 10, w.y + 9, width - 20, { size: 9, color: COLORS.muted });
    w.write(tile.value, x + 10, w.y + 23, width - 20, { font: BOLD, size: 14 });
  });
  w.y += height + GAP;
}

/** Una riga con l'importo a destra. */
function amountRow(w: Writer, row: { label: string; detail?: string | null; value: string }, opts: { divider: boolean; strong?: boolean; large?: boolean }): void {
  const size = opts.large ? 13 : 10.5;
  const valueWidth = 120;
  const labelWidth = CONTENT_WIDTH - valueWidth - 12;
  const labelFont = opts.strong ? BOLD : FONT;
  const height = 7 + Math.max(w.height(row.label, labelFont, size, labelWidth) + (row.detail ? w.height(row.detail, FONT, 9, labelWidth) + 2 : 0), size + 3) + 7;
  w.ensure(height);
  let y = w.y + 7;
  y += w.write(row.label, MARGIN, y, labelWidth, { font: labelFont, size });
  if (row.detail) w.write(row.detail, MARGIN, y + 2, labelWidth, { size: 9, color: COLORS.muted });
  w.write(row.value, MARGIN + CONTENT_WIDTH - valueWidth, w.y + 7, valueWidth, { font: BOLD, size, align: "right" });
  w.y += height;
  if (opts.divider) w.line(w.y, COLORS.border);
}

function rows(w: Writer, block: Extract<PdfBlock, { type: "rows" }>): void {
  block.rows.forEach((row, index) => {
    if ("group" in row) {
      const height = w.height(row.group, BOLD, 11, CONTENT_WIDTH);
      w.ensure(height + 40);
      w.y += 10;
      w.y += w.write(row.group, MARGIN, w.y, CONTENT_WIDTH, { font: BOLD, size: 11 });
      return;
    }
    // L'ultima riga non ha la linea sotto: separano già i totali.
    amountRow(w, row, { divider: index < block.rows.length - 1 });
  });
  w.y += 6;
}

function totals(w: Writer, block: Extract<PdfBlock, { type: "totals" }>): void {
  // Totali e linea del totale restano insieme sulla stessa pagina.
  w.ensure(block.rows.length * 26 + 44);
  for (const row of block.rows) amountRow(w, row, { divider: false });
  w.y += 4;
  w.line(w.y, COLORS.text, 1.5);
  amountRow(w, block.total, { divider: false, strong: true, large: true });
  w.y += GAP - 4;
}

function table(w: Writer, block: Extract<PdfBlock, { type: "table" }>): void {
  const totalWidth = block.columns.reduce((sum, c) => sum + c.width, 0);
  const gap = 8;
  const widths = block.columns.map((c) => ((CONTENT_WIDTH - gap * (block.columns.length - 1)) * c.width) / totalWidth);
  const xs = widths.map((_, index) => MARGIN + widths.slice(0, index).reduce((sum, width) => sum + width + gap, 0));
  const head = () => {
    w.ensure(22);
    block.columns.forEach((column, index) => w.write(caps(column.label), xs[index]!, w.y, widths[index]!, { font: BOLD, size: 8, color: COLORS.muted, align: column.align ?? "left" }));
    w.y += 14;
    w.line(w.y, COLORS.border, 1.5);
  };
  head();
  for (const row of block.rows) {
    const cellHeight = (index: number) => w.height(row.cells[index] ?? "", FONT, 9.5, widths[index]!) + (row.details?.[index] ? w.height(row.details[index]!, FONT, 8.5, widths[index]!) + 1 : 0);
    const height = 6 + Math.max(...block.columns.map((_, index) => cellHeight(index))) + 6;
    if (w.y + height > BOTTOM) {
      w.ensure(height + 40);
      head();
    }
    block.columns.forEach((column, index) => {
      let y = w.y + 6;
      y += w.write(row.cells[index] ?? "", xs[index]!, y, widths[index]!, { size: 9.5, align: column.align ?? "left" });
      const detail = row.details?.[index];
      if (detail) w.write(detail, xs[index]!, y + 1, widths[index]!, { size: 8.5, color: COLORS.muted, align: column.align ?? "left" });
    });
    w.y += height;
    w.line(w.y, COLORS.border);
  }
  w.y += GAP;
}

function note(w: Writer, block: Extract<PdfBlock, { type: "note" }>): void {
  const inner = CONTENT_WIDTH - 24;
  const heights = block.lines.map((line) => w.height(line, FONT, 10.5, inner));
  const height = 20 + heights.reduce((sum, h) => sum + h, 0) + (block.lines.length - 1) * 5;
  w.ensure(height);
  w.box(MARGIN, w.y, CONTENT_WIDTH, height, block.tone === "green" ? COLORS.greenTint : COLORS.sandTint);
  let y = w.y + 10;
  block.lines.forEach((line, index) => {
    w.write(line, MARGIN + 12, y, inner, { size: 10.5 });
    y += heights[index]! + 5;
  });
  w.y += height + GAP;
}

function text(w: Writer, block: Extract<PdfBlock, { type: "text" }>): void {
  for (const line of block.lines) {
    const size = block.muted ? 9.5 : 10.5;
    w.ensure(w.height(line, FONT, size, CONTENT_WIDTH));
    w.y += w.write(line, MARGIN, w.y, CONTENT_WIDTH, { size, color: block.muted ? COLORS.muted : COLORS.text }) + 4;
  }
  w.y += GAP - 4;
}

function signature(w: Writer, block: Extract<PdfBlock, { type: "signature" }>): void {
  w.ensure(60);
  w.y += 24;
  w.write(block.label, MARGIN, w.y, 60, { size: 10.5 });
  w.doc
    .moveTo(MARGIN + 50, w.y + 12)
    .lineTo(MARGIN + 260, w.y + 12)
    .lineWidth(0.75)
    .strokeColor(COLORS.text)
    .stroke();
  w.y += 24 + GAP;
}

/** Il PDF del documento, pronto da mandare o allegare. */
export function renderDocumentPdf(model: PdfDocumentModel): Promise<Buffer> {
  const w = new Writer(model.title);
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    w.doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    w.doc.on("end", () => resolve(Buffer.concat(chunks)));
    w.doc.on("error", reject);
  });

  titleBlock(w, model);
  for (const block of model.blocks) {
    if (block.type === "highlight") highlight(w, block);
    else if (block.type === "meta") meta(w, block);
    else if (block.type === "parties") parties(w, block);
    else if (block.type === "tiles") tiles(w, block);
    else if (block.type === "rows") rows(w, block);
    else if (block.type === "totals") totals(w, block);
    else if (block.type === "table") table(w, block);
    else if (block.type === "note") note(w, block);
    else if (block.type === "text") text(w, block);
    else signature(w, block);
  }

  // Piede: il sito e, se le pagine sono più di una, "Pagina 1 di 2".
  const range = w.doc.bufferedPageRange();
  const site = frontendUrl().replace(/^https?:\/\//, "");
  for (let index = 0; index < range.count; index += 1) {
    w.doc.switchToPage(range.start + index);
    const y = PAGE.height - 40;
    w.write(site, MARGIN, y, CONTENT_WIDTH / 2, { size: 8.5, color: COLORS.muted });
    if (range.count > 1) w.write(`Pagina ${index + 1} di ${range.count}`, MARGIN + CONTENT_WIDTH / 2, y, CONTENT_WIDTH / 2, { size: 8.5, color: COLORS.muted, align: "right" });
  }
  w.doc.end();
  return done;
}

/** Il PDF come file da scaricare. */
export function pdfResponse(pdf: Buffer, fileName: string): StreamableFile {
  return new StreamableFile(pdf, { type: "application/pdf", disposition: `attachment; filename="${fileName}"`, length: pdf.length });
}
