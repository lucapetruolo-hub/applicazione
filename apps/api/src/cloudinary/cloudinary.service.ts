import { createReadStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { BadRequestException, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { temporaryUploadPath } from "../common/media-upload";
import { documentExtension, fileHead, isMarkupImage } from "../common/file-signature";
import { DailyBudget, sharedBudgetStore } from "../common/daily-budget";
import { opsAlert } from "../common/ops-alert";
import { v2 as cloudinary } from "cloudinary";
import { MEDIA_VIDEO_MAX_SECONDS } from "@professionisti/shared";

/**
 * Manda il file a Cloudinary: dal disco a pezzi se Multer l'ha scritto lì
 * (foto e video fino a 50 MB, `MEDIA_UPLOAD_DIR`), altrimenti dalla memoria
 * (docs/changelog/2026-11-16-traffico-elevato.md).
 */
/**
 * Seconda difesa, controllata da Cloudinary stesso (test di sicurezza del 25/11,
 * docs/changelog/2026-11-25-correzioni-test-sicurezza.md): formati accettati
 * al caricamento. Niente SVG né HTML anche se un controllo nostro sbagliasse.
 */
const ALLOWED_IMAGE_FORMATS = ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "avif"] as const;
const ALLOWED_DOCUMENT_FORMATS = ["pdf", "doc", "docx", "xls", "xlsx"] as const;

const NOT_AN_IMAGE_MESSAGE = "Il file caricato non è una foto (JPEG, PNG, WebP o HEIC).";

function sendFile(file: Express.Multer.File, uploadStream: NodeJS.WritableStream, reject: (error: unknown) => void): void {
  const path = temporaryUploadPath(file.path);
  if (path) {
    const source = createReadStream(path);
    source.on("error", reject);
    source.pipe(uploadStream);
    return;
  }
  uploadStream.end(file.buffer);
}

/**
 * Il "public_id" di Cloudinary da un indirizzo come
 * https://res.cloudinary.com/<cloud>/image/upload/v123/receipts/abc.jpg →
 * "receipts/abc". Solo indirizzi di immagini caricate (upload).
 */
export function cloudinaryPublicId(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== "res.cloudinary.com") return null;
  const match = /^\/[^/]+\/image\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-z0-9]+)?$/i.exec(parsed.pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/**
 * Foto o video caricati sul nostro Cloudinary, dal loro indirizzo: tipo e
 * `public_id` per cancellarli. `null` per tutto il resto (altri siti, un altro
 * Cloudinary, le copertine pronte del sito, i documenti "raw").
 */
export function ownCloudinaryMedia(url: string | null | undefined, cloudName: string | undefined): { resourceType: "image" | "video"; publicId: string } | null {
  if (!url || !cloudName) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== "res.cloudinary.com") return null;
  // Gli indirizzi salvati sono i `secure_url` di Cloudinary: versione e nome, senza trasformazioni.
  const match = /^\/([^/]+)\/(image|video)\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-z0-9]+)?$/i.exec(parsed.pathname);
  if (!match || match[1] !== cloudName || !match[3]) return null;
  return { resourceType: match[2]!.toLowerCase() as "image" | "video", publicId: decodeURIComponent(match[3]) };
}

/** Toglie il file temporaneo dal disco, anche se il caricamento non è riuscito. */
export async function removeTemporaryFile(file: Express.Multer.File): Promise<void> {
  const path = temporaryUploadPath(file.path);
  if (path) await unlink(path).catch(() => undefined);
}

/**
 * Tetti ai video caricati direttamente su Cloudinary
 * (docs/changelog/2026-11-19-revisione-termini-e-video.md): ogni permesso vale
 * per un solo video, quindi contare i permessi vuol dire contare i video.
 */
export const VIDEO_UPLOAD_USER_DAILY_LIMIT = 20;
export const VIDEO_UPLOAD_DAILY_LIMIT = 1500;
export const VIDEO_LIMIT_MESSAGE = "Per oggi hai caricato tutti i video possibili. Puoi mandare foto, oppure riprovare domani.";

@Injectable()
export class CloudinaryService {
  private readonly isConfigured: boolean;

  /** Tetto di tutto il sito, uguale su tutte le copie dell'API (tabella daily_budget_usage). */
  private readonly videoBudget = new DailyBudget(
    VIDEO_UPLOAD_DAILY_LIMIT,
    () => opsAlert("video-upload-budget", "Tetto giornaliero dei video raggiunto: fino a mezzanotte non si caricano altri video."),
    "VIDEO_UPLOAD_DAILY_LIMIT",
    "video-cloudinary",
    undefined,
    (used, limit) => opsAlert("video-upload-budget-80", `Video caricati oggi: ${used} su ${limit}. Se serve, alza VIDEO_UPLOAD_DAILY_LIMIT su Render.`),
  );

  /**
   * Un video in più oggi per questo utente e per il sito? Prima l'utente,
   * così chi ha finito i suoi non consuma il tetto di tutti. Dell'utente si
   * tiene solo un'impronta, come per gli indirizzi della ricerca con foto.
   */
  async takeVideoUpload(userId: string, now: Date = new Date()): Promise<boolean> {
    const today = now.toISOString().slice(0, 10);
    const raw = Number(process.env.VIDEO_UPLOAD_USER_DAILY_LIMIT?.trim() || NaN);
    const limit = Number.isInteger(raw) && raw >= 0 ? raw : VIDEO_UPLOAD_USER_DAILY_LIMIT;
    if (limit === 0) return false;
    const print = createHash("sha256").update(`${userId}|${today}`).digest("hex").slice(0, 24);
    try {
      if ((await sharedBudgetStore().take(`video-utente:${print}`, today, limit)) === null) return false;
    } catch {
      return false;
    }
    return this.videoBudget.take(now);
  }

  constructor() {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    this.isConfigured = Boolean(cloudName && apiKey && apiSecret);
    if (this.isConfigured) {
      cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
    }
  }

  /**
   * `size`: misura massima dell'immagine salvata. La copertina del profilo
   * (docs/changelog/2026-11-13-copertina-profilo.md) arriva già ritagliata 2:1
   * dal browser e si salva a 1600×800 riempiendo la misura.
   */
  async uploadImage(file: Express.Multer.File, folder: string, size: { width: number; height: number; crop: "limit" | "fill" } = { width: 800, height: 800, crop: "limit" }): Promise<string> {
    if (!this.isConfigured) {
      await removeTemporaryFile(file);
      throw new BadRequestException(
        "Il caricamento immagini non è ancora configurato su questo ambiente. Aggiungi CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET per attivarlo.",
      );
    }
    if (isMarkupImage(await fileHead(file), file.mimetype)) {
      await removeTemporaryFile(file);
      throw new BadRequestException(NOT_AN_IMAGE_MESSAGE);
    }

    try {
      return await new Promise<string>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder,
            resource_type: "image",
            allowed_formats: [...ALLOWED_IMAGE_FORMATS],
            // quality/fetch_format "auto": Cloudinary sceglie la compressione
            // migliore per contenuto e il formato più leggero supportato dal
            // browser che la richiede (es. WebP/AVIF), invece del JPEG fisso
            // caricato dal client — stessa immagine, file più piccolo.
            transformation: [{ ...size, quality: "auto", fetch_format: "auto" }],
          },
          (error, result) => {
            if (error || !result) {
              reject(error ?? new Error("Upload immagine fallito."));
              return;
            }
            resolve(result.secure_url);
          },
        );
        sendFile(file, uploadStream, reject);
      });
    } catch (error) {
      // Un errore di Cloudinary (formato non valido, file troppo grande per
      // il piano, timeout di rete) non deve mai risultare in un generico
      // "Internal Server Error" lato client — stesso principio "errore
      // chiaro invece di crash" già usato per Stripe/Google in questo file.
      throw new BadRequestException(uploadFailureMessage(error, "image"));
    } finally {
      await removeTemporaryFile(file);
    }
  }

  /**
   * Cancella da Cloudinary un'immagine caricata da noi, dal suo indirizzo
   * (foto degli scontrini, docs/changelog/2026-11-19-entrate-e-uscite.md).
   * Non blocca mai chi la chiama: se Cloudinary non risponde resta il file,
   * non il collegamento.
   */
  /**
   * Cancella da Cloudinary foto e video caricati da noi, per la chiusura di un
   * account (GDPR art. 17, docs/changelog/2026-11-26-foto-cancellate-alla-chiusura.md).
   * Una chiamata ogni 100 file per tipo. Non blocca mai la chiusura: se
   * Cloudinary non risponde restano i file, e lo dice il registro.
   * Restituisce quanti file ha chiesto di cancellare.
   */
  async deleteOwnMedia(urls: readonly (string | null | undefined)[]): Promise<number> {
    if (!this.isConfigured) return 0;
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const byType: Record<"image" | "video", Set<string>> = { image: new Set(), video: new Set() };
    for (const url of urls) {
      const media = ownCloudinaryMedia(url, cloudName);
      if (media) byType[media.resourceType].add(media.publicId);
    }
    let requested = 0;
    for (const resourceType of ["image", "video"] as const) {
      const ids = [...byType[resourceType]];
      for (let start = 0; start < ids.length; start += 100) {
        const chunk = ids.slice(start, start + 100);
        try {
          await cloudinary.api.delete_resources(chunk, { resource_type: resourceType, type: "upload", invalidate: true });
          requested += chunk.length;
        } catch (error) {
          const message = typeof error === "object" && error !== null && "message" in error ? String((error as { message: unknown }).message) : String(error);
          console.error(`[CloudinaryService] cancellazione di ${chunk.length} file (${resourceType}) non riuscita: ${message}`);
        }
      }
    }
    return requested;
  }

  async deleteImageByUrl(url: string | null | undefined): Promise<boolean> {
    const publicId = cloudinaryPublicId(url);
    if (!this.isConfigured || !publicId) return false;
    try {
      const result = (await cloudinary.uploader.destroy(publicId, { resource_type: "image", invalidate: true })) as { result?: string };
      return result.result === "ok" || result.result === "not found";
    } catch {
      return false;
    }
  }

  /**
   * Copia su Cloudinary un'immagine già pubblica (la foto dell'account
   * Google alla registrazione), con lo stesso ridimensionamento di
   * `uploadImage`: l'indirizzo di Google può cambiare o sparire, la copia
   * resta. Restituisce null senza Cloudinary o se il caricamento fallisce:
   * una foto mancante non deve mai bloccare una registrazione.
   */
  async uploadImageFromUrl(url: string, folder: string): Promise<string | null> {
    if (!this.isConfigured) return null;
    try {
      const result = await cloudinary.uploader.upload(url, {
        folder,
        resource_type: "image",
        allowed_formats: [...ALLOWED_IMAGE_FORMATS],
        timeout: 5000,
        transformation: [{ width: 800, height: 800, crop: "limit", quality: "auto", fetch_format: "auto" }],
      });
      return result.secure_url;
    } catch {
      return null;
    }
  }

  /**
   * Permesso firmato per caricare UN video (uno solo) direttamente dal browser a
   * Cloudinary, senza passare dal nostro server
   * (docs/changelog/2026-11-18-video-che-carica-ancora.md, decisione di Luca:
   * con tanto traffico un video da 50 MB teneva occupata l'API per tutto il
   * caricamento). La firma copre cartella, nome del file, ora e trasformazione: il browser
   * non può cambiarle. La trasformazione all'arrivo sostituisce l'originale,
   * così Cloudinary tiene solo la copia piccola:
   * - 480p (lato lungo al massimo 854 px, scelta di Luca del 18/11);
   * - al massimo la durata ammessa più 5 secondi (`du_`), anche se qualcuno
   *   salta il controllo del sito;
   * - compressione automatica; i dati nascosti (posizione GPS) non passano
   *   nella copia ricodificata.
   * Null se Cloudinary non è configurato: il sito ripiega sul caricamento dal server.
   */
  signDirectVideoUpload(folder: string, maxSeconds: number): { uploadUrl: string; fields: Record<string, string> } | null {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!this.isConfigured || !cloudName || !apiKey || !apiSecret) return null;
    const params = {
      folder,
      // Nome a caso firmato e niente sovrascrittura: il permesso vale per un
      // solo video. Prima la stessa firma andava bene per un'ora per quanti
      // video si voleva (docs/changelog/2026-11-19-revisione-termini-e-video.md).
      overwrite: "false",
      public_id: randomBytes(12).toString("hex"),
      timestamp: String(Math.floor(Date.now() / 1000)),
      transformation: `c_limit,w_854,h_854,du_${maxSeconds + 5},q_auto`,
    };
    const signature = cloudinary.utils.api_sign_request(params, apiSecret);
    return {
      uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/video/upload`,
      fields: { ...params, api_key: apiKey, signature },
    };
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
  async uploadMedia(file: Express.Multer.File, folder: string, opts: { videoUserId?: string } = {}): Promise<string> {
    if (!this.isConfigured) {
      await removeTemporaryFile(file);
      throw new BadRequestException(
        "Il caricamento non è ancora configurato su questo ambiente. Aggiungi CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET per attivarlo.",
      );
    }
    // Stesso tetto dei video caricati direttamente, così il ripiego
    // dall'API non lo aggira (docs/changelog/2026-11-19-revisione-termini-e-video.md).
    if (opts.videoUserId && file.mimetype.startsWith("video/") && !(await this.takeVideoUpload(opts.videoUserId))) {
      await removeTemporaryFile(file);
      throw new HttpException(VIDEO_LIMIT_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
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
        ? // Stesso taglio del caricamento diretto (`du_`): un video più lungo tenuto dal
          // cliente arriva al professionista solo col primo minuto anche da qui
          // (docs/changelog/2026-11-19-video-lungo-due-scelte.md).
          [{ quality: "auto", duration: MEDIA_VIDEO_MAX_SECONDS + 5 }]
        : undefined;
    // Caricato via stream (buffer, nessun nome file passato a Cloudinary):
    // per un documento "raw" Cloudinary non ha altro modo di sapere che
    // estensione dare all'URL restituito, a differenza di immagini/video
    // (dove il formato si rileva dal contenuto stesso) — senza questo,
    // `isDocumentUrl`/`documentTypeLabel` lato web (basati sull'estensione
    // dell'URL) non riconoscerebbero mai il file come documento. Ricavata
    // dai primi byte del file (sotto), non dal nome scelto da chi carica.
    // Test di sicurezza del 25/11 (docs/changelog/2026-11-25-correzioni-test-sicurezza.md):
    // tipo ed estensione dal contenuto vero, non dal nome scelto da chi carica
    // (prima una pagina `.html` dichiarata PDF passava). Niente SVG tra le immagini.
    const head = await fileHead(file);
    if (isImage && isMarkupImage(head, file.mimetype)) {
      await removeTemporaryFile(file);
      throw new BadRequestException(NOT_AN_IMAGE_MESSAGE);
    }
    const rawExtension = resourceType === "raw" ? documentExtension(head, file.mimetype) : undefined;
    if (rawExtension === null) {
      await removeTemporaryFile(file);
      throw new BadRequestException("Il file non è un PDF, un documento Word o un foglio Excel.");
    }
    // `public_id` esplicito solo per un documento "raw" (immagini/video
    // restano su un id auto-generato da Cloudinary, comportamento
    // invariato): incorpora direttamente nel percorso dell'URL restituito
    // il nome reale caricato dall'utente (sanitizzato), preceduto da un
    // breve id casuale per evitare collisioni tra upload diversi con lo
    // stesso nome file — nessun bisogno di un flag di trasformazione
    // separato (`fl_attachment`, approccio precedente) per portare avanti
    // il nome: `extractAttachmentFilename` lo rilegge direttamente
    // dall'ultimo segmento del percorso, vedi sotto.
    // Per un documento "raw" Cloudinary non usa `format`: l'estensione
    // dell'URL è quella scritta nel `public_id` (provato dal vivo il 25/11,
    // docs/changelog/2026-11-25-parti-lasciate-fuori-sicurezza.md: senza, un
    // PDF arrivava come ".../283cf7d78f96-fattura" e il sito non lo
    // riconosceva come documento). Estensione sempre dal contenuto vero.
    const rawPublicId =
      resourceType === "raw" && rawExtension
        ? `${randomBytes(6).toString("hex")}-${sanitizeAttachmentFilename(file.originalname)}.${rawExtension}`
        : undefined;

    try {
      return await new Promise<string>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder,
            resource_type: resourceType,
            ...(resourceType === "image" ? { allowed_formats: [...ALLOWED_IMAGE_FORMATS] } : resourceType === "raw" ? { allowed_formats: [...ALLOWED_DOCUMENT_FORMATS] } : {}),
            ...(transformation ? { transformation } : {}),
            ...(rawPublicId ? { public_id: rawPublicId } : {}),
          },
          (error, result) => {
            if (error || !result) {
              reject(error ?? new Error("Upload fallito."));
              return;
            }
            // Nessuna trasformazione/firma applicata qui, per nessun
            // `resourceType` (documento incluso) — `secure_url` è già la
            // sola verità di consegna, mai ricostruita a mano (causa dei
            // due bug reali già corretti in un giro precedente: consegna
            // bloccata da un URL non firmato, poi doppia estensione da una
            // firma ricostruita male). Il download reale di un documento
            // "raw" (bloccato di default sulla CDN pubblica di Cloudinary
            // per PDF/ZIP/ecc.) passa ora dall'Admin API autenticata
            // (`CloudinaryService.fetchAttachmentForDownload`,
            // `private_download_url`), non da un trucco sulla stessa URL
            // di consegna — vedi il commento esteso lì per il perché il
            // tentativo precedente (URL di consegna "firmata" con
            // `sign_url`/`fl_attachment`) non bypassa affatto quel blocco:
            // sono due meccanismi di firma Cloudinary distinti e
            // indipendenti (uno per le trasformazioni, l'altro per
            // l'accesso autenticato ai file), l'uno non sostituisce l'altro.
            resolve(result.secure_url);
          },
        );
        sendFile(file, uploadStream, reject);
      });
    } catch (error) {
      throw new BadRequestException(uploadFailureMessage(error, resourceType));
    } finally {
      await removeTemporaryFile(file);
    }
  }

  /**
   * Scarica un documento (PDF/Word/Excel, allegato in chat) da Cloudinary
   * server-to-server e lo restituisce pronto per essere inoltrato al
   * browser dal nostro stesso backend.
   *
   * Terzo bug reale sullo stesso identico problema, segnalato dall'utente
   * DOPO i due fix precedenti (proxy di download lato backend +
   * `Content-Disposition` impostato da noi, vedi la cronologia in
   * CLAUDE.md §95/§97/§98): "quando vado a scaricare un file dalla chat mi
   * dice file non trovato o non più presente" — il proxy stesso falliva
   * (`!response.ok` dalla fetch verso Cloudinary), non il download nel
   * browser. Causa reale: la CDN pubblica di Cloudinary (`res.cloudinary.
   * com`) **blocca di default la consegna di risorse "raw" potenzialmente
   * rischiose** (PDF, ZIP, ecc.) per motivi di sicurezza — un blocco a
   * livello di CDN, non aggirabile con un URL di "consegna firmata"
   * (`sign_url`/`fl_attachment`, il meccanismo tentato nei due fix
   * precedenti): quella firma serve a limitare quali TRASFORMAZIONI si
   * possono richiedere su un URL pubblico ("strict transformations"), un
   * meccanismo di sicurezza Cloudinary completamente distinto e
   * indipendente dal blocco sui tipi "raw" rischiosi — non lo sostituisce
   * né lo bypassa, per quanto correttamente costruita fosse quella firma
   * (e lo era, verificato a parte).
   *
   * Il bypass realmente documentato da Cloudinary per questo blocco è
   * l'**Admin API "download"** (SDK: `cloudinary.utils.private_download_
   * url`) — un endpoint diverso (`api.cloudinary.com`, non la CDN
   * `res.cloudinary.com`), autenticato con firma API key/secret per ogni
   * chiamata: essendo una richiesta autorizzata (non un accesso pubblico
   * anonimo alla CDN), non è soggetta allo stesso blocco. Costruita qui,
   * fetchata server-to-server (stesso principio "nessun vincolo CORS,
   * mai esposto al browser" già in uso per il resto di questo metodo) —
   * il browser non vede mai né l'URL né le credenziali Cloudinary.
   *
   * Retrocompatibile con i documenti già caricati prima di questo fix
   * (URL firmati "vecchio stile", con uno o più segmenti di
   * trasformazione — `/s--...--/`, `/fl_attachment:.../` — tra `upload/`
   * e `/v<versione>/`): l'estrazione cerca il segmento `/v<cifre>/`
   * ovunque si trovi nel percorso (non subito dopo `upload/`, che per un
   * URL "vecchio stile" non è mai vero — bug reale trovato scrivendo
   * questo stesso fix, prima di un qualunque deploy, con un test dedicato
   * su un URL legacy), non il testo letterale `upload/v` — nessuna doppia
   * gestione necessaria per il solo `publicId`/`format`; resta invece un
   * doppio percorso per il nome file, vedi `extractAttachmentFilename`.
   *
   * Blocco di sicurezza esplicito invariato: questo metodo fa da proxy
   * SOLO per URL di consegna Cloudinary del nostro stesso cloud (prefisso
   * `raw/upload/` verificato) — mai un proxy aperto verso un URL
   * arbitrario.
   */
  async fetchAttachmentForDownload(rawUrl: string): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    if (!this.isConfigured) {
      throw new BadRequestException("Il download non è disponibile: Cloudinary non è configurato su questo ambiente.");
    }
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const expectedPrefix = `https://res.cloudinary.com/${cloudName}/raw/upload/`;
    if (!rawUrl.startsWith(expectedPrefix)) {
      throw new BadRequestException("URL non valido per il download.");
    }
    // Tutto ciò che segue il segmento di versione ("v1712345678"). Diviso per
    // segmenti invece che con un'espressione regolare: su un indirizzo lungo
    // fatto apposta quella poteva impiegare molto tempo (CodeQL, §313).
    const segments = (rawUrl.split("?")[0] ?? "").split("/");
    const versionIndex = segments.findIndex((segment) => /^v\d+$/.test(segment));
    const pathWithExtension = versionIndex === -1 ? "" : segments.slice(versionIndex + 1).join("/");
    if (!pathWithExtension) {
      throw new BadRequestException("URL non valido per il download.");
    }
    // Quinto giro sullo stesso identico problema ("file non trovato"
    // persistito anche dopo il fix con l'Admin API, CLAUDE.md §100): il
    // codice precedente separava `publicId`/`format` (`lastDot`) esattamente
    // come si fa per image/video — ma per `resource_type: "raw"` Cloudinary
    // NON tiene un campo `format` distinto dal `public_id`: l'identificativo
    // vero della risorsa, quello che l'Admin API cerca, **include già
    // l'estensione per intero** (stessa causa già trovata una volta sul lato
    // "costruzione URL di consegna", §97 — qui si ripresentava identica sul
    // lato "chiamata Admin API"). Passare `publicId` senza estensione +
    // `format` separato firmava una richiesta che cercava una risorsa con un
    // identificativo diverso da quello reale (mai trovata → "file non
    // trovato", coerente col sintomo). Corretto passando l'intero percorso
    // (estensione compresa) come unico `public_id`, `format` sempre stringa
    // vuota — `clear_blank`/`sign_request` del SDK la scarta comunque dalla
    // firma prima di calcolarla (verificato leggendo il sorgente del SDK
    // installato), quindi non introduce un campo fantasma nella richiesta.
    const downloadUrl = cloudinary.utils.private_download_url(pathWithExtension, "", {
      resource_type: "raw",
      type: "upload",
      attachment: true,
    });

    let response;
    try {
      response = await fetch(downloadUrl);
    } catch {
      throw new BadRequestException("Impossibile raggiungere il file in questo momento.");
    }
    if (!response.ok) {
      // Non più un solo messaggio generico: la storia di questo bug (quattro
      // fix precedenti, tutti basati su un'ipotesi mai verificabile in
      // questo ambiente — nessuna credenziale Cloudinary reale, nessun
      // accesso di rete a cloudinary.com) ha sempre lasciato il vero errore
      // di Cloudinary invisibile. Il corpo della risposta (mai il testo
      // completo, troncato) viene ora loggato server-side — la prossima
      // volta che questo fallisce, il log dice davvero perché invece di
      // dover indovinare una sesta volta.
      const bodyText = await response.text().catch(() => "");
      console.error(`[CloudinaryService] download fallito (${response.status}): ${bodyText.slice(0, 500)}`);
      throw new BadRequestException("File non trovato o non più disponibile.");
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    const filename = extractAttachmentFilename(rawUrl);
    return { buffer, contentType, filename };
  }
}

const DOWNLOADABLE_DOCUMENT_EXTENSIONS = [".pdf", ".doc", ".docx", ".xls", ".xlsx"];
// Prefisso di unicità anteposto al nome sanitizzato nel `public_id` di
// upload (`uploadMedia`, ramo "raw") — 12 caratteri esadecimali minuscoli
// seguiti da un trattino, pattern scelto apposta abbastanza specifico da
// non essere mai prodotto per coincidenza da `sanitizeAttachmentFilename`
// (che normalizza spazi/accenti/simboli, mai genera esadecimale puro).
const UNIQUE_ID_PREFIX = /^[0-9a-f]{12}-/;

/**
 * Nome file reale da mostrare al download. Due percorsi, per restare
 * retrocompatibile con i documenti caricati prima di questo fix:
 * - **URL "vecchio stile"** (caricati quando il nome viveva nel flag di
 *   trasformazione `fl_attachment:<nome>`, mai nel percorso): estratto da
 *   lì, come già prima.
 * - **URL "nuovo stile"** (il nome vive già nell'ultimo segmento del
 *   percorso stesso, incorporato nel `public_id` al momento dell'upload):
 *   preso da lì, spogliato del solo prefisso di unicità anteposto
 *   (`UNIQUE_ID_PREFIX`) — mai un flag di trasformazione da cercare.
 * Stessa logica duplicata lato frontend (`apps/web/src/lib/media.ts`,
 * `attachmentFileName`) perché backend e frontend non condividono un
 * package per una funzione così piccola.
 */
/**
 * Messaggio per chi carica quando Cloudinary rifiuta il file. Cloudinary
 * risponde con un oggetto semplice (`{ message, http_code }`), non un
 * `Error`: prima il messaggio diventava "Errore sconosciuto". Un 400 di
 * Cloudinary vuol dire file non valido o formato non ammesso
 * (`allowed_formats`): si dice cosa caricare, senza il testo inglese.
 */
export function uploadFailureMessage(error: unknown, resourceType: "image" | "video" | "raw"): string {
  const httpCode = typeof error === "object" && error !== null && "http_code" in error ? Number((error as { http_code: unknown }).http_code) : undefined;
  if (httpCode === 400) {
    if (resourceType === "raw") return "Il file non è un PDF, un documento Word o un foglio Excel.";
    if (resourceType === "video") return "Il video non si può caricare: prova con un file MP4 o MOV.";
    return NOT_AN_IMAGE_MESSAGE;
  }
  return "Caricamento non riuscito, riprova tra poco.";
}

function extractAttachmentFilename(url: string): string {
  const clean = url.split("?")[0] ?? "";
  const legacyMatch = /\/fl_attachment:([^/,]+)/.exec(clean);
  const extension = DOWNLOADABLE_DOCUMENT_EXTENSIONS.find((ext) => clean.endsWith(ext));
  if (legacyMatch?.[1]) {
    const base = decodeURIComponent(legacyMatch[1]);
    return extension ? `${base}${extension}` : base;
  }
  const lastSegment = clean.split("/").pop() ?? "documento";
  const base = lastSegment.replace(UNIQUE_ID_PREFIX, "");
  return base || "documento";
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
