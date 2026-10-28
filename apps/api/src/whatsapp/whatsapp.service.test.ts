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
        }: {
          where: { id?: string; providerMessageId?: string };
          include?: unknown;
        }) => {
          const row = messages.find((m) =>
            where.id
              ? m.id === where.id
              : m.providerMessageId === where.providerMessageId,
          );
          if (!row) return null;
          return include
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
  const provider: WhatsAppProvider = {
    name: "fake",
    sendTemplate: vi.fn(async (m: WhatsAppTemplateMessage) => {
      if (fail) throw fail;
      sent.push(m);
      return { providerMessageId: `wamid.${sent.length}` };
    }),
    verifyWebhook: (_raw, headers) => headers["x-hub-signature-256"] === "ok",
    parseWebhook: (body) =>
      body as ReturnType<WhatsAppProvider["parseWebhook"]>,
  };
  return { provider, sent };
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
  const { provider, sent } = fakeProvider(fail);
  const service = new WhatsAppService(
    prisma as unknown as PrismaClient,
    provider,
  );
  return { service, prisma, messages, sent };
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
        { from: "393331234567", text: "Non ricevere più", buttonPayload: null },
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
