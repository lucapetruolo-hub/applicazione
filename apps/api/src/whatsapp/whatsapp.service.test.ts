import { describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@professionisti/database";
import { WhatsAppService } from "./whatsapp.service";
import {
  WhatsAppProviderError,
  type WhatsAppProvider,
  type WhatsAppTemplateMessage,
} from "./whatsapp-provider";

type Row = Record<string, unknown> & { id: string };

/** Confronto minimo dei filtri usati dal servizio: uguale, gte/lte/lt, not, in. */
function matches(
  row: Record<string, unknown>,
  where: Record<string, unknown> = {},
): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as Record<string, unknown>;
      if ("gte" in c && !(value instanceof Date && value >= (c.gte as Date)))
        return false;
      if ("lte" in c && !(value instanceof Date && value <= (c.lte as Date)))
        return false;
      if ("lt" in c && !(value instanceof Date && value < (c.lt as Date)))
        return false;
      if ("not" in c && value === c.not) return false;
      if ("in" in c && !(c.in as unknown[]).includes(value)) return false;
      return true;
    }
    return value === cond;
  });
}

function fakePrisma(users: Row[]) {
  const messages: Row[] = [];
  let seq = 0;
  const apply = (row: Row, data: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === "object" && "increment" in (v as object))
        row[k] = (row[k] as number) + (v as { increment: number }).increment;
      else row[k] = v === Prisma.DbNull ? null : v;
    }
  };
  const prisma = {
    user: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        users.filter((u) => where.id.in.includes(u.id)),
      ),
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          users.find((u) => u.id === where.id) ?? null,
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const user = users.find((u) => u.id === where.id)!;
          apply(user, data);
          return user;
        },
      ),
    },
    outboundMessage: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (messages.some((m) => m.idempotencyKey === data.idempotencyKey)) {
          throw new Prisma.PrismaClientKnownRequestError("duplicate", {
            code: "P2002",
            clientVersion: "test",
          });
        }
        const row: Row = {
          id: `m${++seq}`,
          status: "QUEUED",
          attempts: 0,
          costMicroEur: 0,
          providerMessageId: null,
          sentAt: null,
          deliveredAt: null,
          createdAt: data.sendAfter,
          ...data,
        };
        messages.push(row);
        return { ...row };
      }),
      findUnique: vi.fn(
        async ({
          where,
          include,
          select,
        }: {
          where: {
            id?: string;
            providerMessageId?: string;
            idempotencyKey?: string;
          };
          include?: unknown;
          select?: { user?: unknown };
        }) => {
          const row = messages.find((m) =>
            where.id
              ? m.id === where.id
              : where.idempotencyKey
                ? m.idempotencyKey === where.idempotencyKey
                : m.providerMessageId === where.providerMessageId,
          );
          if (!row) return null;
          return include || select?.user
            ? { ...row, user: users.find((u) => u.id === row.userId) ?? null }
            : { ...row };
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const row = messages.find((m) => m.id === where.id)!;
          apply(row, data);
          return row;
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          const rows = messages.filter((m) => matches(m, where));
          rows.forEach((r) => apply(r, data));
          return { count: rows.length };
        },
      ),
      count: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          messages.filter((m) => matches(m, where)).length,
      ),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        messages.filter((m) => matches(m, where)).map((m) => ({ id: m.id })),
      ),
    },
    booking: { findUnique: vi.fn() },
    $queryRaw: vi.fn(async () =>
      users.filter((u) => u.whatsappOptInAt).map((u) => ({ id: u.id })),
    ),
  };
  return { prisma, messages };
}

function fakeProvider(fail?: WhatsAppProviderError) {
  const sent: WhatsAppTemplateMessage[] = [];
  const texts: { to: string; body: string }[] = [];
  const provider: WhatsAppProvider = {
    name: "fake",
    sendTemplate: vi.fn(async (m: WhatsAppTemplateMessage) => {
      if (fail) throw fail;
      sent.push(m);
      return { providerMessageId: `wamid.${sent.length}` };
    }),
    sendText: vi.fn(async (m: { to: string; body: string }) => {
      texts.push(m);
      return { providerMessageId: `wamid.text.${texts.length}` };
    }),
    verifyWebhook: (_raw, headers) => headers["x-hub-signature-256"] === "ok",
    parseWebhook: (body) =>
      body as ReturnType<WhatsAppProvider["parseWebhook"]>,
  };
  return { provider, sent, texts };
}

const PHONE = "+39 3331234567";
const verifiedUser = (extra: Record<string, unknown> = {}): Row => ({
  id: "u1",
  phone: PHONE,
  phoneVerifiedNumber: PHONE,
  whatsappOptInAt: new Date("2027-01-01T00:00:00Z"),
  phoneCodeNumber: null,
  deletedAt: null,
  ...extra,
});
// Venerdì 15 gennaio 2027, le 11 italiane.
const DAY = new Date("2027-01-15T10:00:00Z");
const PARAMS = {
  bodyParams: ["giovedì 21 gennaio alle 10:30", "Rossi Idraulica"],
  urlButtonSuffix: "le-mie-richieste?open=r1",
};

function setup(users: Row[], fail?: WhatsAppProviderError) {
  const { prisma, messages } = fakePrisma(users);
  const { provider, sent, texts } = fakeProvider(fail);
  const service = new WhatsAppService(
    prisma as unknown as PrismaClient,
    provider,
  );
  return { service, prisma, messages, sent, texts };
}

describe("WhatsAppService: invio", () => {
  it("di giorno parte subito, una sola volta per evento, e il testo non resta nel registro", async () => {
    const { service, messages, sent } = setup([verifiedUser()]);
    const input = {
      userId: "u1",
      type: "BOOKING_REMINDER_CLIENT" as const,
      params: PARAMS,
      idempotencyKey: "booking-reminder:b1:client",
      now: DAY,
    };
    await service.enqueue(input);
    await service.enqueue(input);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: "393331234567",
      template: "promemoria_appuntamento_cliente",
      language: "it",
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      status: "SENT",
      providerMessageId: "wamid.1",
      params: null,
    });
  });

  it("di sera aspetta le 8, poi parte dal giro programmato", async () => {
    const { service, messages, sent } = setup([verifiedUser()]);
    const evening = new Date("2027-01-15T21:30:00Z");
    await service.enqueue({
      userId: "u1",
      type: "BOOKING_REMINDER_CLIENT",
      params: PARAMS,
      idempotencyKey: "k",
      now: evening,
    });
    expect(sent).toHaveLength(0);
    expect((messages[0]!.sendAfter as Date).toISOString()).toBe(
      "2027-01-16T07:00:00.000Z",
    );
    await service.dispatchDue(new Date("2027-01-16T07:05:00Z"));
    expect(sent).toHaveLength(1);
  });

  it("'urgente' (annullamento vicino, sto arrivando) parte anche di notte", async () => {
    const { service, sent } = setup([verifiedUser()]);
    await service.enqueue({
      userId: "u1",
      type: "BOOKING_CANCELED",
      params: PARAMS,
      idempotencyKey: "k",
      urgent: true,
      now: new Date("2027-01-15T22:00:00Z"),
    });
    expect(sent).toHaveLength(1);
  });

  it.each([
    ["promemoria spenti", { whatsappOptInAt: null }, "OPTED_OUT"],
    [
      "numero cambiato dopo la conferma",
      { phone: "+39 3339999999" },
      "NOT_VERIFIED",
    ],
    ["mai confermato", { phoneVerifiedNumber: null }, "NOT_VERIFIED"],
    ["senza numero", { phone: null }, "NO_PHONE"],
    [
      "numero fisso",
      { phone: "+39 0773123456", phoneVerifiedNumber: "+39 0773123456" },
      "NOT_MOBILE",
    ],
  ])("non parte se %s", async (_label, extra, reason) => {
    const { service, messages, sent } = setup([verifiedUser(extra)]);
    await service.enqueue({
      userId: "u1",
      type: "BOOKING_REMINDER_CLIENT",
      params: PARAMS,
      idempotencyKey: "k",
      now: DAY,
    });
    expect(sent).toHaveLength(0);
    expect(messages[0]).toMatchObject({
      status: "SKIPPED",
      skipReason: reason,
      params: null,
    });
  });

  it("un appuntamento già passato non si ricorda più", async () => {
    const { service, messages } = setup([verifiedUser()]);
    const evening = new Date("2027-01-15T21:30:00Z");
    await service.enqueue({
      userId: "u1",
      type: "BOOKING_REMINDER_CLIENT",
      params: PARAMS,
      idempotencyKey: "k",
      expiresAt: new Date("2027-01-16T06:30:00Z"),
      now: evening,
    });
    await service.dispatchDue(new Date("2027-01-16T07:00:00Z"));
    expect(messages[0]).toMatchObject({
      status: "SKIPPED",
      skipReason: "EXPIRED",
    });
  });

  it("tetto per persona: al settimo messaggio del giorno si ferma", async () => {
    const { service, messages, sent } = setup([verifiedUser()]);
    for (let i = 0; i < 7; i++)
      await service.enqueue({
        userId: "u1",
        type: "BOOKING_CANCELED",
        params: PARAMS,
        idempotencyKey: `k${i}`,
        now: DAY,
      });
    expect(sent).toHaveLength(6);
    expect(messages[6]).toMatchObject({
      status: "SKIPPED",
      skipReason: "USER_DAILY_LIMIT",
    });
  });

  it("tetto del sito (WHATSAPP_DAILY_LIMIT)", async () => {
    vi.stubEnv("WHATSAPP_DAILY_LIMIT", "1");
    try {
      const { service, messages } = setup([
        verifiedUser(),
        verifiedUser({
          id: "u2",
          phone: "+39 3330000000",
          phoneVerifiedNumber: "+39 3330000000",
        }),
      ]);
      await service.enqueue({
        userId: "u1",
        type: "BOOKING_CANCELED",
        params: PARAMS,
        idempotencyKey: "a",
        now: DAY,
      });
      await service.enqueue({
        userId: "u2",
        type: "BOOKING_CANCELED",
        params: PARAMS,
        idempotencyKey: "b",
        now: DAY,
      });
      expect(messages.map((m) => m.status)).toEqual(["SENT", "SKIPPED"]);
      expect(messages[1]!.skipReason).toBe("DAILY_LIMIT");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("errore che si può riprovare: ritenta fra 10 minuti, poi si arrende al terzo", async () => {
    const { service, messages } = setup(
      [verifiedUser()],
      new WhatsAppProviderError("rete"),
    );
    await service.enqueue({
      userId: "u1",
      type: "BOOKING_CANCELED",
      params: PARAMS,
      idempotencyKey: "k",
      now: DAY,
    });
    expect(messages[0]).toMatchObject({ status: "QUEUED", attempts: 1 });
    await service.dispatchDue(new Date(DAY.getTime() + 11 * 60_000));
    await service.dispatchDue(new Date(DAY.getTime() + 22 * 60_000));
    expect(messages[0]).toMatchObject({
      status: "FAILED",
      attempts: 3,
      params: null,
    });
  });

  it("numero senza WhatsApp: fallito subito, senza riprovare", async () => {
    const { service, messages } = setup(
      [verifiedUser()],
      new WhatsAppProviderError("undeliverable", "131026", true),
    );
    await service.enqueue({
      userId: "u1",
      type: "BOOKING_CANCELED",
      params: PARAMS,
      idempotencyKey: "k",
      now: DAY,
    });
    expect(messages[0]).toMatchObject({
      status: "FAILED",
      errorCode: "131026",
      attempts: 1,
    });
  });

  it("senza chiavi di Meta non scrive e non manda nulla", async () => {
    const { prisma } = fakePrisma([verifiedUser()]);
    const service = new WhatsAppService(
      prisma as unknown as PrismaClient,
      null,
    );
    expect(
      await service.enqueue({
        userId: "u1",
        type: "BOOKING_CANCELED",
        params: PARAMS,
        idempotencyKey: "k",
        now: DAY,
      }),
    ).toBeNull();
    expect(prisma.outboundMessage.create).not.toHaveBeenCalled();
  });
});

describe("WhatsAppService: riepilogo della sera al professionista", () => {
  // Venerdì 15 gennaio 2027 alle 18 italiane; domani è sabato 16.
  const EVENING = new Date("2027-01-15T17:00:00Z");
  const booking = (id: string, wall: string, userId = "u1") => ({
    id,
    scheduledAt: new Date(wall),
    city: "Sabaudia",
    serviceMode: "AT_HOME",
    professionalProfile: { userId, city: "Latina" },
    quote: {
      guidedRequest: {
        city: "Sabaudia",
        description: "Chiamare al 333 1234567 per la perdita",
        category: { label: "Idraulico" },
      },
    },
  });

  it("un solo messaggio per professionista con tutti i lavori di domani", async () => {
    const { service, prisma, messages, sent } = setup([
      verifiedUser(),
      verifiedUser({
        id: "u2",
        phone: "+39 3339999999",
        phoneVerifiedNumber: "+39 3339999999",
      }),
    ]);
    const findMany = vi.fn(async () => [
      booking("b1", "2027-01-16T08:30:00Z"),
      booking("b2", "2027-01-16T11:00:00Z"),
      booking("b3", "2027-01-16T15:00:00Z"),
      booking("b4", "2027-01-16T10:00:00Z", "u2"),
    ]);
    (prisma.booking as unknown as { findMany: typeof findMany }).findMany =
      findMany;
    expect(await service.professionalDayReminders(EVENING)).toBe(2);
    const where = (
      findMany.mock.calls[0] as unknown as [
        { where: { scheduledAt: { gte: Date; lt: Date } } },
      ]
    )[0].where;
    expect(where.scheduledAt.gte.toISOString()).toBe(
      "2027-01-16T00:00:00.000Z",
    );
    expect(where.scheduledAt.lt.toISOString()).toBe("2027-01-17T00:00:00.000Z");
    expect(sent).toHaveLength(2);
    // Il numero di telefono scritto nella descrizione non va a Meta: resta il mestiere.
    expect(sent[0]).toMatchObject({
      template: "riepilogo_lavori_3",
      bodyParams: [
        "sabato 16 gennaio",
        "08:30",
        "Idraulico · Sabaudia",
        "11:00",
        "Idraulico · Sabaudia",
        "15:00",
        "Idraulico · Sabaudia",
      ],
    });
    expect(sent[1]).toMatchObject({ template: "riepilogo_lavori_1" });
    expect(messages[0]).toMatchObject({ bookingId: "b1" });

    // Il giro delle 18:30 non lo manda di nuovo.
    await service.professionalDayReminders(new Date("2027-01-15T17:30:00Z"));
    expect(sent).toHaveLength(2);
  });

  it("parte all'ora scelta dal professionista, anche alle 21", async () => {
    const { service, prisma, sent } = setup([
      verifiedUser({ whatsappDigestHour: 21 }),
    ]);
    (prisma.booking as unknown as { findMany: unknown }).findMany = vi.fn(
      async () => [booking("b1", "2027-01-16T08:30:00Z")],
    );
    await service.professionalDayReminders(EVENING);
    await service.professionalDayReminders(new Date("2027-01-15T19:30:00Z"));
    expect(sent).toHaveLength(0);
    // Le 21 italiane: ore di silenzio, ma l'ora l'ha scelta lui.
    await service.professionalDayReminders(new Date("2027-01-15T20:00:00Z"));
    expect(sent).toHaveLength(1);
  });
});

describe("WhatsAppService: codice del numero", () => {
  const newUser = () =>
    verifiedUser({
      phoneVerifiedNumber: null,
      whatsappOptInAt: null,
      phoneCodeHash: null,
      phoneCodeExpiresAt: null,
      phoneCodeAttempts: 0,
      phoneCodeSentAt: null,
    });

  it("codice giusto: numero confermato e promemoria accesi", async () => {
    const { service, sent } = setup([newUser()]);
    const status = await service.sendCode("u1", DAY);
    expect(status.codeSentTo).toBe("+39 333 ••• 4567");
    const code = sent[0]!.copyCode!;
    expect(code).toMatch(/^\d{6}$/);
    const after = await service.confirmCode(
      "u1",
      code,
      new Date(DAY.getTime() + 60_000),
    );
    expect(after).toMatchObject({ verified: true, enabled: true });
  });

  it("codice sbagliato: dopo 5 tentativi ne serve uno nuovo", async () => {
    const { service, sent } = setup([newUser()]);
    await service.sendCode("u1", DAY);
    const wrong = sent[0]!.copyCode === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++)
      await expect(service.confirmCode("u1", wrong, DAY)).rejects.toThrow(
        "non è giusto",
      );
    await expect(
      service.confirmCode("u1", sent[0]!.copyCode!, DAY),
    ).rejects.toThrow("Troppi tentativi");
  });

  it("scaduto dopo 10 minuti", async () => {
    const { service, sent } = setup([newUser()]);
    await service.sendCode("u1", DAY);
    await expect(
      service.confirmCode(
        "u1",
        sent[0]!.copyCode!,
        new Date(DAY.getTime() + 11 * 60_000),
      ),
    ).rejects.toThrow("scaduto");
  });

  it("un minuto tra un codice e l'altro, al massimo 5 al giorno", async () => {
    const { service } = setup([newUser()]);
    await service.sendCode("u1", DAY);
    await expect(
      service.sendCode("u1", new Date(DAY.getTime() + 30_000)),
    ).rejects.toThrow("Aspetta un minuto");
    for (let i = 1; i < 5; i++)
      await service.sendCode("u1", new Date(DAY.getTime() + i * 61_000));
    await expect(
      service.sendCode("u1", new Date(DAY.getTime() + 6 * 61_000)),
    ).rejects.toThrow("troppi codici");
  });

  it("niente codice a un numero fisso", async () => {
    const { service } = setup(
      [newUser()].map((u) => ({ ...u, phone: "+39 0773123456" })),
    );
    await expect(service.sendCode("u1", DAY)).rejects.toThrow("numero fisso");
  });
});

describe("WhatsAppService: webhook e 'Non ricevere più'", () => {
  it("firma sbagliata: rifiutato", async () => {
    const { service } = setup([verifiedUser()]);
    await expect(
      service.handleWebhook(Buffer.from("{}"), { "x-hub-signature-256": "no" }),
    ).rejects.toThrow("Firma");
  });

  it("consegnato: stato e costo; 'Non ricevere più' spegne e ferma quelli in attesa", async () => {
    const { service, messages } = setup([verifiedUser()]);
    await service.enqueue({
      userId: "u1",
      type: "BOOKING_CANCELED",
      params: PARAMS,
      idempotencyKey: "a",
      now: DAY,
    });
    await service.enqueue({
      userId: "u1",
      type: "BOOKING_REMINDER_CLIENT",
      params: PARAMS,
      idempotencyKey: "b",
      now: new Date("2027-01-15T22:00:00Z"),
    });
    const body = {
      statuses: [
        {
          providerMessageId: "wamid.1",
          status: "delivered",
          at: DAY,
          billable: true,
          category: "utility",
          errorCode: null,
          errorMessage: null,
        },
      ],
      inbound: [
        {
          from: "393331234567",
          text: "Non ricevere più",
          buttonPayload: null,
          replyTo: null,
        },
      ],
    };
    await service.handleWebhook(Buffer.from(JSON.stringify(body)), {
      "x-hub-signature-256": "ok",
    });
    expect(messages[0]).toMatchObject({
      status: "DELIVERED",
      costMicroEur: 24_800,
    });
    expect(messages[1]).toMatchObject({
      status: "SKIPPED",
      skipReason: "OPTED_OUT",
    });
  });
});

describe("WhatsAppService: 'Ci sarò' e 'Non posso più'", () => {
  const webhook = (
    text: string,
    replyTo: string | null,
    from = "393331234567",
  ) =>
    Buffer.from(
      JSON.stringify({
        statuses: [],
        inbound: [{ from, text, buttonPayload: text, replyTo }],
      }),
    );

  async function withReminder() {
    const ctx = setup([verifiedUser()]);
    await ctx.service.enqueue({
      userId: "u1",
      type: "BOOKING_REMINDER_CLIENT",
      params: PARAMS,
      idempotencyKey: "booking-reminder:b1:client",
      bookingId: "b1",
      now: DAY,
    });
    const handler = vi.fn(async (input: { action: string }) =>
      input.action.startsWith("UNDO")
        ? { text: "Fatto, abbiamo tolto la conferma.", undo: false }
        : {
            text: "Grazie! Abbiamo detto a Rossi Idraulica che ci sarai.",
            undo: true,
          },
    );
    ctx.service.onBookingReply(handler);
    return { ...ctx, handler };
  }

  it("risposta al promemoria: avvisa il professionista e risponde gratis al cliente, nel registro", async () => {
    const { service, handler, texts, messages } = await withReminder();
    await service.handleWebhook(webhook("Ci sarò", "wamid.1"), {
      "x-hub-signature-256": "ok",
    });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "u1",
        bookingId: "b1",
        action: "CONFIRM",
      }),
    );
    expect(texts).toEqual([
      {
        to: "393331234567",
        body: "Grazie! Abbiamo detto a Rossi Idraulica che ci sarai.",
        buttons: [{ id: "UNDO", title: "Ho sbagliato" }],
      },
    ]);
    expect(messages[1]).toMatchObject({
      type: "BOOKING_REPLY",
      template: "risposta:CONFIRM",
      status: "SENT",
      costMicroEur: 0,
      bookingId: "b1",
    });
  });

  it("'Ho sbagliato' sotto la risposta toglie quella risposta, e vale solo lì", async () => {
    const { service, handler, texts } = await withReminder();
    // Sotto il promemoria "Ho sbagliato" non vuol dire nulla.
    await service.handleWebhook(webhook("UNDO", "wamid.1"), {
      "x-hub-signature-256": "ok",
    });
    expect(handler).not.toHaveBeenCalled();
    await service.handleWebhook(webhook("Ci sarò", "wamid.1"), {
      "x-hub-signature-256": "ok",
    });
    await service.handleWebhook(webhook("UNDO", "wamid.text.1"), {
      "x-hub-signature-256": "ok",
    });
    expect(handler).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: "UNDO_CONFIRM" }),
    );
    // La seconda risposta non ha più il pulsante.
    expect(texts[1]).toEqual({
      to: "393331234567",
      body: "Fatto, abbiamo tolto la conferma.",
    });
  });

  it("vale solo come risposta a un nostro promemoria e dal numero a cui era partito", async () => {
    const { service, handler } = await withReminder();
    await service.handleWebhook(webhook("Non posso più", null), {
      "x-hub-signature-256": "ok",
    });
    await service.handleWebhook(webhook("Non posso più", "wamid.99"), {
      "x-hub-signature-256": "ok",
    });
    await service.handleWebhook(
      webhook("Non posso più", "wamid.1", "393339999999"),
      { "x-hub-signature-256": "ok" },
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it("niente risposta se il professionista è già stato avvisato", async () => {
    const { service, handler, texts } = await withReminder();
    handler.mockResolvedValueOnce(null as never);
    await service.handleWebhook(webhook("Non posso più", "wamid.1"), {
      "x-hub-signature-256": "ok",
    });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CANT_COME" }),
    );
    expect(texts).toHaveLength(0);
  });
});

describe("WhatsAppService: promemoria prima del preavviso con l'acconto", () => {
  // Sabato 16 gennaio alle 10:30, preavviso di 48 ore: si annulla fino a
  // giovedì 14 alle 10:30, il promemoria parte da giovedì alle 4:30, cioè
  // dalle 20 di mercoledì 13 (ore di silenzio).
  const booking = (extra: Record<string, unknown> = {}) => ({
    id: "b1",
    clientId: "u1",
    scheduledAt: new Date("2027-01-16T10:30:00Z"),
    cancellationNoticeHours: 48,
    professionalProfile: { businessName: "Rossi Idraulica" },
    quote: { guidedRequestId: "r1" },
    jobPayment: { paidEurCents: 5000, refundedEurCents: 0 },
    ...extra,
  });

  function withBookings(rows: ReturnType<typeof booking>[]) {
    const ctx = setup([verifiedUser()]);
    (ctx.prisma.booking as unknown as { findMany: unknown }).findMany = vi.fn(
      async () => rows,
    );
    return ctx;
  }

  it("parte alle 20 della sera prima e dice fino a quando si annulla riavendo l'acconto", async () => {
    const { service, sent } = withBookings([booking()]);
    // Mercoledì 13 alle 19:30 italiane: troppo presto.
    expect(
      await service.depositReminders(new Date("2027-01-13T18:30:00Z")),
    ).toBe(0);
    // Alle 20:00.
    expect(
      await service.depositReminders(new Date("2027-01-13T19:00:00Z")),
    ).toBe(1);
    expect(sent[0]).toMatchObject({
      template: "promemoria_appuntamento_acconto",
      bodyParams: [
        "sabato 16 gennaio alle 10:30",
        "Rossi Idraulica",
        "giovedì 14 gennaio alle 10:30",
      ],
      urlButtonSuffix: "le-mie-richieste?open=r1",
      // "Apri la richiesta" dopo "Ci sarò", "Non posso più" e "Non ricevere più".
      urlButtonIndex: 3,
    });
    // Il giro dopo non lo rimanda.
    await service.depositReminders(new Date("2027-01-13T19:30:00Z"));
    expect(sent).toHaveLength(1);
  });

  it("non parte a un'ora dalla fine del preavviso, né senza acconto pagato", async () => {
    const late = withBookings([booking()]);
    expect(
      await late.service.depositReminders(new Date("2027-01-14T09:00:00Z")),
    ).toBe(0);
    const refunded = withBookings([
      booking({ jobPayment: { paidEurCents: 5000, refundedEurCents: 5000 } }),
    ]);
    expect(
      await refunded.service.depositReminders(new Date("2027-01-13T19:00:00Z")),
    ).toBe(0);
  });

  it("con 24 ore di preavviso sostituisce il promemoria del giorno prima", async () => {
    const { service, sent } = withBookings([
      booking({ cancellationNoticeHours: 24 }),
    ]);
    // Si annulla fino a venerdì 15 alle 10:30: promemoria da venerdì alle 4:30, cioè giovedì alle 20.
    expect(
      await service.depositReminders(new Date("2027-01-14T19:00:00Z")),
    ).toBe(1);
    await service.bookingReminder({
      bookingId: "b1",
      scheduledAt: new Date("2027-01-16T10:30:00Z"),
      clientId: "u1",
      businessName: "Rossi Idraulica",
      guidedRequestId: "r1",
      now: new Date("2027-01-15T09:30:00Z"),
    });
    expect(sent).toHaveLength(1);
  });
});

describe("WhatsAppService: registrazione del webhook", () => {
  it("rimanda solo il numero di Meta e rifiuta il resto", () => {
    vi.stubEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN", "segreto");
    try {
      const { service } = setup([]);
      expect(
        service.verifySubscription("subscribe", "segreto", "1158201444"),
      ).toBe("1158201444");
      expect(() =>
        service.verifySubscription("subscribe", "altro", "1158201444"),
      ).toThrow();
      expect(() =>
        service.verifySubscription(
          "subscribe",
          "segreto",
          "<script>alert(1)</script>",
        ),
      ).toThrow();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
