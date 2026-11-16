import { tmpdir } from "node:os";
import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from "@nestjs/common";
import { unlink } from "node:fs/promises";
import { finalize, type Observable } from "rxjs";
/**
 * Cartella temporanea per foto, video e documenti fino a 50 MB
 * (docs/changelog/2026-11-16-traffico-elevato.md): Multer li scrive sul
 * disco invece di tenerli interi nella memoria dell'API, dove 8 video
 * caricati insieme bastavano a finire i 512 MB del piano Starter.
 * `CloudinaryService` li legge a pezzi e li cancella dopo il caricamento.
 * Le immagini piccole che l'IA deve guardare (copertina, foto della
 * ricerca) restano in memoria: servono intere e sono al massimo 8 MB.
 */
export const MEDIA_UPLOAD_DIR = tmpdir();


/**
 * A fine richiesta toglie dal disco il file caricato, anche quando la
 * richiesta si ferma prima di Cloudinary (permesso negato, dati sbagliati):
 * così la cartella temporanea non si riempie. Su ogni copia dell'API, perché
 * ognuna ha il suo disco.
 */
@Injectable()
export class TemporaryUploadCleanupInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ file?: { path?: string } } | undefined>();
    return next.handle().pipe(
      finalize(() => {
        const path = request?.file?.path;
        if (path) void unlink(path).catch(() => undefined);
      }),
    );
  }
}
