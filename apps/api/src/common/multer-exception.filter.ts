import { ArgumentsHost, Catch, ExceptionFilter, HttpException, PayloadTooLargeException } from "@nestjs/common";
import type { Response } from "express";

// @nestjs/platform-express traduce già i MulterError in HttpException
// prima che qualunque ExceptionFilter li veda (vedi
// transformException in @nestjs/platform-express/multer/multer.utils.js):
// LIMIT_FILE_SIZE diventa un PayloadTooLargeException col messaggio inglese
// grezzo di multer ("File too large"). Qui lo riscriviamo in italiano,
// stesso principio "errore chiaro invece di crash" del resto dell'app.
@Catch(PayloadTooLargeException)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const friendly = new PayloadTooLargeException("L'immagine è troppo grande: la dimensione massima è 8MB.");
    response.status(friendly.getStatus()).json(friendly.getResponse());
  }
}
