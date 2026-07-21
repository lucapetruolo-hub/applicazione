import { Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { SavedProfessionalsService } from "./saved-professionals.service";

@Controller("saved-professionals")
@UseGuards(JwtAuthGuard)
export class SavedProfessionalsController {
  constructor(private readonly savedProfessionalsService: SavedProfessionalsService) {}

  @Get("me")
  listMine(@Req() req: AuthenticatedRequest) {
    return this.savedProfessionalsService.listForUser(req.user.userId);
  }

  @Post(":professionalProfileId")
  save(@Req() req: AuthenticatedRequest, @Param("professionalProfileId") professionalProfileId: string) {
    return this.savedProfessionalsService.save(req.user.userId, professionalProfileId);
  }

  @Delete(":professionalProfileId")
  remove(@Req() req: AuthenticatedRequest, @Param("professionalProfileId") professionalProfileId: string) {
    return this.savedProfessionalsService.remove(req.user.userId, professionalProfileId);
  }
}
