import { expect, test, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@professionisti/database";
import { API_URL } from "../fixtures/env";

/**
 * Stelle e numero di recensioni accanto al nome del professionista, dalla
 * parte del cliente (docs/CHANGELOG.md §342): nei preventivi ricevuti da più
 * professionisti e nella richiesta inviata a uno solo. Le stelle portano alle
 * recensioni del profilo; senza recensioni "Nessuna recensione ancora".
 */
const prisma = new PrismaClient();
const PASSWORD = "Password123!";
const ids = { withReviews: "" };
const clients = { quotes: "", direct: "" };

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === "telefono-new-york", "Il fuso non cambia le stelle: bastano un telefono e un computer.");
});

test.beforeAll(async () => {
  const stamp = Date.now();
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "idraulico" } });
  const user = (key: string, role: "CLIENT" | "PROFESSIONAL", name: string) =>
    prisma.user.create({ data: { role, email: `${key}-${stamp}@test.it`, passwordHash, name, emailVerifiedAt: new Date(), legalConsentAt: new Date() } });
  const profile = async (key: string, businessName: string) =>
    prisma.professionalProfile.create({
      data: { userId: (await user(key, "PROFESSIONAL", businessName)).id, categoryId: category.id, businessName, city: "Latina", latitude: 41.4677, longitude: 12.9036 },
    });
  const withReviews = await profile("stelle-recensioni", "Luigi Bianchi Idraulica");
  const withoutReviews = await profile("stelle-nuovo", "Paolo Gallo Idraulica");
  ids.withReviews = withReviews.id;

  // Tre lavori conclusi con recensione (5, 5, 4 → 4,7) e una nascosta da un admin, che non conta.
  const past = await user("stelle-cliente-passato", "CLIENT", "Marta");
  for (const [index, rating] of [5, 5, 4, 1].entries()) {
    const request = await prisma.guidedRequest.create({ data: { clientId: past.id, categoryId: category.id, description: "Lavoro concluso.", city: "Latina", status: "CLOSED" } });
    const quote = await prisma.quote.create({
      data: { guidedRequestId: request.id, professionalProfileId: withReviews.id, estimatedStartDate: new Date("2026-09-01T09:00:00Z"), status: "ACCEPTED" },
    });
    const booking = await prisma.booking.create({
      data: { quoteId: quote.id, clientId: past.id, professionalProfileId: withReviews.id, scheduledAt: new Date("2026-09-01T09:00:00Z"), status: "COMPLETED", serviceMode: "HOME" },
    });
    await prisma.review.create({ data: { bookingId: booking.id, rating, comment: "Lavoro fatto bene.", hiddenAt: index === 3 ? new Date() : null } });
  }

  // Cliente con due preventivi per la stessa richiesta.
  const quotesClient = await user("stelle-cliente-preventivi", "CLIENT", "Giulia");
  const request = await prisma.guidedRequest.create({
    data: { clientId: quotesClient.id, categoryId: category.id, description: "Rubinetto che perde in bagno.", city: "Latina", serviceMode: "HOME" },
  });
  for (const [profileId, price] of [
    [withReviews.id, 12000],
    [withoutReviews.id, 9000],
  ] as const) {
    await prisma.quote.create({
      data: {
        guidedRequestId: request.id,
        professionalProfileId: profileId,
        estimatedStartDate: new Date("2026-12-01T09:00:00Z"),
        status: "SENT",
        paymentOptions: ["DIRECT"],
        items: { create: [{ name: "Sostituzione rubinetto", priceMinEurCents: price, priceMaxEurCents: price }] },
      },
    });
  }
  clients.quotes = quotesClient.email ?? "";

  // Cliente con una richiesta inviata solo al professionista con recensioni, ancora senza preventivo.
  const directClient = await user("stelle-cliente-diretta", "CLIENT", "Sara");
  const direct = await prisma.guidedRequest.create({
    data: { clientId: directClient.id, categoryId: category.id, professionalProfileId: withReviews.id, description: "Scarico del lavandino lento.", city: "Latina", serviceMode: "HOME" },
  });
  await prisma.lead.create({ data: { guidedRequestId: direct.id, professionalProfileId: withReviews.id, priceEurCents: 0 } });
  clients.direct = directClient.email ?? "";
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

/** L'accesso ha un limite al minuto per indirizzo: dopo gli altri test può servire aspettare. */
async function signIn(page: Page, email: string) {
  let token = "";
  for (let attempt = 0; !token; attempt++) {
    const response = await fetch(`${API_URL}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
    if (response.status === 429 && attempt < 6) {
      await new Promise((resolve) => setTimeout(resolve, (Number(response.headers.get("retry-after")) || 20) * 1000 + 500));
      continue;
    }
    expect(response.ok).toBe(true);
    token = ((await response.json()) as { token: string }).token;
  }
  await page.addInitScript((value) => localStorage.setItem("professionisti_token", value), token);
}

async function screenshot(page: Page, name: string, target: ReturnType<Page["locator"]>) {
  if (!process.env.E2E_SCREENSHOTS) return;
  await target.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.screenshot({ path: `${process.env.E2E_SCREENSHOTS}/${name}-${test.info().project.name}.png` });
}

test("nei preventivi ricevuti stelle e numero di recensioni accanto al nome", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, clients.quotes);
  await page.goto("/le-mie-richieste");
  const rating = page.getByRole("link", { name: "Valutazione 4,7 su 5, 3 recensioni: vedi le recensioni" });
  await expect(rating).toBeVisible();
  // Voto con la virgola, come si scrive in italiano.
  await expect(rating).toContainText("4,7");
  await expect(rating).toContainText("(3 recensioni)");
  // Chi non ha recensioni: la stessa scritta del profilo, senza link.
  await expect(page.getByText("Nessuna recensione ancora")).toBeVisible();
  await screenshot(page, "preventivi", rating);

  // Le stelle portano alle recensioni del profilo pubblico.
  await rating.click();
  await expect(page).toHaveURL(new RegExp(`/professionista/${ids.withReviews}#recensioni$`));
  await expect(page.getByText("Lavoro fatto bene.").first()).toBeInViewport();
});

test("nella richiesta inviata a un solo professionista stelle sotto il nome", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, clients.direct);
  await page.goto("/le-mie-richieste");
  const sentTo = page.getByText("Inviata a", { exact: true });
  await expect(sentTo).toBeVisible();
  await expect(page.getByText("(3 recensioni)")).toBeVisible();
  await screenshot(page, "inviata-a", sentTo);
});
