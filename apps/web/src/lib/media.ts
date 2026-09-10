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
