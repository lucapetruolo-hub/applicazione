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

    try {
      return await new Promise<string>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder,
            resource_type: isVideo ? "video" : "image",
            transformation: isVideo
              ? [{ quality: "auto" }]
              : [{ width: 800, height: 800, crop: "limit", quality: "auto", fetch_format: "auto" }],
          },
          (error, result) => {
            if (error || !result) {
              reject(error ?? new Error("Upload fallito."));
              return;
            }
            resolve(result.secure_url);
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
