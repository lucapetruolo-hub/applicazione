// Controllo in CI che l'API si avvii: costruisce il grafo dei moduli Nest
// dal build (dist/) senza database né porte. Fallisce con un modulo
// `undefined` negli imports (import circolare tra file, docs/CHANGELOG.md
// §218) o un provider che non si risolve. Lanciare dopo `nest build`.
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { AppModule } = require("../dist/app.module.js");

try {
  // preview: niente istanze né hook di avvio (quindi niente connessione
  // al database), ma scansione dei moduli e risoluzione delle dipendenze sì.
  const app = await NestFactory.create(AppModule, { preview: true, abortOnError: false, logger: ["error"] });
  await app.close();
  console.log("Avvio API: grafo dei moduli valido.");
  process.exit(0);
} catch (err) {
  console.error("Avvio API fallito:\n", err);
  process.exit(1);
}
