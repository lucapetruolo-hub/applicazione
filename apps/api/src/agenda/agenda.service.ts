import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@professionisti/database";
import { agendaWeekTemplateSchema, DEFAULT_WEEK_TEMPLATE, type AgendaWeekTemplate, type WeatherDayAlert } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { WeatherService } from "./weather.service";

@Injectable()
export class AgendaService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly weatherService: WeatherService,
  ) {}

  /** Settimana tipo salvata, o quella proposta se non c'è (o non è più valida). */
  async weekTemplate(userId: string): Promise<AgendaWeekTemplate> {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, select: { agendaWeekTemplate: true } });
    if (!profile) throw new NotFoundException("Profilo professionista non trovato.");
    const parsed = agendaWeekTemplateSchema.safeParse(profile.agendaWeekTemplate);
    return parsed.success ? parsed.data : DEFAULT_WEEK_TEMPLATE;
  }

  async saveWeekTemplate(userId: string, template: AgendaWeekTemplate): Promise<AgendaWeekTemplate> {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new NotFoundException("Profilo professionista non trovato.");
    await this.prisma.professionalProfile.update({ where: { userId }, data: { agendaWeekTemplate: template as unknown as Prisma.InputJsonValue } });
    return template;
  }

  /** Icone meteo dei prossimi giorni sulla zona del professionista. */
  async weather(userId: string): Promise<WeatherDayAlert[]> {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, select: { latitude: true, longitude: true } });
    if (!profile) throw new NotFoundException("Profilo professionista non trovato.");
    return this.weatherService.alerts(profile.latitude, profile.longitude);
  }
}
