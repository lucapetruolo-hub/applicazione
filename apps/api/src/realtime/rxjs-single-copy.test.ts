import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

/**
 * Con due copie di rxjs NestJS non riconosce l'Observable restituito da
 * `@Sse()` (controlla `instanceof` con la sua copia) e, appena c'è un
 * interceptor globale come quello di Sentry, manda un evento vuoto al posto
 * dello stream: niente messaggi né notifiche in tempo reale
 * (docs/CHANGELOG.md §330). La versione unica sta negli `overrides` di
 * pnpm-workspace.yaml.
 */
describe("rxjs", () => {
  it("l'API e NestJS usano la stessa copia", () => {
    const fromApi = createRequire(__filename);
    const fromNest = createRequire(fromApi.resolve("@nestjs/core"));
    expect(fromNest.resolve("rxjs")).toBe(fromApi.resolve("rxjs"));
  });
});
