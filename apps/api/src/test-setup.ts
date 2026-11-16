import { beforeEach } from "vitest";
import { MemoryBudgetStore, setSharedBudgetStore } from "./common/daily-budget";

// Nelle prove i tetti giornalieri "condivisi" stanno in memoria, nuovi a ogni
// prova: nessuna prova tocca il database vero.
beforeEach(() => {
  setSharedBudgetStore(new MemoryBudgetStore());
});
