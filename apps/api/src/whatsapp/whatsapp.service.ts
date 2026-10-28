import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import {
  Prisma,
  type OutboundMessage,
  type PrismaClient,
} from "@professionisti/database";
import {
  notificationJobLabel,
  WHATSAPP_DIGEST_DEFAULT_HOUR,
  WHATSAPP_MESSAGE_TYPES,
  wallClockNow,
  type WhatsAppMessageType,
  type WhatsAppAdminSummary,
  type WhatsAppStatus,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { anonymizeProblemText } from "../problem-match/problem-match.service";
import { opsAlert } from "../common/ops-alert";
import {
  COUNTED_USER,
  countingFrom,
  sinceLaunch,
} from "../site-counts/counted";
import {
  whatsAppDailyLimit,
  whatsAppPriceMicroEur,
  whatsAppProviderFromEnv,
} from "./whatsapp-env";
import {
  WhatsAppProviderError,
  type WhatsAppProvider,
} from "./whatsapp-provider";
import {
  WHATSAPP_LANGUAGE,
  WHATSAPP_TEMPLATES,
  professionalDayMessage,
  type WhatsAppTemplateDefinition,
  whatsappDayTime,
  whatsappName,
  whatsappTime,
} from "./whatsapp-templates";
import {
  isMobileNumber,
  isStopRequest,
  maskedPhone,
  nextSendTime,
  shouldApplyStatus,
  startOfItalianDay,
  wallClockToInstant,
  whatsappNumber,
} from "./whatsapp-rules";

export const PHONE_CODE_VALID_MINUTES = 10;
export const PHONE_CODE_MAX_ATTEMPTS = 5;
export const PHONE_CODE_RESEND_SECONDS = 60;
export const PHONE_CODES_PER_DAY = 5;
/** Messaggi al giorno per persona (codici esclusi): un difetto non deve diventare una raffica. */
export const WHATSAPP_PER_USER_DAILY_LIMIT = 6;
/** Tentativi per un errore che si può riprovare (rete, limiti di Meta), a 10 minuti l'uno dall'altro. */
const MAX_ATTEMPTS = 3;
const RETRY_MINUTES = 10;

type MessageParams = {
  bodyParams: string[];
  urlButtonSuffix?: string;
  copyCode?: string;
};

function hashPhoneCode(userId: string, phone: string, code: string): string {
  return createHash("sha256")
    .update(`${userId}:${phone}:${code}`)
    .digest("hex");
}

function storedParams(value: Prisma.JsonValue | null): MessageParams | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (
    !Array.isArray(v.bodyParams) ||
    !v.bodyParams.every((p) => typeof p === "string")
  )
    return null;
  return {
    bodyParams: v.bodyParams as string[],
    ...(typeof v.urlButtonSuffix === "string"
      ? { urlButtonSuffix: v.urlButtonSuffix }
      : {}),
    ...(typeof v.copyCode === "string" ? { copyCode: v.copyCode } : {}),
  };
}

/**
 * Promemoria su WhatsApp con Meta (decisione di Luca del 28/10/2026,
 * docs/changelog/2026-10-28-promemoria-whatsapp.md). Pochi messaggi
 * (`WHATSAPP_MESSAGE_TYPES`), solo a chi ha confermato il numero con un
 * codice e acceso i promemoria. Ogni messaggio è una riga di
 * `OutboundMessage`, come un pagamento: un solo invio per evento, esito dal
 * webhook di Meta, costo stimato dalla rate card. Ore di silenzio 21-8 per
 * ciò che può aspettare, tetto al giorno per il sito e per persona.
 *
 * Mai bloccante, come le email: senza chiavi non parte nulla e non si
 * scrive nulla; un errore di Meta resta nel registro e non ferma chi ha
 * chiamato.
 */
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly provider: WhatsAppProvider | null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    // Solo i test passano un fornitore finto.
    @Optional() @Inject("WHATSAPP_PROVIDER") provider?: WhatsAppProvider | null,
  ) {
    this.provider =
      provider === undefined ? whatsAppProviderFromEnv() : provider;
  }

  get available(): boolean {
    return this.provider !== null;
  }

  // ---------------------------------------------------------------------------
  // Messaggi
  // ---------------------------------------------------------------------------

  /**
   * Mette in coda un messaggio e, se non è l'ora del silenzio, lo manda
   * subito. `urgent` salta le ore di silenzio (codice, "sto arrivando",
   * annullamento di un appuntamento vicino). Un secondo invio con la stessa
   * `idempotencyKey` non fa nulla.
   */
  async enqueue(input: {
    userId: string;
    type: WhatsAppMessageType;
    params: MessageParams;
    idempotencyKey: string;
    /** Un modello diverso da quello del tipo (riepilogo della sera: 1, 2, 3 o più lavori). */
    template?: WhatsAppTemplateDefinition;
    bookingId?: string | null;
    urgent?: boolean;
    expiresAt?: Date | null;
    now?: Date;
  }): Promise<OutboundMessage | null> {
    if (!this.provider) return null;
    const now = input.now ?? new Date();
    const template = input.template ?? WHATSAPP_TEMPLATES[input.type];
    let row: OutboundMessage;
    try {
      row = await this.prisma.outboundMessage.create({
        data: {
          userId: input.userId,
          type: input.type,
          template: template.name,
          category: template.category,
          params: input.params as unknown as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey,
          bookingId: input.bookingId ?? null,
          sendAfter: input.urgent ? now : nextSendTime(now),
          expiresAt: input.expiresAt ?? null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        return null;
      throw error;
    }
    if (row.sendAfter.getTime() <= now.getTime()) {
      await this.dispatch(row.id, now);
      return this.prisma.outboundMessage.findUnique({ where: { id: row.id } });
    }
    return row;
  }

  /** Spedisce un messaggio in coda, se tutte le condizioni valgono ancora adesso. */
  async dispatch(id: string, now: Date = new Date()): Promise<void> {
    if (!this.provider) return;
    const row = await this.prisma.outboundMessage.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            phone: true,
            phoneVerifiedNumber: true,
            whatsappOptInAt: true,
            phoneCodeNumber: true,
            deletedAt: true,
          },
        },
      },
    });
    if (!row || row.status !== "QUEUED") return;
    const skip = (reason: string) =>
      this.prisma.outboundMessage.updateMany({
        where: { id, status: "QUEUED" },
        data: { status: "SKIPPED", skipReason: reason, params: Prisma.DbNull },
      });

    const user = row.user;
    const isCode = row.type === "PHONE_VERIFICATION_CODE";
    if (row.expiresAt && row.expiresAt.getTime() <= now.getTime())
      return void (await skip("EXPIRED"));
    if (!user || user.deletedAt || !user.phone)
      return void (await skip("NO_PHONE"));
    if (isCode) {
      if (user.phoneCodeNumber !== user.phone)
        return void (await skip("PHONE_CHANGED"));
    } else {
      if (!user.whatsappOptInAt) return void (await skip("OPTED_OUT"));
      if (user.phoneVerifiedNumber !== user.phone)
        return void (await skip("NOT_VERIFIED"));
    }
    if (!isMobileNumber(user.phone)) return void (await skip("NOT_MOBILE"));
    const params = storedParams(row.params);
    if (
      !params ||
      !(WHATSAPP_MESSAGE_TYPES as readonly string[]).includes(row.type)
    )
      return void (await skip("INVALID"));

    const dayStart = startOfItalianDay(now);
    const sentToday = await this.prisma.outboundMessage.count({
      where: { sentAt: { gte: dayStart } },
    });
    if (sentToday >= whatsAppDailyLimit()) {
      opsAlert(
        "whatsapp-daily-limit",
        `Tetto di ${whatsAppDailyLimit()} messaggi WhatsApp al giorno raggiunto: i messaggi successivi non partono (WHATSAPP_DAILY_LIMIT).`,
      );
      return void (await skip("DAILY_LIMIT"));
    }
    if (!isCode && row.userId) {
      const userToday = await this.prisma.outboundMessage.count({
        where: {
          userId: row.userId,
          sentAt: { gte: dayStart },
          type: { not: "PHONE_VERIFICATION_CODE" },
        },
      });
      if (userToday >= WHATSAPP_PER_USER_DAILY_LIMIT)
        return void (await skip("USER_DAILY_LIMIT"));
    }

    // Prenotato per questo giro: un secondo giro in contemporanea non lo rimanda.
    const claimed = await this.prisma.outboundMessage.updateMany({
      where: { id, status: "QUEUED", attempts: row.attempts },
      data: { attempts: { increment: 1 } },
    });
    if (claimed.count === 0) return;

    try {
      const { providerMessageId } = await this.provider.sendTemplate({
        to: whatsappNumber(user.phone),
        template: row.template,
        language: WHATSAPP_LANGUAGE,
        ...params,
      });
      await this.prisma.outboundMessage.update({
        where: { id },
        data: {
          status: "SENT",
          providerMessageId,
          sentAt: now,
          params: Prisma.DbNull,
          errorCode: null,
          errorMessage: null,
        },
      });
    } catch (error) {
      const providerError =
        error instanceof WhatsAppProviderError ? error : null;
      const message = (
        error instanceof Error ? error.message : String(error)
      ).slice(0, 300);
      const final =
        providerError?.permanent || row.attempts + 1 >= MAX_ATTEMPTS;
      await this.prisma.outboundMessage.update({
        where: { id },
        data: final
          ? {
              status: "FAILED",
              failedAt: now,
              errorCode: providerError?.code ?? null,
              errorMessage: message,
              params: Prisma.DbNull,
            }
          : {
              sendAfter: new Date(now.getTime() + RETRY_MINUTES * 60_000),
              errorCode: providerError?.code ?? null,
              errorMessage: message,
            },
      });
      this.logger.warn(
        `Messaggio WhatsApp ${row.type} non partito: ${message}`,
      );
      if (final && !providerError?.permanent)
        opsAlert(
          "whatsapp-send-failed",
          `WhatsApp: messaggi che non partono dopo ${MAX_ATTEMPTS} tentativi (${message}).`,
        );
    }
  }

  /** Ogni 5 minuti i messaggi in attesa arrivati alla loro ora (ore di silenzio finite, nuovo tentativo). */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async dispatchDue(now: Date = new Date()): Promise<number> {
    if (!this.provider) return 0;
    const due = await this.prisma.outboundMessage.findMany({
      where: { status: "QUEUED", sendAfter: { lte: now } },
      orderBy: { sendAfter: "asc" },
      take: 100,
      select: { id: true },
    });
    for (const { id } of due) {
      try {
        await this.dispatch(id, now);
      } catch (error) {
        this.logger.error(
          `Invio WhatsApp ${id} non riuscito: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return due.length;
  }

  /** Non attende e non lancia: per chi manda notifiche (annullamenti, "sto arrivando"). */
  private fireAndForget(task: Promise<unknown>, what: string): void {
    void task.catch((error: unknown) => {
      this.logger.error(
        `WhatsApp ${what} non riuscito: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  /**
   * Promemoria del giorno prima (anti no-show) al cliente, 24 ore prima
   * dell'appuntamento. Chiamato da `BookingRemindersService` insieme alle
   * email. Al professionista va invece un solo riepilogo la sera prima
   * (`professionalDayReminders`).
   */
  async bookingReminder(input: {
    bookingId: string;
    scheduledAt: Date;
    clientId: string;
    businessName: string;
    guidedRequestId: string | null;
    now?: Date;
  }): Promise<void> {
    if (!this.provider) return;
    const now = input.now ?? new Date();
    await this.enqueue({
      userId: input.clientId,
      type: "BOOKING_REMINDER_CLIENT",
      params: {
        bodyParams: [
          whatsappDayTime(input.scheduledAt),
          whatsappName(input.businessName),
        ],
        urlButtonSuffix: clientRequestPath(input.guidedRequestId),
      },
      idempotencyKey: `booking-reminder:${input.bookingId}:client`,
      bookingId: input.bookingId,
      expiresAt: wallClockToInstant(input.scheduledAt, now),
      now,
    });
  }

  /**
   * Riepilogo della sera prima al professionista (Luca, 28/10/2026): un
   * solo messaggio con quanti lavori ha domani e il primo, invece di uno per
   * appuntamento. Parte all'ora scelta dal professionista (18-21, Notifiche),
   * anche alle 21 che sono già ore di silenzio, perché l'ha chiesta lui. Un
   * giro ogni mezz'ora fino alle 21:30, se il server dormiva all'ora giusta:
   * la chiave per persona e giorno evita i doppioni. Le email restano una per
   * appuntamento.
   */
  @Cron("0,30 18-21 * * *", { timeZone: "Europe/Rome" })
  async professionalDayReminders(now: Date = new Date()): Promise<number> {
    if (!this.provider) return 0;
    // scheduledAt è l'ora italiana scritta in UTC (§287): domani da mezzanotte a mezzanotte.
    const wall = wallClockNow(now);
    const from = new Date(
      Date.UTC(
        wall.getUTCFullYear(),
        wall.getUTCMonth(),
        wall.getUTCDate() + 1,
      ),
    );
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    const bookings = await this.prisma.booking.findMany({
      where: { status: "CONFIRMED", scheduledAt: { gte: from, lt: to } },
      orderBy: { scheduledAt: "asc" },
      select: {
        id: true,
        scheduledAt: true,
        city: true,
        serviceMode: true,
        professionalProfile: { select: { userId: true, city: true } },
        quote: {
          select: {
            guidedRequest: {
              select: {
                city: true,
                description: true,
                category: { select: { label: true } },
              },
            },
          },
        },
      },
    });
    const byProfessional = new Map<string, typeof bookings>();
    for (const booking of bookings) {
      const userId = booking.professionalProfile.userId;
      byProfessional.set(userId, [
        ...(byProfessional.get(userId) ?? []),
        booking,
      ]);
    }
    const hours = new Map(
      (
        await this.prisma.user.findMany({
          where: { id: { in: [...byProfessional.keys()] } },
          select: { id: true, whatsappDigestHour: true },
        })
      ).map((u) => [
        u.id,
        u.whatsappDigestHour ?? WHATSAPP_DIGEST_DEFAULT_HOUR,
      ]),
    );
    const day = from.toISOString().slice(0, 10);
    let queued = 0;
    for (const [userId, jobs] of byProfessional) {
      if (
        wall.getUTCHours() < (hours.get(userId) ?? WHATSAPP_DIGEST_DEFAULT_HOUR)
      )
        continue;
      const first = jobs[0]!;
      const message = professionalDayMessage(
        jobs.map((job) => {
          const request = job.quote?.guidedRequest;
          // La prima riga della descrizione, senza contatti né vie: va a
          // Meta. Se ne restano tracce, il mestiere.
          const label = notificationJobLabel(
            anonymizeProblemText(request?.description ?? ""),
          );
          return {
            scheduledAt: job.scheduledAt,
            what:
              label && !label.includes("[")
                ? label
                : (request?.category?.label ?? null),
            where:
              job.serviceMode === "ONLINE"
                ? "online"
                : (job.city ?? request?.city ?? job.professionalProfile.city),
          };
        }),
      );
      try {
        await this.enqueue({
          userId,
          type: "BOOKING_REMINDER_PROFESSIONAL",
          template: message.template,
          params: {
            bodyParams: message.bodyParams,
            urlButtonSuffix: "dashboard/agenda",
          },
          idempotencyKey: `professional-day:${userId}:${day}`,
          bookingId: first.id,
          urgent: true,
          expiresAt: wallClockToInstant(first.scheduledAt, now),
          now,
        });
        queued++;
      } catch (error) {
        this.logger.error(
          `Riepilogo WhatsApp di ${userId} non messo in coda: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return queued;
  }

  /**
   * Le notifiche che hanno anche un messaggio WhatsApp
   * (`NotificationsService.notify`): "sto arrivando" al cliente e
   * appuntamento annullato a chi non l'ha annullato. Tutte le altre restano
   * su sito ed email.
   */
  onNotification(
    userId: string,
    type: string,
    payload: Prisma.InputJsonValue,
  ): void {
    if (!this.provider) return;
    const bookingId =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>).bookingId
        : null;
    if (typeof bookingId !== "string") return;
    if (type === "PROFESSIONAL_ON_THE_WAY")
      this.fireAndForget(this.onTheWay(userId, bookingId), type);
    else if (
      type === "BOOKING_CANCELED_BY_PROFESSIONAL" ||
      type === "BOOKING_CANCELED_BY_CLIENT"
    )
      this.fireAndForget(this.bookingCanceled(userId, bookingId), type);
  }

  async onTheWay(
    clientId: string,
    bookingId: string,
    now: Date = new Date(),
  ): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        clientId: true,
        scheduledAt: true,
        professionalProfile: { select: { businessName: true } },
        quote: { select: { guidedRequestId: true } },
      },
    });
    if (!booking || booking.clientId !== clientId) return;
    await this.enqueue({
      userId: clientId,
      type: "PROFESSIONAL_ON_THE_WAY",
      params: {
        bodyParams: [
          whatsappName(booking.professionalProfile.businessName),
          whatsappTime(booking.scheduledAt),
        ],
        urlButtonSuffix: clientRequestPath(
          booking.quote?.guidedRequestId ?? null,
        ),
      },
      idempotencyKey: `on-the-way:${bookingId}`,
      bookingId,
      urgent: true,
      // Dopo due ore "sta arrivando" non ha più senso.
      expiresAt: new Date(now.getTime() + 2 * 60 * 60_000),
      now,
    });
  }

  async bookingCanceled(
    userId: string,
    bookingId: string,
    now: Date = new Date(),
  ): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        clientId: true,
        scheduledAt: true,
        client: { select: { name: true, surname: true } },
        professionalProfile: { select: { businessName: true, userId: true } },
        quote: { select: { guidedRequestId: true } },
      },
    });
    if (!booking) return;
    const toClient = booking.clientId === userId;
    if (!toClient && booking.professionalProfile.userId !== userId) return;
    // Un appuntamento già passato non si annuncia.
    if (booking.scheduledAt.getTime() <= wallClockNow(now).getTime()) return;
    const otherParty = toClient
      ? booking.professionalProfile.businessName
      : [
          booking.client.name,
          booking.client.surname?.trim()
            ? `${booking.client.surname.trim()[0]}.`
            : null,
        ]
          .filter(Boolean)
          .join(" ") || "il cliente";
    const appointment = wallClockToInstant(booking.scheduledAt, now);
    await this.enqueue({
      userId,
      type: "BOOKING_CANCELED",
      params: {
        bodyParams: [
          whatsappDayTime(booking.scheduledAt),
          whatsappName(otherParty),
        ],
        urlButtonSuffix: toClient
          ? clientRequestPath(booking.quote?.guidedRequestId ?? null)
          : "dashboard/agenda",
      },
      idempotencyKey: `booking-canceled:${bookingId}:${userId}`,
      bookingId,
      // Entro 24 ore serve subito, anche di notte: si evita il viaggio a vuoto.
      urgent: appointment.getTime() - now.getTime() < 24 * 60 * 60_000,
      expiresAt: appointment,
      now,
    });
  }

  // ---------------------------------------------------------------------------
  // Numero e consenso
  // ---------------------------------------------------------------------------

  async status(
    userId: string,
    now: Date = new Date(),
  ): Promise<WhatsAppStatus> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        phone: true,
        phoneVerifiedNumber: true,
        whatsappOptInAt: true,
        phoneCodeNumber: true,
        phoneCodeHash: true,
        phoneCodeExpiresAt: true,
        phoneCodeAttempts: true,
        phoneCodeSentAt: true,
        whatsappDigestHour: true,
        professionalProfile: { select: { id: true } },
      },
    });
    const phone = user?.phone ?? null;
    const verified = !!phone && user?.phoneVerifiedNumber === phone;
    const codeActive =
      !!user?.phoneCodeHash &&
      !!phone &&
      user.phoneCodeNumber === phone &&
      user.phoneCodeAttempts < PHONE_CODE_MAX_ATTEMPTS &&
      !!user.phoneCodeExpiresAt &&
      user.phoneCodeExpiresAt > now;
    return {
      available: this.available,
      phone,
      phoneIsMobile: isMobileNumber(phone),
      verified,
      enabled: verified && !!user?.whatsappOptInAt,
      codeSentTo: codeActive && phone ? maskedPhone(phone) : null,
      codeValidForSeconds:
        codeActive && user?.phoneCodeExpiresAt
          ? Math.floor(
              (user.phoneCodeExpiresAt.getTime() - now.getTime()) / 1000,
            )
          : 0,
      codeResendInSeconds: user?.phoneCodeSentAt
        ? Math.max(
            0,
            Math.ceil(
              (user.phoneCodeSentAt.getTime() +
                PHONE_CODE_RESEND_SECONDS * 1000 -
                now.getTime()) /
                1000,
            ),
          )
        : 0,
      digestHour: user?.professionalProfile
        ? (user.whatsappDigestHour ?? WHATSAPP_DIGEST_DEFAULT_HOUR)
        : null,
    };
  }

  /** Ora del riepilogo della sera, solo per chi ha un profilo da professionista. */
  async setDigestHour(
    userId: string,
    hour: number,
    now: Date = new Date(),
  ): Promise<WhatsAppStatus> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { professionalProfile: { select: { id: true } } },
    });
    if (!user?.professionalProfile)
      throw new BadRequestException(
        "Il riepilogo della sera è solo per i professionisti.",
      );
    await this.prisma.user.update({
      where: { id: userId },
      data: { whatsappDigestHour: hour },
    });
    return this.status(userId, now);
  }

  /** Manda su WhatsApp il codice per confermare il numero dell'account. */
  async sendCode(
    userId: string,
    now: Date = new Date(),
  ): Promise<WhatsAppStatus> {
    if (!this.provider)
      throw new BadRequestException(
        "I promemoria su WhatsApp non sono ancora attivi.",
      );
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true, phoneCodeSentAt: true, deletedAt: true },
    });
    if (!user || user.deletedAt)
      throw new BadRequestException("Account non trovato.");
    if (!user.phone)
      throw new BadRequestException(
        "Aggiungi prima il tuo numero di cellulare nell'account.",
      );
    if (!isMobileNumber(user.phone))
      throw new BadRequestException(
        "Serve un numero di cellulare con WhatsApp: questo sembra un numero fisso.",
      );
    if (
      user.phoneCodeSentAt &&
      now.getTime() - user.phoneCodeSentAt.getTime() <
        PHONE_CODE_RESEND_SECONDS * 1000
    ) {
      throw new BadRequestException(
        "Aspetta un minuto prima di chiedere un altro codice.",
      );
    }
    const codesToday = await this.prisma.outboundMessage.count({
      where: {
        userId,
        type: "PHONE_VERIFICATION_CODE",
        createdAt: { gte: startOfItalianDay(now) },
      },
    });
    if (codesToday >= PHONE_CODES_PER_DAY)
      throw new BadRequestException(
        "Hai chiesto troppi codici oggi. Riprova domani.",
      );

    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        phoneCodeHash: hashPhoneCode(userId, user.phone, code),
        phoneCodeNumber: user.phone,
        phoneCodeExpiresAt: new Date(
          now.getTime() + PHONE_CODE_VALID_MINUTES * 60_000,
        ),
        phoneCodeAttempts: 0,
        phoneCodeSentAt: now,
      },
    });
    const message = await this.enqueue({
      userId,
      type: "PHONE_VERIFICATION_CODE",
      params: { bodyParams: [code], copyCode: code },
      idempotencyKey: `phone-code:${userId}:${now.getTime()}`,
      urgent: true,
      expiresAt: new Date(now.getTime() + PHONE_CODE_VALID_MINUTES * 60_000),
      now,
    });
    if (message?.status === "FAILED") {
      throw new BadRequestException(
        "WhatsApp non ha accettato il messaggio. Controlla che il numero sia quello che usi su WhatsApp e riprova.",
      );
    }
    return this.status(userId, now);
  }

  /** Codice giusto: numero confermato e promemoria accesi (il consenso è il pulsante "Conferma e attiva"). */
  async confirmCode(
    userId: string,
    code: string,
    now: Date = new Date(),
  ): Promise<WhatsAppStatus> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        phone: true,
        phoneCodeHash: true,
        phoneCodeNumber: true,
        phoneCodeExpiresAt: true,
        phoneCodeAttempts: true,
      },
    });
    if (
      !user?.phone ||
      !user.phoneCodeHash ||
      user.phoneCodeNumber !== user.phone
    )
      throw new BadRequestException("Chiedi un nuovo codice.");
    if (user.phoneCodeAttempts >= PHONE_CODE_MAX_ATTEMPTS)
      throw new BadRequestException(
        "Troppi tentativi: chiedi un nuovo codice.",
      );
    if (!user.phoneCodeExpiresAt || user.phoneCodeExpiresAt <= now)
      throw new BadRequestException("Il codice è scaduto: chiedine uno nuovo.");
    const expected = Buffer.from(user.phoneCodeHash, "hex");
    const given = Buffer.from(
      hashPhoneCode(userId, user.phone, code.replace(/\D/g, "")),
      "hex",
    );
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { phoneCodeAttempts: { increment: 1 } },
      });
      throw new BadRequestException(
        "Il codice non è giusto. Controlla l'ultimo messaggio su WhatsApp.",
      );
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        phoneVerifiedNumber: user.phone,
        phoneVerifiedAt: now,
        whatsappOptInAt: now,
        whatsappOptOutAt: null,
        phoneCodeHash: null,
        phoneCodeNumber: null,
        phoneCodeExpiresAt: null,
        phoneCodeAttempts: 0,
      },
    });
    return this.status(userId, now);
  }

  /** Riaccende i promemoria su un numero già confermato, senza un nuovo codice. */
  async enable(
    userId: string,
    now: Date = new Date(),
  ): Promise<WhatsAppStatus> {
    const current = await this.status(userId, now);
    if (!current.verified)
      throw new BadRequestException("Conferma prima il numero con il codice.");
    await this.prisma.user.update({
      where: { id: userId },
      data: { whatsappOptInAt: now, whatsappOptOutAt: null },
    });
    return this.status(userId, now);
  }

  /** Spegne i promemoria: quelli in attesa non partono più. */
  async disable(
    userId: string,
    now: Date = new Date(),
  ): Promise<WhatsAppStatus> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { whatsappOptInAt: null, whatsappOptOutAt: now },
    });
    await this.prisma.outboundMessage.updateMany({
      where: { userId, status: "QUEUED" },
      data: {
        status: "SKIPPED",
        skipReason: "OPTED_OUT",
        params: Prisma.DbNull,
      },
    });
    return this.status(userId, now);
  }

  // ---------------------------------------------------------------------------
  // Webhook di Meta
  // ---------------------------------------------------------------------------

  /** Registrazione del webhook nella console di Meta (GET con hub.challenge). */
  verifySubscription(
    mode: unknown,
    token: unknown,
    challenge: unknown,
  ): string {
    const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();
    if (
      !expected ||
      mode !== "subscribe" ||
      typeof token !== "string" ||
      typeof challenge !== "string"
    )
      throw new UnauthorizedException("Token non valido.");
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b))
      throw new UnauthorizedException("Token non valido.");
    // Meta manda un numero: si rimanda solo quello, mai il testo ricevuto
    // così com'è (niente HTML riflesso nella risposta).
    if (!/^\d{1,32}$/.test(challenge))
      throw new UnauthorizedException("Richiesta non valida.");
    return BigInt(challenge).toString().padStart(challenge.length, "0");
  }

  async handleWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<{ received: true }> {
    if (!this.provider) return { received: true };
    if (!this.provider.verifyWebhook(rawBody, headers))
      throw new UnauthorizedException("Firma non valida.");
    let body: unknown;
    try {
      body = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return { received: true };
    }
    const { statuses, inbound } = this.provider.parseWebhook(body);
    for (const update of statuses) {
      const row = await this.prisma.outboundMessage.findUnique({
        where: { providerMessageId: update.providerMessageId },
      });
      const next =
        update.status === "sent"
          ? "SENT"
          : update.status === "delivered"
            ? "DELIVERED"
            : update.status === "read"
              ? "READ"
              : "FAILED";
      if (!row || !shouldApplyStatus(row.status, next)) continue;
      const category = update.category ?? row.category;
      const charged =
        (next === "DELIVERED" || next === "READ") &&
        update.billable !== false &&
        row.costMicroEur === 0;
      await this.prisma.outboundMessage.update({
        where: { id: row.id },
        data: {
          status: next,
          ...(next === "DELIVERED" ? { deliveredAt: update.at } : {}),
          ...(next === "READ"
            ? { readAt: update.at, deliveredAt: row.deliveredAt ?? update.at }
            : {}),
          ...(next === "FAILED"
            ? {
                failedAt: update.at,
                errorCode: update.errorCode,
                errorMessage: update.errorMessage?.slice(0, 300) ?? null,
              }
            : {}),
          ...(charged
            ? { costMicroEur: whatsAppPriceMicroEur(category), category }
            : {}),
        },
      });
    }
    for (const message of inbound) {
      if (!isStopRequest(message.text, message.buttonPayload)) continue;
      await this.optOutByNumber(message.from);
    }
    return { received: true };
  }

  /** "Non ricevere più" dal messaggio, o "STOP" scritto in risposta. */
  private async optOutByNumber(digits: string): Promise<void> {
    if (!digits) return;
    const users = await this.prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM users WHERE "whatsappOptInAt" IS NOT NULL AND phone IS NOT NULL AND regexp_replace(phone, '\\D', '', 'g') = ${digits}`,
    );
    for (const { id } of users) await this.disable(id);
  }

  // ---------------------------------------------------------------------------
  // Admin
  // ---------------------------------------------------------------------------

  /** Admin → WhatsApp: messaggi e costo del mese, motivi dei saltati, lavori saltati con e senza promemoria. */
  async adminSummary(
    month: string | undefined,
    now: Date = new Date(),
  ): Promise<WhatsAppAdminSummary> {
    const match = /^(\d{4})-(\d{2})$/.exec(month ?? "");
    const year = match ? Number(match[1]) : now.getUTCFullYear();
    const monthIndex = match ? Number(match[2]) - 1 : now.getUTCMonth();
    const from = new Date(Date.UTC(year, monthIndex, 1));
    const to = new Date(Date.UTC(year, monthIndex + 1, 1));
    const inMonth = { createdAt: { gte: from, lt: to } };

    const [
      byStatus,
      byType,
      bySkip,
      cost,
      optedIn,
      verified,
      sentToday,
      recent,
    ] = await Promise.all([
      this.prisma.outboundMessage.groupBy({
        by: ["status"],
        where: inMonth,
        _count: { _all: true },
      }),
      this.prisma.outboundMessage.groupBy({
        by: ["type", "status"],
        where: inMonth,
        _count: { _all: true },
        _sum: { costMicroEur: true },
      }),
      this.prisma.outboundMessage.groupBy({
        by: ["skipReason"],
        where: { ...inMonth, status: "SKIPPED" },
        _count: { _all: true },
      }),
      this.prisma.outboundMessage.aggregate({
        where: inMonth,
        _sum: { costMicroEur: true },
      }),
      this.prisma.user.count({
        where: { whatsappOptInAt: { not: null }, deletedAt: null },
      }),
      this.prisma.user.count({
        where: { phoneVerifiedNumber: { not: null }, deletedAt: null },
      }),
      this.prisma.outboundMessage.count({
        where: { sentAt: { gte: startOfItalianDay(now) } },
      }),
      this.prisma.outboundMessage.findMany({
        where: inMonth,
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          type: true,
          status: true,
          skipReason: true,
          errorCode: true,
          errorMessage: true,
          createdAt: true,
          sentAt: true,
          deliveredAt: true,
          readAt: true,
          costMicroEur: true,
          user: { select: { role: true } },
        },
      }),
    ]);

    return {
      available: this.available,
      month: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
      dailyLimit: whatsAppDailyLimit(),
      sentToday,
      optedInUsers: optedIn,
      verifiedUsers: verified,
      costEurCents: Math.round((cost._sum.costMicroEur ?? 0) / 10_000),
      byStatus: Object.fromEntries(
        byStatus.map((r) => [r.status, r._count._all]),
      ),
      byType: byType.map((r) => ({
        type: r.type,
        status: r.status,
        count: r._count._all,
        costEurCents: Math.round((r._sum.costMicroEur ?? 0) / 10_000),
      })),
      skipped: bySkip.map((r) => ({
        reason: r.skipReason ?? "?",
        count: r._count._all,
      })),
      reminderEffect: await this.reminderEffect(now),
      recent: recent.map((r) => ({
        id: r.id,
        type: r.type,
        status: r.status,
        skipReason: r.skipReason,
        error: r.errorCode
          ? `${r.errorCode}${r.errorMessage ? ` · ${r.errorMessage}` : ""}`
          : r.errorMessage,
        role: r.user?.role ?? null,
        createdAt: r.createdAt.toISOString(),
        sentAt: r.sentAt?.toISOString() ?? null,
        deliveredAt: r.deliveredAt?.toISOString() ?? null,
        readAt: r.readAt?.toISOString() ?? null,
        costEurCents: Math.round(r.costMicroEur / 10_000),
      })),
    };
  }

  /**
   * Il numero che dice se i promemoria servono: lavori degli ultimi 90
   * giorni (dal lancio, senza account di prova, CLAUDE.md §5 punto 17) con il
   * promemoria WhatsApp consegnato al cliente e senza, e quanti di ognuno
   * sono saltati (cliente assente segnalato o annullato tardi).
   */
  private async reminderEffect(now: Date) {
    const since = sinceLaunch(
      new Date(now.getTime() - 90 * 24 * 60 * 60_000),
      countingFrom(now),
    );
    const bookings = await this.prisma.booking.findMany({
      where: {
        scheduledAt: { gte: since, lt: wallClockNow(now) },
        status: { in: ["COMPLETED", "NO_SHOW", "CANCELED", "CONFIRMED"] },
        client: COUNTED_USER,
        professionalProfile: { user: COUNTED_USER },
      },
      select: { id: true, status: true, canceledLate: true, canceledBy: true },
    });
    const delivered = new Set(
      (
        await this.prisma.outboundMessage.findMany({
          where: {
            bookingId: { in: bookings.map((b) => b.id) },
            type: "BOOKING_REMINDER_CLIENT",
            status: { in: ["DELIVERED", "READ"] },
          },
          select: { bookingId: true },
        })
      ).map((m) => m.bookingId),
    );
    const group = (withReminder: boolean) => {
      const rows = bookings.filter(
        (b) =>
          delivered.has(b.id) === withReminder &&
          !(b.status === "CANCELED" && !b.canceledLate),
      );
      const missed = rows.filter(
        (b) =>
          b.status === "NO_SHOW" ||
          (b.status === "CANCELED" &&
            b.canceledLate &&
            b.canceledBy === "CLIENT"),
      ).length;
      return { jobs: rows.length, missed };
    };
    return {
      since: since.toISOString(),
      withReminder: group(true),
      withoutReminder: group(false),
    };
  }
}

/** Pagina della richiesta del cliente, relativa al dominio del sito (pulsante del modello). */
function clientRequestPath(guidedRequestId: string | null): string {
  return guidedRequestId
    ? `le-mie-richieste?open=${encodeURIComponent(guidedRequestId)}`
    : "le-mie-richieste";
}
