import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SavedProfessionalsController } from "./saved-professionals.controller";
import { SavedProfessionalsService } from "./saved-professionals.service";

@Module({
  imports: [AuthModule],
  controllers: [SavedProfessionalsController],
  providers: [SavedProfessionalsService],
})
export class SavedProfessionalsModule {}
