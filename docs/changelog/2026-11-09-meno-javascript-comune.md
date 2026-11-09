# Meno lavoro per il telefono su home, città e profilo

**Richiesta** (Luca, 09/11/2026, dal thread delle prestazioni del controllo
pre-lancio, E8-03): "Meno JavaScript comune (React + Tamagui) su home, città
e profilo: sì, in un thread dedicato". Da telefono il blocco del JavaScript
(TBT) restava sopra 0,5 s su tutte le pagine da leggere.

## Cosa caricavano le pagine (misurato prima)

Mappa dei pacchetti del sito costruito (`productionBrowserSourceMaps` solo
in locale, mai nel codice) e profilo del processore con il telefono
rallentato 4 volte:

- **zod e tutti gli schemi su città e profilo** (~40 KB compressi): bastava
  importare una costante da un file con schemi. `MAX_CHOSEN_PROFESSIONALS`
  stava in `schemas.ts` e `PROFILE_REQUEST_SOURCE_PARAM` in `siteStats.ts`,
  che ha anche schemi zod.
- **Testi di tutte le notifiche, campanella, menu dell'account e percorso di
  attivazione del professionista** su ogni pagina, anche per chi visita senza
  account (`notificationCopy`, `NotificationBell`, `AccountMenu` →
  `useNavAttention` → `SetupJourney`, `ToastStack`).
- **Home**: le due righe di esempi sotto la ricerca rileggevano la larghezza
  della riga a ogni fotogramma (anche durante la pausa iniziale) e a ogni
  scorrimento, ridisegnando il componente ogni volta: il browser ricalcolava
  l'impaginazione di tutta la pagina mentre la stava ancora preparando
  (~280 ms di processore nel profilo). Le luci animate (`GlowLights`) per 1,8
  secondi dopo l'apertura chiedevano le animazioni a ogni fotogramma
  (`getAnimations`, ricalcolo degli stili di tutta la pagina, ~330 ms) per
  portare la velocità da 1 a 1.
- **Home**: "Nuovi professionisti" riceveva tutti i professionisti con le
  disponibilità dei prossimi giorni (127 KB di dati nella pagina per 7
  profili di prova, e crescevano con ogni iscritto) per mostrarne nome,
  mestiere, città e foto.

## Decisione

- `packages/shared/src/limits.ts`: i limiti numerici (`MAX_CHOSEN_PROFESSIONALS`,
  `MAX_PROFESSIONAL_CATEGORIES`, `MAX_REQUEST_CATEGORIES`,
  `PROBLEM_DESCRIPTION_MAX`) senza zod. `siteStatsSchemas.ts`: gli schemi
  dell'andamento del sito separati dalle costanti, come gli altri `*Schemas.ts`.
  `notificationDefaults.ts`: le preferenze di partenza usate da `AuthContext`
  senza l'elenco di tutte le notifiche. Stessi nomi esportati da
  `@professionisti/shared`: API e app non cambiano.
- Campanella e menu dell'account caricati a parte (`next/dynamic`, solo con
  l'accesso fatto); chi ha già la sessione nel browser li scarica subito,
  mentre il sito controlla ancora la sessione, e il loro posto è tenuto con
  le stesse misure. I popup delle notifiche (`ToastStackLazy`) si caricano
  al primo popup, i testi delle notifiche (`notificationCopy`) solo quando
  serve un popup.
- `HomeHero`: la larghezza della riga di esempi si misura solo quando cambia
  misura (`ResizeObserver`), le freccette si aggiornano solo quando cambiano,
  lo scorrimento automatico lavora un fotogramma alla volta solo mentre
  scorre davvero (pause e attesa iniziale con un timer). Comportamento uguale:
  parte dopo 2,5 s, pausa ai capi, si ferma per sempre al primo tocco, fermo
  col cursore sopra, fuori dallo schermo e con "riduci movimento".
- `GlowLights`: nessun cambio di velocità quando è già quella giusta.
- Home: "Nuovi professionisti" riceve dal server solo gli ultimi 21 iscritti
  con i campi mostrati (`apps/web/src/lib/newProfiles.ts`).
- Sezioni della home e piè di pagina dentro un confine di Suspense (React li
  prepara a pezzi). Il contenuto arriva già pronto dal server, non cambia
  nulla a vista.

Non fatto qui (proposto a Luca): togliere Tamagui dal disegno delle pagine
pubbliche o usare il suo compilatore (oggi il grosso del lavoro restante della
home è Tamagui che calcola gli stili di ogni elemento all'apertura), dividere
il client dell'API per pagina (46 KB non compressi su ogni pagina).

## Verifica

- Peso del JavaScript scaricato (compresso, senza il file per i browser
  vecchi che i telefoni moderni non scaricano): home 367 → 340 KB, città
  408 → 335 KB, profilo 411 → 330 KB, per-professionisti 339 → 309 KB.
  Pagina della home (HTML) 272 → 144 KB.
- Lighthouse telefono (Moto G Power simulato, CPU ×4) in locale contro l'API
  vera, sito prima e dopo accesi insieme e misurati alternati, mediana di 5-7
  giri: TBT città 626 → 357 ms, profilo 591 → 362 ms, per-professionisti
  700 → 538 ms, home 627 → 522 ms. LCP in locale già sotto 1,1 s in tutti e
  due i casi (in locale non c'è la rete del telefono).
- `confronto-pagine` (64 foto, pubbliche, computer e telefono): 57 identiche,
  7 con 12-46 pixel diversi (bordo di un pulsante, testo durante il caricamento),
  nessuna differenza visibile; la home identica.
- `pnpm lint`, `typecheck`, prove di `packages/shared`.
