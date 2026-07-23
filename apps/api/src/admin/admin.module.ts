import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminController } from "./admin.controller";
import { AdminBootstrapController } from "./admin-bootstrap.controller";
import { AdminService } from "./admin.service";
import { AdminGuard } from "./admin.guard";

@Module({
  imports: [AuthModule],
  controllers: [AdminController, AdminBootstrapController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}
