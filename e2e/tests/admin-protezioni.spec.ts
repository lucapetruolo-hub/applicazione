import { expect, test, type Browser } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { WEB_URL } from "../fixtures/env";
import { testToken } from "../fixtures/preventivi";

/**
 * Protezioni (docs/changelog/2026-11-02-admin-protezioni.md): in chat i
 * contatti non partono prima dell'accettazione; in Admin i ruoli e la
 * chiusura di una zona chiedono conferma con il motivo, che va nel registro.
 */
const prisma = new PrismaClient();
const stamp = Date.now();
const ids = { admin: "", target: "", client: "", pro: "", profile: "", request: "", categoryId: "" };
const zoneCity = `Protezionopoli ${stamp}`;

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia" && testInfo.project.name !== "computer-tokyo", "Un giro su telefono e uno su computer.");
});

test.beforeAll(async () => {
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "idraulico" } });
  ids.categoryId = category.id;
  const user = (data: { role: "CLIENT" | "PROFESSIONAL" | "ADMIN"; key: string; name: string; surname: string }) =>
    prisma.user.create({
      data: {
        role: data.role,
        email: `${data.key}-${stamp}@test.it`,
        name: data.name,
        surname: data.surname,
        emailVerifiedAt: new Date(),
        legalConsentAt: new Date(),
        ...(data.role === "ADMIN" ? { adminRoles: ["SUPER"], adminTotpEnabledAt: new Date(Date.now() - 60_000) } : {}),
      },
    });
  ids.admin = (await user({ role: "ADMIN", key: "admin-protezioni", name: "Admin", surname: "Protezioni" })).id;
  ids.target = (await user({ role: "CLIENT", key: "rita-ruoli", name: "Rita", surname: `Ruoli${stamp}` })).id;
  ids.client = (await user({ role: "CLIENT", key: "chiara-chat", name: "Chiara", surname: `Chat${stamp}` })).id;
  ids.pro = (await user({ role: "PROFESSIONAL", key: "pro-protezioni", name: "Paolo", surname: "Tubi" })).id;
  ids.profile = (
    await prisma.professionalProfile.create({
      data: { userId: ids.pro, categoryId: category.id, businessName: `Idraulica Chat ${stamp}`, city: "Latina", latitude: 41.4677, longitude: 12.9036 },
    })
  ).id;
  ids.request = (await prisma.guidedRequest.create({ data: { clientId: ids.client, categoryId: category.id, description: "Rubinetto che perde.", city: "Latina" } })).id;
  await prisma.lead.create({ data: { guidedRequestId: ids.request, professionalProfileId: ids.profile, priceEurCents: 0 } });
  await prisma.conversationEvent.create({ data: { guidedRequestId: ids.request, professionalProfileId: ids.profile, actor: "PROFESSIONAL", message: "Buongiorno, posso passare domani." } });
});

test.afterAll(async () => {
  await prisma.generalRequestBlock.deleteMany({ where: { categoryId: ids.categoryId, city: { contains: String(stamp) } } });
  await prisma.$disconnect();
});

async function pageAs(browser: Browser, isMobile: boolean, userId: string, admin = false) {
  const context = await browser.newContext({
    baseURL: WEB_URL,
    locale: "it-IT",
    viewport: isMobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    isMobile,
    hasTouch: isMobile,
    storageState: {
      cookies: [],
      origins: [
        {
          origin: WEB_URL,
          localStorage: [
            { name: "cookie-consent-v1", value: "denied" },
            { name: "professionisti_token", value: testToken(userId, admin ? { amfa: Math.floor(Date.now() / 1000) } : {}) },
          ],
        },
      ],
    },
  });
  return { context, page: await context.newPage() };
}

test("Chat: il numero di telefono non parte prima dell'accettazione, dopo sì", async ({ browser, isMobile }) => {
  const { context, page } = await pageAs(browser, isMobile, ids.client);
  await page.goto("/chat");
  if (isMobile) await page.getByText(`Idraulica Chat ${stamp}`).first().click();
  const box = page.getByRole("textbox", { name: "Scrivi un messaggio" });
  await box.fill("Mi chiami al 333 123 4567");
  await page.getByRole("button", { name: "Invia" }).click();
  await expect(page.getByText(/togli il numero di telefono per inviare il messaggio/)).toBeVisible();
  // Il testo resta nel campo da correggere, e il messaggio non c'è.
  await expect(box).toHaveValue("Mi chiami al 333 123 4567");
  expect(await prisma.conversationEvent.count({ where: { guidedRequestId: ids.request, message: { contains: "333 123 4567" } } })).toBe(0);
  // Senza contatti parte.
  await box.fill("A che ora passa domani?");
  await page.getByRole("button", { name: "Invia" }).click();
  // Prima il campo si svuota, poi il messaggio: finché il testo è ancora nel
  // campo, getByText trova due elementi (campo e messaggio).
  await expect(box).toHaveValue("");
  await expect(page.getByText("A che ora passa domani?")).toBeVisible();

  // Preventivo accettato: ora il numero si può scrivere.
  const quote = await prisma.quote.create({ data: { guidedRequestId: ids.request, professionalProfileId: ids.profile, estimatedStartDate: new Date(Date.now() + 86_400_000), status: "ACCEPTED" } });
  await prisma.booking.create({
    data: { quoteId: quote.id, clientId: ids.client, professionalProfileId: ids.profile, scheduledAt: new Date(Date.now() + 86_400_000), status: "CONFIRMED", serviceMode: "HOME" },
  });
  await box.fill("Mi chiami al 333 123 4567");
  await page.getByRole("button", { name: "Invia" }).click();
  await expect(box).toHaveValue("");
  await expect(page.getByText("Mi chiami al 333 123 4567")).toBeVisible();
  await expect.poll(() => prisma.conversationEvent.count({ where: { guidedRequestId: ids.request, message: { contains: "333 123 4567" } } })).toBe(1);
  // Per il giro successivo (telefono/computer) si riparte senza accettazione.
  await prisma.booking.deleteMany({ where: { quoteId: quote.id } });
  await prisma.quote.delete({ where: { id: quote.id } });
  await prisma.conversationEvent.deleteMany({ where: { guidedRequestId: ids.request, message: { contains: "333 123 4567" } } });
  await context.close();
});

test("Admin: ruoli e chiusura di una zona chiedono conferma con il motivo", async ({ browser, isMobile }) => {
  const { context, page } = await pageAs(browser, isMobile, ids.admin, true);
  const role = isMobile ? "MODERATOR" : "FINANCE";
  await prisma.user.update({ where: { id: ids.target }, data: { role: "CLIENT", adminRoles: [] } });

  // Ruoli: niente parte con un clic, il motivo è obbligatorio e va nel registro.
  await page.goto(`/admin/utenti/${ids.target}`);
  await page.getByRole("checkbox", { name: role === "MODERATOR" ? /^Moderatore/ : /^Finanza/ }).check();
  await page.getByRole("button", { name: "Salva ruoli" }).click();
  const dialog = page.getByRole("dialog", { name: "Cambia i ruoli di amministratore" });
  await expect(dialog.getByText(/Tutti i super admin ricevono un'email/)).toBeVisible();
  expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.target } })).role).toBe("CLIENT");
  await dialog.getByRole("button", { name: "Salva ruoli" }).click();
  await expect(dialog.getByText(/almeno 10 caratteri/)).toBeVisible();
  const reason = `Prova ${stamp}: entra nel gruppo di lavoro`;
  await dialog.getByLabel("Motivo (va nel registro azioni)").fill(reason);
  await dialog.getByRole("button", { name: "Salva ruoli" }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await prisma.user.findUniqueOrThrow({ where: { id: ids.target } })).adminRoles).toEqual([role]);
  expect((await prisma.auditLog.findFirstOrThrow({ where: { entityId: ids.target, fieldName: "adminRoles" }, orderBy: { createdAt: "desc" } })).reason).toBe(reason);

  // Chiudere una zona: conferma e motivo, che si vede anche nella riga della zona.
  const city = `${zoneCity} ${isMobile ? "t" : "c"}`;
  await page.goto("/admin/richieste-generali");
  await page.getByLabel("Categoria").selectOption("idraulico");
  await page.getByLabel("Città").fill(city);
  await page.getByRole("button", { name: "Chiudi", exact: true }).first().click();
  const zone = page.getByRole("dialog", { name: "Chiudi la zona" });
  await expect(zone.getByText(new RegExp(`Idraulico a ${city}`))).toBeVisible();
  await zone.getByLabel("Motivo").fill("Prova: troppe richieste per i professionisti della zona");
  await zone.getByRole("button", { name: "Chiudi la zona" }).click();
  await expect(zone).toHaveCount(0);
  await expect
    .poll(async () => (await prisma.generalRequestBlock.findFirst({ where: { categoryId: ids.categoryId, city: { contains: String(stamp) }, reopenedAt: null }, orderBy: { closedAt: "desc" } }))?.reason)
    .toBe("Chiusa a mano: Prova: troppe richieste per i professionisti della zona");
  await context.close();
});
