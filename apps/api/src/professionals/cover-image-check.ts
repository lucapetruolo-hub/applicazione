import { Injectable, Logger } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import type { PhotoMediaType } from "../problem-match/problem-match.service";

/**
 * Controllo della copertina prima di pubblicarla
 * (docs/changelog/2026-11-13-copertina-profilo.md). I contatti del cliente e
 * del professionista restano nascosti fino all'accettazione (CLAUDE.md §5
 * punto 9): una copertina con un numero di telefono, un'email, un sito o un
 * QR code aggirerebbe la regola, come un messaggio in chat. Lo stesso modello
 * della ricerca con foto guarda l'immagine e la rifiuta con il motivo.
 */
const MODEL = "claude-haiku-5-5";
const TIMEOUT_MS = 20_000;

export const coverCheckSchema = z.object({
  verdict: z.enum(["ok", "contatti", "non-adatta"]),
});
export type CoverCheckVerdict = z.infer<typeof coverCheckSchema>["verdict"] | "non-controllata";

export const COVER_CHECK_INSTRUCTIONS = `Sei il controllo delle immagini di copertina di un sito italiano che mette in contatto clienti e artigiani (idraulici, elettricisti, imbianchini, giardinieri, ecc.). La copertina compare in alto nel profilo pubblico dell'artigiano.
Sul sito i contatti diretti sono vietati finché il cliente non accetta un preventivo. Guarda l'immagine qui sopra e rispondi con verdict:
- "contatti" se nell'immagine si legge, anche piccolo, di traverso o su un furgone, un biglietto da visita, un cartello o un adesivo: un numero di telefono, un'email, un indirizzo di un sito, un nome utente di social (con @), la parola WhatsApp o il suo logo, un QR code o un codice a barre. Il solo nome dell'attività o un marchio senza contatti non conta.
- "non-adatta" se è sessuale, violenta, offensiva, mostra armi o droghe, oppure mostra in primo piano documenti, carte di pagamento o targhe leggibili.
- "ok" in tutti gli altri casi: lavori, attrezzi, furgoni senza contatti, paesaggi, la persona stessa, un logo.`;

/** Messaggio per il professionista: dice cosa togliere, mai un generico "errore". */
export function coverRejectedMessage(verdict: Exclude<CoverCheckVerdict, "ok">): string {
  if (verdict === "contatti") {
    return "Nella copertina si vede un contatto (telefono, email, sito, social o QR code). I contatti si scambiano solo dopo che il cliente accetta il preventivo: scegli un'altra immagine o ritagliala senza.";
  }
  if (verdict === "non-adatta") {
    return "Questa immagine non si può usare come copertina. Scegli una foto dei tuoi lavori, dei tuoi attrezzi o una delle copertine pronte.";
  }
  return "Non siamo riusciti a controllare l'immagine. Riprova tra qualche minuto o scegli una delle copertine pronte.";
}

@Injectable()
export class CoverImageCheckService {
  private readonly logger = new Logger(CoverImageCheckService.name);
  private client: Anthropic | null = null;

  /** Sostituibile nelle prove. */
  ask: (image: Buffer, mediaType: PhotoMediaType) => Promise<CoverCheckVerdict> = (image, mediaType) => this.callClaude(image, mediaType);

  async check(image: Buffer, mediaType: PhotoMediaType): Promise<CoverCheckVerdict> {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      // In produzione senza chiave nessuna copertina passa senza controllo;
      // in locale e nelle prove si carica lo stesso.
      return process.env.NODE_ENV === "production" ? "non-controllata" : "ok";
    }
    return this.ask(image, mediaType);
  }

  private async callClaude(image: Buffer, mediaType: PhotoMediaType): Promise<CoverCheckVerdict> {
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
                { type: "image", source: { type: "base64", media_type: mediaType, data: image.toString("base64") } },
                { type: "text", text: COVER_CHECK_INSTRUCTIONS },
              ],
            },
          ],
          output_config: { format: zodOutputFormat(coverCheckSchema), effort: "low" },
        },
        { timeout: TIMEOUT_MS },
      );
      if (response.stop_reason === "refusal") return "non-adatta";
      return response.parsed_output?.verdict ?? "non-controllata";
    } catch (error) {
      const status = error instanceof Anthropic.APIError ? error.status : undefined;
      this.logger.warn(`Controllo della copertina non riuscito: ${status ?? (error instanceof Error ? error.message : String(error))}.`);
      return "non-controllata";
    }
  }
}
