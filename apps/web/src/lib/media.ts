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

/**
 * Forza il download di un URL Cloudinary (`fl_attachment`, header
 * `Content-Disposition: attachment` nella risposta) invece di lasciare che
 * il browser lo apra semplicemente inline in una nuova scheda — richiesta
 * esplicita dell'utente per l'opzione "File" della chat ("in modo che
 * l'altro successivamente possa scaricare quel file"). Il solo attributo
 * HTML `download` su un `<a>` non è garantito cross-origin (Cloudinary è
 * un'origine diversa dal sito): alcuni browser ignorano `download` per un
 * URL esterno e navigano semplicemente alla risorsa. `fl_attachment` è il
 * flag di trasformazione ufficiale di Cloudinary per questo, funziona per
 * qualunque resource_type (image/video/raw). URL non riconosciuto come
 * URL di delivery Cloudinary (`/upload/`) → ritornato invariato, mai un
 * link rotto.
 *
 * Un URL caricato dopo il fix del bug "file vuoto" (`CloudinaryService.
 * uploadMedia`, ramo "raw") porta già `fl_attachment:<nome>` **firmato** al
 * momento dell'upload — inserirne un secondo qui, non firmato, invaliderebbe
 * la firma esistente (calcolata su transformazione+public_id+api_secret) e
 * farebbe fallire di nuovo la consegna. `hasEmbeddedAttachmentFlag` lo
 * riconosce e lascia l'URL invariato in quel caso; solo un URL "vecchio
 * stile" (caricato prima del fix, mai firmato) riceve ancora l'inserimento
 * qui.
 */
export function cloudinaryDownloadUrl(url: string): string {
  if (hasEmbeddedAttachmentFlag(url)) return url;
  const marker = "/upload/";
  const index = url.indexOf(marker);
  if (index === -1) return url;
  const insertAt = index + marker.length;
  return `${url.slice(0, insertAt)}fl_attachment/${url.slice(insertAt)}`;
}

/** True se l'URL porta già un flag `fl_attachment[:nome]` incorporato (upload firmato lato server, vedi `cloudinaryDownloadUrl`). */
function hasEmbeddedAttachmentFlag(url: string): boolean {
  return /\/fl_attachment(:|\/|,)/.test(url);
}

/**
 * Nome file originale da mostrare al download, estratto dal flag
 * `fl_attachment:<nome>` incorporato nell'URL (upload firmato lato server) —
 * `null` per un URL "vecchio stile" senza quel flag, dove il nome reale non
 * è mai stato conservato (nessun campo per portarlo avanti prima del fix,
 * si ricade sull'etichetta generica "allegato.<estensione>" come già prima).
 */
export function attachmentFileName(url: string): string | null {
  const clean = url.split("?")[0] ?? "";
  const match = clean.match(/\/fl_attachment:([^/,]+)/);
  if (!match || !match[1]) return null;
  const base = decodeURIComponent(match[1]);
  const extMatch = DOCUMENT_EXTENSIONS.find((ext) => clean.endsWith(ext));
  return extMatch ? `${base}${extMatch}` : base;
}
