---
name: deploy-ops
description: >-
  Deploy e operatività di Manovia: API e Postgres su Render (render.yaml, variabili d'ambiente, limiti free
  tier, scadenza DB 30 giorni, migrazioni e baseline P3005), sito su Vercel (push che non attivano una build,
  build saltate di proposito, Deploy Hook, origini OAuth Google). Usala per qualunque domanda o problema su
  deploy, produzione, "il sito non si aggiorna", variabili d'ambiente o database di produzione.
---

# Deploy e operatività

Note spostate da `CLAUDE.md` §2 (stesso testo). Le regole vincolanti sulle
migrazioni restano anche in `CLAUDE.md`.

- **Deploy `apps/api` su Railway**: Railway (builder "Railpack") rileva da
  solo il monorepo pnpm ed esegue `pnpm --filter @professionisti/api build`
  / `start`, ignorando eventuali Build/Start Command custom impostati a
  mano — per questo lo script `build` di `apps/api/package.json` costruisce
  esplicitamente prima `@professionisti/database` e `@professionisti/shared`
  (altrimenti TypeScript non trova quei moduli). Lo script `start` eseguiva
  `prisma db push --accept-data-loss` ad ogni avvio prima di far partire il
  server (scelta pragmatica iniziale, per non richiedere un comando manuale
  separato in un'interfaccia che l'utente trova difficile da navigare) —
  **sostituito** (CEO, audit tecnico: "un push che droppa una colonna è
  perdita dati silenziosa", rischio segnalato come blocco reale prima di
  avere utenti paganti) con migrazioni esplicite tracciate:
  `packages/database/prisma/migrations/` contiene ora una migrazione
  `baseline` generata dallo schema attuale (verificata: applicata a un
  database vuoto produce uno schema identico, byte per byte via `prisma
  migrate diff`, a quello che `db push` produceva), e lo script `start` di
  `apps/api/package.json` esegue `prisma migrate deploy` — non distruttivo
  per definizione, applica solo le migrazioni non ancora applicate, mai un
  `push` che sincronizza forzando lo schema.
  **Baseline del database esistente — automatica** (docs/CHANGELOG.md
  §128): il database Render di produzione ha le tabelle create da `db push`
  ma nessuno storico migrazioni, e `prisma migrate deploy` da solo fallisce
  con `P3005` ("The database schema is not empty" — successo davvero al
  primo deploy). Lo script `start` quindi non chiama più `migrate deploy`
  direttamente ma `packages/database/scripts/migrate-deploy.mjs`: se e solo
  se il deploy fallisce con `P3005`, marca la migrazione baseline come già
  applicata (`migrate resolve --applied`, non tocca dati né schema) e
  rilancia il deploy, che applica solo le migrazioni successive. Nessun
  comando manuale contro il DB di produzione; un DB nuovo e vuoto (es. dopo
  la scadenza 30gg) non dà `P3005` e riceve tutte le migrazioni da zero.
  **Regola per la baseline**: `20260921212750_baseline` deve restare lo
  schema **realmente presente** in produzione al momento del passaggio
  (ultimo `db push`, commit `034f1a5`), mai lo schema corrente — ogni
  cambiamento successivo va in una migrazione a parte (es.
  `20260923080000_booking_reminder_sent_at`, `Booking.reminderSentAt`, che
  in origine era finito per errore dentro la baseline e non sarebbe mai
  arrivato in produzione). Nuove modifiche allo schema: `prisma migrate dev
  --name <nome>` in locale, mai modificare una migrazione già committata.
  Stesso problema si è presentato in passato per i **dati** (non solo lo schema): `db
  push` sincronizza le tabelle ma non le righe, quindi la tabella
  `categories` restava vuota in produzione (mai eseguito `prisma db seed`
  lì) e ogni salvataggio di un profilo professionista falliva con
  "Categoria non valida" (`ProfessionalsService.upsertMyProfile`, che cerca
  la categoria per slug nel DB). Corretto con `CategoriesSeedService`
  (`apps/api/src/categories/categories-seed.service.ts`, hook
  `OnModuleInit`): sincronizza (upsert, idempotente) `PROFESSIONAL_CATEGORIES`
  nella tabella `categories` a ogni avvio dell'API, stesso principio pragmatico
  del punto sopra.
  Deploy live e funzionante (registrazione, login email e login Google
  testati sul sito reale): backend su Render (URL `<nome>.onrender.com`),
  Postgres su Render (senza estensione PostGIS — vedi nota schema sotto),
  variabili impostate: `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`,
  `FRONTEND_URL`. Render inietta `PORT` automaticamente — a differenza di
  Railway NON va impostata manualmente nelle env var.
  Il deploy è dichiarato come codice in **`render.yaml`** (Blueprint alla
  radice del repo): Dashboard Render → New → Blueprint → selezionare il repo
  crea API + database in un colpo solo. Le variabili segrete marcate
  `sync: false` vanno valorizzate una sola volta dalla dashboard.
  **Limiti free tier Render da ricordare**: il web service va in sleep dopo
  15 min di inattività (cold start ~1 min alla prima richiesta — le
  funzioni schedulate con `@nestjs/schedule` non girano mentre dorme);
  il Postgres free (1 GB) scade dopo 30 giorni → alla scadenza creare un
  nuovo DB free, aggiornare `DATABASE_URL` e rieseguire il seed
  (lo script `start` di `apps/api` applica già da solo le migrazioni ad
  ogni avvio, vedi sopra in questa sezione; le
  categorie si ripopolano da sole via `CategoriesSeedService` — nessun
  comando manuale necessario per quelle. Il seed dei dati demo, se
  servisse, si rilancia a mano puntando `DATABASE_URL` locale
  sull'External Connection String di Render con `?sslmode=require`).
  Due problemi risolti durante il primo deploy (su Railway), entrambi
  corretti nel codice (non solo in configurazione, per non doverli rifare
  ad ogni nuovo ambiente) e ancora validi su Render:
  1. `app.listen(port)` senza host esplicito si lega solo a IPv6 su
     alcune piattaforme cloud → il proxy pubblico (IPv4) non raggiunge il
     processo pur essendo partito correttamente nei log ("Application
     failed to respond"). Fix: `app.listen(port, "0.0.0.0")` in
     `apps/api/src/main.ts`.
  2. Ogni piattaforma può iniettare un proprio `PORT` diverso da 3001 —
     l'API legge sempre `process.env.PORT` (fallback 3001 in locale), mai
     hardcodare la porta.
  Sul frontend Vercel vanno impostate anche `NEXT_PUBLIC_API_URL` (verso
  l'URL Render) e `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (esisteva solo in
  `.env.local` locale, mai propagata a Vercel finché non serviva in
  produzione) — più l'origine `https://applicazione-web.vercel.app`
  aggiunta manualmente tra le "Authorized JavaScript origins" del Client
  ID OAuth su Google Cloud Console (altrimenti `Error 400: origin_mismatch`).
- **Deploy `apps/web` su Vercel — push che non attivano una build**: il
  repository ha un solo branch (`claude/professionisti-platform-architecture-xr9gmn`,
  nessun `main`). Il progetto Vercel (piano Hobby) risultava collegato al
  repository GitHub giusto (Settings → Git → "Connected Git Repository"
  mostrava `lucapetruolo-hub/applicazione`) ma i push non generavano più
  alcuna build automatica — sintomo: il sito live restava fermo a una
  versione vecchia anche dopo diversi commit, e persino "Redeploy" manuale
  dalla dashboard ricostruiva lo stesso commit vecchio invece di quello più
  recente. Su questo piano Vercel non espone un campo "Production Branch"
  modificabile in UI: il branch di produzione viene dedotto dal branch
  predefinito del repository al momento del collegamento, e non risulta
  aggiornarsi da solo se quel riferimento cambia dopo. **Fix che ha
  funzionato**: disconnect + reconnect del repository da Settings → Git
  (forza Vercel a ri-rilevare il branch predefinito attuale). Non risolto
  da un push vuoto da solo (provato prima, nessun effetto). Per un innesco
  immediato di build senza aspettare il rilevamento automatico, un **Deploy
  Hook** (Settings → Git → "Deploy Hooks", URL dedicato per branch) chiamato
  via browser/`curl` funziona sempre indipendentemente da questo problema —
  utile sia come verifica sia come soluzione ponte. Se ricapita in futuro,
  ripartire da lì invece di affidarsi solo a push+attesa.
  **Build saltate di proposito** (docs/CHANGELOG.md §131, quota piano
  gratuito): `apps/web/vercel.json` → `ignoreCommand` esegue
  `scripts/vercel-ignore-build.sh`, che salta tutte le anteprime (branch
  diversi dalla produzione) e, in produzione, i commit che non toccano
  `apps/web`, i pacchetti condivisi o le dipendenze. Se il sito "non si
  aggiorna", controllare prima nel log del deploy se compare "build
  saltata": è voluto per commit solo backend/mobile/docs. Redeploy e Deploy
  Hook sullo stesso commit costruiscono sempre. Le immagini `next/image` su
  Cloudinary sono ridimensionate da Cloudinary (`images.loaderFile`), non
  dall'ottimizzatore di Vercel.
