import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { COMPUTER, PHONE, acceptQuote, createClient, createProfessional, createRequestWithQuotes, pageAsClient, wallDay } from "../fixtures/preventivi";

/**
 * Rubrica "I miei clienti" (docs/changelog/2026-11-08-rubrica-clienti.md):
 * clienti del sito (solo con un lavoro accettato) e dei lavori aggiunti in
 * agenda, ricerca, storico, nota privata e "Proponi una data", che prepara il
 * messaggio nella chat del lavoro senza mandarlo.
 */
const prisma = new PrismaClient();

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Basta un progetto: telefono e computer si provano qui dentro.");
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

for (const [device, size] of [["telefono", PHONE], ["computer", COMPUTER]] as const) {
  test(`la rubrica dei clienti (${device})`, async ({ browser }) => {
    const pro = await createProfessional(prisma, "Idraulica Verdi Latina");
    const client = await createClient(prisma, "Maria");
    const { request, quotes } = await createRequestWithQuotes(prisma, client.id, [pro.id], { start: wallDay(-10, "09:00") });
    expect((await acceptQuote(client.id, quotes[0]!.id)).status).toBe(201);
    await prisma.booking.updateMany({ where: { guidedRequestId: request.id }, data: { status: "COMPLETED", finalAmountEurCents: 11000 } });
    // Un cliente con un preventivo non accettato non entra nella rubrica.
    const stranger = await createClient(prisma, "Paolo");
    await createRequestWithQuotes(prisma, stranger.id, [pro.id], { start: wallDay(5, "09:00") });
    await prisma.externalJob.createMany({
      data: [
        { professionalProfileId: pro.id, clientName: "Luigi Neri", clientPhone: "+39 333 777 6666", address: "Via Milano 3, Latina", description: "Caldaia", scheduledAt: wallDay(-30, "10:00"), priceEurCents: 9000, status: "COMPLETED" },
        { professionalProfileId: pro.id, clientName: "Luigi", clientPhone: "3337776666", description: "Controllo caldaia", scheduledAt: wallDay(4, "15:00"), status: "SCHEDULED" },
      ],
    });

    const page = await pageAsClient(browser, pro.userId, size);
    await page.goto("/dashboard/clienti");
    const list = page.getByRole("list", { name: "Clienti" });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(page.getByText("Paolo")).toHaveCount(0);
    // Prima chi ha un appuntamento in arrivo; lo stesso numero scritto in due modi è un cliente solo.
    await expect(list.getByRole("listitem").first()).toContainText("Luigi Neri");
    await expect(list.getByRole("listitem").first()).toContainText("Prossimo:");
    await expect(list.getByRole("listitem").nth(1)).toContainText("Maria Bianchi");
    await expect(list.getByRole("listitem").nth(1)).toContainText("110,00");
    await page.screenshot({ path: `test-results/rubrica-clienti-${device}.png` });

    await page.getByRole("searchbox", { name: "Cerca un cliente" }).fill("maria");
    await expect(list.getByRole("listitem")).toHaveCount(1);

    const maria = list.getByRole("listitem").first();
    await maria.getByRole("button", { name: "Storico e nota" }).click();
    await expect(maria.getByText("Sostituzione sifone")).toBeVisible();
    await expect(maria.getByText("Terminato", { exact: true })).toBeVisible();
    await maria.getByLabel("Nota privata").fill("Citofono rotto, chiamare prima");
    await maria.getByRole("button", { name: "Salva la nota" }).click();
    await expect(maria.getByText("Salvata", { exact: true })).toBeVisible();
    const notes = await prisma.professionalClientNote.findMany({ where: { professionalProfileId: pro.id } });
    expect(notes.map((n) => [n.clientKey, n.note])).toEqual([[`u:${client.id}`, "Citofono rotto, chiamare prima"]]);
    await page.screenshot({ path: `test-results/rubrica-clienti-${device}-storico.png`, fullPage: true });
    const axe = await new AxeBuilder({ page }).include("main").analyze();
    expect(axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);

    // "Proponi una data": il messaggio è pronto nella chat del lavoro, lo manda il professionista.
    await maria.getByRole("button", { name: "Proponi una data" }).click();
    const day = wallDay(7, "09:00").toISOString().slice(0, 10);
    await maria.getByLabel("Giorno proposto").fill(day);
    await maria.getByRole("button", { name: "Scrivi il messaggio" }).click();
    const chat = page.getByRole("dialog", { name: "Cronologia della richiesta" });
    await expect(chat.locator("textarea")).toHaveValue(/^Ciao Maria, per il prossimo intervento ti andrebbe bene \S+ \d+ \w+ alle 9:00\? Se ti va, chiedimi il preventivo da qui: https:\/\/.+\/preventivo\?professionista=/);
    await page.screenshot({ path: `test-results/rubrica-clienti-${device}-proposta.png` });
    await page.keyboard.press("Escape");

    // Cliente aggiunto a mano: "Aggiungi un lavoro" apre il modulo dell'agenda già compilato.
    await page.getByRole("searchbox", { name: "Cerca un cliente" }).fill("777 66");
    await list.getByRole("listitem").first().getByRole("button", { name: "Aggiungi un lavoro" }).click();
    const form = page.getByRole("dialog", { name: "Aggiungi un tuo lavoro" });
    await expect(form.getByLabel("Nome cliente")).toHaveValue("Luigi Neri");
    await expect(form.getByLabel("Indirizzo")).toHaveValue("Via Milano 3, Latina");
    await page.context().close();
  });
}
