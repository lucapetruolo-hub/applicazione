# Barra di attesa nella creazione dell'account e in ogni schermata che carica

**Richiesta** (Luca, 10/11/2026): "anche nella creazione dell'account se ci
mette un po' di tempo, metti il caricamento della barra", poi "in tutte le
schermate che ci stanno mettendo tempo a caricare potremmo inserirla".

**Decisione** (stessa barra `.flow-bar` di
`2026-11-05-barra-di-attesa.md`, nessuno stile nuovo):
- **Creazione dell'account e accesso**: nel pulsante premuto la barra bianca
  al posto della scritta, come già per l'invio della richiesta
  (`ButtonWaitBar` in `apps/web/src/components/WaitBar.tsx`, ora usato anche
  da `GuidedRequestForm`). Vale per "Registrati" del professionista,
  "Crea account"/"Accedi"/"Continua" del cliente (anche nella finestra della
  richiesta), "Accetta e continua" del consenso Google, `/accedi` e
  `/completa-profilo`. Il pulsante resta pieno (non più sbiadito al 60%) per
  far vedere bene la barra.
- **Dopo la creazione** la pagina successiva (profilo, Dashboard) può
  metterci qualche secondo: il pulsante resta con la barra finché la pagina
  cambia (`useLeavingWait`, al massimo 20 s), invece di tornare "Registrati"
  per un attimo come se non fosse successo nulla.
- **Con il pulsante di Google** (che non è nostro) la barra va in cima allo
  schermo e continua senza interruzioni fino alla pagina di arrivo.
- **Schermate che caricano i loro dati**: la barra in cima si accende dopo
  300 ms (sotto non compare, niente lampeggi) finché a schermo c'è la sagoma
  grigia (`PageLoading`, sagome composte di `Skeleton.tsx`, agenda, finanza) o
  un "Caricamento…" di pagina (`WaitBarSignal`). Contatore unico in
  `apps/web/src/lib/navigationProgress.ts` (`beginWait`): più attese insieme,
  una sola barra. Senza frase sotto: la pagina dice già "Caricamento…".
- **Pagine che restavano vuote** mentre caricavano (profilo del
  professionista, "Il tuo link", "I miei clienti", admin e statistiche admin):
  ora mostrano la sagoma con la barra.
- **Dove no**, come deciso il 05/11: invio delle foto (pallini), tendina
  delle notifiche e pulsanti piccoli (rotellina). I primitivi
  `SkeletonBlock`/`SkeletonCircle` non accendono la barra perché si usano
  anche in punti piccoli.

**Verifica**: `pnpm typecheck` e `pnpm lint` di `apps/web` verdi. Prova sul
sito compilato con le risposte dell'API finte e rallentate (registrazione 6 s,
profilo 8 s), telefono (iPhone 13) e computer: barra bianca nel pulsante
durante la creazione, pulsante ancora in attesa mentre arriva il profilo,
poi sagoma del profilo con la barra verde in cima. Foto in
`anteprime/barra-ogni-attesa/` nei file del progetto.

## Secondo giro: le tre migliorie

**Richiesta** (Luca, 10/11/2026): "Effettua le tre migliorie".

- **Pulsanti grandi di salvataggio e invio**: la barra bianca al posto di
  "Salvataggio..."/"Invio..." nei pulsanti verdi e rossi che aspettano il
  server: barra "Salva" del profilo e dell'account (`SaveBar`), "Salva" dei
  dati fiscali (resta la frase sul controllo di codice fiscale o partita IVA),
  "Salva" prima di uscire dal profilo, "Invia preventivo"/"Salva le
  modifiche", "Salva modifiche" della richiesta del cliente, "Pubblica la
  risposta" alla recensione, "Salva e accedi" della nuova password, conferma
  del lavoro terminato (professionista e cliente), annullamento
  dell'appuntamento, lavoro esterno in agenda, fattura chiesta dal cliente,
  segnalazioni di problemi, spiegazione della contestazione in banca, impostazioni
  del commercialista e ritaglio della foto. Restano come prima i pulsanti
  bianchi e piccoli (la barra bianca non si vedrebbe) e quelli di Admin.
- **"Ancora un attimo, quasi fatto…"** sotto il pulsante quando la creazione
  dell'account supera 5 secondi (`SlowWaitHint`): professionista, cliente,
  consenso Google e `/completa-profilo`. Letta anche dal lettore di schermo.
- **`LoadingState` tolto**, con la sua animazione `.loading-pulse` in
  `globals.css`: non li usava più nessuno.

**Verifica**: `pnpm typecheck` e `pnpm lint` verdi; sul sito compilato con la
registrazione rallentata a 9 s la frase compare dopo 5 secondi sotto il
pulsante con la barra (foto `registrati-dopo-5-secondi-*.png`).
