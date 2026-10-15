import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminModule } from "../admin/admin.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { Dac7Controller, ProfessionalDac7Controller } from "./dac7.controller";
import { Dac7Service } from "./dac7.service";

@Module({
  imports: [AuthModule, AdminModule, NotificationsModule],
  controllers: [Dac7Controller, ProfessionalDac7Controller],
  providers: [Dac7Service],
  exports: [Dac7Service],
})
export class Dac7Module {}
