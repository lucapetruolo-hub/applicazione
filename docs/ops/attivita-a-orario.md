# Attività a orario

L'API fa da sé una cinquantina di lavori a orario (promemoria, fatture del
mese, pulizie). Sono scritti con `@ScheduledJob` (`apps/api/src/common/scheduled-job.ts`,
docs/changelog/2026-11-08-infrastruttura-lancio.md), che dà a tutti:

- **ora italiana** (anche se Render è in UTC): "alle 9" vuol dire le 9 a Roma;
- **mai due giri insieme**: se un giro è ancora in corso, quello dopo si salta;
- **un solo giro anche con due API accese** (succede per qualche minuto a ogni
  deploy): ogni giro scrive prima una riga in `cron_runs` (attività +
  minuto) e lo fa solo chi la scrive per primo.

Un'attività nuova si scrive con `@ScheduledJob(...)`, mai con `@Cron` di Nest.

## Ha girato? È finita bene?

Nella tabella `cron_runs` (righe tenute 40 giorni), dal pannello del database
su Render o con `psql`:

```sql
-- Ultimi giri di un'attività (nome = Servizio.metodo, vedi tabella sotto)
SELECT slot, "finishedAt", error FROM cron_runs
WHERE name = 'InvoicesService.runMonthly' ORDER BY slot DESC LIMIT 5;

-- Giri finiti con un errore negli ultimi 2 giorni
SELECT name, slot, error FROM cron_runs
WHERE error IS NOT NULL AND "startedAt" > now() - interval '2 days' ORDER BY slot DESC;

-- Giri mai finiti (API riavviata a metà)
SELECT name, slot FROM cron_runs
WHERE "finishedAt" IS NULL AND "startedAt" < now() - interval '1 hour' ORDER BY slot DESC;
```

L'orario `slot` è in UTC. Gli errori vanno anche nei log di Render e, con
`SENTRY_DSN`, in Sentry.

## Se un giro salta

Un giro salta se in quel minuto l'API era giù o stava ripartendo. Il giro
dopo riprende quasi sempre da solo, perché le attività lavorano su "tutto
quello che è ancora da fare" e non sul solo minuto. Fanno eccezione quelle a
data fissa:

| Attività | Quando | Se salta | Come si rimedia |
|---|---|---|---|
| `InvoicesService.runMonthly` | 1° del mese, 7:00 | Fatture delle trattenute del mese prima e riepilogo ai professionisti non partono | Admin → Finanza → mese → **Rifai il giro del mese** |
| `StatementsService.sendAccountantStatements` | 1° del mese, 8:00 | Estratti ai commercialisti non partono | Lo stesso pulsante: fa fatture, riepiloghi ed estratti che mancano, mai doppi (`accountant_statement_sends`) |
| `FeeReconciliationService.runMonthly` | 1° del mese, 7:30 | Quadratura con Stripe del mese non fatta | Admin → Finanza (quadratura) |
| `DatabaseVersionService.monthlyCheck` | 1° del mese, 9:00 | Nessun avviso sulla versione di PostgreSQL per un mese | Nessuno, riprova il mese dopo |
| `Dac7Service.sendYearEndReminders` | 1° novembre, 9:00 | Promemoria DAC7 di fine anno | Chiedere a un thread |
| `Dac7Service.remindAnnualDeadline` | 10, 20, 27, 30 gennaio, 9:00 | Un promemoria della scadenza DAC7 in meno | Gli altri giorni restano |
| `CourtesyCopyService.remindDocumentsToFix` | 15 dicembre, 9:00 | Promemoria dei documenti da sistemare | Chiedere a un thread |

Per questo i deploy importanti si fanno **fuori** dalle 7-9 del 1° del mese.

## Tutte le attività

Ogni giorno a ora fissa (ora italiana):

| Ora | Attività | Cosa fa |
|---|---|---|
| 1:00 | `Dac7Service.runDailyAggregation` | Somme DAC7 dei professionisti |
| 2:00 | `Dac7Service.checkSubmittedYears` | Segnala anni DAC7 già inviati che andrebbero corretti |
| 2:30 | `AgendaService.extendWeekTemplates` | Allunga la settimana tipo nell'agenda |
| 3:00 | `SiteCountsService.deleteOldCounters` | Cancella i contatori vecchi |
| 3:40 | `ProblemMatchService.removeOldDescriptions` | Cancella le descrizioni dei problemi vecchie |
| 3:50 | `CronRunsService.deleteOld` | Cancella le righe di `cron_runs` oltre 40 giorni |
| 4:00 | `GuidedRequestsService.purgeClientDeletedRequests` | Cancella le richieste eliminate dal cliente |
| 4:20 | `AdminProposalsService.nightly` | Prepara le proposte "Da approvare" in Admin |
| 5:30 | `AccountClosuresService.nightly` | Chiude gli account con la chiusura fissata da Admin e cancella le impronte email oltre 10 anni |
| 6:15 | `BillingService.issueMissedInvoices` | Fatture dei pagamenti Stripe rimaste senza (mai doppie) |
| 7:00 | `SuspiciousAccountsService.morningCheck` | Account sospetti all'admin |
| 8:00 | `AdminQueueService.morningClaimedDue` | Casi presi in carico e scaduti all'admin |
| 9:00 | `SubscriptionsService.runPeriodNotices`, `runTrialCheck` | Avvisi di rinnovo e di fine mesi gratis |
| 9:00 | `IdentityVerificationService.checkBadgesOverTime` | Ricontrolla i badge "Verificato" |
| 10:00 | `AwayService.remindEnding`, `ReviewReplyRemindersService.remindReplies`, `AgendaRemindersService.remindAgenda`, `IdentityVerificationService.remindUnverified` | Promemoria ai professionisti (fine pausa, recensioni da rispondere, agenda, verifica) |
| 11:00 | `IdentityVerificationService.remindProfileSetup` | Promemoria del profilo da completare |
| 18-21 | `AgendaTomorrowSummaryService.sendTomorrowSummaries`, `WhatsAppService.professionalDayReminders` | Riepilogo della sera all'ora scelta dal professionista |

Ogni settimana: lunedì 8:00 `InvoicesService.remindStuckSdi` (fatture
ferme allo SdI), lunedì 9:00 `SiteStatsService.weeklyAdvice` e
`UrgencyMetricsService.weeklyCheck` (consigli e numeri all'admin).

Di continuo:

| Ogni | Attività |
|---|---|
| minuto | `ChatMessageEmailsService.sendDue` (email dei messaggi in chat) |
| 5 minuti | `HeldEmailsService.sendDue` (email rimandate), `GuidedRequestUserStateService.runDueReminders` (promemoria delle richieste), `GuidedRequestsService.runExpiryCheck` (richieste scadute), `WhatsAppService.dispatchDue` (coda WhatsApp) |
| 10 minuti | `BillingService.runReturnToBase`, `TermsNoticeService.run` (avviso dei Termini cambiati), `IdentityVerificationService.followUp` (esiti Didit) |
| 30 minuti | `BookingRemindersService.sendUpcomingReminders` e `sendDepositReminders` (promemoria del giorno prima e dell'acconto), `WhatsAppService.depositReminders`, `TaxIdCheckService.retryPending` (controlli CF/P.IVA in attesa), `GuidedRequestUserStateService.runDueRebookReminders` ("Ricordamelo tra…" della manutenzione) |
| ora | `SubscriptionsService.runPauseSweep`, `BillingService.runSubscriptionSafetyChecks` (abbonamenti di account chiusi, rinnovi non pagati, passaggi a metà), `AwayService.endPauses`, `DateChangeRemindersService.remindUnanswered`, `JobIssueOutcomeService.runDeadlines`, `GeneralRequestsService.runAutoCheck`, `CompletionDeadlineService.run`, `OnlineMoneyService.runReleases` (bonifici ai professionisti), `InvoicesService.syncSdi` (ai :20) |

I promemoria del giorno prima e dell'acconto si segnano sulla prenotazione
**prima** di mandare l'email: mai due volte, anche con due giri insieme. Il
riepilogo dei documenti del mese controlla di non essere già stato mandato
per quel mese.
