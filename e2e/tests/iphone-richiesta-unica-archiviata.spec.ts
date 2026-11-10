import { test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { checkSingleRequestArchiveAndRestore } from "../fixtures/archiviate";
import { PHONE } from "../fixtures/preventivi";

/**
 * Su iPhone con Safari, archiviando e ripristinando l'unica richiesta la
 * pagina "Le mie richieste" non si poteva più usare
 * (docs/changelog/2026-11-10-ripristino-pagina-bloccata.md). Gira solo nel
 * progetto "iphone-safari" (motore WebKit).
 */
const prisma = new PrismaClient();

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-safari", "Riguarda il motore di Safari.");
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("cliente con una sola richiesta: archivia e ripristina, la pagina resta usabile (iPhone)", async ({ browser }) => {
  await checkSingleRequestArchiveAndRestore(prisma, browser, PHONE, "iphone");
});
