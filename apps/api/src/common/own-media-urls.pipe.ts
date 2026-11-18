import { BadRequestException, type PipeTransform } from "@nestjs/common";

/**
 * Foto, video e allegati si accettano solo dal nostro Cloudinary
 * (docs/changelog/2026-11-18-video-che-carica-ancora.md, ok di Luca): prima
 * `photoUrls`/`mediaUrls` accettavano qualunque indirizzo web, quindi chi
 * chiamava l'API a mano poteva far vedere al professionista un'immagine
 * presa da un altro sito (o un indirizzo che traccia chi la apre).
 * Senza `CLOUDINARY_CLOUD_NAME` (prove in locale) non controlla nulla.
 * Si mette dopo `ZodValidationPipe`, sul corpo già validato.
 */
export function isOwnMediaUrl(url: string, cloudName = process.env.CLOUDINARY_CLOUD_NAME): boolean {
  if (!cloudName) return true;
  return url.startsWith(`https://res.cloudinary.com/${cloudName}/`);
}

export class OwnMediaUrlsPipe implements PipeTransform {
  transform<T>(value: T): T {
    if (!value || typeof value !== "object") return value;
    const body = value as Record<string, unknown>;
    for (const key of ["photoUrls", "mediaUrls"]) {
      const urls = body[key];
      if (!Array.isArray(urls)) continue;
      if (urls.some((url) => typeof url !== "string" || !isOwnMediaUrl(url))) {
        throw new BadRequestException("Una foto o un video non viene dal nostro sito: caricalo di nuovo.");
      }
    }
    return value;
  }
}
