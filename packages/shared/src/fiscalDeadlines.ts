/**
 * Scadenze fiscali della nostra società e le attività a orario che le servono
 * (docs/changelog/2026-11-24-scadenze-fiscali-attivita.md,
 * analisi/scadenze-fiscali-attivita-versione-profonda.md). Una riga per
 * scadenza: chi la fa, quando parte, chi si accorge se salta. Il controllo
 * `/health/cron` dell'API usa questi nomi per dire quale scadenza è a rischio.
 *
 * Ogni attività qui ha `catchUpWithinMs` in `@ScheduledJob`: se l'API era
 * spenta all'orario, parte al risveglio.
 */
export type FiscalDeadline = {
  /** Cosa chiede la legge, in parole semplici. */
  rule: string;
  /** Dove sta scritto. */
  law: string;
  /** Attività dell'API (Servizio.metodo) che la servono. */
  jobs: string[];
  /** Quando partono, ora di Roma. */
  when: string;
  /** Chi viene avvisato se qualcosa non va. */
  alert: string;
};

export const FISCAL_DEADLINES: readonly FiscalDeadline[] = [
  {
    rule: "Fattura differita delle trattenute del mese emessa entro il 15 del mese dopo",
    law: "art. 21 c. 4 DPR 633/72",
    jobs: ["InvoicesService.runMonthly", "InvoicesService.recoverMonthly"],
    when: "il 1° alle 7, poi ogni mattina dal 2 al 15",
    alert: "Finanza il 10 se ne manca qualcuna; uptime se il giro non parte",
  },
  {
    rule: "Fattura dell'abbonamento emessa al pagamento (anche se il webhook di Stripe si perde)",
    law: "art. 21 DPR 633/72",
    jobs: ["BillingService.issueMissedInvoices"],
    when: "ogni mattina alle 6:15",
    alert: "uptime se il giro non parte",
  },
  {
    rule: "Fattura inviata allo SdI entro 12 giorni dalla sua data, esito letto",
    law: "art. 21 c. 4 DPR 633/72, specifiche tecniche SdI",
    jobs: ["InvoicesService.syncSdi", "InvoicesService.remindStuckSdi"],
    when: "ogni ora; il lunedì alle 8 il riepilogo delle ferme",
    alert: "Finanza il lunedì; uptime se il giro non parte",
  },
  {
    rule: "Fattura scartata rimandata entro 5 giorni dallo scarto, stesso numero e stessa data",
    law: "circolare Agenzia delle Entrate 13/E del 2018",
    jobs: ["InvoicesService.syncSdi", "InvoicesService.remindRejectedSdi"],
    when: "avviso allo scarto, secondo avviso al giorno 4 (ogni mattina alle 8:15)",
    alert: "Finanza",
  },
  {
    rule: "Fatture del mese al commercialista prima della liquidazione IVA del 16",
    law: "art. 1 DPR 100/98",
    jobs: ["CompanyAccountantService.sendMonthly", "InvoicesService.checkMonthSdiChain"],
    when: "zip il 5 alle 9; il 16 alle 9 quadratura emesse/arrivate",
    alert: "Finanza se lo zip non parte o i conti non tornano",
  },
  {
    rule: "Fatture elettroniche conservate a norma per 10 anni",
    law: "art. 3 DM 17/06/2014, art. 2220 c.c.",
    jobs: ["InvoicesService.syncSdi"],
    when: "a ogni invio (Openapi, invio con conservazione)",
    alert: "domanda C38 al commercialista per la seconda copia all'Agenzia",
  },
];

/** La scadenza fiscale servita da un'attività, se c'è. */
export function fiscalDeadlineOfJob(job: string): FiscalDeadline | null {
  return FISCAL_DEADLINES.find((deadline) => deadline.jobs.includes(job)) ?? null;
}
