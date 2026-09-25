import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import { notificationPreferencesSchema, type NotificationPreferences } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get("unread-count")
  unreadCount(@Req() req: AuthenticatedRequest) {
    return this.notificationsService.unreadCount(req.user.userId);
  }

  /** Contenuto delle notifiche non lette (tipo/payload), per il popup "toast" — vedi NotificationsService.listUnread. */
  @Get("unread")
  listUnread(@Req() req: AuthenticatedRequest) {
    return this.notificationsService.listUnread(req.user.userId);
  }

  /** Preferenze per argomento e canale, popup e suono (docs/CHANGELOG.md §152). */
  @Get("preferences")
  preferences(@Req() req: AuthenticatedRequest) {
    return this.notificationsService.preferencesOf(req.user.userId);
  }

  @Put("preferences")
  updatePreferences(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(notificationPreferencesSchema)) body: NotificationPreferences) {
    return this.notificationsService.updatePreferences(req.user.userId, body);
  }

  @Post("mark-all-read")
  markAllRead(@Req() req: AuthenticatedRequest) {
    return this.notificationsService.markAllRead(req.user.userId);
  }

  /** Cronologia completa (lette + non lette), per il pulsante a campanella nell'header — vedi NotificationsService.history. */
  @Get("history")
  history(@Req() req: AuthenticatedRequest) {
    return this.notificationsService.history(req.user.userId);
  }

  /** Elimina tutte le notifiche in un colpo (richiesta esplicita dell'utente). */
  @Delete()
  removeAll(@Req() req: AuthenticatedRequest) {
    return this.notificationsService.deleteAll(req.user.userId);
  }

  /** Elimina una singola notifica (swipe o pulsante nel dropdown della campanella). */
  @Delete(":id")
  remove(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.notificationsService.delete(req.user.userId, id);
  }
}
