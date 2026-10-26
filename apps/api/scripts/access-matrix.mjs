// Test dei permessi di tutte le rotte (controllo sicurezza, docs/CHANGELOG.md
// §312). Avvia l'API vera dal build (dist/) su un database Postgres di prova,
// crea utenti e dati per ogni ruolo e chiama ogni rotta:
// - senza accesso: 401 su tutto ciò che non è pubblico;
// - admin: ogni ruolo admin e un utente normale, secondo @RequireAdminScope;
// - rotte da professionista chiamate da un cliente: mai una risposta valida;
// - rotte con l'id di qualcosa di altri: 403 o 404 per chi non ne è parte,
//   risposta valida per i proprietari (solo GET).
// Le regole stanno in access-policy.mjs. Svuota il database: parte solo con
// ACCESS_MATRIX_RESET_DB=yes. Uso (dopo `pnpm build` e `prisma migrate deploy`):
//   ACCESS_MATRIX_RESET_DB=yes DATABASE_URL=... node scripts/access-matrix.mjs
import "reflect-metadata";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { listRoutes } from "./lib/list-routes.mjs";
import { POLICY, DEFAULT_STRANGERS } from "./access-policy.mjs";

if (process.env.ACCESS_MATRIX_RESET_DB !== "yes") {
  console.error("Questo test svuota il database: impostare ACCESS_MATRIX_RESET_DB=yes solo su un database di prova.");
  process.exit(2);
}
process.env.JWT_SECRET ??= "access-matrix-secret";
process.env.NODE_ENV = "test";
for (const key of ["STRIPE_SECRET_KEY", "RESEND_API_KEY", "GOOGLE_MAPS_API_KEY", "SENTRY_DSN", "CLOUDINARY_URL", "OPENAPI_TOKEN_RISK", "OPENAPI_TOKEN_COMPANY", "DIDIT_API_KEY"]) {
  delete process.env[key];
}

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@professionisti/database");
const { JwtService } = require("@nestjs/jwt");
const { BadRequestException } = require("@nestjs/common");
const { AppModule } = require("../dist/app.module.js");
const { configureApp } = require("../dist/app-setup.js");
const { ZodValidationPipe } = require("../dist/common/zod-validation.pipe.js");

// Un corpo non valido darebbe 400 prima del controllo di proprietà e il test
// non saprebbe se la rotta è protetta: qui il corpo passa comunque così
// com'è, e decide il servizio. Dove serve, access-policy.mjs dà un corpo valido.
const validate = ZodValidationPipe.prototype.transform;
ZodValidationPipe.prototype.transform = function (value, metadata) {
  try {
    return validate.call(this, value, metadata);
  } catch (err) {
    if (err instanceof BadRequestException) return value ?? {};
    throw err;
  }
};

const prisma = new PrismaClient();
// Allegato "documento" della chat tra clientA e proA (rotta di download, §313).
const ATTACHMENT_URL = "https://res.cloudinary.com/prova/raw/upload/v1/chat/abc123-preventivo.pdf";

async function resetDatabase() {
  const tables = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`);
  if (tables.length > 0) await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

async function seed() {
  const category = await prisma.category.findFirstOrThrow({ orderBy: { slug: "asc" } });
  const verified = new Date();
  const twoFactorSince = new Date(Date.now() - 60_000);
  const user = (key, role, extra = {}) =>
    prisma.user.create({ data: { email: `${key.toLowerCase()}@prova.it`, name: key, role, emailVerifiedAt: verified, ...extra } });
  const users = {
    clientA: await user("clientA", "CLIENT"),
    clientB: await user("clientB", "CLIENT"),
    proA: await user("proA", "PROFESSIONAL"),
    proB: await user("proB", "PROFESSIONAL"),
    // Verifica in due passaggi già attivata (docs/CHANGELOG.md §359).
    adminSuper: await user("adminSuper", "ADMIN", { adminRoles: ["SUPER"], adminTotpEnabledAt: twoFactorSince }),
    adminModerator: await user("adminModerator", "ADMIN", { adminRoles: ["MODERATOR"], adminTotpEnabledAt: twoFactorSince }),
    adminFinance: await user("adminFinance", "ADMIN", { adminRoles: ["FINANCE"], adminTotpEnabledAt: twoFactorSince }),
  };
  const profile = (u, name) =>
    prisma.professionalProfile.create({
      data: { userId: u.id, categoryId: category.id, businessName: name, city: "Latina", latitude: 41.4676, longitude: 12.9037, isDemo: true },
    });
  const profileA = await profile(users.proA, "Ditta A");
  const profileB = await profile(users.proB, "Ditta B");

  // Richiesta aperta di clientA arrivata solo a proA, con preventivo e chat.
  const requestA = await prisma.guidedRequest.create({
    data: { clientId: users.clientA.id, categoryId: category.id, description: "Perdita sotto il lavandino", city: "Latina", address: "Via Roma 1" },
  });
  const leadA = await prisma.lead.create({ data: { guidedRequestId: requestA.id, professionalProfileId: profileA.id, priceEurCents: 0 } });
  const start = new Date(Date.now() + 7 * 86_400_000);
  const quoteA = await prisma.quote.create({
    data: { guidedRequestId: requestA.id, professionalProfileId: profileA.id, estimatedStartDate: start, items: { create: [{ name: "Manodopera" }] } },
  });
  await prisma.conversationEvent.create({
    data: { guidedRequestId: requestA.id, professionalProfileId: profileA.id, actor: "PROFESSIONAL", message: "Buongiorno", mediaUrls: [ATTACHMENT_URL] },
  });

  // Lavoro già accettato tra clientA e proA, con pagamento diretto.
  const requestDone = await prisma.guidedRequest.create({
    data: { clientId: users.clientA.id, categoryId: category.id, description: "Presa da sostituire", city: "Latina" },
  });
  await prisma.lead.create({ data: { guidedRequestId: requestDone.id, professionalProfileId: profileA.id, priceEurCents: 0, status: "CONVERTED" } });
  const quoteDone = await prisma.quote.create({
    data: { guidedRequestId: requestDone.id, professionalProfileId: profileA.id, estimatedStartDate: start, status: "ACCEPTED" },
  });
  const bookingA = await prisma.booking.create({
    data: {
      quoteId: quoteDone.id,
      clientId: users.clientA.id,
      professionalProfileId: profileA.id,
      scheduledAt: start,
      status: "CONFIRMED",
      recipientPhone: "+393331234567",
      street: "Via Roma",
      houseNumber: "1",
      city: "Latina",
    },
  });
  await prisma.jobPayment.create({ data: { bookingId: bookingA.id, paymentMethod: "DIRECT", grossAmountEurCents: 10000, netAmountEurCents: 10000 } });

  const notificationA = await prisma.notification.create({ data: { userId: users.clientA.id, channel: "PUSH", type: "QUOTE_RECEIVED", payload: {} } });
  const externalJobA = await prisma.externalJob.create({ data: { professionalProfileId: profileA.id, clientName: "Cliente esterno", scheduledAt: start } });
  const reportA = await prisma.contentReport.create({
    data: {
      reporterId: users.clientB.id,
      targetType: "PROFESSIONAL_PROFILE",
      targetId: profileA.id,
      reason: "OTHER",
      status: "RESOLVED",
      contentOwnerId: users.proA.id,
      resolvedAt: new Date(),
    },
  });

  return {
    users,
    ids: {
      attachmentUrl: ATTACHMENT_URL,
      profileA: profileA.id,
      profileB: profileB.id,
      requestA: requestA.id,
      leadA: leadA.id,
      quoteA: quoteA.id,
      bookingA: bookingA.id,
      notificationA: notificationA.id,
      externalJobA: externalJobA.id,
      reportA: reportA.id,
    },
  };
}

const DUMMY_PARAMS = { id: randomUUID(), file: "abcdefghijklmnopqrstuvwxyz.ics", date: "2030-01-01", token: "x".repeat(43), part: "deposit" };

function fillPath(path, params) {
  return path.replace(/:(\w+)/g, (_, name) => encodeURIComponent(params[name] ?? DUMMY_PARAMS[name] ?? randomUUID()));
}

let ipCounter = 0;
async function call(base, route, url, { token, body, readBody = false } = {}) {
  ipCounter += 1;
  // Un IP diverso a ogni chiamata (l'API si fida di X-Forwarded-For come su
  // Render): i limiti al minuto non devono falsare il test.
  const headers = { "X-Forwarded-For": `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}` };
  if (token) headers.Authorization = `Bearer ${token}`;
  const method = route.httpMethod;
  const init = { method, headers, signal: AbortSignal.timeout(10_000), redirect: "manual" };
  if (method !== "GET" && method !== "DELETE") {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body ?? {});
  }
  try {
    const res = await fetch(base + url, init);
    if (readBody) return { status: res.status, text: await res.text() };
    // Lo stream in tempo reale con 200 resterebbe aperto: basta lo stato.
    await res.body?.cancel();
    return res.status;
  } catch (err) {
    return `errore: ${err.message}`;
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Vero se la risposta contiene almeno un valore diverso da vuoto, zero o falso. */
function carriesData(text) {
  if (!text || !text.trim()) return false;
  const walk = (value) => {
    if (value === null || value === false || value === 0 || value === "") return false;
    if (Array.isArray(value)) return value.some(walk);
    if (typeof value === "object") return Object.values(value).some(walk);
    return true;
  };
  const parsed = safeJson(text);
  return parsed === null ? true : walk(parsed);
}

const ok = (status) => typeof status === "number" && status >= 200 && status < 300;
const denied = (status) => status === 403 || status === 404;

function adminAllowed(roles, scope) {
  if (roles.includes("SUPER") || scope === "ANY") return true;
  if (scope === "MODERATION") return roles.includes("MODERATOR");
  if (scope === "FINANCE") return roles.includes("FINANCE");
  return false;
}

async function main() {
  await resetDatabase();
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger: ["error"] });
  configureApp(app);
  await app.listen(0, "127.0.0.1");
  const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
  const { users, ids } = await seed();
  const jwt = app.get(JwtService, { strict: false });
  // Gli admin hanno appena dato il codice dell'app (`amfa`); `adminSuperNoCode` è lo stesso super admin senza codice.
  const amfa = Math.floor(Date.now() / 1000);
  const tokens = Object.fromEntries(
    Object.entries(users).map(([key, u]) => [key, jwt.sign({ sub: u.id, sv: u.sessionVersion, ...(u.role === "ADMIN" ? { amfa } : {}) })]),
  );
  tokens.adminSuperNoCode = jwt.sign({ sub: users.adminSuper.id, sv: users.adminSuper.sessionVersion });

  const routes = listRoutes(app);
  const failures = [];
  let checks = 0;
  const fail = (route, message) => failures.push(`${route.method} ${route.path}: ${message}`);
  const expect = (route, condition, message) => {
    checks += 1;
    if (!condition) fail(route, message);
  };

  for (const route of routes) {
    const key = `${route.method} ${route.path}`;
    const isAdmin = route.guards.includes("AdminGuard");
    const policy = POLICY[key];
    if (!policy && !isAdmin) {
      fail(route, "rotta nuova senza regola: aggiungila in scripts/access-policy.mjs");
      continue;
    }
    if (policy && isAdmin) fail(route, "rotta admin anche in access-policy.mjs: toglila da lì");
    if (policy?.kind === "public") {
      expect(route, route.guards.length === 0, `dichiarata pubblica ma ha ${route.guards.join(", ")}`);
      continue;
    }
    if (policy?.kind !== "ticket") expect(route, route.guards.includes("JwtAuthGuard"), "non pubblica ma senza JwtAuthGuard");

    const params = policy?.params ? policy.params(ids) : {};
    const query = policy?.query ? `?${new URLSearchParams(policy.query(ids))}` : "";
    const url = fillPath(route.path, params) + query;

    const anonymous = await call(base, route, url, { body: policy?.body?.(ids, null) });
    expect(route, anonymous === 401, `senza accesso risponde ${anonymous}, atteso 401`);

    if (isAdmin) {
      const scope = String(route.adminScope).replace(" (implicito)", "");
      for (const actor of ["clientA", "proA", "adminSuper", "adminModerator", "adminFinance"]) {
        const roles = users[actor].adminRoles ?? [];
        const allowed = users[actor].role === "ADMIN" && adminAllowed(roles, scope);
        // Solo le GET con i permessi giusti: le altre cambierebbero i dati di prova.
        if (allowed && route.httpMethod !== "GET") continue;
        const status = await call(base, route, url, { token: tokens[actor] });
        if (allowed) expect(route, status !== 401 && status !== 403, `${actor} (permesso ${scope}) riceve ${status}`);
        else expect(route, status === 403, `${actor} riceve ${status}, atteso 403 (permesso ${scope})`);
      }
      // Senza il codice della verifica in due passaggi nessuna rotta admin risponde, neanche al super admin.
      const noCode = await call(base, route, url, { token: tokens.adminSuperNoCode, body: route.httpMethod === "GET" ? undefined : {} });
      expect(route, noCode === 403, `super admin senza codice dell'app riceve ${noCode}, atteso 403`);
      continue;
    }

    if (policy.kind === "self" && policy.role === "professional") {
      // Una risposta vuota o di soli zeri va bene: il cliente non vede dati di nessuno.
      const { status, text } = await call(base, route, url, { token: tokens.clientA, body: {}, readBody: true });
      expect(route, !ok(status) || !carriesData(text), `un cliente riceve ${status} con dei dati: dovrebbe essere riservata ai professionisti`);
    }

    if (policy.kind === "self" && policy.role === "admin") {
      for (const actor of ["clientA", "proA"]) {
        const status = await call(base, route, url, { token: tokens[actor], body: { code: "123456" } });
        expect(route, status === 403, `${actor} riceve ${status}, atteso 403: riservata agli admin`);
      }
    }

    if (policy.kind === "owned") {
      for (const actor of policy.strangers ?? DEFAULT_STRANGERS) {
        const { status, text } = await call(base, route, url, { token: tokens[actor], body: policy.body?.(ids, actor), readBody: true });
        if (status === 404 && /^Cannot [A-Z]+ /.test(safeJson(text)?.message ?? "")) {
          expect(route, false, `${actor} riceve "rotta inesistente": indirizzo costruito male nel test`);
        } else if (status === 400) {
          expect(route, false, `${actor} riceve 400: il controllo di proprietà non è stato raggiunto, dai un corpo valido in access-policy.mjs`);
        } else {
          expect(route, denied(status), `${actor} (estraneo) riceve ${status}, atteso 403 o 404`);
        }
      }
      if (route.httpMethod === "GET") {
        for (const actor of policy.owners) {
          const status = await call(base, route, url, { token: tokens[actor] });
          // `ownerPassesCheck`: dopo il controllo di proprietà la rotta usa un
          // servizio esterno spento nel test, basta che non neghi l'accesso.
          const passed = policy.ownerPassesCheck ? typeof status === "number" && !denied(status) && status !== 401 : ok(status);
          expect(route, passed, `${actor} (proprietario) riceve ${status}: dati di prova sbagliati o rotta rotta`);
        }
      }
    }
  }

  await app.close();
  await prisma.$disconnect();
  console.log(`Test dei permessi: ${routes.length} rotte, ${checks} controlli.`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} problemi:\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }
  console.log("Nessun problema.");
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
