import assert from "node:assert/strict";
import { test } from "node:test";
import { currentRecurringVisit, jobByRequest, recurringAllowedForCategory, recurringVisitDate, recurringVisitsToCreate } from "./recurringJobs";

const first = new Date("2026-11-10T09:00:00.000Z");

test("visite settimanali e ogni 2 settimane alla stessa ora", () => {
  assert.equal(recurringVisitDate(first, "WEEKLY", 1).toISOString(), "2026-11-10T09:00:00.000Z");
  assert.equal(recurringVisitDate(first, "WEEKLY", 3).toISOString(), "2026-11-24T09:00:00.000Z");
  assert.equal(recurringVisitDate(first, "BIWEEKLY", 2).toISOString(), "2026-11-24T09:00:00.000Z");
});

test("ogni mese: stesso giorno, o l'ultimo del mese", () => {
  const jan31 = new Date("2027-01-31T15:30:00.000Z");
  assert.equal(recurringVisitDate(jan31, "MONTHLY", 2).toISOString(), "2027-02-28T15:30:00.000Z");
  assert.equal(recurringVisitDate(jan31, "MONTHLY", 3).toISOString(), "2027-03-31T15:30:00.000Z");
  assert.equal(recurringVisitDate(first, "MONTHLY", 3).toISOString(), "2027-01-10T09:00:00.000Z");
});

test("in agenda le visite dei prossimi 28 giorni, almeno la prossima", () => {
  const now = new Date("2026-11-09T12:00:00.000Z");
  assert.deepEqual(recurringVisitsToCreate(first, "WEEKLY", 1, now), [2, 3, 4]);
  assert.deepEqual(recurringVisitsToCreate(first, "WEEKLY", 3, now), [4]);
  assert.deepEqual(recurringVisitsToCreate(first, "MONTHLY", 1, now), []);
  // Passata la prima visita, la prossima c'è sempre, anche oltre i 28 giorni.
  assert.deepEqual(recurringVisitsToCreate(first, "MONTHLY", 1, new Date("2026-11-11T08:00:00.000Z")), [2]);
});

test("le date passate non si creano: si riparte dalla prossima", () => {
  const later = new Date("2026-12-20T12:00:00.000Z");
  assert.deepEqual(recurringVisitsToCreate(first, "BIWEEKLY", 1, later), [4, 5]);
  assert.deepEqual(recurringVisitsToCreate(first, "MONTHLY", 1, later), [3]);
});

test("solo i mestieri a visite ripetute", () => {
  assert.equal(recurringAllowedForCategory("pulizie"), true);
  assert.equal(recurringAllowedForCategory("dogsitter"), true);
  assert.equal(recurringAllowedForCategory("idraulico"), false);
  assert.equal(recurringAllowedForCategory(null), false);
});

test("nella scheda la visita che chiede ancora qualcosa, altrimenti l'ultima", () => {
  const s = { seriesId: "rj" };
  const visits = [
    { id: "v1", status: "COMPLETED", scheduledAt: "2026-11-10T09:00:00.000Z", clientConfirmedCompletedAt: null, recurring: s, guidedRequestId: "gr" },
    { id: "v2", status: "CONFIRMED", scheduledAt: "2026-11-17T09:00:00.000Z", clientConfirmedCompletedAt: null, recurring: s, guidedRequestId: "gr" },
    { id: "v3", status: "CONFIRMED", scheduledAt: "2026-11-24T09:00:00.000Z", clientConfirmedCompletedAt: null, recurring: s, guidedRequestId: "gr" },
  ];
  assert.equal(currentRecurringVisit(visits, "CLIENT")?.id, "v1");
  assert.equal(currentRecurringVisit(visits, "PROFESSIONAL")?.id, "v2");
  assert.equal(jobByRequest(visits, "PROFESSIONAL").get("gr")?.id, "v2");
  const done = visits.map((v) => ({ ...v, status: v.id === "v3" ? "CANCELED" : "COMPLETED", clientConfirmedCompletedAt: "x" }));
  assert.equal(currentRecurringVisit(done, "CLIENT")?.id, "v2");
});
