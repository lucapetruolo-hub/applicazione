import { beforeEach } from "vitest";
import { MemoryBudgetStore, setSharedBudgetStore } from "./common/daily-budget";
import { setSharedHitStore } from "./common/shared-throttler-storage";

// Nelle prove i tetti giornalieri "condivisi" stanno in memoria, nuovi a ogni
// prova: nessuna prova tocca il database vero.
beforeEach(() => {
  setSharedBudgetStore(new MemoryBudgetStore());
  setSharedHitStore(null);
});
