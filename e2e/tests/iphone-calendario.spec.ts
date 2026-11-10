import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@professionisti/database";
import { acceptQuote, createClient, createProfessional, createRequestWithQuotes, pageAsClient, PHONE, wallDay } from "../fixtures/preventivi";

/**
 * "Altri calendari" con il motore di Safari (WebKit, telefono iPhone): il
 * tasto apriva un link `data:` che Safari su iPhone ignora, e non succedeva
 * nulla (docs/changelog/2026-11-10-calendario-iphone.md). Ora il file arriva
 * dal sito come `text/calendar`, che l'iPhone apre con "Aggiungi al
 * calendario". Gira solo nel progetto "iphone-safari".
 */
const prisma = new PrismaClient();

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-safari", "Riguarda il motore di Safari.");
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("Altri calendari apre davvero il file dell'appuntamento", async ({ browser }) => {
  const client = await createClient(prisma);
  const pro = await createProfessional(prisma, "Marco Idraulica");
  const { request, quotes } = await createRequestWithQuotes(prisma, client.id, [pro.id], { start: wallDay(3, "10:00"), end: wallDay(3, "12:00") });
  expect((await acceptQuote(client.id, quotes[0].id)).status).toBeLessThan(300);

  const page = await pageAsClient(browser, client.id, PHONE);
  await page.goto(`/le-mie-richieste?open=${request.id}`);
  const card = page.locator(`#request-${request.id}`);
  await card.getByText("Aggiungi al calendario", { exact: true }).click();
  const link = card.getByRole("link", { name: /Altri calendari/ });
  await expect(link).toHaveAttribute("href", /^https?:\/\/.+\/calendario\/.+\.ics$/);
  await expect(link).not.toHaveAttribute("download", /.*/);

  // Safari riceve il file del calendario (in Playwright arriva come scaricamento).
  const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
  const body = await readFile((await download.path())!, "utf8");
  expect(body).toContain("BEGIN:VEVENT");
  expect(body).toContain("T100000");

  // Appuntamento annullato: una pagina chiara, non un errore tecnico.
  const href = (await link.getAttribute("href"))!;
  await prisma.booking.updateMany({ where: { guidedRequestId: request.id }, data: { status: "CANCELED" } });
  await page.goto(href);
  await expect(page.getByRole("heading", { name: "Questo link non vale più" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Le mie richieste" })).toBeVisible();
  await page.context().close();
});
