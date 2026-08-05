const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv", ".ogv"];

/** True se l'URL (foto o video, stesso array `photoUrls` ovunque nel progetto) punta a un video, per estensione del file. */
export function isVideoUrl(url: string): boolean {
  const clean = url.split("?")[0]?.toLowerCase() ?? "";
  return VIDEO_EXTENSIONS.some((ext) => clean.endsWith(ext));
}
