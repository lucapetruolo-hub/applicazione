import { BadRequestException, type PipeTransform } from "@nestjs/common";
import { frontendUrl } from "../email/email-brand";

/**
 * Foto, video e allegati si accettano solo dal nostro Cloudinary
 * (docs/changelog/2026-11-18-video-che-carica-ancora.md, ok di Luca): prima
 * `photoUrls`/`mediaUrls` accettavano qualunque indirizzo web, quindi chi
 * chiamava l'API a mano poteva far vedere al professionista un'immagine
 * presa da un altro sito (o un indirizzo che traccia chi la apre).
 * Valgono anche le immagini del sito stesso (copertine e foto d'esempio in
 * `/copertine`), che sono nostre.
 * Senza `CLOUDINARY_CLOUD_NAME` (prove in locale) non controlla nulla.
 * Si mette dopo `ZodValidationPipe`, sul corpo già validato.
 */
export function isOwnMediaUrl(url: string, cloudName = process.env.CLOUDINARY_CLOUD_NAME): boolean {
  if (!cloudName) return true;
  return url.startsWith(`https://res.cloudinary.com/${cloudName}/`) || url.startsWith(`${frontendUrl()}/`);
}

/**
 * Campi con indirizzi di foto controllati: le liste delle richieste, della
 * chat, delle recensioni e delle segnalazioni, più foto e lavori svolti del
 * profilo pubblico (test di sicurezza del 25/11,
 * docs/changelog/2026-11-25-correzioni-test-sicurezza.md).
 */
const URL_LIST_KEYS = ["photoUrls", "mediaUrls", "portfolioUrls"] as const;
const URL_KEYS = ["imageUrl"] as const;

export class OwnMediaUrlsPipe implements PipeTransform {
  transform<T>(value: T): T {
    if (!value || typeof value !== "object") return value;
    const body = value as Record<string, unknown>;
    const urls: unknown[] = [];
    for (const key of URL_LIST_KEYS) {
      if (Array.isArray(body[key])) urls.push(...(body[key] as unknown[]));
    }
    for (const key of URL_KEYS) {
      if (body[key] !== undefined && body[key] !== null && body[key] !== "") urls.push(body[key]);
    }
    if (urls.some((url) => typeof url !== "string" || !isOwnMediaUrl(url))) {
      throw new BadRequestException("Una foto o un video non viene dal nostro sito: caricalo di nuovo.");
    }
    return value;
  }
}
