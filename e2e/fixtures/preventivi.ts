import { createHmac } from "node:crypto";
import type { Browser, Page } from "@playwright/test";
import type { PrismaClient } from "@professionisti/database";
import { API_URL, WEB_URL } from "./env";

/**
 * Richieste con preventivi da accettare, per le prove del lavoro prenotato
 * (docs/CHANGELOG.md §344): cliente, professionisti e preventivi creati nel
 * database di prova, accettazione fatta dall'API vera.
 */

/** Accesso di prova firmato come l'API (stesso JWT_SECRET): niente limite sugli accessi. */
export function testToken(userId: string): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const body = `${part({ alg: "HS256", typ: "JWT" })}.${part({ sub: userId, sv: 0, iat: now, exp: now + 3600 })}`;
  const signature = createHmac("sha256", process.env.JWT_SECRET ?? "e2e-secret").update(body).digest("base64url");
  return `${body}.${signature}`;
}

/** Ora "di parete" italiana salvata come UTC (docs/CHANGELOG.md §287), a `minutes` da adesso. */
export function wallFromNow(minutes: number): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(Date.now() + minutes * 60_000))
      .map((p) => [p.type, p.value]),
  );
  return new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00.000Z`);
}

/** Ora italiana tra `days` giorni, all'ora indicata. */
export function wallDay(days: number, time: string): Date {
  return new Date(`${wallFromNow(days * 24 * 60).toISOString().slice(0, 10)}T${time}:00.000Z`);
}

let counter = 0;
const unique = () => `${Date.now()}-${++counter}`;

export async function createClient(prisma: PrismaClient, name = "Giulia") {
  const stamp = unique();
  return prisma.user.create({
    data: { role: "CLIENT", email: `cliente-${stamp}@test.it`, name, surname: "Bianchi", phone: `+3934${stamp.replace(/\D/g, "").slice(-8)}`, city: "Latina", emailVerifiedAt: new Date(), legalConsentAt: new Date() },
  });
}

export async function createProfessional(prisma: PrismaClient, businessName: string, slug = "idraulico") {
  const stamp = unique();
  const category = await prisma.category.findFirstOrThrow({ where: { slug } });
  const user = await prisma.user.create({
    data: { role: "PROFESSIONAL", email: `pro-${stamp}@test.it`, name: businessName.split(" ")[0], surname: "Prova", phone: `+3933${stamp.replace(/\D/g, "").slice(-8)}`, emailVerifiedAt: new Date(), legalConsentAt: new Date() },
  });
  return prisma.professionalProfile.create({
    data: { userId: user.id, categoryId: category.id, businessName, city: "Latina", latitude: 41.4677, longitude: 12.9036 },
  });
}

/** Una richiesta del cliente con un preventivo per ogni professionista, tutti da accettare e con il solo pagamento diretto. */
export async function createRequestWithQuotes(
  prisma: PrismaClient,
  clientId: string,
  professionalProfileIds: string[],
  options: { start: Date; end?: Date; serviceMode?: "HOME" | "ONLINE"; description?: string } = { start: wallDay(3, "10:00") },
) {
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "idraulico" } });
  const online = options.serviceMode === "ONLINE";
  const request = await prisma.guidedRequest.create({
    data: {
      clientId,
      categoryId: category.id,
      description: options.description ?? "Perdita sotto il lavandino della cucina.",
      city: "Latina",
      serviceMode: options.serviceMode ?? "HOME",
      ...(online
        ? {}
        : { address: "Via Emanuele Filiberto", houseNumber: "12", postalCode: "04100", province: "LT", recipientName: "Giulia", recipientSurname: "Bianchi", recipientPhone: "+393334445555" }),
    },
  });
  const quotes = [];
  for (const [index, professionalProfileId] of professionalProfileIds.entries()) {
    await prisma.lead.create({ data: { guidedRequestId: request.id, professionalProfileId, priceEurCents: 0 } });
    quotes.push(
      await prisma.quote.create({
        data: {
          guidedRequestId: request.id,
          professionalProfileId,
          estimatedStartDate: options.start,
          estimatedEndDate: options.end ?? new Date(options.start.getTime() + 2 * 60 * 60_000),
          status: "SENT",
          paymentOptions: ["DIRECT"],
          items: { create: [{ name: "Sostituzione sifone", priceMinEurCents: 8000 + index * 1000, priceMaxEurCents: 12000 + index * 1000 }] },
        },
      }),
    );
  }
  return { request, quotes };
}

/** Accetta un preventivo dall'API come farebbe il pulsante "Accetta preventivo". */
export function acceptQuote(clientId: string, quoteId: string): Promise<Response> {
  return fetch(`${API_URL}/bookings/from-quote/${quoteId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${testToken(clientId)}` },
    body: JSON.stringify({ paymentMethod: "DIRECT" }),
  });
}

/** Pagina del sito con il cliente già dentro e il banner dei cookie già chiuso. */
export async function pageAsClient(browser: Browser, clientId: string, device: { viewport: { width: number; height: number }; isMobile: boolean }): Promise<Page> {
  const context = await browser.newContext({
    baseURL: WEB_URL,
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    viewport: device.viewport,
    isMobile: device.isMobile,
    hasTouch: device.isMobile,
    deviceScaleFactor: 2,
    storageState: {
      cookies: [],
      origins: [{ origin: WEB_URL, localStorage: [{ name: "cookie-consent-v1", value: "denied" }, { name: "professionisti_token", value: testToken(clientId) }] }],
    },
  });
  return context.newPage();
}

export const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true };
export const COMPUTER = { viewport: { width: 1280, height: 900 }, isMobile: false };
