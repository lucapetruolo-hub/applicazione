import { Inject, Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import { agendaAttention, type AgendaAttention } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";

const DAY_MS = 24 * 60 * 60_000;
/** Il primo avviso "agenda vuota" dopo 3 giorni dalla creazione del profilo, al massimo due, a una settimana di distanza. */
const EMPTY_FIRST_AFTER_DAYS = 3;
const EMPTY_AGAIN_AFTER_DAYS = 7;
const MAX_EMPTY_REMINDERS = 2;
/** "Stanno per finire": al massimo uno ogni due settimane, per chi l'agenda la usa già. */
const RUNNING_LOW_EVERY_DAYS = 14;

/**
 * Va mandato il promemoria sull'agenda (docs/CHANGELOG.md §273)? `sent` sono
 * gli avvisi già mandati, dal più recente.
 */
export function agendaReminderDue(input: { attention: AgendaAttention | null; profileCreatedAt: Date; sent: { attention: string | null; createdAt: Date }[]; now: Date }): boolean {
  const { attention, now } = input;
  if (!attention) return false;
  const last = input.sent[0];
  const daysSince = (date: Date) => (now.getTime() - date.getTime()) / DAY_MS;
  if (attention === "EMPTY") {
    if (daysSince(input.profileCreatedAt) < EMPTY_FIRST_AFTER_DAYS) return false;
    if (input.sent.filter((s) => s.attention === "EMPTY").length >= MAX_EMPTY_REMINDERS) return false;
    return !last || daysSince(last.createdAt) >= EMPTY_AGAIN_AFTER_DAYS;
  }
  return !last || daysSince(last.createdAt) >= RUNNING_LOW_EVERY_DAYS;
}

/**
 * Promemoria (sito + email, argomento "Lavori e appuntamenti", spegnibile)
 * a chi non ha disponibilità in agenda o non ne ha nei prossimi 7 giorni:
 * stesso criterio dell'avviso in "Oggi" e del pallino su "Agenda".
 */
@Injectable()
export class AgendaRemindersService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron("0 10 * * *", { timeZone: "Europe/Rome" })
  async remindAgenda(now: Date = new Date()): Promise<void> {
    const startOfToday = new Date(now);
    startOfToday.setUTCHours(0, 0, 0, 0);
    // Stessi filtri dello smistamento (CLAUDE.md §5 punto 11): niente avvisi a chi non può ricevere clienti.
    const profiles = await this.prisma.professionalProfile.findMany({
      where: {
        isDemo: false,
        deletedAt: null,
        invitePendingAt: null,
        suspendedAt: null,
        pausedAt: null,
        user: { suspendedAt: null },
        createdAt: { lte: new Date(now.getTime() - EMPTY_FIRST_AFTER_DAYS * DAY_MS) },
      },
      select: {
        userId: true,
        createdAt: true,
        availabilitySlots: { where: { OR: [{ date: null }, { date: { gte: startOfToday } }] }, select: { date: true } },
      },
    });
    for (const profile of profiles) {
      const attention = agendaAttention(profile.availabilitySlots, now);
      if (!attention) continue;
      const sent = await this.prisma.notification.findMany({
        where: { userId: profile.userId, type: "AGENDA_REMINDER" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, payload: true },
      });
      const history = sent.map((row) => ({ createdAt: row.createdAt, attention: payloadAttention(row.payload) }));
      if (!agendaReminderDue({ attention, profileCreatedAt: profile.createdAt, sent: history, now })) continue;
      await this.notificationsService.notify(profile.userId, "AGENDA_REMINDER", { attention });
    }
  }
}

function payloadAttention(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>).attention;
  return typeof value === "string" ? value : null;
}
