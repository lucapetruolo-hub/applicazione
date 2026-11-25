import { open } from "node:fs/promises";
import { temporaryUploadPath } from "./media-upload";

/**
 * Tipo vero di un file caricato, dai primi byte (test di sicurezza del 25/11,
 * docs/changelog/2026-11-25-correzioni-test-sicurezza.md). Il tipo che manda
 * il browser e il nome del file li sceglie chi carica: chi chiamava l'API a
 * mano poteva mandare una pagina web `.html` dichiarata come PDF, o un'immagine
 * SVG (che può contenere script), e finivano sul nostro Cloudinary.
 */

/** Estensione da dare a un documento della chat, dal suo contenuto; null se non è un PDF, Word o Excel. */
export function documentExtension(head: Buffer, declaredMime: string): "pdf" | "doc" | "xls" | "docx" | "xlsx" | null {
  if (head.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  // Word e Excel vecchi (contenitore OLE).
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) {
    if (declaredMime === "application/msword") return "doc";
    if (declaredMime === "application/vnd.ms-excel") return "xls";
    return null;
  }
  // Word e Excel nuovi (archivio ZIP).
  if (head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) {
    if (declaredMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
    if (declaredMime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx";
    return null;
  }
  return null;
}

/**
 * Un'immagine che è in realtà testo (SVG, HTML): si riconosce dal primo
 * carattere visibile `<`. Le immagini vere (JPEG, PNG, WebP, HEIC, GIF…)
 * cominciano con byte binari; il resto lo rifiuta Cloudinary da solo.
 */
export function isMarkupImage(head: Buffer, declaredMime: string): boolean {
  if (declaredMime.toLowerCase().includes("svg")) return true;
  const text = head.toString("utf8").replace(/^\uFEFF/, "").trimStart();
  return text.startsWith("<");
}

/** Primi byte del file caricato, dalla memoria o dal file temporaneo su disco. */
export async function fileHead(file: Pick<Express.Multer.File, "buffer" | "path">, bytes = 512): Promise<Buffer> {
  if (file.buffer) return file.buffer.subarray(0, bytes);
  const path = temporaryUploadPath(file.path);
  if (!path) return Buffer.alloc(0);
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}
