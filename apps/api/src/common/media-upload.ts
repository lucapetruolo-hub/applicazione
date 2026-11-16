import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
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
 * Il percorso del file temporaneo solo se è davvero uno di quelli scritti da
 * Multer: dentro `MEDIA_UPLOAD_DIR` e con il suo nome casuale (32 caratteri
 * esadecimali). Qualunque altro percorso viene ignorato, così nessun dato
 * della richiesta può far leggere o cancellare un altro file.
 */
export function temporaryUploadPath(path: string | undefined): string | null {
  if (!path) return null;
  const folder = resolve(MEDIA_UPLOAD_DIR);
  const resolved = resolve(path);
  if (dirname(resolved) !== folder || !/^[a-f0-9]{32}$/.test(basename(resolved))) return null;
  return resolved;
}

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
        const path = temporaryUploadPath(request?.file?.path);
        if (path) void unlink(path).catch(() => undefined);
      }),
    );
  }
}
