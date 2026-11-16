import { Module } from "@nestjs/common";
import { SiteCountsController } from "./site-counts.controller";
import { SiteCountsService } from "./site-counts.service";
import { ContactFaqService } from "./contact-faq.service";

/** Contatori dell'andamento del sito (docs/CHANGELOG.md §372): solo Prisma, nessun altro modulo, per poterlo usare ovunque senza giri. */
@Module({
  controllers: [SiteCountsController],
  providers: [SiteCountsService, ContactFaqService],
  exports: [SiteCountsService, ContactFaqService],
})
export class SiteCountsModule {}
