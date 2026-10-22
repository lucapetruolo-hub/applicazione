import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { GeocodingModule } from "../geocoding/geocoding.module";
import { AgendaController, CalendarFeedController } from "./agenda.controller";
import { AgendaService } from "./agenda.service";
import { CalendarFeedService } from "./calendar-feed.service";
import { DayRouteService } from "./day-route.service";
import { WeatherService } from "./weather.service";

/** Strumenti della nuova agenda (docs/CHANGELOG.md §288). */
@Module({
  imports: [AuthModule, GeocodingModule],
  controllers: [AgendaController, CalendarFeedController],
  providers: [AgendaService, CalendarFeedService, DayRouteService, WeatherService],
})
export class AgendaModule {}
