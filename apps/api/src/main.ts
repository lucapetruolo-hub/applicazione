import "dotenv/config";
// Prima di tutti gli altri import (richiesto da Sentry), subito dopo le env.
import "./instrument";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { configureApp } from "./app-setup";

async function bootstrap() {
  // Senza JWT_SECRET l'API userebbe la chiave di sviluppo scritta nel codice
  // e chiunque potrebbe crearsi un accesso (controllo sicurezza,
  // docs/CHANGELOG.md §292): online meglio non partire. Render imposta da
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
  configureApp(app);
  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  // "0.0.0.0" esplicito: su alcune piattaforme cloud (Render inclusa)
  // app.listen(port) senza host può legarsi solo a IPv6, irraggiungibile
  // dal proxy pubblico che si connette via IPv4 — da qui "Application
  // failed to respond" pur con il processo avviato correttamente.
  await app.listen(port, "0.0.0.0");
  console.log(`API in ascolto su 0.0.0.0:${port}`);
}

bootstrap();
