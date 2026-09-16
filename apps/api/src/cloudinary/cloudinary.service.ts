import { extname } from "node:path";
import { randomBytes } from "node:crypto";
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
    // `public_id` esplicito solo per un documento "raw" (immagini/video
    // restano su un id auto-generato da Cloudinary, comportamento
    // invariato): incorpora direttamente nel percorso dell'URL restituito
    // il nome reale caricato dall'utente (sanitizzato), preceduto da un
    // breve id casuale per evitare collisioni tra upload diversi con lo
    // stesso nome file — nessun bisogno di un flag di trasformazione
    // separato (`fl_attachment`, approccio precedente) per portare avanti
    // il nome: `extractAttachmentFilename` lo rilegge direttamente
    // dall'ultimo segmento del percorso, vedi sotto.
    const rawPublicId =
      resourceType === "raw" ? `${randomBytes(6).toString("hex")}-${sanitizeAttachmentFilename(file.originalname)}` : undefined;

    try {
      return await new Promise<string>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder,
            resource_type: resourceType,
            ...(transformation ? { transformation } : {}),
            ...(rawExtension ? { format: rawExtension } : {}),
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
        uploadStream.end(file.buffer);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore sconosciuto.";
      throw new BadRequestException(`Caricamento non riuscito: ${message}`);
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
    const versionMatch = /\/v\d+\/(.+)$/.exec(rawUrl.split("?")[0] ?? "");
    const pathWithExtension = versionMatch?.[1];
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
      // eslint-disable-next-line no-console
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
