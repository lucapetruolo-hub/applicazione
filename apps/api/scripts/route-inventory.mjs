// Elenco completo delle rotte dell'API con guard, permesso admin e limite
// (controllo sicurezza, docs/CHANGELOG.md §293). Legge i metadati di Nest dal
// build (dist/) senza database: `node scripts/route-inventory.mjs [--json]`.
import "reflect-metadata";
import { NestFactory, ModulesContainer } from "@nestjs/core";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { AppModule } = require("../dist/app.module.js");
const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "ALL", "OPTIONS", "HEAD", "SEARCH"];

const app = await NestFactory.create(AppModule, { preview: true, abortOnError: false, logger: false });
const routes = [];
for (const module of app.get(ModulesContainer).values()) {
  for (const wrapper of module.controllers.values()) {
    const controller = wrapper.metatype;
    if (!controller) continue;
    const base = [Reflect.getMetadata("path", controller)].flat().filter((p) => p !== undefined)[0] ?? "";
    const classGuards = (Reflect.getMetadata("__guards__", controller) ?? []).map((g) => g.name);
    const classScope = Reflect.getMetadata("adminScope", controller);
    for (const name of Object.getOwnPropertyNames(controller.prototype)) {
      const handler = controller.prototype[name];
      if (name === "constructor" || typeof handler !== "function") continue;
      const path = Reflect.getMetadata("path", handler);
      const method = Reflect.getMetadata("method", handler);
      if (path === undefined || method === undefined) continue;
      const guards = [...classGuards, ...(Reflect.getMetadata("__guards__", handler) ?? []).map((g) => g.name)];
      const throttle = Reflect.getMetadata("THROTTLER:LIMITdefault", handler) ?? Reflect.getMetadata("THROTTLER:LIMITdefault", controller);
      const skipThrottle = Reflect.getMetadata("THROTTLER:SKIPdefault", handler) === true;
      const sse = Reflect.getMetadata("__sse__", handler) === true;
      const full = `/${[base, path].flat().filter(Boolean).join("/")}`.replace(/\/+/g, "/").replace(/(.)\/$/, "$1");
      routes.push({
        method: sse ? "SSE" : METHODS[method],
        path: full,
        controller: controller.name,
        handler: name,
        guards,
        adminScope: Reflect.getMetadata("adminScope", handler) ?? classScope ?? (guards.includes("AdminGuard") ? "ANY (implicito)" : null),
        throttlePerMinute: skipThrottle ? "nessuno" : (throttle ?? 60),
      });
    }
  }
}
await app.close();
routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(routes, null, 2));
} else {
  console.log("| Metodo | Rotta | Accesso | Permesso admin | Limite/min |\n|---|---|---|---|---|");
  for (const r of routes) {
    const access = r.guards.length ? r.guards.join(" + ") : "pubblica";
    console.log(`| ${r.method} | \`${r.path}\` | ${access} | ${r.adminScope ?? ""} | ${r.throttlePerMinute} |`);
  }
  console.log(`\n${routes.length} rotte.`);
}
process.exit(0);
