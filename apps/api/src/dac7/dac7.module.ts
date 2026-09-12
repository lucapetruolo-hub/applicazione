import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminModule } from "../admin/admin.module";
import { Dac7Controller } from "./dac7.controller";
import { Dac7Service } from "./dac7.service";

@Module({
  imports: [AuthModule, AdminModule],
  controllers: [Dac7Controller],
  providers: [Dac7Service],
  exports: [Dac7Service],
})
export class Dac7Module {}
