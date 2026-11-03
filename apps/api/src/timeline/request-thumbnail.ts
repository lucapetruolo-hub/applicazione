const VIDEO_EXTENSION = /\.(mp4|webm|mov|m4v|avi|mkv|ogv)$/i;

/**
 * Miniatura della richiesta per la lista delle chat: la prima foto; se ci sono
 * solo video, il primo fotogramma del primo video su Cloudinary (stesso
 * indirizzo con `.jpg`, ritagliato da Cloudinary). Nessuna miniatura per un video
 * altrove (docs/changelog/2026-11-03-foto-richiesta-nei-messaggi.md).
 */
export function requestThumbnailUrl(photoUrls: string[]): string | null {
  const isVideo = (url: string) => VIDEO_EXTENSION.test(url.split("?")[0] ?? "");
  const photo = photoUrls.find((url) => !isVideo(url));
  if (photo) return photo;
  const video = photoUrls.find((url) => url.startsWith("https://res.cloudinary.com/") && url.includes("/video/upload/"));
  if (!video) return null;
  // Fotogramma iniziale già ritagliato a 112 px (la miniatura è 56 px, doppio
  // per gli schermi del telefono): non si scarica il fotogramma intero.
  return (video.split("?")[0] ?? video).replace("/video/upload/", "/video/upload/so_0,c_fill,w_112,h_112/").replace(VIDEO_EXTENSION, ".jpg");
}
