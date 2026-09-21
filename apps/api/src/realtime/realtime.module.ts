import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RealtimeController } from "./realtime.controller";
import { RealtimeService } from "./realtime.service";

@Module({
  // AuthModule: RealtimeController inietta JwtService direttamente (verifica
  // manuale del token via query string, EventSource non supporta header
  // custom — vedi il controller) — AuthModule esporta già JwtModule per lo
  // stesso motivo di JwtAuthGuard altrove nel progetto.
  imports: [AuthModule],
  controllers: [RealtimeController],
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
