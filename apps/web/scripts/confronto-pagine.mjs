// Confronto delle pagine prima/dopo un aggiornamento importante (Next.js,
// React, Tamagui...): fotografa tutte le pagine del sito a pagina intera, da
// computer (1440px) e da telefono (390px), e confronta due giri pixel per
// pixel (docs/CHANGELOG.md §298).
//
//   node scripts/confronto-pagine.mjs foto <cartella>
//   node scripts/confronto-pagine.mjs confronta <cartella-prima> <cartella-dopo>
//
// Serve il sito avviato (`pnpm build && pnpm start`) con l'API e un database
// di prova (`pnpm --filter @professionisti/database seed`). Variabili:
//   SITO                 indirizzo del sito (predefinito http://localhost:3000)
//   TOKEN_CLIENTE        sessione di un cliente (risposta di POST /auth/login)
//   TOKEN_PROFESSIONISTA sessione di un professionista
//   TOKEN_ADMIN          sessione di un admin
//   PROFESSIONISTA_ID    id di un profilo pubblico da fotografare
//   CHROMIUM             percorso di Chromium, se Playwright non lo trova da solo
// Senza un token quel gruppo di pagine si salta. Ogni giro scrive anche
// `report.json` con stato HTTP, indirizzo finale ed errori della console.
import { chromium } from "playwright";
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SITE = (process.env.SITO ?? "http://localhost:3000").replace(/\/$/, "");

const PAGES = {
  pubbliche: [
    "/", "/accedi", "/registrati", "/registrati?ruolo=PROFESSIONAL", "/accessibilita", "/contatti", "/cookie", "/faq",
    "/per-professionisti", "/per-professionisti/pagamenti", "/privacy", "/sicurezza", "/termini",
    "/password-dimenticata", "/reimposta-password", "/conferma-email", "/completa-profilo", "/preventivo",
    "/preventivo?categoria=idraulico&citta=Roma", "/urgente", "/cerca", "/cerca?citta=Roma", "/cerca?online=1",
    "/cerca/idraulico", "/cerca/idraulico/roma", "/cerca/idraulico?citta=Roma", "/cerca/idraulico?online=1",
    "/cerca/categoria-finta", "/cerca/idraulico/citta-finta", "/professionista/profilo-finto", "/pagina-finta",
    ...(process.env.PROFESSIONISTA_ID ? [`/professionista/${process.env.PROFESSIONISTA_ID}`] : []),
  ],
  cliente: ["/account", "/account/notifiche", "/le-mie-richieste", "/le-mie-recensioni", "/professionisti-salvati", "/segnalazioni", "/chat"],
  professionista: [
    "/dashboard", "/dashboard/abbonamento", "/dashboard/agenda", "/dashboard/fiscale", "/dashboard/fiscale/dac7",
    "/dashboard/profilo", "/dashboard/richieste", "/dashboard/statistiche", "/dashboard/verifica-identita", "/chat",
  ],
  admin: [
    "/admin", "/admin/chat", "/admin/finanza", "/admin/lavori", "/admin/lista-attesa", "/admin/messaggi", "/admin/pagamenti",
    "/admin/problemi", "/admin/professionisti", "/admin/promuovi", "/admin/registro", "/admin/richieste-eliminate",
    "/admin/richieste-generali", "/admin/segnalazioni", "/admin/statistiche", "/admin/utenti", "/admin/verifiche",
  ],
};
const TOKENS = {
  pubbliche: null,
  cliente: process.env.TOKEN_CLIENTE,
  professionista: process.env.TOKEN_PROFESSIONISTA,
  admin: process.env.TOKEN_ADMIN,
};
const SCREENS = {
  computer: { viewport: { width: 1440, height: 900 } },
  telefono: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
};
// Chiave della sessione nel browser (src/lib/AuthContext.tsx).
const TOKEN_STORAGE_KEY = "professionisti_token";

const launch = () => chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const fileName = (screen, group, url) => `${screen}__${group}__${url.replace(/[^a-z0-9]+/gi, "_")}.png`;

async function takePhotos(outDir) {
  mkdirSync(outDir, { recursive: true });
  const browser = await launch();
  const report = [];
  for (const [screen, options] of Object.entries(SCREENS)) {
    for (const [group, urls] of Object.entries(PAGES)) {
      if (group !== "pubbliche" && !TOKENS[group]) continue;
      const context = await browser.newContext({ ...options, reducedMotion: "reduce", locale: "it-IT", timezoneId: "Europe/Rome" });
      await context.addInitScript(
        ([key, token]) => {
          try {
            if (token) localStorage.setItem(key, token);
          } catch {
            // archiviazione non disponibile: si fotografa da ospite
          }
        },
        [TOKEN_STORAGE_KEY, TOKENS[group]],
      );
      for (const url of urls) {
        const page = await context.newPage();
        const errors = [];
        page.on("console", (message) => message.type() === "error" && errors.push(message.text().slice(0, 300)));
        page.on("pageerror", (error) => errors.push(`Errore nella pagina: ${String(error).slice(0, 300)}`));
        let status = null;
        try {
          const response = await page.goto(SITE + url, { waitUntil: "networkidle", timeout: 45_000 });
          status = response?.status() ?? null;
        } catch (error) {
          errors.push(`Caricamento non riuscito: ${String(error).slice(0, 200)}`);
        }
        await page.waitForTimeout(1500);
        await page
          .addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" })
          .catch(() => {});
        await page.screenshot({ path: join(outDir, fileName(screen, group, url)), fullPage: true }).catch((error) => errors.push(String(error)));
        report.push({ screen, group, url, status, finalUrl: page.url().replace(SITE, ""), errors });
        await page.close();
      }
      await context.close();
    }
  }
  await browser.close();
  writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
  const withErrors = report.filter((entry) => entry.errors.some((error) => !error.includes("404")));
  console.log(`${report.length} foto in ${outDir}. Pagine con errori in console (esclusi i 404): ${withErrors.length}`);
  for (const entry of withErrors) console.log(`  ${entry.screen} ${entry.url}: ${entry.errors.join(" | ")}`);
}

/** Confronto nel browser stesso (canvas): nessuna libreria di immagini in più. */
async function compare(beforeDir, afterDir) {
  const diffDir = join(afterDir, "differenze");
  mkdirSync(diffDir, { recursive: true });
  const browser = await launch();
  const page = await browser.newPage();
  const names = readdirSync(afterDir).filter((name) => name.endsWith(".png"));
  const changed = [];
  for (const name of names) {
    if (!existsSync(join(beforeDir, name))) {
      changed.push(`${name}: manca nel giro "prima"`);
      continue;
    }
    const toDataUrl = (dir) => `data:image/png;base64,${readFileSync(join(dir, name)).toString("base64")}`;
    const result = await page.evaluate(
      async ([before, after]) => {
        const load = (src) =>
          new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = src;
          });
        const [a, b] = await Promise.all([load(before), load(after)]);
        if (a.width !== b.width || a.height !== b.height) return { size: `${a.width}×${a.height} → ${b.width}×${b.height}` };
        const pixels = (image) => {
          const canvas = new OffscreenCanvas(image.width, image.height);
          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, image.width, image.height);
        };
        const pa = pixels(a);
        const pb = pixels(b);
        // Foto "dopo" schiarita, con i pixel diversi in rosso.
        const out = new ImageData(b.width, b.height);
        let different = 0;
        for (let i = 0; i < pb.data.length; i += 4) {
          const same = pa.data[i] === pb.data[i] && pa.data[i + 1] === pb.data[i + 1] && pa.data[i + 2] === pb.data[i + 2];
          if (!same) different += 1;
          out.data[i] = same ? 128 + pb.data[i] / 2 : 255;
          out.data[i + 1] = same ? 128 + pb.data[i + 1] / 2 : 0;
          out.data[i + 2] = same ? 128 + pb.data[i + 2] / 2 : 0;
          out.data[i + 3] = 255;
        }
        if (different === 0) return { different };
        const canvas = new OffscreenCanvas(b.width, b.height);
        canvas.getContext("2d").putImageData(out, 0, 0);
        const blob = await canvas.convertToBlob({ type: "image/png" });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return { different, png: btoa(binary) };
      },
      [toDataUrl(beforeDir), toDataUrl(afterDir)],
    );
    if (result.size) changed.push(`${name}: dimensioni diverse (${result.size})`);
    else if (result.different > 0) {
      writeFileSync(join(diffDir, name), Buffer.from(result.png, "base64"));
      changed.push(`${name}: ${result.different} pixel diversi`);
    }
  }
  await browser.close();
  console.log(`${names.length - changed.length} foto identiche su ${names.length}.`);
  for (const line of changed) console.log(`  ${line}`);
  if (changed.length > 0) console.log(`Pixel diversi in rosso in ${diffDir}`);
}

const [command, first, second] = process.argv.slice(2);
if (command === "foto" && first) await takePhotos(first);
else if (command === "confronta" && first && second) await compare(first, second);
else {
  console.log("Uso: node scripts/confronto-pagine.mjs foto <cartella> | confronta <cartella-prima> <cartella-dopo>");
  process.exit(1);
}
