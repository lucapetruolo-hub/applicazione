import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  GoneException,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { PROBLEM_PHOTO_MAX_BYTES } from "@professionisti/shared";
import { MulterExceptionFilter } from "../common/multer-exception.filter";
import { clientIp } from "../common/client-ip";
import { photoMediaType } from "../problem-match/problem-match.service";
import { PhotoHandoffService, clampMaxPhotos, validCode } from "./photo-handoff.service";

const EXPIRED = "Questo codice è scaduto. Dal computer apri di nuovo \"Scatta dal telefono\".";

/**
 * "Scatta dal telefono" (docs/changelog/2026-11-16-scatta-dal-telefono.md).
 * Tutto pubblico: si usa prima di accedere (ricerca della home, richiesta).
 * La chiave del computer viaggia nel corpo, mai nell'indirizzo (niente log).
 */
@Controller("photo-handoff")
export class PhotoHandoffController {
  constructor(private readonly photoHandoffService: PhotoHandoffService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  @HttpCode(200)
  async create(@Req() req: Parameters<typeof clientIp>[0], @Body() body: { maxPhotos?: unknown } | undefined) {
    if (!(await this.photoHandoffService.takeForIp(clientIp(req)))) {
      throw new HttpException("Per oggi hai aperto molti codici: scegli la foto dal computer.", HttpStatus.TOO_MANY_REQUESTS);
    }
    return this.photoHandoffService.create(clampMaxPhotos(body?.maxPhotos));
  }

  /** Il telefono apre il link. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(":code/open")
  @HttpCode(200)
  async open(@Param("code") code: string) {
    if (!validCode(code)) return { status: "expired", sent: 0, max: 0 };
    return this.photoHandoffService.open(code);
  }

  /** Il telefono manda una foto, già rimpicciolita e senza posizione GPS. */
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @UseFilters(MulterExceptionFilter)
  @Post(":code/photo")
  @HttpCode(200)
  @UseInterceptors(FileInterceptor("image", { limits: { fileSize: PROBLEM_PHOTO_MAX_BYTES, files: 1 } }))
  async upload(@Param("code") code: string, @UploadedFile() file: Express.Multer.File | undefined) {
    if (!validCode(code)) throw new GoneException(EXPIRED);
    if (!file) throw new BadRequestException("Nessuna foto caricata.");
    const mediaType = photoMediaType(file.buffer);
    if (!mediaType) throw new BadRequestException("La foto deve essere un'immagine JPEG, PNG o WebP.");
    const outcome = await this.photoHandoffService.upload(code, file.buffer, mediaType);
    if (outcome.result !== "ok") {
      if (outcome.result === "expired") throw new GoneException(EXPIRED);
      throw new ConflictException("Hai già mandato tutte le foto di questo codice.");
    }
    return { status: "sent", sent: outcome.sent, max: outcome.max };
  }

  /**
   * Il computer chiede le foto ogni pochi secondi: 200 con un'immagine quando
   * ce n'è una (ognuna una volta sola), altrimenti lo stato in JSON.
   */
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @Post(":code/take")
  @HttpCode(200)
  async take(@Param("code") code: string, @Body() body: { key?: unknown }, @Res() res: Response): Promise<void> {
    const key = body?.key;
    res.setHeader("Cache-Control", "no-store");
    if (!validCode(code) || !validCode(key)) {
      res.json({ status: "expired" });
      return;
    }
    const result = await this.photoHandoffService.take(code, key);
    if (result.status !== "sent") {
      res.json({ status: result.status });
      return;
    }
    res.type(result.mediaType).send(result.photo);
  }

  /** Il computer toglie una foto arrivata: il posto torna libero (docs/changelog/2026-11-18-foto-dal-telefono-anteprime.md). */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(":code/release")
  @HttpCode(200)
  async release(@Param("code") code: string, @Body() body: { key?: unknown }) {
    const key = body?.key;
    const result = validCode(code) && validCode(key) ? await this.photoHandoffService.release(code, key) : null;
    if (!result) throw new GoneException(EXPIRED);
    return result;
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(":code/cancel")
  @HttpCode(204)
  async cancel(@Param("code") code: string, @Body() body: { key?: unknown }) {
    const key = body?.key;
    if (validCode(code) && validCode(key)) await this.photoHandoffService.cancel(code, key);
  }
}
