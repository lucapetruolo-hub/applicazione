import { devices, expect, test, type Page } from "@playwright/test";

/**
 * Foto con la webcam dal computer (docs/changelog/2026-11-16-webcam-da-computer.md):
 * dal computer con una webcam il pulsante foto offre "Scatta con la webcam" e
 * "Scegli dal computer"; senza webcam si apre subito la scelta del file; con
 * il permesso negato si spiega cosa fare.
 * Senza webcam restano "Scatta dal telefono" e "Scegli dal computer". La webcam è simulata con un disegno
 * (stessa prova in ogni browser, senza opzioni di avvio).
 */
test.use({ storageState: { cookies: [], origins: [] } });

async function fakeWebcam(page: Page, mode: "ok" | "negata" | "assente") {
  await page.addInitScript((m) => {
    const devices = navigator.mediaDevices;
    if (!devices) return;
    devices.enumerateDevices = () =>
      Promise.resolve(m === "assente" ? [] : ([{ kind: "videoinput", deviceId: "", groupId: "", label: "" }] as unknown as MediaDeviceInfo[]));
    devices.getUserMedia = () => {
      if (m === "negata") return Promise.reject(new DOMException("negata", "NotAllowedError"));
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext("2d")!;
      const draw = () => {
        ctx.fillStyle = "#1e6b6e";
        ctx.fillRect(0, 0, 640, 480);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(200 + (Date.now() % 100), 160, 160, 160);
        requestAnimationFrame(draw);
      };
      draw();
      return Promise.resolve(canvas.captureStream(15));
    };
  }, mode);
}

async function openPicker(page: Page) {
  await page.goto("/preventivo");
  await page.getByRole("button", { name: "Aggiungi una foto del problema" }).click();
}

test("dal computer si scatta con la webcam e la foto entra nella richiesta", async ({ page, isMobile }) => {
  test.skip(isMobile, "Dal telefono resta il menu Scatta / Galleria");
  await fakeWebcam(page, "ok");
  await openPicker(page);
  await page.getByRole("button", { name: "Scatta con la webcam" }).click();
  const scatta = page.getByRole("button", { name: "Scatta", exact: true });
  await expect(scatta).toBeEnabled();
  await scatta.click();
  await expect(page.getByRole("heading", { name: "Va bene questa foto?" })).toBeVisible();
  // La webcam si spegne appena scattata.
  await expect.poll(() => page.evaluate(() => document.querySelector("video")?.srcObject == null || !(document.querySelector("video")!.srcObject as MediaStream).active)).toBe(true);
  await page.getByRole("button", { name: "Usa la foto" }).click();
  await expect(page.locator(".photo-sheet")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Aggiungi una foto o un video" })).toBeVisible();
});

test("dal computer con la webcam bloccata si spiega cosa fare", async ({ page, isMobile }) => {
  test.skip(isMobile, "Solo da computer");
  await fakeWebcam(page, "negata");
  await openPicker(page);
  await page.getByRole("button", { name: "Scatta con la webcam" }).click();
  await expect(page.locator(".webcam-error")).toContainText("La webcam è bloccata");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Scegli dal computer" }).click();
  await chooser;
});

test("dal computer senza webcam restano telefono e file", async ({ page, isMobile }) => {
  test.skip(isMobile, "Solo da computer");
  await fakeWebcam(page, "assente");
  await openPicker(page);
  await expect(page.getByRole("button", { name: "Scatta con la webcam" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Scatta dal telefono" })).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Scegli dal computer" }).click();
  await chooser;
});

/**
 * "Scatta dal telefono" (docs/changelog/2026-11-16-scatta-dal-telefono.md):
 * il computer mostra il QR, il telefono apre il link e manda la foto, il
 * computer la riceve da solo. Prova vera con l'API e il database.
 */
test("il telefono manda la foto e arriva da sola sul computer", async ({ browser, page, isMobile }) => {
  test.skip(isMobile, "La finestra col QR è del computer");
  await fakeWebcam(page, "assente");
  await openPicker(page);
  await page.getByRole("button", { name: "Scatta dal telefono" }).click();
  const qr = page.getByRole("img", { name: "Codice QR da inquadrare con il telefono" });
  await expect(qr).toBeVisible();
  const url = (await qr.getAttribute("data-link")) ?? "";

  const phone = await browser.newContext({ ...devices["Pixel 7"], storageState: { cookies: [], origins: [] } });
  const tel = await phone.newPage();
  // Il link del QR porta al sito configurato sull'API: qui si apre sullo stesso sito della prova.
  await tel.goto(new URL(new URL(url).pathname, page.url()).toString());
  await expect(tel.getByRole("button", { name: "Scatta una foto" })).toBeEnabled({ timeout: 20_000 });
  await expect(page.getByText("Telefono collegato")).toBeVisible({ timeout: 10_000 });
  // Nella richiesta si possono mandare più foto con lo stesso codice
  // (docs/changelog/2026-11-17-piu-foto-dal-telefono.md): due, una dopo l'altra.
  for (const n of [1, 2]) {
    await tel.locator("input[capture]").setInputFiles({ name: `guasto-${n}.png`, mimeType: "image/png", buffer: PNG });
    await tel.getByRole("button", { name: "Manda al computer" }).click();
    await expect(tel.getByText(n === 1 ? "1 foto è arrivata sul computer" : `${n} foto sono arrivate sul computer`)).toBeVisible();
    await expect(page.getByText(n === 1 ? "1 foto arrivata" : `${n} foto arrivate`)).toBeVisible({ timeout: 10_000 });
  }
  await page.getByRole("button", { name: "Fatto", exact: true }).click();
  await expect(page.locator(".photo-sheet")).toHaveCount(0);
  await expect(page.locator(".guided-photo img, .guided-photo video")).toHaveCount(2);

  // Chiusa la finestra sul computer, lo stesso link non vale più.
  await tel.reload();
  await expect(tel.getByRole("heading", { name: "Questo codice è scaduto" })).toBeVisible();
  await phone.close();
});

/** Un quadrato 8×8 col verde di marca, in PNG. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGOQy87DihiGlgQADTA9wRfymtEAAAAASUVORK5CYII=",
  "base64",
);
