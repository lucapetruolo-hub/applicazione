import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminModule } from "../admin/admin.module";
import { AdminFeeRulesController } from "./admin-fee-rules.controller";
import { PlatformFeeRulesService } from "./platform-fee-rules.service";

@Module({
  imports: [AuthModule, AdminModule],
  controllers: [AdminFeeRulesController],
  providers: [PlatformFeeRulesService],
  exports: [PlatformFeeRulesService],
})
export class PlatformFeeRulesModule {}
