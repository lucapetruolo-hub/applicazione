import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RealtimeController, RealtimeTicketGuard } from "./realtime.controller";
import { RealtimeService } from "./realtime.service";
import { RealtimeTickets } from "./realtime-tickets";

@Module({
  // AuthModule: JwtAuthGuard su `POST /realtime/ticket` (§293).
  imports: [AuthModule],
  controllers: [RealtimeController],
  providers: [RealtimeService, RealtimeTickets, RealtimeTicketGuard],
  exports: [RealtimeService],
})
export class RealtimeModule {}
