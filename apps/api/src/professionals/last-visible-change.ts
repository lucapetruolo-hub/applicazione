/**
 * Ultima modifica che si vede sulla pagina del profilo: i dati del profilo,
 * una prestazione aggiunta o una recensione nuova. Va nella sitemap come
 * `lastModified` (collaudo 08/11 E8-10, docs/changelog/2026-11-08-seo-e-velocita.md).
 */
export function lastVisibleChange(
  profileUpdatedAt: Date,
  services: readonly { createdAt: Date }[],
  reviews: readonly { createdAt: Date }[],
): Date {
  let latest = profileUpdatedAt.getTime();
  for (const item of [...services, ...reviews]) latest = Math.max(latest, item.createdAt.getTime());
  return new Date(latest);
}
