import "dotenv/config";
import "reflect-metadata";
import * as express from "express";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  // Body parser disabilitato di default: il webhook Stripe ha bisogno del
  // body raw (non parsato) per verificare la firma, quindi lo montiamo
  // manualmente solo su quella rotta, prima del parser JSON globale
  // (CLAUDE.md §2 — Stripe è già nello stack approvato).
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use("/billing/webhook", express.raw({ type: "application/json" }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.enableCors();
  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  // "0.0.0.0" esplicito: su alcune piattaforme cloud (Railway inclusa)
  // app.listen(port) senza host può legarsi solo a IPv6, irraggiungibile
  // dal proxy pubblico che si connette via IPv4 — da qui "Application
  // failed to respond" pur con il processo avviato correttamente.
  await app.listen(port, "0.0.0.0");
  console.log(`API in ascolto su 0.0.0.0:${port}`);
}

bootstrap();
