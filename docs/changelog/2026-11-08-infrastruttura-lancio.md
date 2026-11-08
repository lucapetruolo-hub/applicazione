# Infrastruttura pronta per il lancio (gruppo 10 del controllo pre-lancio)

**Richiesta**: controllo pre-lancio dell'08/11/2026 con dieci esperti
(`/mnt/project-files/collaudo/2026-11-08/`). Luca ha approvato tutti i gruppi
("sì a tutto quello che ritieni"); questo è il gruppo 10, "Infrastruttura nel
codice": E9-03, E9-07 (regex), E9-08…E9-16, E1-05, E1-06, più le migliorie
"sì" dello stesso tema. Le cose fuori dal codice (piano del database su
Render, Vercel Pro, Resend Pro, variabili sulla dashboard) restano a Luca.

## Decisioni

- **Attività a orario con `@ScheduledJob`** (`apps/api/src/common/scheduled-job.ts`)
  al posto di `@Cron` su tutte le 50 attività (E9-10/E1-05, E9-11/E1-06):
  - ora italiana di serie: 6 attività partivano in UTC, un'ora o due dopo
    (avvisi di rinnovo e di fine mesi gratis "alle 9" arrivavano alle 10-11);
  - `waitForCompletion`: un giro lungo non si accavalla col successivo;
  - un solo giro anche con due API accese: a ogni deploy Render tiene la
    vecchia istanza finché la nuova non risponde. Ogni giro scrive prima una
    riga in `cron_runs` (attività + minuto, chiave unica): chi la scrive per
    primo lavora, l'altra salta. La riga dice anche se il giro è finito e con
    quale errore (`docs/ops/attivita-a-orario.md`); si cancella dopo 40
    giorni. Scelta al posto di `pg_advisory_lock` (che richiede la stessa
    connessione per tutto il giro e non lascia traccia).
  - Il metodo del servizio resta quello di prima: prove e pulsanti di Admin
    lo chiamano senza passare dalla riga; il giro a orario usa un metodo
    nascosto accanto (`<metodo>__aOrario`).
  - La CI blocca un `@Cron` nuovo.
- **Promemoria del giorno prima segnato prima di mandare** (E9-11), come già
  quello dell'acconto: `updateMany ... where reminderSentAt: null`, si manda
  solo se la riga è stata presa.
- **Riepilogo dei documenti del mese una volta sola per mese** (E1-06): prima
  di mandarlo si guarda se c'è già la notifica `MONTHLY_DOCUMENTS_READY` di
  quel mese. Gli estratti al commercialista sono protetti dalla riga di
  `cron_runs`.
- **`/health/db`** (E9-08): `SELECT 1` con 3 secondi di tempo, 503 se il
  database non risponde. L'uptime usa questo; `/health` resta leggero per il
  controllo di Render (un database lento non deve far riavviare l'API).
- **Chiusura ordinata** (E9-12): `app.enableShutdownHooks()` e `$disconnect()`
  di Prisma (`apps/api/src/health/cron-runs.service.ts`). Provato: con SIGTERM
  l'API esce pulita.
- **`render.yaml` completo** (E9-03): aggiunte le 17 variabili lette dal
  codice che mancavano (`FISCAL_DATA_KEY`, `LAUNCH_DATE`,
  `STRIPE_TAX_RATE_IVA`, …), tutte `sync: false` con un commento. Nuovo
  controllo in CI (`apps/api/scripts/check-render-env.mjs`): una variabile
  letta dall'API e assente dal Blueprint blocca la PR.
- **Regex segnalata da CodeQL** (E9-07, `js/polynomial-redos` in
  `packages/shared/src/professionalUrl.ts`): dopo la sostituzione dei
  caratteri i "-" non sono mai ripetuti, quindi basta `^-|-$`; il taglio dei
  nomi lunghi usa `lastIndexOf`. Stesso risultato su tutti i casi provati,
  con una prova nuova (anche su 100.000 trattini).
- **Migrazioni** (E9-13/E9-14): regola "solo additive" in CLAUDE.md §2 e in
  `docs/ops/rollback.md`; la CI blocca una PR che modifica o cancella una
  migrazione già unita; tolto il riferimento al commit `034f1a5`, che non
  esiste più nella cronologia.
- **Prove che passavano senza segreto** (E9-16): la prova della carta fallisce
  sul ramo principale senza `E2E_STRIPE_SECRET_KEY` (sulle PR di Dependabot,
  che non hanno il segreto, si salta ancora); il controllo dello stream
  nell'uptime fallisce senza `UPTIME_EMAIL`/`UPTIME_PASSWORD`.
- **Tetti verso Google** (E9-15): di serie suggerimenti 1000 al giorno,
  dettagli e CAP 500, mappe fisse 500 (prima 5000/2000/2000), vicino alla
  quota gratuita di Google.
- **Avviso quando Resend rifiuta** (miglioria di E9-06): limite del piano,
  troppe richieste, chiave rifiutata o guasto mandano un `opsAlert` a Sentry
  (una volta l'ora per tipo). Un indirizzo sbagliato no.
- **Pagine `docs/ops/`** (E9-02, E9-09): rollback in 5 minuti, ripristino del
  database (da provare una volta), attività a orario con le query su
  `cron_runs`, avvisi, variabili, cambio di dominio (dieci posti, prima
  la checklist ne citava due).

## Non fatto qui

- E9-07 (b, c): download di CodeQL/osv/gitleaks resi "neutri" se GitHub non
  risponde e soglia Lighthouse più larga: indeboliscono controlli, contro la
  regola "sicurezza prima della velocità". Da decidere con Luca.
- Uptime esterno con avviso sul telefono (UptimeRobot/Better Stack): servizio
  nuovo, da decidere con Luca prima.

## Verifica

- Postgres 16 locale: tutte le migrazioni applicate da zero, `prisma migrate
  diff` contro lo schema: nessuna differenza.
- API avviata davvero due volte sullo stesso database: l'attività di ogni
  minuto scrive la riga e la seconda istanza logga "già fatto da un'altra
  istanza, saltato"; SIGTERM chiude la seconda in modo pulito.
- `/health/db`: 200 col database acceso, 503 "non risponde" col database
  spento (mentre `/health` resta 200), di nuovo 200 alla riaccensione.
- Prove dell'API (Vitest) tutte verdi, con le nuove per `@ScheduledJob`, il
  promemoria doppio, l'avviso di Resend e l'indirizzo del profilo.
