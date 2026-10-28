import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { WEB_URL } from "../fixtures/env";

/**
 * "Password dimenticata" con il pulsante dell'email in primo piano e il
 * codice di 6 cifre di riserva
 * (docs/changelog/2026-10-28-verifica-email-con-link.md).
 */
const prisma = new PrismaClient();

test.use({ storageState: { cookies: [], origins: [{ origin: WEB_URL, localStorage: [{ name: "cookie-consent-v1", value: "denied" }] }] } });

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === "telefono-new-york", "Il fuso non cambia il recupero: bastano un telefono e un computer.");
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("prima il pulsante dell'email, il codice solo se serve", async ({ page }) => {
  const user = await prisma.user.create({
    data: { role: "CLIENT", email: `recupero-${Date.now()}@gmail.com`, name: "Anna", legalConsentAt: new Date(), emailVerifiedAt: new Date() },
  });
  await page.goto("/password-dimenticata");
  await page.getByLabel("Email").fill(user.email!);
  await page.getByRole("button", { name: "Mandami l'email" }).click();

  await expect(page.getByText("Se esiste un account, ti abbiamo mandato un'email a")).toBeVisible();
  await expect(page.getByText("Scegli una nuova password", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Apri Gmail" })).toBeVisible();
  await expect(page.getByLabel("Codice di 6 cifre")).toHaveCount(0);

  // Il codice vero non si legge dal database (solo l'impronta): lo sostituiamo con uno noto.
  await expect.poll(async () => (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordResetCodeHash).not.toBeNull();
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordResetCodeHash: createHash("sha256").update(`${user.id}:271828`).digest("hex") },
  });

  await page.getByRole("button", { name: "Il pulsante non si apre? Usa il codice" }).click();
  await page.getByLabel("Codice di 6 cifre").fill("271828");
  await expect(page).toHaveURL(/\/reimposta-password\?token=/, { timeout: 15_000 });
});
