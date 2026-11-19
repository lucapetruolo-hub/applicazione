import { expect, test } from "@playwright/test";
import { api, loginClient, loginPro, pageAs } from "./sito-vero";

/**
 * Il percorso che porta i soldi, sul sito vero: richiesta a un professionista
 * scelto, preventivo con acconto, il cliente accetta e arriva alla pagina di
 * Stripe (docs/changelog/2026-11-19-prova-notturna-sito-vero.md). Non paga:
 * senza pagamento non nasce nessun lavoro e la richiesta si può togliere.
 */
const MARK = "PROVA NOTTURNA";
let clientToken = "";
let requestId: string | null = null;

test.describe.configure({ retries: 1 });

test.beforeEach(async () => {
  clientToken = await loginClient();
  // Una prova interrotta la notte prima può aver lasciato la sua richiesta.
  const mine = await api<{ id: string; description: string }[]>("/guided-requests/me", clientToken);
  for (const request of mine.filter((entry) => entry.description.startsWith(MARK))) {
    await api(`/guided-requests/${request.id}`, clientToken, "DELETE", {}).catch(() => undefined);
  }
});

test.afterEach(async () => {
  if (requestId) await api(`/guided-requests/${requestId}`, clientToken, "DELETE", {});
  requestId = null;
});

test("richiesta, preventivo e accettazione fino alla pagina di Stripe", async ({ browser }) => {
  const proToken = await loginPro();
  const pro = await api<{ id: string }>("/professionals/me", proToken);

  // "Professionista non trovato" qui vuol dire che l'account del segreto
  // NOTTE_PRO_EMAIL non può ricevere richieste (profilo sospeso o senza dati
  // fiscali, account sbagliato). Non si controlla la pagina pubblica: dal
  // lancio gli account di prova non si vedono più nella ricerca, ma una
  // richiesta diretta la ricevono lo stesso.
  const created = await api<{ guidedRequestId: string }>("/guided-requests", clientToken, "POST", {
    categorySlug: "idraulico",
    description: `${MARK}: il rubinetto del bagno gocciola. Prova automatica, non è un lavoro vero.`,
    city: "Latina",
    address: "Via Emanuele Filiberto",
    houseNumber: "10",
    postalCode: "04100",
    province: "LT",
    recipientName: "Prova",
    recipientSurname: "Cliente",
    recipientPhone: "+393331234567",
    serviceMode: "HOME",
    timing: "WEEK",
    professionalProfileId: pro.id,
    boardAllowed: false,
  }).catch((error: Error) => {
    if (error.message.includes("Professionista non trovato")) throw new Error(`NOTTE_PRO_EMAIL non è un professionista che può ricevere richieste. ${error.message}`);
    throw error;
  });
  requestId = created.guidedRequestId;

  const start = new Date(Date.now() + 4 * 86_400_000);
  start.setUTCHours(8, 0, 0, 0);
  const end = new Date(start);
  end.setUTCHours(10);
  const quote = await api<{ id: string }>("/quotes", proToken, "POST", {
    requestId,
    items: [
      { name: "Manodopera", priceMinEurCents: 6000, priceMaxEurCents: 9000 },
      { name: "Materiali", priceMinEurCents: 2000, priceMaxEurCents: 3000 },
    ],
    estimatedStartDate: start.toISOString(),
    estimatedEndDate: end.toISOString(),
    paymentOptions: ["ONLINE", "DIRECT"],
    depositPercent: 30,
    cancellationNoticeHours: 24,
    lateCancelKeepsDeposit: true,
  });

  const { page, errors } = await pageAs(browser, clientToken);
  await page.goto(`/le-mie-richieste?open=${requestId}`);
  const card = page.locator(`#request-${requestId}`);
  await card.locator(`#quote-${quote.id}`).getByText("Accetta preventivo", { exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Accetta il preventivo" });
  await expect(dialog.getByRole("heading", { name: "Accetta il preventivo" })).toBeVisible();
  await dialog.getByText(/Con la carta, sul sito/).last().click();
  // Acconto: 30% del minimo (80 €).
  await expect(dialog.getByTestId("quote-accept-amounts")).toContainText("24,00");

  await dialog.getByRole("button").filter({ hasText: /Accetta|Paga|Conferma/ }).last().click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
  expect(errors, "errori del browser sul sito").toEqual([]);
  await page.context().close();
});
