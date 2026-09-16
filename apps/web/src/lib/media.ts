const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv", ".ogv"];
// Documenti allegabili in chat (richiesta esplicita dell'utente: "in modo
// che puo essere caricata anche la fattura o ricevuta") — stesso elenco
// chiuso già accettato lato server (ALLOWED_TIMELINE_DOCUMENT_MIME_TYPES,
// apps/api/src/guided-requests/guided-requests.controller.ts).
const DOCUMENT_EXTENSIONS = [".pdf", ".doc", ".docx", ".xls", ".xlsx"];

/** True se l'URL (foto o video, stesso array `photoUrls` ovunque nel progetto) punta a un video, per estensione del file. */
export function isVideoUrl(url: string): boolean {
  const clean = url.split("?")[0]?.toLowerCase() ?? "";
  return VIDEO_EXTENSIONS.some((ext) => clean.endsWith(ext));
}

/** True se l'URL punta a un documento (PDF/Word/Excel) invece di un'immagine o un video, per estensione del file. */
export function isDocumentUrl(url: string): boolean {
  const clean = url.split("?")[0]?.toLowerCase() ?? "";
  return DOCUMENT_EXTENSIONS.some((ext) => clean.endsWith(ext));
}

/** Etichetta breve del tipo di documento (es. "PDF", "DOCX") per la miniatura — "FILE" se l'estensione non è tra quelle note. */
export function documentTypeLabel(url: string): string {
  const clean = url.split("?")[0]?.toLowerCase() ?? "";
  const match = DOCUMENT_EXTENSIONS.find((ext) => clean.endsWith(ext));
  return match ? match.slice(1).toUpperCase() : "FILE";
}

// Prefisso di unicità anteposto al nome sanitizzato nel percorso di upload
// di un documento "raw" (`apps/api/src/cloudinary/cloudinary.service.ts`,
// `uploadMedia`) — stesso pattern/motivo già documentato lì.
const UNIQUE_ID_PREFIX = /^[0-9a-f]{12}-/;

/**
 * Nome file originale da mostrare al download. Due percorsi (stessa dualità
 * duplicata lato server, `CloudinaryService.extractAttachmentFilename`):
 * - **URL "vecchio stile"** (nome nel flag di trasformazione
 *   `fl_attachment:<nome>`, mai nel percorso): estratto da lì.
 * - **URL "nuovo stile"** (nome già nell'ultimo segmento del percorso
 *   stesso): preso da lì, spogliato del solo prefisso di unicità.
 * `null` solo se nessuno dei due pattern combacia (un URL non-documento).
 */
export function attachmentFileName(url: string): string | null {
  const clean = url.split("?")[0] ?? "";
  const legacyMatch = clean.match(/\/fl_attachment:([^/,]+)/);
  const extMatch = DOCUMENT_EXTENSIONS.find((ext) => clean.endsWith(ext));
  if (legacyMatch?.[1]) {
    const base = decodeURIComponent(legacyMatch[1]);
    return extMatch ? `${base}${extMatch}` : base;
  }
  if (!extMatch) return null;
  const lastSegment = clean.split("/").pop();
  if (!lastSegment) return null;
  return lastSegment.replace(UNIQUE_ID_PREFIX, "") || null;
}
