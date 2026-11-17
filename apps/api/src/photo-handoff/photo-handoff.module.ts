import { Module } from "@nestjs/common";
import { PhotoHandoffController } from "./photo-handoff.controller";
import { PhotoHandoffService } from "./photo-handoff.service";

/** "Scatta dal telefono" (docs/changelog/2026-11-16-scatta-dal-telefono.md). */
@Module({
  controllers: [PhotoHandoffController],
  providers: [PhotoHandoffService],
})
export class PhotoHandoffModule {}
