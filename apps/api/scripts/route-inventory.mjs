// Elenco completo delle rotte dell'API con guard, permesso admin e limite
// (controllo sicurezza, docs/CHANGELOG.md §293). Legge i metadati di Nest dal
// build (dist/) senza database: `node scripts/route-inventory.mjs [--json]`.
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { createRequire } from "node:module";
import { listRoutes } from "./lib/list-routes.mjs";

const require = createRequire(import.meta.url);
const { AppModule } = require("../dist/app.module.js");

const app = await NestFactory.create(AppModule, { preview: true, abortOnError: false, logger: false });
const routes = listRoutes(app);
await app.close();
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
