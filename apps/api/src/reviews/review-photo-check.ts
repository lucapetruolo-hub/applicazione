import { Inject, Injectable, Logger } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";
import { fetchCloudinaryPhoto } from "../common/cloudinary-photo";

/**
 * Foto del cliente sotto la recensione in home
 * (docs/changelog/2026-11-19-foto-recensioni-in-home.md, decisione di Luca
 * del 19/11/2026). Sul profilo le foto delle recensioni si vedono già; la
 * home però è la pagina più vista, quindi lì va solo una foto che Claude
 * Haiku ha guardato: niente contatti (CLAUDE.md §5 punto 9), niente volti
 * riconoscibili, targhe o documenti. Si controllano solo le recensioni che
 * possono andare in home (3 stelle in su, con un testo) e solo le foto, mai
 * i video. Il risultato resta nel database (`homePhotoUrls`): una foto si
 * guarda una volta sola, anche con più copie dell'API.
 */
const MODEL = "claude-haiku-5-5";
const TIMEOUT_MS = 20_000;
/** Dopo un controllo non riuscito (rete, IA ferma) si riprova non prima di così, per copia dell'API. */
const RETRY_AFTER_MS = 30 * 60_000;
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv", ".ogv"];

export const reviewPhotoCheckSchema = z.object({
  verdict: z.enum(["ok", "contatti", "non-adatta"]),
});
export type ReviewPhotoVerdict = z.infer<typeof reviewPhotoCheckSchema>["verdict"] | "non-controllata";

export const REVIEW_PHOTO_CHECK_INSTRUCTIONS = `Sei il controllo delle foto di un sito italiano che mette in contatto clienti e artigiani (idraulici, elettricisti, imbianchini, giardinieri, ecc.). Un cliente ha messo questa foto nella recensione di un lavoro: comparirà in grande nella pagina principale del sito, vista da tutti.
Guarda l'immagine qui sopra e rispondi con verdict:
- "contatti" se si legge, anche piccolo, di traverso, su un furgone, un biglietto da visita, un cartello o un adesivo: un numero di telefono, un'email, un indirizzo di un sito, un nome utente di social (con @), la parola WhatsApp o il suo logo, un QR code o un codice a barre.
- "non-adatta" se si vede il volto riconoscibile di una persona, un bambino, una targa leggibile, un documento, una lettera o una bolletta con nomi o indirizzi, una carta di pagamento, uno schermo con dati personali, il numero civico o il citofono con i nomi; oppure se è sessuale, violenta, offensiva, mostra armi o droghe, o non c'entra niente con un lavoro in casa o all'aperto.
- "ok" in tutti gli altri casi: il lavoro finito, una stanza, un impianto, un giardino, attrezzi, mani o persone di spalle o non riconoscibili, un marchio senza contatti.`;

function isVideo(url: string): boolean {
  const clean = url.split("?")[0]?.toLowerCase() ?? "";
  return VIDEO_EXTENSIONS.some((ext) => clean.endsWith(ext));
}

@Injectable()
export class ReviewPhotoCheckService {
  private readonly logger = new Logger(ReviewPhotoCheckService.name);
  private client: Anthropic | null = null;
  /** Solo per non ripetere lo stesso controllo su questa copia: il risultato vero sta nel database. */
  private readonly inFlight = new Set<string>();
  private readonly lastFailure = new Map<string, number>();

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /** Sostituibili nelle prove. */
  ask: (image: Buffer) => Promise<ReviewPhotoVerdict> = (image) => this.callClaude(image);
  download: (url: string) => Promise<Buffer | null> = (url) => fetchCloudinaryPhoto(url, (message) => this.logger.warn(`Foto della recensione non scaricata: ${message}`));

  /**
   * Avvia il controllo senza far aspettare chi ha chiamato (la pagina, la
   * recensione appena scritta). Le recensioni senza foto non costano niente.
   */
  checkInBackground(reviews: { id: string; hasPhotos: boolean }[]): void {
    for (const review of reviews) {
      if (!review.hasPhotos || this.inFlight.has(review.id)) continue;
      const failedAt = this.lastFailure.get(review.id);
      if (failedAt !== undefined && Date.now() - failedAt < RETRY_AFTER_MS) continue;
      this.inFlight.add(review.id);
      void this.check(review.id)
        .catch((error: unknown) => {
          this.lastFailure.set(review.id, Date.now());
          this.logger.warn(`Controllo delle foto della recensione non riuscito: ${error instanceof Error ? error.message : String(error)}`);
        })
        .finally(() => this.inFlight.delete(review.id));
    }
  }

  /**
   * Guarda le foto (i video restano fuori dalla home) e salva quelle buone.
   * Se anche una sola non si è potuta controllare, non salva niente e si
   * riprova più tardi: meglio una recensione senza foto che una foto non vista.
   * Gli indirizzi delle foto si rileggono dal database, mai da ciò che è
   * appena arrivato con la richiesta.
   */
  async check(reviewId: string): Promise<string[] | null> {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId }, select: { photoUrls: true } });
    if (!review) return null;
    const photoUrls = review.photoUrls;
    const approved: string[] = [];
    for (const url of photoUrls) {
      if (isVideo(url)) continue;
      const verdict = await this.verdictFor(url);
      if (verdict === "non-controllata") {
        this.lastFailure.set(reviewId, Date.now());
        return null;
      }
      if (verdict === "ok") approved.push(url);
    }
    // Solo se le foto sono ancora quelle guardate: una recensione aggiornata
    // nel frattempo riparte da zero.
    await this.prisma.review.updateMany({
      where: { id: reviewId, photoUrls: { equals: photoUrls } },
      data: { homePhotoUrls: approved, homePhotosCheckedAt: new Date() },
    });
    this.lastFailure.delete(reviewId);
    return approved;
  }

  private async verdictFor(url: string): Promise<ReviewPhotoVerdict> {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      // In produzione senza chiave nessuna foto va in home senza controllo;
      // in locale e nelle prove sì, come per la copertina.
      return process.env.NODE_ENV === "production" ? "non-controllata" : "ok";
    }
    const image = await this.download(url);
    if (!image) return "non-controllata";
    return this.ask(image);
  }

  private async callClaude(image: Buffer): Promise<ReviewPhotoVerdict> {
    this.client ??= new Anthropic({ maxRetries: 1 });
    try {
      const response = await this.client.messages.parse(
        {
          model: MODEL,
          max_tokens: 512,
          messages: [
            {
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image.toString("base64") } },
                { type: "text", text: REVIEW_PHOTO_CHECK_INSTRUCTIONS },
              ],
            },
          ],
          output_config: { format: zodOutputFormat(reviewPhotoCheckSchema), effort: "low" },
        },
        { timeout: TIMEOUT_MS },
      );
      if (response.stop_reason === "refusal") return "non-adatta";
      return response.parsed_output?.verdict ?? "non-controllata";
    } catch (error) {
      const status = error instanceof Anthropic.APIError ? error.status : undefined;
      this.logger.warn(`Controllo della foto della recensione non riuscito: ${status ?? (error instanceof Error ? error.message : String(error))}.`);
      return "non-controllata";
    }
  }
}
