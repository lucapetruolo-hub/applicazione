import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { COMPUTER, PHONE, createClient, createProfessional, createRequestWithQuotes, pageAsClient, wallDay, wallFromNow } from "../fixtures/preventivi";

/**
 * Fascia di oggi già cominciata (docs/changelog/2026-11-11-fascia-in-corso.md):
 * alle 14:20 "oggi 14:00–20:00" proposta dal cliente risultava "già passata".
 * Una fascia vale fino alla sua fine ("14-20 va bene fino alle 20"). Nella
 * scheda il lavoro viene prima di chi lo chiede: "Descrizione lavoro" sopra (o
 * a sinistra di) "Dettagli cliente". Con la data davvero passata niente
 * "Accetta": si propone subito un'altra data.
 */
const prisma = new PrismaClient();

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Basta un progetto: telefono e computer si provano qui dentro.");
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

for (const [device, size] of [["telefono", PHONE], ["computer", COMPUTER]] as const) {
  test(`"Accetta nuova data" su una fascia già cominciata e non ancora finita (${device})`, async ({ browser }) => {
    const pro = await createProfessional(prisma, `Fascia In Corso ${device}`);
    const client = await createClient(prisma);
    const description = `Il lavandino perde sotto il mobile (${device}).`;
    const { quotes } = await createRequestWithQuotes(prisma, client.id, [pro.id], { start: wallDay(3, "08:00"), end: wallDay(3, "09:00"), description });
    // Cominciata mezz'ora fa, finisce tra quattro ore (ora italiana).
    await prisma.quote.update({
      where: { id: quotes[0]!.id },
      data: { status: "MODIFICATION_REQUESTED", clientProposedDate: wallFromNow(-30), clientProposedEndDate: wallFromNow(240) },
    });
    const owner = await prisma.professionalProfile.findUniqueOrThrow({ where: { id: pro.id } });
    const page = await pageAsClient(browser, owner.userId, size);
    await page.goto("/dashboard/richieste");
    await page.getByText(description, { exact: false }).first().click();

    // Prima il lavoro, poi il cliente.
    const job = await page.getByText("Descrizione lavoro", { exact: true }).last().boundingBox();
    const details = await page.getByText("Dettagli cliente", { exact: true }).last().boundingBox();
    expect(job && details && (job.y + job.height <= details.y || job.x + job.width <= details.x)).toBe(true);
    await page.getByText("Descrizione lavoro", { exact: true }).last().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/fascia-in-corso-${device}.png` });

    await page.getByRole("button", { name: "Accetta nuova data" }).click();
    await expect(page.getByText(/già passata/)).toHaveCount(0);
    await expect.poll(async () => (await prisma.quote.findUniqueOrThrow({ where: { id: quotes[0]!.id } })).status).toBe("SENT");
    await page.context().close();
  });
}

test("data proposta già finita: niente \"Accetta nuova data\", resta \"Modifica\"", async ({ browser }) => {
  const pro = await createProfessional(prisma, "Fascia Finita");
  const client = await createClient(prisma);
  const description = "Lo scarico della doccia è lento.";
  const { quotes } = await createRequestWithQuotes(prisma, client.id, [pro.id], { start: wallDay(3, "08:00"), end: wallDay(3, "09:00"), description });
  await prisma.quote.update({
    where: { id: quotes[0]!.id },
    data: { status: "MODIFICATION_REQUESTED", clientProposedDate: wallDay(-1, "14:00"), clientProposedEndDate: wallDay(-1, "20:00") },
  });
  const owner = await prisma.professionalProfile.findUniqueOrThrow({ where: { id: pro.id } });
  const page = await pageAsClient(browser, owner.userId, PHONE);
  await page.goto("/dashboard/richieste");
  await page.getByText(description, { exact: false }).first().click();
  await expect(page.getByText(/La data proposta è già passata/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Accetta nuova data" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Modifica", exact: true })).toBeVisible();
  await page.getByText(/La data proposta è già passata/).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/fascia-finita-professionista-telefono.png" });
  await page.context().close();
});

test.describe("cliente", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const [device, size] of [["telefono", PHONE], ["computer", COMPUTER]] as const) {
    test(`preventivo con la data già passata: "Proponi un'altra data" al posto di "Accetta" (${device})`, async ({ browser }) => {
      const pro = await createProfessional(prisma, `Preventivo Scaduto ${device}`);
      const client = await createClient(prisma);
      const { request } = await createRequestWithQuotes(prisma, client.id, [pro.id], { start: wallDay(-1, "14:00"), end: wallDay(-1, "20:00") });
      const page = await pageAsClient(browser, client.id, size);
      await page.goto(`/le-mie-richieste?open=${request.id}`);
      await expect(page.getByText(/La data di questo preventivo è già passata/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Accetta preventivo" })).toHaveCount(0);
      await page.getByText(/La data di questo preventivo è già passata/).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `test-results/fascia-finita-cliente-${device}.png` });
      await page.getByRole("button", { name: "Proponi un'altra data" }).click();
      await expect(page.getByRole("button", { name: "Proponi un'altra data" })).toHaveCount(0);
      await page.context().close();
    });
  }
});
