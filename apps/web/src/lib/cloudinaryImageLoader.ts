/**
 * Loader globale di `next/image` (next.config.mjs → images.loaderFile),
 * docs/CHANGELOG.md §131: le foto su Cloudinary vengono ridimensionate e
 * compresse da Cloudinary stesso (gratis, già usato per l'upload — CLAUDE.md
 * §2) invece che dall'ottimizzatore di Vercel, che conta ogni versione nella
 * quota "Image Optimization" del piano gratuito.
 *
 * Trasformazione inserita subito dopo `/upload/`: `c_limit` non ingrandisce
 * mai oltre l'originale, `f_auto` sceglie il formato più leggero per il
 * browser (es. WebP/AVIF), `q_auto` la compressione. Qualunque altra origine
 * (le piccole foto categoria in /public, già in WebP) resta invariata: il
 * `?w=` serve solo a Next.js, che altrimenti avvisa di un loader che
 * ignora la larghezza (i file statici lo ignorano).
 */
export default function cloudinaryImageLoader({ src, width, quality }: { src: string; width: number; quality?: number }): string {
  const marker = "/image/upload/";
  if (!src.startsWith("https://res.cloudinary.com/") || !src.includes(marker)) {
    return `${src}${src.includes("?") ? "&" : "?"}w=${width}`;
  }
  const transformation = `c_limit,w_${width},q_${quality ?? "auto"},f_auto`;
  return src.replace(marker, `${marker}${transformation}/`);
}
