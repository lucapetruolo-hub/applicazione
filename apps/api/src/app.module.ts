import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { CategoriesModule } from "./categories/categories.module";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { ProfessionalsModule } from "./professionals/professionals.module";
import { GuidedRequestsModule } from "./guided-requests/guided-requests.module";
import { QuotesModule } from "./quotes/quotes.module";
import { BookingsModule } from "./bookings/bookings.module";
import { ReviewsModule } from "./reviews/reviews.module";

@Module({
  imports: [
    PrismaModule,
    CategoriesModule,
    AuthModule,
    ProfessionalsModule,
    GuidedRequestsModule,
    QuotesModule,
    BookingsModule,
    ReviewsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
