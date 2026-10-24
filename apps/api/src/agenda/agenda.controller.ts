import { Body, Controller, Delete, Get, Header, NotFoundException, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { agendaWeekTemplateSchema, type AgendaWeekTemplate } from "@professionisti/shared";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AgendaService } from "./agenda.service";
import { CalendarFeedService } from "./calendar-feed.service";
import { DayRouteService } from "./day-route.service";

/** Strumenti della nuova agenda (docs/CHANGELOG.md §288), tutti del professionista autenticato. */
@Controller("agenda")
@UseGuards(JwtAuthGuard)
export class AgendaController {
  constructor(
    private readonly agendaService: AgendaService,
    private readonly calendarFeedService: CalendarFeedService,
    private readonly dayRouteService: DayRouteService,
  ) {}

  @Get("week-template")
  weekTemplate(@Req() req: AuthenticatedRequest) {
    return this.agendaService.weekTemplate(req.user.userId);
  }

  @Put("week-template")
  saveWeekTemplate(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(agendaWeekTemplateSchema)) body: AgendaWeekTemplate) {
    return this.agendaService.saveWeekTemplate(req.user.userId, body);
  }

  @Get("weather")
  weather(@Req() req: AuthenticatedRequest) {
    return this.agendaService.weather(req.user.userId);
  }

  @Get("days-ahead")
  daysAhead(@Req() req: AuthenticatedRequest) {
    return this.agendaService.daysAhead(req.user.userId);
  }

  @Get("zone-demand")
  zoneDemand(@Req() req: AuthenticatedRequest) {
    return this.agendaService.zoneDemand(req.user.userId);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get("route")
  route(@Req() req: AuthenticatedRequest, @Query("date") date: string) {
    return this.dayRouteService.dayRoute(req.user.userId, date ?? "");
  }

  @Get("calendar-feed")
  calendarFeed(@Req() req: AuthenticatedRequest) {
    return this.calendarFeedService.status(req.user.userId);
  }

  @Post("calendar-feed")
  enableCalendarFeed(@Req() req: AuthenticatedRequest) {
    return this.calendarFeedService.enable(req.user.userId);
  }

  @Delete("calendar-feed")
  disableCalendarFeed(@Req() req: AuthenticatedRequest) {
    return this.calendarFeedService.disable(req.user.userId);
  }
}

/** Link segreto letto da Google Calendar e iPhone, senza accesso. */
@Controller("calendar")
export class CalendarFeedController {
  constructor(private readonly calendarFeedService: CalendarFeedService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(":file")
  @Header("Content-Type", "text/calendar; charset=utf-8")
  @Header("Cache-Control", "private, max-age=900")
  async feed(@Param("file") file: string) {
    const ics = await this.calendarFeedService.ics(file.replace(/\.ics$/, ""));
    if (!ics) throw new NotFoundException();
    return ics;
  }
}
