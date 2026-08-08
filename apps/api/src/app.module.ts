import { Module } from "@nestjs/common";
import { APP_GUARD, Reflector } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ScheduleModule } from "@nestjs/schedule";
import { HealthController } from "./health/health.controller";
import { CategoriesModule } from "./categories/categories.module";
import { PrismaModule } from "./prisma/prisma.module";
import { CloudinaryModule } from "./cloudinary/cloudinary.module";
import { GeocodingModule } from "./geocoding/geocoding.module";
import { AuthModule } from "./auth/auth.module";
import { ProfessionalsModule } from "./professionals/professionals.module";
import { GuidedRequestsModule } from "./guided-requests/guided-requests.module";
import { QuotesModule } from "./quotes/quotes.module";
import { BookingsModule } from "./bookings/bookings.module";
import { ReviewsModule } from "./reviews/reviews.module";
import { BillingModule } from "./billing/billing.module";
import { SavedProfessionalsModule } from "./saved-professionals/saved-professionals.module";
import { AdminModule } from "./admin/admin.module";
import { WaitlistModule } from "./waitlist/waitlist.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { StatsModule } from "./stats/stats.module";

@Module({
  imports: [
    // Limite globale prudente (60 richieste/minuto per IP): protegge da
    // scraping/flood senza intralciare l'uso normale (una pagina di ricerca
    // può fare più chiamate ravvicinate). Endpoint pubblici ad alto rischio
    // di abuso (registrazione, login, waitlist, richieste guidate,
    // recensioni) hanno un limite più stretto via @Throttle sul singolo
    // controller — CLAUDE.md §10/AUDIT.md §6, punto rimandato alla Fase 6.
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 60 }]),
    // Scadenza/espansione automatica dei Lead e delle richieste guidate
    // (CLAUDE.md §14, GuidedRequestsService.runExpiryCheck): nessuna coda
    // reale nello stack (Redis/BullMQ restano solo nella tabella §2, mai
    // effettivamente collegati — vedi nota lì) — @nestjs/schedule gira un
    // cron in-process, senza infrastruttura nuova da provisionare. Se in
    // futuro l'API girerà su più istanze andrà rivista (rischio di doppia
    // esecuzione), non un problema alla scala attuale (CLAUDE.md §7, singola
    // città).
    ScheduleModule.forRoot(),
    PrismaModule,
    CloudinaryModule,
    GeocodingModule,
    CategoriesModule,
    AuthModule,
    ProfessionalsModule,
    GuidedRequestsModule,
    QuotesModule,
    BookingsModule,
    ReviewsModule,
    BillingModule,
    SavedProfessionalsModule,
    AdminModule,
    WaitlistModule,
    NotificationsModule,
    StatsModule,
  ],
  controllers: [HealthController],
  // Reflector esplicito nei provider (non solo APP_GUARD): senza, il DI di
  // Nest falliva a runtime nel risolvere il terzo parametro del costruttore
  // di ThrottlerGuard ("Reflector at index [2]") pur essendo Reflector
  // normalmente un provider implicito del framework — la guardia falliva in
  // silenzio (nessun crash, ma nessun rate limiting applicato: verificato
  // con richieste ripetute a POST /waitlist, sempre 201 oltre il limite).
  // Workaround noto per questa combinazione @nestjs/throttler + build tsc.
  providers: [Reflector, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
