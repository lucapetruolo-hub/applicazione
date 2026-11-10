# Lavori ricorrenti: ogni settimana, ogni 2 settimane, ogni mese

**Richiesta** (controllo pre-lancio dell'08/11/2026, funzione nuova 3; ok di
Luca a tutte le funzioni nuove tranne la 12): per pulizie, giardiniere,
babysitter e dogsitter il lavoro di solito si ripete. Prima ogni visita voleva
una richiesta, un preventivo e un'accettazione nuovi.

**Decisione**
- Nel preventivo, solo per questi quattro mestieri
  (`RECURRING_CATEGORY_SLUGS` in `packages/shared/src/recurringJobs.ts`), il
  professionista sceglie "Ogni quanto?": Una volta, Ogni settimana, Ogni 2
  settimane, Ogni mese. Il prezzo è a visita. Non si può con l'acconto più
  saldo diretto (`MIXED`): quel modo vale per un lavoro solo.
- Il cliente accetta una volta sola. Nasce la serie (`RecurringJob`) e ogni
  visita è un lavoro a sé (`Booking` con `recurringJobId` e
  `recurringNumber`): promemoria, "Lavoro terminato", pagamento, Agenda. La
  prima visita è quella del preventivo; le altre entrano in agenda da sole
  quattro settimane prima (`RECURRING_HORIZON_DAYS`), alla stessa ora (ogni
  mese: stesso giorno, o l'ultimo del mese). Lo fa l'attività di ogni ora
  (`RecurringJobsService.extendAll`, in `docs/ops/attivita-a-orario.md`). Se
  quell'ora il professionista è già occupato, la visita salta da sola e lo
  sanno tutti e due.
- **Pagamento** (decisione di Luca del 09/11, "Come la prima visita"): chi ha
  scelto online paga ogni visita a lavoro terminato con la carta salvata alla
  prima, in automatico e mai più del preventivo; chi paga direttamente
  continua così. L'acconto c'è solo sulla prima visita.
- Nella scheda della richiesta, per cliente e professionista, il riquadro
  "Lavoro ricorrente" con le prossime visite. "Salta questa volta" è il
  normale annullamento di quella visita (stessi controlli, stesse email con
  una riga diversa); "Interrompi il lavoro ricorrente" toglie tutte le visite
  future e avvisa l'altro. Dopo l'interruzione la visita rimasta torna un
  lavoro normale ("Annulla il lavoro"). Spostare la data resta solo sulla
  prima visita.
- In Agenda (sì di Luca del 09/11) le visite si riconoscono a colpo d'occhio:
  icona "ripeti" nel riquadro, "Ogni settimana" (o la frequenza) nel dettaglio
  e nell'elenco, "Salta questa volta" al posto di "Annulla".
- Una chiusura dell'account interrompe le serie di chi chiude.
- Conteggio dell'abbonamento: la serie conta **un** lavoro accettato, non uno
  a visita. Recensione: una per serie.
- Rotta nuova `POST /bookings/recurring/:id/stop`, solo per il cliente e il
  professionista della serie (matrice dei permessi aggiornata).
- Migrazione solo additiva `20261109180000_lavori_ricorrenti`. Le visite dopo
  la prima non hanno preventivo proprio: valgono quello della serie, quindi
  il vincolo "un lavoro attivo per richiesta" resta sulla prima.

**Perché**: senza ripetizione il cliente di pulizie o dogsitter doveva rifare
tutto ogni settimana, e il professionista perdeva il lavoro fisso fuori dal
sito. Si riusano i percorsi standard (preventivo, annullamento, pagamento a
lavoro terminato), nessuna strada parallela.

**Verifica**
- `packages/shared/src/recurringJobs.test.ts`: date, visite da creare,
  mestieri ammessi, visita mostrata nella scheda.
- `apps/api/src/bookings/recurring-jobs.service.test.ts`: interruzione da
  cliente e professionista, permessi, dati per le schede. Tutti i test
  dell'API passano (1403).
- `e2e/tests/lavori-ricorrenti.spec.ts` (telefono e computer, axe): visite
  create all'accettazione, "Salta questa volta", "Interrompi" dal
  professionista con avviso al cliente, "Ogni quanto?" nel preventivo,
  bollino in Agenda.
- `apps/api/scripts/access-matrix.mjs`: nessun problema.
