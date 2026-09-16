import { extname } from "node:path";
import { BadRequestException, Injectable } from "@nestjs/common";
import { v2 as cloudinary } from "cloudinary";

@Injectable()
export class CloudinaryService {
  private readonly isConfigured: boolean;

  constructor() {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    this.isConfigured = Boolean(cloudName && apiKey && apiSecret);
    if (this.isConfigured) {
      cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
    }
  }

  async uploadImage(file: Express.Multer.File, folder: string): Promise<string> {
    if (!this.isConfigured) {
      throw new BadRequestException(
        "Il caricamento immagini non è ancora configurato su questo ambiente. Aggiungi CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET per attivarlo.",
      );
    }

    try {
      return await new Promise<string>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder,
            resource_type: "image",
            // quality/fetch_format "auto": Cloudinary sceglie la compressione
            // migliore per contenuto e il formato più leggero supportato dal
            // browser che la richiede (es. WebP/AVIF), invece del JPEG fisso
            // caricato dal client — stessa immagine, file più piccolo.
            transformation: [{ width: 800, height: 800, crop: "limit", quality: "auto", fetch_format: "auto" }],
          },
          (error, result) => {
            if (error || !result) {
              reject(error ?? new Error("Upload immagine fallito."));
              return;
            }
            resolve(result.secure_url);
          },
        );
        uploadStream.end(file.buffer);
      });
    } catch (error) {
      // Un errore di Cloudinary (formato non valido, file troppo grande per
      // il piano, timeout di rete) non deve mai risultare in un generico
      // "Internal Server Error" lato client — stesso principio "errore
      // chiaro invece di crash" già usato per Stripe/Google in questo file.
      const message = error instanceof Error ? error.message : "Errore sconosciuto.";
      throw new BadRequestException(`Caricamento immagine non riuscito: ${message}`);
    }
  }

  /**
   * Foto O video (richiesta esplicita dell'utente: "ovunque c'è la
   * possibilità di caricare le foto... fai in modo da poter caricare anche
   * i video") — usata dalle gallerie a più elementi (richiesta guidata,
   * recensioni, portfolio professionista), non dai singoli avatar
   * (`uploadImage` resta quella, un profilo non ha senso come video).
   * `resource_type` scelto in base al mimetype del file invece di
   * `"auto"`: esplicito è più prevedibile di lasciare che Cloudinary
   * indovini, e ci serve comunque sapere già qui se applicare la
   * trasformazione immagine (resize 800×800) o quella video (solo
   * compressione, ridimensionare un video ha implicazioni diverse — durata,
   * bitrate — che non è il caso di introdurre senza una richiesta esplicita
   * in merito).
   */
  async uploadMedia(file: Express.Multer.File, folder: string): Promise<string> {
    if (!this.isConfigured) {
      throw new BadRequestException(
        "Il caricamento non è ancora configurato su questo ambiente. Aggiungi CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET per attivarlo.",
      );
    }

    const isVideo = file.mimetype.startsWith("video/");
    const isImage = file.mimetype.startsWith("image/");
    // Un terzo caso oltre a immagine/video (richiesta esplicita dell'utente:
    // allegare in chat "anche la fattura o ricevuta"): un documento
    // (PDF/Word/Excel, vedi ALLOWED_DOCUMENT_MIME_TYPES nel controller) non
    // è né l'uno né l'altro — `resource_type: "raw"` lo carica così com'è,
    // senza alcuna trasformazione (ridimensionare/comprimere un PDF non ha
    // senso allo stesso modo di un'immagine).
    const resourceType: "image" | "video" | "raw" = isVideo ? "video" : isImage ? "image" : "raw";
    const transformation = isImage
      ? [{ width: 800, height: 800, crop: "limit" as const, quality: "auto", fetch_format: "auto" }]
      : isVideo
        ? [{ quality: "auto" }]
        : undefined;
    // Caricato via stream (buffer, nessun nome file passato a Cloudinary):
    // per un documento "raw" Cloudinary non ha altro modo di sapere che
    // estensione dare all'URL restituito, a differenza di immagini/video
    // (dove il formato si rileva dal contenuto stesso) — senza questo,
    // `isDocumentUrl`/`documentTypeLabel` lato web (basati sull'estensione
    // dell'URL) non riconoscerebbero mai il file come documento. Ricavata
    // dal nome originale caricato dal browser (`file.originalname`, sempre
    // presente su un upload Multer), non da una mappa mimetype→estensione.
    const rawExtension = resourceType === "raw" ? extname(file.originalname).replace(/^\./, "").toLowerCase() : undefined;

    try {
      return await new Promise<string>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder,
            resource_type: resourceType,
            ...(transformation ? { transformation } : {}),
            ...(rawExtension ? { format: rawExtension } : {}),
          },
          (error, result) => {
            if (error || !result) {
              reject(error ?? new Error("Upload fallito."));
              return;
            }
            if (resourceType !== "raw") {
              resolve(result.secure_url);
              return;
            }
            // Bug reale segnalato dall'utente: scaricare un documento
            // allegato in chat ("File") dava un file vuoto. Causa più
            // probabile: Cloudinary blocca di default la consegna
            // pubblica/non firmata di tipi "raw" potenzialmente rischiosi
            // (PDF/ZIP/ecc., politica di sicurezza recente) — l'URL
            // pubblico restituito da `result.secure_url` esisteva ma la
            // richiesta di download veniva rifiutata/svuotata dalla CDN.
            // Un URL FIRMATO (calcolato qui, unico posto con accesso ad
            // `api_secret`) bypassa quel blocco per costruzione — stesso
            // rimedio ufficiale indicato da Cloudinary per continuare a
            // servire questi formati. La firma non scade (nessun
            // `expires_at`/token a tempo, solo `sign_url`), quindi l'URL
            // risultante è sicuro da persistere per sempre nello stesso
            // `mediaUrls: String[]` già in uso, nessuna migrazione.
            // `fl_attachment:<nome>` (senza estensione, sintassi
            // Cloudinary) fa scaricare il file con il nome reale caricato
            // dall'utente invece del generico "allegato.pdf" di prima —
            // stessa richiesta esplicita dell'utente risolta nello stesso
            // punto, nessun campo nuovo nello schema per portarlo avanti:
            // il nome resta incorporato nell'URL firmato stesso.
            //
            // Bug reale corretto (segnalazione "ancora non riesco a
            // scaricare i file" dopo il primo giro sopra): passare
            // `result.public_id` insieme a `format: rawExtension` a
            // `cloudinary.url()` può produrre un'estensione doppia — per
            // `resource_type: "raw"` Cloudinary include già l'estensione
            // dentro il `public_id` restituito (gotcha noto della loro
            // API, diverso da image/video dove l'estensione resta un
            // campo `format` separato); `finalize_source` (SDK, vedi
            // `node_modules/cloudinary/lib/utils/index.js`) appende
            // SEMPRE `.` + `format` al source quando `format != null`,
            // senza controllare se è già presente — risultato:
            // "documento.pdf" + ".pdf" = "documento.pdf.pdf", un percorso
            // che non corrisponde alla risorsa realmente salvata (file
            // vuoto/errore alla consegna). Corretto estraendo il
            // percorso `public_id[.estensione]` direttamente da
            // `result.secure_url` (l'URL di consegna che Cloudinary
            // stesso ha appena generato per questa identica risorsa,
            // quindi per costruzione già corretto qualunque sia il
            // comportamento reale su public_id/estensione) invece di
            // ricostruirlo a mano — e passando quel percorso senza alcun
            // `format` separato, cosicché non venga mai più appesa
            // un'estensione ulteriore. Stessa cautela sulla versione: usare
            // quella reale già presente in `secure_url` (invece di
            // lasciarla implicita, `force_version` di default userebbe
            // sempre "v1" per qualunque risorsa) fa combaciare l'URL
            // firmato byte per byte con quello che Cloudinary ha davvero
            // generato per questa risorsa.
            const safeName = sanitizeAttachmentFilename(file.originalname);
            const uploadPathMatch = /\/upload\/v(\d+)\/(.+)$/.exec(result.secure_url);
            const rawVersion = uploadPathMatch?.[1];
            const rawSource = uploadPathMatch?.[2] ?? result.public_id;
            const downloadUrl = cloudinary.url(rawSource, {
              resource_type: "raw",
              type: "upload",
              ...(rawVersion ? { version: rawVersion } : {}),
              secure: true,
              sign_url: true,
              flags: `attachment:${safeName}`,
            });
            resolve(downloadUrl);
          },
        );
        uploadStream.end(file.buffer);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore sconosciuto.";
      throw new BadRequestException(`Caricamento non riuscito: ${message}`);
    }
  }
}

/**
 * Nome file sicuro per il flag `fl_attachment:<nome>` di Cloudinary (senza
 * estensione, già gestita da `format` sull'URL) — la sintassi di
 * trasformazione Cloudinary usa `/`, `,`, `:` come separatori: qualunque
 * carattere fuori da un set sicuro (lettere/cifre/spazio/trattini) viene
 * sostituito, gli spazi diventano underscore, mai una stringa vuota (Word
 * "Documento" di ripiego) né troppo lunga.
 */
function sanitizeAttachmentFilename(originalName: string): string {
  const withoutExtension = originalName.replace(/\.[^./\\]+$/, "");
  const safe = withoutExtension
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 _-]/g, " ")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 100);
  return safe.length > 0 ? safe : "documento";
}
