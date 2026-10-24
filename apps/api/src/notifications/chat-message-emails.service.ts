import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import { notificationChannelEnabled } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "./notifications.service";

/** Minuti dopo i quali un messaggio non letto sul sito arriva anche per email. */
export const CHAT_EMAIL_AFTER_MINUTES = 10;
/** Oltre un giorno non si recupera più (es. API ferma a lungo): l'email arriverebbe fuori tempo. */
const CHAT_EMAIL_MAX_AGE_HOURS = 24;

const CHAT_TYPES = ["TIMELINE_MESSAGE_FROM_CLIENT", "TIMELINE_MESSAGE_FROM_PROFESSIONAL"] as const;
type ChatType = (typeof CHAT_TYPES)[number];

type ChatNotificationRow = { id: string; userId: string; type: string; payload: unknown; createdAt: Date };

export type ChatEmailGroup = {
  userId: string;
  type: ChatType;
  guidedRequestId: string;
  professionalProfileId: string;
  notificationIds: string[];
};

function threadOf(row: ChatNotificationRow): { guidedRequestId: string; professionalProfileId: string } | null {
  const payload = row.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const { guidedRequestId, professionalProfileId } = payload as Record<string, unknown>;
  return typeof guidedRequestId === "string" && typeof professionalProfileId === "string" ? { guidedRequestId, professionalProfileId } : null;
}

const threadKey = (userId: string, thread: { guidedRequestId: string; professionalProfileId: string }) =>
  `${userId}:${thread.guidedRequestId}:${thread.professionalProfileId}`;

/**
 * Conversazioni da avvisare per email. `pending` sono i messaggi non letti e
 * non ancora avvisati, `alreadyEmailed` quelli non letti già avvisati:
 * finché chi riceve non apre la chat, niente seconda email per la stessa
 * conversazione, e i messaggi nuovi lì si segnano come già coperti
 * (`covered`). Una conversazione è pronta quando il suo primo messaggio non
 * letto ha almeno CHAT_EMAIL_AFTER_MINUTES minuti; l'email conta anche
 * quelli arrivati dopo.
 */
export function chatEmailGroups(
  pending: ChatNotificationRow[],
  alreadyEmailed: ChatNotificationRow[],
  now: Date,
): { groups: ChatEmailGroup[]; covered: string[] } {
  const dueBefore = now.getTime() - CHAT_EMAIL_AFTER_MINUTES * 60_000;
  const emailed = new Set<string>();
  for (const row of alreadyEmailed) {
    const thread = threadOf(row);
    if (thread) emailed.add(threadKey(row.userId, thread));
  }
  const groups = new Map<string, ChatEmailGroup>();
  const due = new Set<string>();
  const covered: string[] = [];
  for (const row of pending) {
    const thread = threadOf(row);
    if (!thread || !(CHAT_TYPES as readonly string[]).includes(row.type)) continue;
    const key = threadKey(row.userId, thread);
    if (emailed.has(key)) {
      covered.push(row.id);
      continue;
    }
    const group = groups.get(key) ?? { userId: row.userId, type: row.type as ChatType, ...thread, notificationIds: [] };
    group.notificationIds.push(row.id);
    groups.set(key, group);
    if (row.createdAt.getTime() <= dueBefore) due.add(key);
  }
  const ready = [...groups.entries()].filter(([key]) => due.has(key)).map(([, group]) => group);
  return { groups: ready, covered: [...covered, ...ready.flatMap((group) => group.notificationIds)] };
}

/**
 * Email per i messaggi in chat che chi riceve non ha visto sul sito
 * (docs/CHANGELOG.md §328): dopo CHAT_EMAIL_AFTER_MINUTES minuti dalla
 * notifica ancora non letta, una sola email per conversazione con il numero
 * di messaggi. `sentAt` della notifica segna che l'email è partita (o che
 * il canale email era spento): ogni messaggio si avvisa al massimo una volta.
 */
@Injectable()
export class ChatMessageEmailsService {
  private readonly logger = new Logger(ChatMessageEmailsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sendDue(now: Date = new Date()): Promise<void> {
    const unread = { type: { in: [...CHAT_TYPES] }, readAt: null, createdAt: { gte: new Date(now.getTime() - CHAT_EMAIL_MAX_AGE_HOURS * 60 * 60_000) } };
    const select = { id: true, userId: true, type: true, payload: true, createdAt: true } as const;
    const pending = await this.prisma.notification.findMany({ where: { ...unread, sentAt: null }, select });
    if (pending.length === 0) return;
    const userIds = [...new Set(pending.map((row) => row.userId))];
    const alreadyEmailed = await this.prisma.notification.findMany({ where: { ...unread, userId: { in: userIds }, sentAt: { not: null } }, select });
    const { groups, covered } = chatEmailGroups(pending, alreadyEmailed, now);
    if (covered.length > 0) await this.prisma.notification.updateMany({ where: { id: { in: covered } }, data: { sentAt: now } });
    for (const group of groups) {
      try {
        const prefs = await this.notificationsService.preferencesOf(group.userId);
        if (!notificationChannelEnabled(prefs, group.type, "email")) continue;
        await this.notificationsService.emailChatMessages(group.userId, { ...group, count: group.notificationIds.length });
      } catch (err) {
        this.logger.error(`Email dei messaggi in chat non inviata: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}
