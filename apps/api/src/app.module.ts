import { Module } from "@nestjs/common";
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

@Module({
  imports: [
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
  ],
  controllers: [HealthController],
})
export class AppModule {}
