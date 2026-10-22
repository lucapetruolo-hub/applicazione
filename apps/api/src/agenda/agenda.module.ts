import { Module } from "@nestjs/common";
import { AgendaController, CalendarFeedController } from "./agenda.controller";
import { AgendaService } from "./agenda.service";
import { CalendarFeedService } from "./calendar-feed.service";
import { DayRouteService } from "./day-route.service";
import { WeatherService } from "./weather.service";

/** Strumenti della nuova agenda (docs/CHANGELOG.md §279). */
@Module({
  controllers: [AgendaController, CalendarFeedController],
  providers: [AgendaService, CalendarFeedService, DayRouteService, WeatherService],
})
export class AgendaModule {}
