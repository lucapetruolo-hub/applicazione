import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Req, UploadedFile, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { cashbookSettingsSchema, expenseInputSchema, type CashbookOverview, type CashbookSettings, type ExpenseInput } from "@professionisti/shared";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { MulterExceptionFilter } from "../common/multer-exception.filter";
import { MEDIA_UPLOAD_DIR } from "../common/media-upload";
import { CloudinaryService, removeTemporaryFile } from "../cloudinary/cloudinary.service";
import { CashbookService } from "./cashbook.service";

const MAX_RECEIPT_SIZE_BYTES = 8 * 1024 * 1024;

/** Entrate e uscite del professionista (docs/changelog/2026-11-19-entrate-e-uscite.md). */
@Controller("cashbook")
@UseGuards(JwtAuthGuard)
export class CashbookController {
  constructor(
    private readonly cashbookService: CashbookService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Get(":year")
  overview(@Req() req: AuthenticatedRequest, @Param("year", ParseIntPipe) year: number): Promise<CashbookOverview> {
    return this.cashbookService.overview(req.user.userId, year);
  }

  @Get(":year/csv")
  yearCsv(@Req() req: AuthenticatedRequest, @Param("year", ParseIntPipe) year: number): Promise<{ fileName: string; csv: string }> {
    return this.cashbookService.yearCsv(req.user.userId, year);
  }

  @Put("settings")
  updateSettings(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(cashbookSettingsSchema)) body: CashbookSettings): Promise<CashbookSettings> {
    return this.cashbookService.updateSettings(req.user.userId, body);
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post("expenses")
  createExpense(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(expenseInputSchema)) body: ExpenseInput) {
    return this.cashbookService.createExpense(req.user.userId, body);
  }

  @Put("expenses/:id")
  updateExpense(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body(new ZodValidationPipe(expenseInputSchema)) body: ExpenseInput) {
    return this.cashbookService.updateExpense(req.user.userId, id, body);
  }

  @Delete("expenses/:id")
  deleteExpense(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.cashbookService.deleteExpense(req.user.userId, id);
  }

  /** Foto dello scontrino: arriva già rimpicciolita e senza posizione GPS dal browser. */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseFilters(MulterExceptionFilter)
  @Post("receipt-photo")
  @UseInterceptors(
    FileInterceptor("image", {
      dest: MEDIA_UPLOAD_DIR,
      limits: { fileSize: MAX_RECEIPT_SIZE_BYTES },
      fileFilter: (_req, file, callback) => {
        if (!file.mimetype.startsWith("image/")) {
          callback(new BadRequestException("Lo scontrino deve essere una foto."), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  async uploadReceipt(@Req() req: AuthenticatedRequest, @UploadedFile() file?: Express.Multer.File): Promise<{ imageUrl: string }> {
    try {
      await this.cashbookService.profileIdOf(req.user.userId);
    } catch (error) {
      if (file) await removeTemporaryFile(file);
      throw error;
    }
    if (!file) throw new BadRequestException("Nessuna foto caricata.");
    // Più grande delle foto del profilo: le cifre di uno scontrino devono restare leggibili.
    const imageUrl = await this.cloudinaryService.uploadImage(file, "receipts", { width: 1600, height: 1600, crop: "limit" });
    return { imageUrl };
  }
}
