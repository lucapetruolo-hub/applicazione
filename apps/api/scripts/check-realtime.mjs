// Controllo in CI che lo stream in tempo reale consegni davvero gli eventi
// (docs/CHANGELOG.md §330-§331): il 24/10/2026, con due copie di rxjs e
// l'interceptor globale di Sentry, `GET /realtime/stream` rispondeva 200 ma
// mandava un evento vuoto, e nessuna notifica arrivava più. Avvia il
// controller vero dal build (dist/) con `SentryModule`, come in produzione,
// senza database. Lanciare dopo `nest build`.
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_FILTER, NestFactory } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { SentryGlobalFilter, SentryModule } from "@sentry/nestjs/setup";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { RealtimeController, RealtimeTicketGuard } = require("../dist/realtime/realtime.controller.js");
const { RealtimeService } = require("../dist/realtime/realtime.service.js");
const { RealtimeTickets } = require("../dist/realtime/realtime-tickets.js");
const { PRISMA } = require("../dist/prisma/prisma.module.js");
const { configureApp } = require("../dist/app-setup.js");

const prisma = { user: { findUnique: async () => ({ suspendedAt: null, sessionVersion: 0 }) } };

class CheckModule {}
Module({
  imports: [SentryModule.forRoot(), JwtModule.register({ secret: "check-realtime" })],
  controllers: [RealtimeController],
  providers: [RealtimeService, RealtimeTickets, RealtimeTicketGuard, { provide: PRISMA, useValue: prisma }, { provide: APP_FILTER, useClass: SentryGlobalFilter }],
})(CheckModule);

const app = await NestFactory.create(CheckModule, { logger: ["error"], abortOnError: false, bodyParser: false });
configureApp(app);
await app.listen(0, "127.0.0.1");
const { port } = app.getHttpServer().address();
const ticket = app.get(RealtimeTickets).issue({ userId: "check", sessionVersion: 0 });
const event = { kind: "notification", notification: { id: "check", type: "CHECK", payload: {}, createdAt: new Date().toISOString() } };
setTimeout(() => app.get(RealtimeService).publish("check", event), 300);

const abort = new AbortController();
const timer = setTimeout(() => abort.abort(), 3000);
let received = "";
try {
  const response = await fetch(`http://127.0.0.1:${port}/realtime/stream?ticket=${ticket}`, { signal: abort.signal });
  const reader = response.body.getReader();
  while (!received.includes('"id":"check"')) {
    const { value, done } = await reader.read();
    if (done) break;
    received += Buffer.from(value).toString();
  }
} catch {
  // timeout: si valuta quello che è arrivato
}
clearTimeout(timer);
abort.abort();
await app.close();

const data = received.split("\n").find((line) => line.startsWith("data: "));
if (!data || JSON.parse(data.slice("data: ".length)).notification?.id !== "check") {
  console.error(`Stream in tempo reale senza eventi. Ricevuto: ${JSON.stringify(received)}`);
  process.exit(1);
}
console.log("Stream in tempo reale: l'evento arriva completo.");
process.exit(0);
