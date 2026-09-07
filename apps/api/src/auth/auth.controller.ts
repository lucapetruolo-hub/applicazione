import { BadRequestException, Body, Controller, Delete, Get, Inject, Patch, Post, Req, UploadedFile, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import {
  changePasswordSchema,
  emailPasswordSchema,
  googleVerifySchema,
  registerSchema,
  updateAccountSchema,
  type ChangePasswordInput,
  type EmailPasswordInput,
  type GoogleVerifyInput,
  type RegisterInput,
  type UpdateAccountInput,
} from "@professionisti/shared";
import type { PrismaClient } from "@professionisti/database";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { MulterExceptionFilter } from "../common/multer-exception.filter";
import { PRISMA } from "../prisma/prisma.module";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { AuthService } from "./auth.service";
import { JwtAuthGuard, type AuthenticatedRequest } from "./jwt-auth.guard";

const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly cloudinaryService: CloudinaryService,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {}

  // Limiti più stretti del default globale (60/min): creazione account e
  // login sono i bersagli classici di bot/credential-stuffing — un IP che
  // prova decine di combinazioni al minuto non è un utente reale.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("register")
  async register(@Body(new ZodValidationPipe(registerSchema)) body: RegisterInput) {
    // `acceptedLegalTerms`/`declaredAdult` sono già garantite `=== true` da
    // `registerSchema` stesso (Zod `.refine`) prima di arrivare qui —
    // `register()` registra sempre il consenso, nessun controllo aggiuntivo.
    return this.authService.register(body.email, body.password, body.name, body.role);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("login")
  async login(@Body(new ZodValidationPipe(emailPasswordSchema)) body: EmailPasswordInput) {
    return this.authService.login(body.email, body.password);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("google/verify")
  async verifyGoogle(@Body(new ZodValidationPipe(googleVerifySchema)) body: GoogleVerifyInput) {
    return this.authService.verifyGoogleToken(body.idToken, body.role, body.createIfMissing, {
      acceptedLegalTerms: body.acceptedLegalTerms === true,
      declaredAdult: body.declaredAdult === true,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@Req() req: AuthenticatedRequest) {
    const user = await this.prisma.user.findUnique({ where: { id: req.user.userId } });
    // Bug reale segnalato dall'utente: un JWT emesso prima della
    // cancellazione dell'account resta valido fino a scadenza naturale
    // (CLAUDE.md §16, `JwtAuthGuard` resta stateless apposta) — senza
    // questo controllo, `/auth/me` restituiva comunque la riga
    // anonimizzata (email sintetica "deleted-...@deleted.invalid"),
    // mostrata in header come se l'utente fosse ancora loggato. Trattato
    // come account inesistente: il frontend (`AuthContext.loadUser`) già
    // interpreta `null` come "non più autenticato".
    if (!user || user.deletedAt !== null) return null;
    return this.withBusinessName(user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch("me")
  async updateMe(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(updateAccountSchema)) body: UpdateAccountInput) {
    const user = await this.authService.updateAccount(req.user.userId, body);
    return this.withBusinessName(user);
  }

  /**
   * Nome attività al posto del nome personale nell'header (AccountMenu),
   * richiesta esplicita dell'utente: un professionista è identificato dalla
   * propria attività, non dal nome dell'intestatario dell'account. `User`
   * non ha un campo `businessName` (vive su `ProfessionalProfile`, entità
   * separata) — recuperato qui con una query dedicata solo per i
   * professionisti, invece di duplicare il campo su `User`.
   */
  private async withBusinessName(user: {
    id: string;
    phone: string | null;
    email: string | null;
    name: string | null;
    surname: string | null;
    birthDate: Date | null;
    role: "CLIENT" | "PROFESSIONAL" | "ADMIN";
    passwordHash: string | null;
    imageUrl: string | null;
    street: string | null;
    houseNumber: string | null;
    addressExtra: string | null;
    postalCode: string | null;
    city: string | null;
    province: string | null;
  }) {
    const { id, phone, email, name, surname, birthDate, role, passwordHash, imageUrl, street, houseNumber, addressExtra, postalCode, city, province } = user;
    // Bug reale corretto (richiesta esplicita dell'utente: "quando faccio
    // admin una email scompare il campo agenda dal suo menu"): promuovere un
    // professionista ad ADMIN (AdminService.promoteToAdmin) sovrascrive
    // `role` a "ADMIN" — il `ProfessionalProfile` collegato resta intatto sul
    // DB (la promozione non lo tocca), ma ogni punto che leggeva
    // `role === "PROFESSIONAL"` per decidere se mostrare la dashboard/agenda/
    // profilo pubblico smetteva di trovarlo, come se il professionista avesse
    // perso il proprio profilo. La query va quindi tentata per qualunque
    // ruolo diverso da CLIENT (un CLIENT non ha mai un ProfessionalProfile
    // per costruzione), non solo per PROFESSIONAL.
    const professionalProfile =
      role !== "CLIENT"
        ? await this.prisma.professionalProfile.findUnique({ where: { userId: id }, select: { businessName: true, imageUrl: true } })
        : null;
    return {
      id,
      phone,
      email,
      name,
      surname,
      birthDate,
      role,
      // Vero per un account PROFESSIONAL "normale" (anche senza ancora un
      // profilo creato — un professionista appena registrato deve poter
      // raggiungere /dashboard/profilo per crearne uno, esattamente come
      // prima), oppure per un ADMIN che ne aveva già uno al momento della
      // promozione. Non basta "il profilo esiste": un ADMIN promosso da un
      // CLIENT (mai stato professionista) deve restare fuori, altrimenti
      // baserebbe l'accesso alla dashboard su un side-effect della query
      // invece che sul suo status reale.
      isProfessional: role === "PROFESSIONAL" || (role === "ADMIN" && professionalProfile !== null),
      hasPassword: Boolean(passwordHash),
      imageUrl,
      businessName: professionalProfile?.businessName ?? null,
      // Immagine profilo pubblica del professionista, richiesta esplicita
      // dell'utente: mostrata al posto delle iniziali nell'icona
      // dell'header (AccountMenu) quando disponibile — `User.imageUrl`
      // resta sempre null per un professionista (upload disabilitato in
      // /account per quel ruolo, vedi nota altrove in CLAUDE.md).
      businessImageUrl: professionalProfile?.imageUrl ?? null,
      street,
      houseNumber,
      addressExtra,
      postalCode,
      city,
      province,
    };
  }

  /**
   * Immagine profilo per l'account cliente (richiesta esplicita
   * dell'utente: prima solo ProfessionalProfile.imageUrl esisteva) — stesso
   * pattern di ProfessionalsController.uploadMyImage, stessa cartella
   * Cloudinary condivisa ("professionisti"): non è un dato specifico del
   * profilo professionale, è la stessa "immagine profilo" per qualunque
   * ruolo, non serve separarla per cartella.
   */
  @UseGuards(JwtAuthGuard)
  @UseFilters(MulterExceptionFilter)
  @Post("me/image")
  @UseInterceptors(
    FileInterceptor("image", {
      limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
      fileFilter: (_req, file, callback) => {
        if (!file.mimetype.startsWith("image/")) {
          callback(new BadRequestException("Il file caricato deve essere un'immagine."), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  async uploadMyImage(@Req() req: AuthenticatedRequest, @UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("Nessuna immagine caricata.");
    }
    const imageUrl = await this.cloudinaryService.uploadImage(file, "professionisti");
    await this.prisma.user.update({ where: { id: req.user.userId }, data: { imageUrl } });
    return { imageUrl };
  }

  @UseGuards(JwtAuthGuard)
  @Post("change-password")
  async changePassword(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
  ) {
    await this.authService.changePassword(req.user.userId, body.currentPassword, body.newPassword);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Delete("me")
  async deleteMe(@Req() req: AuthenticatedRequest) {
    await this.authService.deleteAccount(req.user.userId);
    return { success: true };
  }

  /**
   * Esportazione dati personali (richiesta esplicita dell'utente, "Verbale
   * di Conformità" — diritto alla portabilità, art. 20 GDPR).
   */
  @UseGuards(JwtAuthGuard)
  @Get("me/export")
  async exportMe(@Req() req: AuthenticatedRequest) {
    return this.authService.exportMyData(req.user.userId);
  }
}
