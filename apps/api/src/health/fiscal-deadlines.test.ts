import { FISCAL_DEADLINES } from "@professionisti/shared";
import { describe, expect, it } from "vitest";
import "../app.module";
import { catchUpJobs } from "../common/scheduled-job";

describe("Scadenze fiscali", () => {
  it("ogni attività della tabella esiste e si recupera all'avvio", () => {
    const recoverable = new Set(catchUpJobs.map((job) => job.name));
    for (const deadline of FISCAL_DEADLINES) for (const job of deadline.jobs) expect(recoverable, job).toContain(job);
  });
});
