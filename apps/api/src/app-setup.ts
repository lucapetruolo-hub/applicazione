import * as express from "express";
import type { NestExpressApplication } from "@nestjs/platform-express";

/**
 * Impostazioni dell'app comuni all'avvio vero (main.ts) e al test dei
 * permessi nella CI (scripts/access-matrix.mjs, docs/CHANGELOG.md §312):
 * il test deve vedere l'API esattamente come la vede Render.
 */
export function configureApp(app: NestExpressApplication): void {
  // Render (come ogni hosting dietro un proxy) inoltra le richieste da un
  // solo IP interno: senza "trust proxy" il rate limiting (ThrottlerGuard,
  // Fase 6) userebbe quell'IP del proxy per tutti gli utenti, azzerando la
  // protezione (un solo client abusivo blocca tutti) invece di limitare per
  // singolo IP reale — Express deve fidarsi dell'header X-Forwarded-For.
  app.set("trust proxy", 1);
  // Parametri dell'indirizzo solo come testo (controllo sicurezza, §292): con
  // il formato esteso `?category[contains]=` diventava un oggetto passato
  // così com'è ai filtri del database.
  app.set("query parser", "simple");
  app.disable("x-powered-by");
  // Intestazioni di sicurezza di base (l'API risponde solo JSON e file
  // scaricati): niente riquadri in altri siti, niente indovinare il tipo di file.
  app.use((_req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    // Solo HTTPS anche per l'API, come il sito (test di sicurezza del 25/11).
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
    next();
  });
  // `inflate: false` (docs/CHANGELOG.md §313): nessun client manda corpi
  // compressi, e decomprimerli era un modo noto di bloccare body-parser con
  // una richiesta fatta apposta (risposta 415). Niente lettore dei moduli
  // `urlencoded`: l'API riceve solo JSON, e quel lettore usava `qs`, con
  // altre falle note.
  app.use("/billing/webhook", express.raw({ type: "application/json", inflate: false }));
  // Webhook della verifica d'identità (Didit, docs/CHANGELOG.md §253): firma sul body raw.
  app.use("/identity-verification/webhook", express.raw({ type: "application/json", inflate: false }));
  // Webhook di WhatsApp (Meta): firma X-Hub-Signature-256 sul body raw.
  app.use("/whatsapp/webhook", express.raw({ type: "application/json", inflate: false }));
  app.use(express.json({ inflate: false }));
  // Carattere nullo (\0) nell'indirizzo o nel corpo: Postgres non lo accetta
  // e la richiesta finiva in un errore 500 (e in Sentry). Test di sicurezza
  // del 25/11, docs/changelog/2026-11-25-correzioni-test-sicurezza.md.
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (/%00/i.test(req.originalUrl) || containsNullCharacter(req.body)) {
      res.status(400).json({ statusCode: 400, message: "La richiesta contiene un carattere non valido.", error: "Bad Request" });
      return;
    }
    next();
  });
  // Ristretto a FRONTEND_URL (CTO — audit sicurezza, checklist esterna
  // verificata contro il codice reale): `enableCors()` senza argomenti
  // accetta qualunque origine, un'API con JWT in localStorage letto da
  // qualsiasi sito. Stesso fallback a localhost:3000 già usato altrove
  // nel progetto quando FRONTEND_URL non è impostata (sviluppo locale).
  app.enableCors({ origin: process.env.FRONTEND_URL ?? "http://localhost:3000", credentials: true });
}

/** Un testo con il carattere nullo, anche dentro oggetti e liste (i corpi grezzi dei webhook restano fuori). */
export function containsNullCharacter(value: unknown, depth = 0): boolean {
  if (typeof value === "string") return value.includes("\u0000");
  if (depth > 20 || value === null || typeof value !== "object" || Buffer.isBuffer(value)) return false;
  if (Array.isArray(value)) return value.some((item) => containsNullCharacter(item, depth + 1));
  return Object.entries(value).some(([key, item]) => key.includes("\u0000") || containsNullCharacter(item, depth + 1));
}
