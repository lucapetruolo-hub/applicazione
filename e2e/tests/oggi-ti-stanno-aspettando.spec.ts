import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { acceptQuote, COMPUTER, createClient, createProfessional, createRequestWithQuotes, pageAsClient, PHONE, wallDay, wallFromNow } from "../fixtures/preventivi";

/**
 * "Ti stanno aspettando" e "Lavori da chiudere" nella pagina Oggi
 * (docs/changelog/2026-11-18-oggi-ti-stanno-aspettando.md): un problema
 * segnalato, una chat in cui il cliente aspetta, una fattura chiesta e un
 * lavoro di ieri non ancora chiuso. "Non serve risposta" e "Fatta" tolgono
 * la riga anche dopo aver ricaricato la pagina.
 */
const prisma = new PrismaClient();
const SHOTS = process.env.OGGI_SHOTS_DIR;

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Basta un progetto.");
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function setUp() {
  const pro = await createProfessional(prisma, "Marco Rossi Idraulica");
  const anna = await createClient(prisma, "Anna");
  const paolo = await createClient(prisma, "Paolo");
  const luisa = await createClient(prisma, "Luisa");
  const ornella = await createClient(prisma, "Ornella");

  // 1. Chat: preventivo inviato, poi il cliente chiede una cosa da 3 ore.
  const chat = await createRequestWithQuotes(prisma, anna.id, [pro.id], { start: wallDay(4, "09:00") });
  const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000);
  await prisma.conversationEvent.create({ data: { guidedRequestId: chat.request.id, professionalProfileId: pro.id, actor: "PROFESSIONAL", message: "Il professionista ha inviato un preventivo.", automatic: true, createdAt: ago(5) } });
  await prisma.conversationEvent.create({ data: { guidedRequestId: chat.request.id, professionalProfileId: pro.id, actor: "CLIENT", message: "Va bene anche giovedì mattina? Prima delle 10 non ci sono.", createdAt: ago(3) } });

  // 2. Problema segnalato su un lavoro di tre giorni fa, già chiuso: il cliente scrive in chat.
  const issue = await createRequestWithQuotes(prisma, paolo.id, [pro.id], { start: wallDay(-3, "14:00"), end: wallDay(-3, "16:00") });
  expect((await acceptQuote(paolo.id, issue.quotes[0].id)).ok).toBe(true);
  const issueJob = await prisma.booking.update({ where: { quoteId: issue.quotes[0].id }, data: { status: "COMPLETED" } });
  await prisma.jobIssue.create({ data: { bookingId: issueJob.id, type: "BAD_WORK", description: "Il rubinetto perde ancora.", status: "CHAT" } });

  // 3. Fattura chiesta su un lavoro terminato.
  const invoice = await createRequestWithQuotes(prisma, luisa.id, [pro.id], { start: wallDay(-2, "10:00"), end: wallDay(-2, "12:00") });
  expect((await acceptQuote(luisa.id, invoice.quotes[0].id)).ok).toBe(true);
  await prisma.booking.update({ where: { quoteId: invoice.quotes[0].id }, data: { status: "COMPLETED" } });
  await prisma.clientInvoiceRequest.create({
    data: { quoteId: invoice.quotes[0].id, clientId: luisa.id, kind: "VAT", name: "Bar Centrale srl", vatNumber: "01234567890", street: "Via Roma", houseNumber: "3", postalCode: "04100", city: "Latina" },
  });

  // 4. Lavoro di ieri ancora "confermato": da chiudere.
  const toClose = await createRequestWithQuotes(prisma, ornella.id, [pro.id], { start: wallDay(-1, "09:00"), end: wallDay(-1, "12:00") });
  expect((await acceptQuote(ornella.id, toClose.quotes[0].id)).ok).toBe(true);
  const toCloseJob = await prisma.booking.findFirstOrThrow({ where: { quoteId: toClose.quotes[0].id } });
  // 5. Lavoro di oggi già finito (solo se oggi è iniziato da almeno due ore).
  const todayStart = wallFromNow(-120);
  const todayJob =
    todayStart.toISOString().slice(0, 10) === wallFromNow(0).toISOString().slice(0, 10)
      ? await (async () => {
          const silvia = await createClient(prisma, "Silvia");
          const today = await createRequestWithQuotes(prisma, silvia.id, [pro.id], { start: todayStart, end: wallFromNow(-60) });
          expect((await acceptQuote(silvia.id, today.quotes[0].id)).ok).toBe(true);
          return prisma.booking.findFirstOrThrow({ where: { quoteId: today.quotes[0].id } });
        })()
      : null;
  return { pro, toCloseJob, todayJob };
}

test("Ti stanno aspettando: problema, chat e fattura in cima, lavori da chiudere sotto", async ({ browser }) => {
  const { pro, toCloseJob, todayJob } = await setUp();

  if (SHOTS) {
    const desk = await pageAsClient(browser, pro.userId, COMPUTER);
    // Senza i fumetti del menu ridotto nella foto.
    await desk.emulateMedia({ reducedMotion: "reduce" });
    await desk.goto("/dashboard");
    await desk.mouse.move(700, 880);
    await expect(desk.getByText("Ti stanno aspettando")).toBeVisible();
    await expect(desk.getByText("Lavori da chiudere")).toBeVisible();
    await desk.screenshot({ path: `${SHOTS}/computer.png`, fullPage: true });
    await desk.context().close();
  }

  const page = await pageAsClient(browser, pro.userId, PHONE);
  await page.goto("/dashboard");
  await expect(page.getByText("Ti stanno aspettando", { exact: true })).toBeVisible();
  // Il problema per primo, con la scadenza.
  await expect(page.getByText("Problema segnalato")).toBeVisible();
  await expect(page.getByText("Rispondi in chat e proponi una soluzione")).toBeVisible();
  await expect(page.getByText("«Va bene anche giovedì mattina? Prima delle 10 non ci sono.»")).toBeVisible();
  await expect(page.getByText("Aspetta da 3 ore")).toBeVisible();
  await expect(page.getByText("Fattura chiesta")).toBeVisible();
  await expect(page.getByText("Messaggi non letti")).toHaveCount(0);
  // Lavoro di ieri: "Lavoro terminato" apre subito la finestra in agenda.
  await expect(page.getByText("Lavori da chiudere")).toBeVisible();
  const closeLink = page.getByRole("link", { name: /Ornella/ });
  await expect(closeLink).toHaveAttribute("href", `/dashboard/agenda?booking=${toCloseJob.id}&termina=1`);
  // Lavoro di oggi già finito: in "Oggi e domani" con "Lavoro terminato" al posto di Naviga, non in "Lavori da chiudere".
  if (todayJob) {
    await expect(page.locator(`a[href="/dashboard/agenda?booking=${todayJob.id}&termina=1"]`)).toHaveText(/Lavoro terminato/);
    await expect(page.getByRole("link", { name: /Naviga verso/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Silvia/ })).toHaveCount(1);
  }
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/telefono.png`, fullPage: true });

  // "Non serve risposta": la chat sparisce, anche ricaricando.
  await page.getByRole("button", { name: "Non serve risposta" }).click();
  await expect(page.getByText("Aspetta da 3 ore")).toHaveCount(0);
  // "Fatta" sulla fattura: resta con "Annulla" fino al prossimo caricamento.
  await page.getByRole("button", { name: "Fatta" }).click();
  await expect(page.getByText("Segnata come fatta")).toBeVisible();
  await expect(page.getByRole("button", { name: "Annulla" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Problema segnalato")).toBeVisible();
  await expect(page.getByText("Aspetta da 3 ore")).toHaveCount(0);
  await expect(page.getByText("Fattura chiesta")).toHaveCount(0);

  // Il cliente riscrive: la chat torna.
  const chatRequest = await prisma.conversationEvent.findFirstOrThrow({ where: { professionalProfileId: pro.id, actor: "CLIENT" } });
  await prisma.conversationEvent.create({ data: { guidedRequestId: chatRequest.guidedRequestId, professionalProfileId: pro.id, actor: "CLIENT", message: "Mi fa sapere?" } });
  await page.reload();
  await expect(page.getByText("«Mi fa sapere?»")).toBeVisible();

  // "Lavoro terminato" da Oggi apre la finestra di chiusura in agenda.
  await closeLink.click();
  await expect(page).toHaveURL(/termina=1/);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.context().close();
});
