# Fatture che partono davvero: attività saltate, scarti e scadenze fiscali

**Richiesta** (Luca, 24/11/2026, thread "Emettere fatture elettroniche ai
professionisti"): alla domanda "cosa stiamo tralasciando?" sono emerse tre
cose (attività a orario saltate col piano Free di Render, conservazione per 10
anni, scarti dello SdI da rimandare entro 5 giorni). Luca ha detto sì a tutte,
poi ha chiesto la versione profonda
(`analisi/scadenze-fiscali-attivita-versione-profonda.md`) e ha approvato il
prompt riscritto.

**Dati grezzi controllati prima del codice**: delle ultime 30 chiamate del
workflow Uptime, metà ha impiegato 41-46 secondi invece di 6 (il risveglio di
Render): l'API sul Free dorme davvero. Il controllo della notte
(`site_checks`) non era mai partito: anche lui è dentro l'API.

**Decisioni**
- **Recupero all'avvio** (`catchUpWithinMs` in `@ScheduledJob`,
  `ScheduledCatchUpService`): al risveglio, per ogni attività che lo dichiara,
  se in `cron_runs` manca il giro dell'ultimo orario previsto (entro la
  finestra) lo fa partire una volta, con quell'orario come `slot`. Niente
  doppioni con due API né se il giro normale è già partito. Solo attività "a
  stato" (fatture COM del 1° e recupero dal 2 al 15, esiti SdI ogni ora,
  promemoria del lunedì, zip al commercialista del 5, estratti del 1°,
  quadratura Stripe, promemoria del 15/12, reti di sicurezza
  dell'abbonamento, fatture mancate di Stripe); mai i promemoria a orario
  fisso. Gli orari si leggono dal `CronTime` registrato da Nest, quindi
  restano quelli del decoratore.
- **Controllo "uomo morto" fuori dall'API**: `GET /health/cron` (aspetta il
  recupero all'avvio, poi 503 se un'attività non è partita, è finita con un
  errore nelle ultime 48 ore o si è fermata a metà) e un passo nel workflow
  Uptime, che sveglia l'API e manda l'email di GitHub se è rosso. Un 404
  (deploy in corso) non fa rosso.
- **Tabella delle scadenze di legge** in `packages/shared/src/fiscalDeadlines.ts`
  (fattura differita entro il 15, invio entro 12 giorni, rimando entro 5
  giorni dallo scarto, zip prima dell'IVA del 16, conservazione): una prova
  controlla che ogni attività della tabella si recuperi all'avvio, e
  `/health/cron` dice quale scadenza è a rischio.
- **Scarti dello SdI** (circolare 13/E del 2018): nuova colonna
  `sdiRejectedAt`; l'avviso dice il termine ("va rimandata entro il …, con lo
  stesso numero e la stessa data") e cosa fare per i codici più comuni (00200,
  00305, 00306, 00311, 00312, 00404, 00423, `sdiRejectionHint`); secondo
  avviso al giorno 4 (`remindRejectedSdi`, una volta per scarto con
  `sdiRejectRemindedAt`); in Fisco e fatture "da rimandare entro il …".
  "Rimanda" teneva già numero e data (cambia solo il progressivo del file).
- **Mancata consegna (MC)** distinta: la fattura resta "arrivata" ma con
  `sdiUndeliveredAt`; in Admin "Nel cassetto fiscale" e sul PDF la frase che
  l'originale è nel cassetto fiscale del professionista (copia di cortesia).
- **Quadratura del mese**: riga "Fatture di …: N emesse, N arrivate al fisco,
  N da sistemare" in Fisco e fatture e avviso alla Finanza il 16 alle 9
  (`checkMonthSdiChain`) se i conti non tornano.
- **Conservazione**: dalla documentazione Openapi l'invio che usiamo
  (`POST /invoices_legal_storage`) è già "invio + conservazione a norma per 10
  anni" (circa 0,10 € a fattura). Manca la prova concreta (documento
  conservato scaricato o conferma scritta) e la seconda copia gratuita
  all'Agenzia: punto 14 della checklist e domanda C38 al commercialista.
- Migrazione `20261124170000_scarti_e_mancate_consegne`, solo additiva.

**Verifica**: prove `src/health` (ultimo orario previsto, recupero una volta
sola, recupero che fallisce senza fermare gli altri, uomo morto con i tre
motivi e la finestra di 48 ore, tabella delle scadenze) e
`src/accounting/scarti-sdi.test.ts` (termine, consiglio per codice, MC, secondo
avviso una volta sola, quadratura, PDF). La prova vera, non nostra: le righe di
`cron_runs` del 1/12 e del 5/12 e il passo "Attività a orario" del workflow.
