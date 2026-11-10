import { expect, type Browser, type Page } from "@playwright/test";
import type { PrismaClient } from "@professionisti/database";
import { createClient, createProfessional, pageAsClient } from "./preventivi";

/**
 * Archivia e ripristina l'unica richiesta del cliente
 * (docs/changelog/2026-11-10-ripristino-pagina-bloccata.md): dopo il
 * ripristino la pagina restava sulla scheda "Archiviate", ma con una sola
 * richiesta schede e filtri spariscono, e restava solo "Nessuna richiesta in
 * questa sezione" senza niente da toccare. Usata dal telefono Android
 * (richieste-archiviate.spec.ts) e dall'iPhone con Safari
 * (iphone-richiesta-unica-archiviata.spec.ts).
 */
export async function checkSingleRequestArchiveAndRestore(prisma: PrismaClient, browser: Browser, device: { viewport: { width: number; height: number }; isMobile: boolean }, shot: string) {
  const pro = await createProfessional(prisma, "Ripristino Idraulica");
  const client = await createClient(prisma);
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "idraulico" } });
  const request = await prisma.guidedRequest.create({
    data: { clientId: client.id, categoryId: category.id, description: "Rubinetto del bagno che gocciola", city: "Bologna", serviceMode: "ONLINE", professionalProfileId: pro.id },
  });
  await prisma.lead.create({ data: { guidedRequestId: request.id, professionalProfileId: pro.id, priceEurCents: 0 } });

  const page = await pageAsClient(browser, client.id, device);
  await page.goto("/le-mie-richieste");
  const card = page.locator(`#request-${request.id}`);
  await expect(card).toHaveCount(1);
  // Con una sola richiesta niente schede di stato.
  await expect(stateTab(page, "Archiviate")).toHaveCount(0);

  const menu = card.getByLabel("Azioni sulla richiesta", { exact: true });
  await menu.scrollIntoViewIfNeeded();
  await menu.click();
  await page.getByText("Archivia", { exact: true }).click();
  await page.getByRole("button", { name: "Vedi archiviate" }).click();
  await expect(stateTab(page, "Archiviate")).toHaveAttribute("aria-pressed", "true");
  await expect(card).toHaveCount(1);

  const restore = card.getByRole("button", { name: "Ripristina", exact: true });
  await restore.scrollIntoViewIfNeeded();
  await restore.click();

  // La richiesta torna in vista, aperta e toccabile: niente scheda vuota.
  await expect(page.getByRole("status").filter({ hasText: "Richiesta ripristinata" })).toBeVisible();
  await expect(card).toHaveCount(1);
  await expect(page.getByText("Nessuna richiesta in questa sezione")).toHaveCount(0);
  await expect(card.getByText("Rubinetto del bagno che gocciola").first()).toBeVisible();
  await page.screenshot({ path: `test-results/richiesta-unica-ripristinata-${shot}.png` });

  // La pagina risponde: il menu della scheda si apre di nuovo.
  await menu.scrollIntoViewIfNeeded();
  await menu.click();
  await expect(page.getByText("La ritrovi in Archiviate")).toBeVisible();
  await page.context().close();
}

// Le schede di stato hanno il numero nel nome ("Tutte 1"): così non si confondono con "Tutte" di A domicilio/Online.
export const stateTab = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^${name}( \\d+)?$`) }).and(page.locator("[aria-pressed]"));
