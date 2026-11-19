/**
 * Scarica una foto del nostro Cloudinary in JPEG ridotto (un video come
 * fotogramma iniziale). Solo dal nostro cloud, mai da un indirizzo qualsiasi,
 * e senza seguire reindirizzamenti. Null se non arriva.
 * Usata dal PDF delle contestazioni e dal controllo delle foto delle
 * recensioni in home (docs/changelog/2026-11-19-foto-recensioni-in-home.md).
 */
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_TIMEOUT_MS = 8000;
/** pdfkit legge solo JPEG e PNG, Claude accetta il JPEG: la foto resta leggera. */
const PHOTO_TRANSFORM = "c_limit,w_1000,h_1000,q_70,f_jpg";

export async function fetchCloudinaryPhoto(url: string, onError?: (message: string) => void): Promise<Buffer | null> {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloud) return null;
  const prefix = `https://res.cloudinary.com/${cloud}/`;
  // L'indirizzo da scaricare si ricostruisce da un inizio fisso (host del
  // nostro cloud): dall'URL salvato si prende solo il percorso dopo
  // "upload/", così non può mai puntare altrove (CodeQL, richieste verso
  // indirizzi scelti da fuori).
  const imagePrefix = `${prefix}image/upload/`;
  const videoPrefix = `${prefix}video/upload/`;
  const path = (url.split("?")[0] ?? "").split("#")[0] ?? "";
  let source: string;
  if (path.startsWith(imagePrefix)) {
    source = `https://res.cloudinary.com/${encodeURIComponent(cloud)}/image/upload/${PHOTO_TRANSFORM}/${path.slice(imagePrefix.length)}`;
  } else if (path.startsWith(videoPrefix)) {
    // Fotogramma iniziale in JPEG: estensione cambiata con le stringhe, senza
    // espressioni regolari (CodeQL, tempi lunghi su indirizzi fatti apposta).
    const rest = path.slice(videoPrefix.length);
    const dot = rest.lastIndexOf(".");
    const base = dot > rest.lastIndexOf("/") ? rest.slice(0, dot) : rest;
    source = `https://res.cloudinary.com/${encodeURIComponent(cloud)}/video/upload/${PHOTO_TRANSFORM},so_0/${base}.jpg`;
  } else return null;
  if (new URL(source).hostname !== "res.cloudinary.com") return null;
  try {
    const response = await fetch(source, { signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS), redirect: "error" });
    if (!response.ok) return null;
    const data = Buffer.from(await response.arrayBuffer());
    return data.length > 0 && data.length <= PHOTO_MAX_BYTES ? data : null;
  } catch (err) {
    onError?.((err as Error).message);
    return null;
  }
}
