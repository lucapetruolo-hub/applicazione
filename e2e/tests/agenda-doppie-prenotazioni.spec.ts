import { expect, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@professionisti/database";
import { API_URL } from "../fixtures/env";

/**
 * Doppie prenotazioni (docs/CHANGELOG.md §293, D1-D4 della verifica §292),
 * provate sull'API vera con un database vero: le richieste partono davvero
 * nello stesso istante, come due clienti che toccano "Accetta" insieme.
 */
const PASSWORD = "Password123!";
const wall = (date: string, time: string) => new Date(`${date}T${time}:00.000Z`);
/** Una data tra `days` giorni, AAAA-MM-GG. */
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const prisma = new PrismaClient();
let stamp = 0;

test.beforeAll(() => {
  stamp = Date.now();
});
test.afterAll(async () => {
  await prisma.$disconnect();
});

async function user(role: "PROFESSIONAL" | "CLIENT", tag: string) {
  const n = String(stamp + Math.floor(Math.random() * 1e6)).slice(-8);
  const created = await prisma.user.create({
    data: {
      role,
      email: `${tag}-${stamp}-${n}@test.it`,
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      name: tag,
      surname: "Prova",
      phone: `+3935${n}`,
      emailVerifiedAt: new Date(),
      legalConsentAt: new Date(),
      city: "Latina",
    },
  });
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: created.email, password: PASSWORD }),
  });
  expect(response.ok).toBe(true);
  const { token } = (await response.json()) as { token: string };
  return { id: created.id, token };
}

async function professional() {
  const pro = await user("PROFESSIONAL", "pro-doppie");
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "idraulico" } });
  const profile = await prisma.professionalProfile.create({
    data: { userId: pro.id, categoryId: category.id, businessName: "Doppie Prove Idraulica", city: "Latina", latitude: 41.4677, longitude: 12.9036 },
  });
  return { ...pro, profileId: profile.id, categoryId: category.id };
}

/** Un cliente con una richiesta e un preventivo del professionista da accettare. */
async function clientWithQuote(pro: { profileId: string; categoryId: string }, start: Date, end: Date | null) {
  const client = await user("CLIENT", "cliente-doppie");
  const request = await prisma.guidedRequest.create({
    data: { clientId: client.id, categoryId: pro.categoryId, description: "Rubinetto che perde.", city: "Latina", serviceMode: "HOME" },
  });
  const quote = await prisma.quote.create({
    data: { guidedRequestId: request.id, professionalProfileId: pro.profileId, estimatedStartDate: start, estimatedEndDate: end, status: "SENT", paymentOptions: ["DIRECT"] },
  });
  return { ...client, quoteId: quote.id };
}

const accept = (token: string, quoteId: string) =>
  fetch(`${API_URL}/bookings/from-quote/${quoteId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ paymentMethod: "DIRECT" }),
  });

test.describe("doppie prenotazioni", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "telefono-italia", "Prova dell'API: basta un dispositivo.");
  });

  test("D1: due clienti accettano insieme due preventivi alla stessa ora, nasce un solo lavoro", async () => {
    const pro = await professional();
    const date = inDays(4);
    const [a, b] = await Promise.all([
      clientWithQuote(pro, wall(date, "10:00"), wall(date, "11:00")),
      clientWithQuote(pro, wall(date, "10:30"), wall(date, "12:00")),
    ]);

    const responses = await Promise.all([accept(a.token, a.quoteId), accept(b.token, b.quoteId)]);
    const statuses = responses.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);
    const refused = responses.find((r) => r.status === 409)!;
    expect(((await refused.json()) as { message: string }).message).toContain("non è più libero");
    expect(await prisma.booking.count({ where: { professionalProfileId: pro.profileId } })).toBe(1);
  });

  test("D1: un lavoro esterno a quell'ora blocca l'accettazione", async () => {
    const pro = await professional();
    const date = inDays(4);
    await prisma.externalJob.create({
      data: { professionalProfileId: pro.profileId, clientName: "Lavoro esterno", scheduledAt: wall(date, "09:00"), scheduledEndAt: wall(date, "17:00") },
    });
    const client = await clientWithQuote(pro, wall(date, "15:00"), null);

    expect((await accept(client.token, client.quoteId)).status).toBe(409);
  });

  test("D4: cinque tocchi insieme su Accetta creano un solo lavoro e nessun errore interno", async () => {
    const pro = await professional();
    const client = await clientWithQuote(pro, wall(inDays(5), "09:00"), wall(inDays(5), "10:00"));

    const statuses = (await Promise.all(Array.from({ length: 5 }, () => accept(client.token, client.quoteId)))).map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s >= 500)).toEqual([]);
    expect(await prisma.booking.count({ where: { quoteId: client.quoteId } })).toBe(1);
  });

  test("D2 e D3: le fasce occupate da un lavoro lungo o da un lavoro esterno non risultano libere ai clienti", async () => {
    const pro = await professional();
    const date = inDays(3);
    const dayOfWeek = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    const slot = (startTime: string, endTime: string) => ({
      professionalProfileId: pro.profileId,
      dayOfWeek,
      date: new Date(`${date}T00:00:00.000Z`),
      startTime,
      endTime,
      allowsHome: true,
      homeMaxBookings: 1,
    });
    await prisma.availabilitySlot.createMany({ data: [slot("09:00", "10:00"), slot("10:00", "11:00"), slot("12:00", "13:00"), slot("17:00", "18:00")] });
    const client = await user("CLIENT", "cliente-fasce");
    await prisma.booking.create({
      data: { clientId: client.id, professionalProfileId: pro.profileId, scheduledAt: wall(date, "09:00"), scheduledEndAt: wall(date, "12:00"), status: "CONFIRMED", serviceMode: "HOME" },
    });
    await prisma.externalJob.create({
      data: { professionalProfileId: pro.profileId, clientName: "Condominio", scheduledAt: wall(date, "17:00"), scheduledEndAt: wall(date, "18:00") },
    });

    const agenda = (await (await fetch(`${API_URL}/professionals/${pro.profileId}/agenda`)).json()) as {
      days: { date: string; slots: { startTime: string; home: { maxBookings: number; bookedCount: number } | null }[] }[];
    };
    const day = agenda.days.find((d) => d.date === date)!;
    const booked = Object.fromEntries(day.slots.map((s) => [s.startTime, s.home!.bookedCount]));
    expect(booked).toEqual({ "09:00": 1, "10:00": 1, "12:00": 0, "17:00": 1 });
  });
});
