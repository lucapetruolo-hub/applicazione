import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@professionisti/database";
import { API_URL, WEB_URL } from "./env";
import { BOOKING_CASES } from "./cases";
import { DATA_FILE, STATE_FILE, type E2eData } from "./data";

const PASSWORD = "Password123!";

/** Ora "di parete" italiana salvata come UTC (docs/CHANGELOG.md §287). */
const wall = (iso: string) => new Date(`${iso}:00.000Z`);

/**
 * Un professionista con appuntamenti attorno ai due cambi d'ora (25/10/2026 e
 * 28/03/2027), uno a fine giornata (23:30, dove un fuso sbagliato lo sposta
 * al giorno dopo) e un lavoro esterno.
 */
export default async function globalSetup(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const stamp = Date.now();
    const category = await prisma.category.findFirstOrThrow({ where: { slug: "idraulico" } });
    const pro = await prisma.user.create({
      data: {
        role: "PROFESSIONAL",
        email: `pro-e2e-${stamp}@test.it`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        name: "Marco",
        surname: "Rossi",
        phone: `+3933${String(stamp).slice(-8)}`,
        emailVerifiedAt: new Date(),
        legalConsentAt: new Date(),
      },
    });
    const profile = await prisma.professionalProfile.create({
      data: { userId: pro.id, categoryId: category.id, businessName: "Marco Rossi Idraulica", city: "Latina", latitude: 41.4677, longitude: 12.9036 },
    });
    const client = await prisma.user.create({
      data: { role: "CLIENT", email: `cliente-e2e-${stamp}@test.it`, name: "Giulia", surname: "Bianchi", phone: `+3934${String(stamp).slice(-8)}`, city: "Latina" },
    });

    const bookings: E2eData["bookings"] = [];
    for (const item of BOOKING_CASES) {
      const request = await prisma.guidedRequest.create({
        data: { clientId: client.id, categoryId: category.id, description: "Perdita sotto il lavandino della cucina.", city: "Latina" },
      });
      const quote = await prisma.quote.create({
        data: { guidedRequestId: request.id, professionalProfileId: profile.id, estimatedStartDate: wall(item.wallClock.replace(" ", "T")), status: "ACCEPTED" },
      });
      const booking = await prisma.booking.create({
        data: {
          quoteId: quote.id,
          clientId: client.id,
          professionalProfileId: profile.id,
          scheduledAt: wall(item.wallClock.replace(" ", "T")),
          scheduledEndAt: wall(item.end.replace(" ", "T")),
          status: "CONFIRMED",
          serviceMode: "HOME",
          street: "Via Emanuele Filiberto",
          houseNumber: "12",
          city: "Latina",
          postalCode: "04100",
          province: "LT",
          recipientName: "Giulia",
          recipientSurname: "Bianchi",
          recipientPhone: "+393334445555",
        },
      });
      bookings.push({ id: booking.id, label: item.label, wallClock: item.wallClock });
    }
    const externalJob = await prisma.externalJob.create({
      data: {
        professionalProfileId: profile.id,
        clientName: "Condominio Aurora",
        address: "Via Isonzo 40, Latina",
        scheduledAt: wall("2026-10-26T17:00"),
        scheduledEndAt: wall("2026-10-26T18:00"),
        description: "Controllo caldaia",
      },
    });

    const response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: pro.email, password: PASSWORD }),
    });
    if (!response.ok) throw new Error(`Accesso di prova non riuscito: ${response.status} ${await response.text()}`);
    const { token } = (await response.json()) as { token: string };

    const data: E2eData = { token, userId: pro.id, bookings, externalJob: { id: externalJob.id, wallClock: "2026-10-26 17:00" } };
    mkdirSync(dirname(DATA_FILE), { recursive: true });
    writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    // Sessione già aperta e banner cookie già chiuso, come per un professionista che torna sul sito.
    writeFileSync(
      STATE_FILE,
      JSON.stringify({
        cookies: [],
        origins: [{ origin: WEB_URL, localStorage: [{ name: "professionisti_token", value: token }, { name: "cookie-consent-v1", value: "denied" }] }],
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}
