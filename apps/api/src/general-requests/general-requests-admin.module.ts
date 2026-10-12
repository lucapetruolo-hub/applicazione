import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminModule } from "../admin/admin.module";
import { AdminGeneralRequestsController } from "./general-requests.controller";
import { GeneralRequestsModule } from "./general-requests.module";

/** Rotte admin delle richieste generali (vedi GeneralRequestsModule). */
@Module({
  imports: [AuthModule, AdminModule, GeneralRequestsModule],
  controllers: [AdminGeneralRequestsController],
})
export class GeneralRequestsAdminModule {}
