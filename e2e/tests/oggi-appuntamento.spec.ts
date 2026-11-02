import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { acceptQuote, createClient, createProfessional, createRequestWithQuotes, pageAsClient, PHONE, wallDay } from "../fixtures/preventivi";

/**
 * Collaudo 0-14 (docs/changelog/2026-11-02-collaudo-accettazione-e-chiusure.md):
 * dopo "Fai passare il tempo" di un giorno l'appuntamento di domani diventa di
 * oggi, anche già passato, e "Oggi e domani" del professionista deve mostrarlo
 * finché il lavoro non è chiuso.
 */
const prisma = new PrismaClient();

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Basta un progetto.");
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("l'appuntamento di oggi resta in Oggi e domani anche dopo l'orario e dopo Fai passare il tempo", async ({ browser }) => {
  const client = await createClient(prisma, "Ornella");
  const pro = await createProfessional(prisma, "Marco Rossi Idraulica");
  const { quotes } = await createRequestWithQuotes(prisma, client.id, [pro.id], { start: wallDay(1, "08:00"), end: wallDay(1, "13:00") });
  expect((await acceptQuote(client.id, quotes[0].id)).ok).toBe(true);
  const job = await prisma.booking.findFirstOrThrow({ where: { quoteId: quotes[0].id } });

  // Come "Fai passare il tempo" di 1 giorno: le date del lavoro indietro di 24 ore.
  const day = 24 * 60 * 60_000;
  await prisma.booking.update({
    where: { id: job.id },
    data: { scheduledAt: new Date(job.scheduledAt.getTime() - day), scheduledEndAt: job.scheduledEndAt ? new Date(job.scheduledEndAt.getTime() - day) : null, createdAt: new Date(job.createdAt.getTime() - day) },
  });

  const page = await pageAsClient(browser, pro.userId, PHONE);
  await page.goto("/dashboard");
  await expect(page.getByText("Nessun appuntamento oggi e domani.")).toHaveCount(0);
  await expect(page.getByText("Ornella", { exact: false }).first()).toBeVisible();
  await page.context().close();
});
