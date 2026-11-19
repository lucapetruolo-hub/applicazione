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
  if (!url.startsWith(prefix)) return null;
  let source: string;
  if (url.startsWith(`${prefix}image/upload/`)) source = url.replace("/image/upload/", `/image/upload/${PHOTO_TRANSFORM}/`);
  else if (url.startsWith(`${prefix}video/upload/`)) source = url.replace("/video/upload/", `/video/upload/${PHOTO_TRANSFORM},so_0/`).replace(/\.[a-z0-9]+(\?.*)?$/i, ".jpg");
  else return null;
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
