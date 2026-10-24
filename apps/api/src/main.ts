import "dotenv/config";
// Prima di tutti gli altri import (richiesto da Sentry), subito dopo le env.
import "./instrument";
import "reflect-metadata";
import * as express from "express";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";

async function bootstrap() {
  // Senza JWT_SECRET l'API userebbe la chiave di sviluppo scritta nel codice
  // e chiunque potrebbe crearsi un accesso (controllo sicurezza,
  // docs/CHANGELOG.md §290): online meglio non partire. Render imposta da
  // solo RENDER=true.
  const deployed = process.env.NODE_ENV === "production" || process.env.RENDER === "true";
  if (deployed && !process.env.JWT_SECRET?.trim()) {
    throw new Error("JWT_SECRET mancante: l'API non parte senza la chiave delle sessioni.");
  }
  // Body parser disabilitato di default: il webhook Stripe ha bisogno del
  // body raw (non parsato) per verificare la firma, quindi lo montiamo
  // manualmente solo su quella rotta, prima del parser JSON globale
  // (CLAUDE.md §2 — Stripe è già nello stack approvato).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  // Render (come ogni hosting dietro un proxy) inoltra le richieste da un
  // solo IP interno: senza "trust proxy" il rate limiting (ThrottlerGuard,
  // Fase 6) userebbe quell'IP del proxy per tutti gli utenti, azzerando la
  // protezione (un solo client abusivo blocca tutti) invece di limitare per
  // singolo IP reale — Express deve fidarsi dell'header X-Forwarded-For.
  app.set("trust proxy", 1);
  // Parametri dell'indirizzo solo come testo (controllo sicurezza, §290): con
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
  app.use("/billing/webhook", express.raw({ type: "application/json" }));
  // Webhook della verifica d'identità (Didit, docs/CHANGELOG.md §253): firma sul body raw.
  app.use("/identity-verification/webhook", express.raw({ type: "application/json" }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  // Ristretto a FRONTEND_URL (CTO — audit sicurezza, checklist esterna
  // verificata contro il codice reale): `enableCors()` senza argomenti
  // accetta qualunque origine, un'API con JWT in localStorage letto da
  // qualsiasi sito. Stesso fallback a localhost:3000 già usato altrove
  // nel progetto quando FRONTEND_URL non è impostata (sviluppo locale).
  app.enableCors({ origin: process.env.FRONTEND_URL ?? "http://localhost:3000", credentials: true });
  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  // "0.0.0.0" esplicito: su alcune piattaforme cloud (Render inclusa)
  // app.listen(port) senza host può legarsi solo a IPv6, irraggiungibile
  // dal proxy pubblico che si connette via IPv4 — da qui "Application
  // failed to respond" pur con il processo avviato correttamente.
  await app.listen(port, "0.0.0.0");
  console.log(`API in ascolto su 0.0.0.0:${port}`);
}

bootstrap();
