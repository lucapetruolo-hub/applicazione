import { appendFileSync } from "node:fs";
import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";

/**
 * Prove passate solo al secondo tentativo (docs/changelog/2026-10-28-prove-ripetute.md).
 * Nella CI una prova che fallisce viene ripetuta una volta, così una lentezza
 * isolata della macchina non fa diventare rosso il ramo; ma non deve sparire:
 * ogni prova ripetuta compare come avviso giallo nella PR e nel riepilogo del
 * giro, con l'errore del primo tentativo. Se la stessa prova torna più volte,
 * è un bug da cercare, non una lentezza.
 */
export default class ProveRipetute implements Reporter {
  private readonly ripetute: { titolo: string; errore: string }[] = [];

  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status !== "passed" || result.retry === 0) return;
    const primo = test.results.find((r) => r.retry === 0);
    const errore = (primo?.error?.message ?? "").replace(/\u001b\[[0-9;]*m/g, "").split("\n")[0]!.slice(0, 200);
    this.ripetute.push({ titolo: test.titlePath().filter(Boolean).join(" › "), errore });
  }

  onEnd(_result: FullResult) {
    if (this.ripetute.length === 0) return;
    for (const { titolo, errore } of this.ripetute) {
      console.log(`::warning title=Prova passata solo al secondo tentativo::${titolo}: ${errore}`.replace(/\r?\n/g, " "));
    }
    const riepilogo = process.env.GITHUB_STEP_SUMMARY;
    if (riepilogo) {
      const righe = this.ripetute.map(({ titolo, errore }) => `- **${titolo}**: ${errore || "(nessun messaggio)"}`);
      appendFileSync(
        riepilogo,
        `### Prove passate solo al secondo tentativo (${this.ripetute.length})\n\nAl primo tentativo erano fallite. Se una torna spesso, è un bug da cercare.\n\n${righe.join("\n")}\n\n`,
      );
    }
  }
}
