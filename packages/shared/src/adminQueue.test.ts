import assert from "node:assert/strict";
import { test } from "node:test";
import { adminQueueClaimSchema, sortAdminQueue } from "./adminQueue";

const item = (key: string, danger: boolean, dueAt: string | null, createdAt: string) => ({ key, danger, dueAt, createdAt });

test("coda Da fare: prima i pericoli, poi la scadenza più vicina, poi il più vecchio", () => {
  const sorted = sortAdminQueue([
    item("vecchio-senza-scadenza", false, null, "2026-10-01T00:00:00Z"),
    item("scade-dopo", false, "2026-11-05T00:00:00Z", "2026-10-29T00:00:00Z"),
    item("gas", true, null, "2026-10-30T10:00:00Z"),
    item("gia-scaduto", false, "2026-10-29T00:00:00Z", "2026-10-28T00:00:00Z"),
    item("nuovo-senza-scadenza", false, null, "2026-10-30T09:00:00Z"),
  ]);
  assert.deepEqual(
    sorted.map((i) => i.key),
    ["gas", "gia-scaduto", "scade-dopo", "vecchio-senza-scadenza", "nuovo-senza-scadenza"],
  );
});

test("Prendo io accetta solo una chiave tipo:id", () => {
  assert.equal(adminQueueClaimSchema.safeParse({ caseKey: "REFUND:1be3f3f7-0a09-4382-b9aa-f742394443fa" }).success, true);
  assert.equal(adminQueueClaimSchema.safeParse({ caseKey: "REFUND:../../etc" }).success, false);
  assert.equal(adminQueueClaimSchema.safeParse({ caseKey: "refund:1be3f3f7-0a09-4382-b9aa-f742394443fa" }).success, false);
});
