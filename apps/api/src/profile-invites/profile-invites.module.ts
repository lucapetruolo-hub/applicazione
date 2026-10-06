import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminModule } from "../admin/admin.module";
import { ProfessionalsModule } from "../professionals/professionals.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { EmailModule } from "../email/email.module";
import { AdminProfileInvitesController, ProfileInvitesController } from "./profile-invites.controller";
import { ProfileInvitesService } from "./profile-invites.service";

@Module({
  imports: [AuthModule, AdminModule, ProfessionalsModule, AuditLogModule, EmailModule],
  controllers: [AdminProfileInvitesController, ProfileInvitesController],
  providers: [ProfileInvitesService],
})
export class ProfileInvitesModule {}
