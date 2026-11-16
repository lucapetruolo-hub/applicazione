import { expect, test, type Page } from "@playwright/test";

/**
 * Foto con la webcam dal computer (docs/changelog/2026-11-16-webcam-da-computer.md):
 * dal computer con una webcam il pulsante foto offre "Scatta con la webcam" e
 * "Scegli dal computer"; senza webcam si apre subito la scelta del file; con
 * il permesso negato si spiega cosa fare. La webcam è simulata con un disegno
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

test("dal computer senza webcam si apre subito la scelta del file", async ({ page, isMobile }) => {
  test.skip(isMobile, "Solo da computer");
  await fakeWebcam(page, "assente");
  await page.goto("/preventivo");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Aggiungi una foto del problema" }).click();
  await chooser;
  await expect(page.locator(".photo-sheet")).toHaveCount(0);
});
