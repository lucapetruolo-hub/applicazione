import assert from "node:assert/strict";
import { test } from "node:test";
import { POPULAR_SERVICES } from "./categories";
import { matchPopularServices } from "./serviceSearch";
import { DEFAULT_POPULAR_JOBS, POPULAR_JOBS_COUNT, POPULAR_JOBS_MIN, POPULAR_JOBS_MIN_SEARCHES, buildPopularJobsAdminView, orderPopularJobs } from "./popularJobs";

test("l'elenco di partenza ha solo prestazioni suggerite del loro mestiere, ed è abbastanza lungo", () => {
  for (const job of DEFAULT_POPULAR_JOBS) assert.ok(POPULAR_SERVICES[job.categorySlug].includes(job.service), job.service);
  assert.ok(DEFAULT_POPULAR_JOBS.length >= POPULAR_JOBS_MIN);
});

test("ogni lavoro di partenza si conta se qualcuno lo scrive nella ricerca", () => {
  for (const job of DEFAULT_POPULAR_JOBS) {
    assert.ok(
      matchPopularServices(job.service).some((m) => m.service === job.service),
      job.service,
    );
  }
});

test("con poche ricerche vale l'ordine dell'elenco", () => {
  const result = orderPopularJobs(DEFAULT_POPULAR_JOBS, [{ categorySlug: "fabbro", service: "Apertura porte bloccate", searches: POPULAR_JOBS_MIN_SEARCHES - 1 }]);
  assert.equal(result.source, "list");
  assert.deepEqual(result.jobs, DEFAULT_POPULAR_JOBS.slice(0, POPULAR_JOBS_COUNT));
});

test("con abbastanza ricerche prima i più cercati, a parità l'ordine dell'elenco, e una riserva può salire", () => {
  const result = orderPopularJobs(DEFAULT_POPULAR_JOBS, [
    { categorySlug: "climatizzazione", service: "Installazione pompa di calore", searches: 40 },
    // Lo stesso nome in due mestieri si somma.
    { categorySlug: "idraulico", service: "Trasformazione vasca in doccia", searches: 10 },
    { categorySlug: "muratore", service: "Trasformazione vasca in doccia", searches: 10 },
    // Fuori elenco: non entra in home.
    { categorySlug: "giardiniere", service: "Taglio erba", searches: 500 },
  ]);
  assert.equal(result.source, "searches");
  assert.equal(result.jobs.length, POPULAR_JOBS_COUNT);
  assert.deepEqual(
    result.jobs.slice(0, 3).map((job) => job.service),
    ["Installazione pompa di calore", "Trasformazione vasca in doccia", "Installazione caldaia"],
  );
  assert.ok(!result.jobs.some((job) => job.service === "Taglio erba"));
});

test("in Admin: ricerche per lavoro, chi è in home e i cercati fuori elenco", () => {
  const view = buildPopularJobsAdminView(DEFAULT_POPULAR_JOBS, false, [
    { categorySlug: "giardiniere", service: "Taglio erba", searches: 60 },
    { categorySlug: "pulizie", service: "Pulizie di casa", searches: 5 },
    { categorySlug: "giardiniere", service: "Nome inventato", searches: 99 },
  ]);
  assert.equal(view.custom, false);
  assert.equal(view.totalSearches, 164);
  assert.equal(view.jobs.find((job) => job.service === "Pulizie di casa")?.searches, 5);
  assert.equal(view.jobs.filter((job) => job.shown).length, POPULAR_JOBS_COUNT);
  assert.deepEqual(view.missing.map((job) => job.service), ["Taglio erba"]);
  // Con 164 ricerche "Pulizie di casa" (5) passa davanti a tutti gli altri (0).
  assert.equal(view.jobs.find((job) => job.service === "Pulizie di casa")?.homePosition, 1);
  assert.equal(view.jobs.find((job) => job.service === "Installazione pompa di calore")?.homePosition, null);
});
