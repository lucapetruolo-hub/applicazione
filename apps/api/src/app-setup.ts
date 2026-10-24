import * as express from "express";
import type { NestExpressApplication } from "@nestjs/platform-express";

/**
 * Impostazioni dell'app comuni all'avvio vero (main.ts) e al test dei
 * permessi nella CI (scripts/access-matrix.mjs, docs/CHANGELOG.md §303):
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
    next();
  });
  // `inflate: false` (docs/CHANGELOG.md §304): nessun client manda corpi
  // compressi, e decomprimerli era un modo noto di bloccare body-parser con
  // una richiesta fatta apposta (risposta 415). Niente lettore dei moduli
  // `urlencoded`: l'API riceve solo JSON, e quel lettore usava `qs`, con
  // altre falle note.
  app.use("/billing/webhook", express.raw({ type: "application/json", inflate: false }));
  // Webhook della verifica d'identità (Didit, docs/CHANGELOG.md §253): firma sul body raw.
  app.use("/identity-verification/webhook", express.raw({ type: "application/json", inflate: false }));
  app.use(express.json({ inflate: false }));
  // Ristretto a FRONTEND_URL (CTO — audit sicurezza, checklist esterna
  // verificata contro il codice reale): `enableCors()` senza argomenti
  // accetta qualunque origine, un'API con JWT in localStorage letto da
  // qualsiasi sito. Stesso fallback a localhost:3000 già usato altrove
  // nel progetto quando FRONTEND_URL non è impostata (sviluppo locale).
  app.enableCors({ origin: process.env.FRONTEND_URL ?? "http://localhost:3000", credentials: true });
}
