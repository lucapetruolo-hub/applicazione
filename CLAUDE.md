# CLAUDE.md — Regole del progetto

Piattaforma marketplace per la ricerca di professionisti locali (imbianchino,
elettricista, pulizie, idraulico, giardiniere, traslochi, ecc.), ispirata al
modello di miodottore.it/Doctolib ma applicata ai lavori artigianali/servizi
alla persona invece che alla sanità. Stessa interfaccia su iOS, Android e web
desktop.

> Questo file è la fonte di verità per le decisioni architetturali. Va
> aggiornato ogni volta che una decisione cambia — non lasciare che diventi
> obsoleto rispetto al codice.

---

## 1. Modello di business (guida le scelte tecniche)

Due fonti di ricavo, entrambe da riflettere nel data model fin dall'inizio:

1. **Abbonamenti SaaS per i professionisti** — canone mensile per: agenda
   digitale, promemoria automatici (riduzione no-show), fatturazione,
   eventualmente consulenza da remoto. Richiede un **backoffice** dedicato
   ai professionisti (dashboard gestionale), non solo un profilo pubblico.
2. **Pacchetti di visibilità/marketing** — i professionisti pagano per
   comparire più in alto nei risultati di ricerca locali (per
   categoria + zona) e per strumenti di gestione della reputazione
   (recensioni). Richiede: motore di ricerca con **ranking sponsorizzabile**,
   geolocalizzazione, e pagine profilo **SEO-friendly** (il traffico
   organico da Google è ciò che rende preziosa la visibilità a pagamento).

Implicazioni tecniche dirette:
- Le pagine profilo pubbliche e le pagine di categoria/città devono essere
  **server-rendered/indicizzabili** (SSR/SSG), non una SPA client-only.
- Il modello dati separa fin da subito: `User`, `ProfessionalProfile`,
  `Category`, `Subscription` (piano SaaS), `VisibilityBoost` (pacchetto
  marketing), `Booking`, `Review`, `Payment`, `Notification`.
- Serve un sistema di **notifiche/promemoria automatici** (push, email, SMS)
  come feature core, non accessoria.

---

## 2. Stack tecnologico

| Livello | Scelta | Perché |
|---|---|---|
| Web (desktop/mobile browser) | **Next.js** (App Router, TypeScript) | SSR/SSG per SEO su pagine categoria/professionista — critico per il ricavo da visibilità |
| App mobile (iOS + Android) | **Expo / React Native** (TypeScript) | Un'unica codebase per iOS e Android, OTA update, accesso a push notification/fotocamera/geolocalizzazione native |
| UI condivisa web+mobile | **Tamagui** (o in alternativa NativeWind) | Stessi componenti/design tokens compilati sia per React Native che per web → "stessa interfaccia" richiesta, senza duplicare il design system |
| Backend API | **NestJS** (Node.js, TypeScript) | Struttura modulare adatta a un dominio con tanti bounded context (utenti, prenotazioni, pagamenti, ricerca) |
| Database | **PostgreSQL** + **PostGIS** | Ricerca geografica (professionisti vicini) nativa in SQL; PostGIS evita di introdurre subito un motore di ricerca separato |
| ORM | **Prisma** | Type-safety end-to-end condivisa col resto del monorepo TS |
| Ricerca full-text avanzata (fase 2) | **Meilisearch** o **Typesense** | Da introdurre quando serve ranking sponsorizzato + filtri complessi oltre a ciò che Postgres gestisce bene |
| Autenticazione | **Email+password + Google Sign-In**, JWT emesso da `apps/api` | Login implementato direttamente in NestJS (bcrypt + `@nestjs/jwt`, niente Auth.js/Clerk): un solo backend emette la sessione per web e mobile. Niente Apple Sign-In (richiede Apple Developer Program a pagamento, non attivato) |
| Pagamenti | **Stripe** (Subscriptions + Checkout one-off) | Copre sia l'abbonamento SaaS ricorrente sia i pacchetti di visibilità one-shot |
| Notifiche | Expo Push, **Resend** (email), **Twilio** (SMS) | Promemoria automatici anti no-show |
| Code/cache | **Redis** (BullMQ) | Job asincroni: invio reminder, sync ranking di visibilità |
| Monorepo | **Turborepo** + **pnpm workspaces** | Build cache e task orchestration tra app/pacchetti condivisi |
| Hosting | Web → **Vercel** (`applicazione-web.vercel.app`); Mobile build → EAS (Expo); API/DB → **Render** (deciso, deployato; in precedenza Railway, abbandonato per scadenza piano free) | Scelta pragmatica per iterare velocemente in fase iniziale |
| Mappa risultati ricerca | **Leaflet + OpenStreetMap** (`apps/web` only, mai in `packages/ui`) | Puntini reali dei professionisti nei risultati di ricerca. Deciso esplicitamente con l'utente **al posto di** Google Maps/Places: nessuna chiave API, nessuna carta di pagamento su Google Cloud, tile OpenStreetMap gratuiti. Leaflet non gira in React Native (serve DOM/CSS) — se la mappa servirà anche su mobile andrà valutato `react-native-maps` separatamente, non è nello scope attuale |
| Storage immagini profilo | **Cloudinary** | Upload dell'immagine profilo dei professionisti (`apps/api/src/cloudinary/`). Deciso esplicitamente con l'utente al posto di Vercel Blob o di salvare il file nel database: piano gratuito senza carta di pagamento, CDN + resize automatico (800×800 max) incluso lato upload |
| Geocodifica indirizzo preciso | **Nominatim** (OpenStreetMap) | `apps/api/src/geocoding/geocoding.service.ts` — geocodifica l'indirizzo preciso (opzionale) inserito dal professionista in `/dashboard/profilo` per posizionarlo esatto sulla mappa dei risultati, invece che al centro del comune. Stessa scelta già fatta per le tile della mappa (niente Google Geocoding API, niente carta di pagamento): gratuito, nessuna chiave richiesta, solo uno User-Agent identificativo richiesto dalla usage policy. Usata solo al salvataggio del profilo (poche richieste al giorno), mai in un percorso di ricerca. Se la geocodifica non trova nulla o il servizio non risponde entro 5s, si ricade silenziosamente sul centro del comune (dataset ISTAT) — non deve mai bloccare il salvataggio del profilo |

Non introdurre framework o servizi alternativi a questa tabella senza
prima discuterne e aggiornare questo file.

**Note tecniche di scaffolding:**
- `.npmrc` usa `node-linker=hoisted`: richiesto da Expo/Metro in monorepo
  pnpm (risolve problemi di risoluzione dei moduli nested). Non rimuoverlo.
- I package condivisi (`packages/shared`, `packages/api-client`,
  `packages/database`) hanno uno step di **build reale** (tsc → `dist/`),
  non vengono consumati come sorgente TS: `apps/api` (NestJS) esegue
  `node dist/main.js` in produzione e non transpila i `node_modules` a
  runtime, a differenza di Next.js (`transpilePackages`) e Metro. `turbo dev`
  dipende da `^build` per garantire che i package siano compilati prima
  dell'avvio dei dev server.
- Il build di produzione di `apps/mobile` avviene su **EAS Build** (cloud),
  non in locale: `expo export` in locale è soggetto a un conflitto di
  versione noto tra pacchetti Metro in ambienti pnpm, non vale la pena
  risolverlo per un comando che non è il path di build reale.
- **Deploy `apps/api` su Railway**: Railway (builder "Railpack") rileva da
  solo il monorepo pnpm ed esegue `pnpm --filter @professionisti/api build`
  / `start`, ignorando eventuali Build/Start Command custom impostati a
  mano — per questo lo script `build` di `apps/api/package.json` costruisce
  esplicitamente prima `@professionisti/database` e `@professionisti/shared`
  (altrimenti TypeScript non trova quei moduli). Lo script `start` esegue
  `prisma db push --accept-data-loss` ad ogni avvio prima di far partire il
  server: scelta pragmatica per non richiedere un comando manuale separato
  in un'interfaccia che l'utente trova difficile da navigare — da sostituire
  con una migrazione esplicita (`prisma migrate deploy`, no data-loss
  automatico) prima che ci siano dati reali di utenti da rischiare.
  Stesso problema si è presentato per i **dati** (non solo lo schema): `db
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
  (lo script `start` di `apps/api` esegue già da solo `prisma db push
  --accept-data-loss` ad ogni avvio, vedi sopra in questa sezione; le
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
- **Guard JWT senza `@nestjs/passport`**: `apps/api/src/auth/jwt-auth.guard.ts` verifica il token
  manualmente con `JwtService.verify()` invece di usare `@nestjs/passport` +
  `passport-jwt`. Motivo: con quella combinazione (testata con
  `@nestjs/core@10.4.22` + `@nestjs/passport@10.0.3`), un guard che nega
  l'accesso restituisce sempre `500 Internal Server Error` invece di `401`
  — l'eccezione lanciata da `AuthGuard.handleRequest` non viene propagata
  correttamente nella pipeline async di Nest. Non reintrodurre passport per
  l'auth JWT senza aver prima verificato che il bug sia risolto a monte.
- **Regola critica Tamagui**: in `apps/web` e `apps/mobile` non importare
  MAI primitive da `"tamagui"` direttamente (`Text`, `XStack`, `YStack`,
  `H1`, `Input`, ecc.) — vanno sempre importate da `"@professionisti/ui"`,
  che le ri-esporta. Motivo: né `apps/web` né `apps/mobile` dichiarano
  `tamagui` come propria dipendenza (solo `packages/ui` la dichiara);
  importarla direttamente crea un'istanza del modulo diversa da quella in
  cui `createTamagui()` è stato eseguito, causando a runtime l'errore
  `Can't find Tamagui configuration` (capita sia in SSR che client-side,
  indipendentemente da `@tamagui/next-plugin`). Se serve una nuova
  primitiva Tamagui in un'app, va prima ri-esportata da
  `packages/ui/src/index.ts`.

---

## 3. Architettura (vista d'insieme)

```
                         ┌─────────────────────┐
                         │   packages/ui        │  Tamagui design system
                         │ (componenti condivisi)│  condiviso da web + mobile
                         └──────────┬───────────┘
                    ┌───────────────┼────────────────┐
                    ▼                                ▼
          ┌──────────────────┐             ┌──────────────────────┐
          │   apps/web        │             │   apps/mobile          │
          │   Next.js (SSR)   │             │   Expo/React Native   │
          │  - ricerca+SEO    │             │  - stessa UX           │
          │  - profili pubblici│            │  - notifiche push       │
          │  - dashboard pro   │            │  - dashboard pro        │
          │  - dashboard cliente│           │  - dashboard cliente     │
          └─────────┬─────────┘             └──────────┬────────────┘
                    │              REST/OpenAPI (typed via api-client)
                    └───────────────┬───────────────────┘
                                    ▼
                         ┌─────────────────────┐
                         │     apps/api          │  NestJS
                         │  - auth                │
                         │  - search (Postgres/  │
                         │    PostGIS → poi       │
                         │    Meilisearch)        │
                         │  - booking             │
                         │  - billing (Stripe)    │
                         │  - notifications        │
                         └──────────┬───────────┘
                                    ▼
                    ┌───────────────┴───────────────┐
                    ▼                                ▼
          ┌──────────────────┐             ┌──────────────────────┐
          │  PostgreSQL+PostGIS│           │   Redis (BullMQ jobs)  │
          └──────────────────┘             └──────────────────────┘
```

Principi:
- **Un solo backend (`apps/api`)** consumato sia da web che da mobile: niente
  logica di business duplicata nei due frontend.
- **UI condivisa** tramite `packages/ui`: un componente `ProfessionalCard`,
  `SearchBar`, ecc. si scrive una volta e si usa ovunque.
- **Logica/tipi condivisi** (validazioni, tipi delle entità, costanti come le
  categorie professionali) vivono in `packages/shared`, non duplicati.
- Web e mobile restano **due app separate** (non react-native-web
  "universal" puro) perché il web ha bisogno di SSR per SEO mentre il mobile
  ha bisogno di feature native — Tamagui è il collante che le fa sembrare la
  stessa interfaccia senza forzarle nello stesso runtime.

---

## 4. Struttura cartelle (monorepo)

```
/
├── apps/
│   ├── web/                 # Next.js — sito pubblico + dashboard web
│   ├── mobile/               # Expo/React Native — app iOS/Android
│   └── api/                   # NestJS — backend unico
├── packages/
│   ├── ui/                    # Design system Tamagui condiviso
│   ├── shared/                 # Tipi TS, zod schema, costanti (categorie, ecc.)
│   ├── api-client/              # Client tipizzato per chiamare apps/api
│   ├── config/                   # tsconfig/eslint/tamagui config condivisi
│   └── database/                  # Prisma schema + migrations
├── docs/                       # ADR e documentazione architetturale
├── CLAUDE.md
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

Regola: nessun codice di business dentro `apps/web` o `apps/mobile` che non
sia UI/routing — la logica va in `apps/api` o `packages/shared`.

---

## 5. Regole di sviluppo (da seguire sempre)

1. **Non scaffoldare o installare nulla senza conferma esplicita** finché
   l'architettura in questo file non è stata approvata dall'utente.
2. **TypeScript ovunque**, strict mode. Niente `any` non giustificato.
3. Ogni nuova entità di dominio (es. una nuova categoria di servizio, un
   nuovo stato di prenotazione) va prima riflessa nello schema Prisma in
   `packages/database`, poi propagata ai client.
4. Le pagine SEO-critiche (categoria, città, profilo professionista) restano
   **SSR/SSG in Next.js** — non convertirle in client-side rendering per
   comodità.
5. Nessuna duplicazione di componenti UI tra `apps/web` e `apps/mobile`: se
   serve un componente in entrambi, va in `packages/ui`.
6. Feature legate al modello di business (abbonamenti, boost di visibilità,
   promemoria no-show) sono **prioritarie** rispetto a feature accessorie:
   in caso di ambiguità sullo scope, chiedere prima di implementare la
   versione "ricca".
7. Pagamenti: usare sempre Stripe in modalità test durante lo sviluppo, mai
   hardcodare chiavi — solo variabili d'ambiente, mai committate.
8. Aggiornare questo file quando cambia una decisione tecnica: è la memoria
   persistente del progetto, non un documento statico.
9. **Principio fisso — visibilità dei contatti del cliente** ("Verbale
   Cognitivo" F6.3, richiesta esplicita dell'utente di fissarlo per
   iscritto: la stessa domanda era stata invertita tre volte nella
   cronologia del prodotto — subito visibile → solo dopo l'accettazione →
   di nuovo subito → di nuovo solo dopo l'accettazione, §12/§16/§45/§48 —
   senza mai un principio scritto a fermare l'oscillazione): **telefono,
   email e indirizzo del cliente sono visibili al professionista solo
   dopo un impegno reciproco confermato** (un preventivo accettato → una
   `Booking` creata), mai prima. Prima di quel momento il professionista
   vede solo città, descrizione del lavoro, foto/video e la cronologia
   della conversazione (chat) — mai un dato di contatto diretto. Non
   invertire questa regola una quarta volta senza discuterne
   esplicitamente con l'utente: se sembra necessario un'eccezione, è un
   segnale che va posta la domanda invece di cambiare il codice.
10. **Regola "zero emoji nell'interfaccia" (§10, Fase 2) abrogata** —
    decisione esplicita dell'utente, in risposta al rilievo F8.1 del
    "Verbale Cognitivo" (che anzi la elogiava com'era: "nessuna azione,
    tenerla come riferimento"). La regola resta descritta più sotto solo
    come cronologia di una decisione passata, non più vincolante da qui in
    avanti: un'emoji nell'interfaccia non è più da evitare per principio —
    resta comunque buon senso non abusarne, coerente con il tono caldo
    "Vicinato" (§19) già scelto per il prodotto. Nessun codice esistente
    modificato da questo solo cambio di regola (il sito ha oggi zero emoji
    tranne l'eccezione già documentata in coda a §31): riguarda solo lo
    sviluppo futuro.

---

## 6. Decisioni di prodotto

### Categorie professionisti (MVP)

Lancio con poche categorie ad alta frequenza di ricerca, poi si espande:
idraulico, elettricista, imbianchino, pulizie (casa/ufficio), giardiniere,
traslochi, fabbro, climatizzazione/caldaie, muratore/ristrutturazioni,
falegname. Ogni categoria ha sotto-tag di specializzazione (es. Elettricista
→ impianti civili, domotica, certificazioni), usati sia per il matching in
ricerca sia per differenziare i piani a pagamento.

Espansa oltre il set iniziale di mestieri artigianali con tre categorie di
assistenza alla persona, su richiesta esplicita dell'utente: **Tutto Fare**
(piccole riparazioni generiche), **OSS** (Operatore Socio-Sanitario,
assistenza domiciliare/ospedaliera), **Badanti** (assistenza anziani,
convivenza, compagnia). Fonte di verità unica in
`packages/shared/src/categories.ts` (`PROFESSIONAL_CATEGORIES`): icone SVG
e colori accento in `apps/web/src/components/icons/CategoryIcons.tsx`
(`CATEGORY_ICONS`/`CATEGORY_ACCENT`, tipizzati `Record<ProfessionalCategorySlug, ...>`
così il compilatore segnala ogni punto da aggiornare per una categoria
nuova). Nessuna migrazione DB necessaria per aggiungerne: `CategoriesSeedService`
sincronizza `PROFESSIONAL_CATEGORIES` nella tabella `categories` a ogni
avvio dell'API (stesso meccanismo del seed iniziale, vedi §2).

### Monetizzazione professionista — piani SaaS

| Piano | Prezzo indicativo | Cosa include |
|---|---|---|
| **Free** | €0 | Profilo base, riceve richieste, nessuna agenda automatica |
| **Pro** | ~€29/mese | Agenda digitale, promemoria automatici (SMS/push), badge "verificato" |
| **Business** | ~€59/mese | + fatturazione, multi-operatore, statistiche comparative |

Il piano Free è strategico: serve a popolare l'offerta sul marketplace fin
dal day 1 (senza professionisti non c'è ricerca). Il ricavo arriva
dall'upsell.

### Pacchetti di visibilità

- **Boost locale**: prime posizioni nei risultati per categoria + zona, a
  canone mensile o a credito consumato per contatto ricevuto.
- **Badge reputazione**: evidenza per rating alto + tempo di risposta rapido.
- **Storie di successo**: contenuti editoriali per i top professionisti
  (leva marketing/retention, come su miodottore.it).

---

## 7. Strategia go-to-market

1. **Concentrare la liquidità, non disperderla**: lanciare in 1 città con 3
   categoria ad alta frequenza (idraulico, elettricista, pulizie) prima di
   espandere. Un marketplace con ricerca vuota non converte, a prescindere
   da quante città copre sulla carta.
2. **Bootstrap manuale del lato offerta**: i primi 50-100 professionisti per
   città vanno reclutati uno per uno (telefonate, contatti diretti), con
   piano Pro gratuito per i primi 3 mesi. Senza offerta reale non c'è
   domanda da servire.
3. **Sequenza dei ricavi: lead a pagamento prima dell'abbonamento flat.**
   Un artigiano non si fida di un canone fisso finché non vede un lavoro
   arrivare dalla piattaforma. Fase iniziale a pagamento per lead
   qualificato (es. €3-8 a richiesta di preventivo ricevuta); solo dopo che
   il professionista vede ROI concreto lo si converte su abbonamento flat.
   **Questo cambia l'ordine del MVP**: il flusso "richiesta guidata + lead a
   pagamento" viene prima dell'abbonamento Stripe ricorrente (vedi sezione 9).
4. **La retention vera viene dal gestionale, non dal boost.** Il boost si
   disattiva con un click; l'agenda con storico clienti/fatture crea
   switching cost reale. Priorità di investimento tecnico coerente con
   questo.
5. **Verticale "urgenza" come margine più alto**: un flusso "richiesta
   urgente" con instant-match e notifica push immediata ai professionisti
   disponibili "ora" (es. idraulico per allagamento) giustifica una
   commissione più alta sul singolo intervento e differenzia da chi offre
   solo un elenco statico.
6. **SEO locale come canale di acquisizione a costo quasi zero**: pagine
   "quanto costa un [servizio] a [città]", recensioni per città/categoria —
   motivo per cui Next.js SSR non è negoziabile (vedi sezione 2).

---

## 8. Funzionalità chiave per innovazione, utilità, semplicità d'uso

- **Richiesta guidata invece di ricerca a scaffale**: foto + poche domande
  guidate → il sistema suggerisce categoria/sotto-categoria e un range di
  prezzo stimato, poi fa il fan-out ai professionisti compatibili in zona.
  Riduce le richieste alla categoria sbagliata, causa primaria di abbandono
  in questi marketplace.
- **Preventivo strutturato in-app**, non solo scambio di numero di
  telefono: modulo con manodopera/materiali/tempistiche, per mantenere la
  piattaforma nel mezzo della transazione (necessario anche per il modello
  a lead/commissione).
- **Recensioni solo da prenotazione confermata**: niente recensioni libere,
  per credibilità del sistema reputazionale che giustifica il badge a
  pagamento.
- **Onboarding pensato per professionisti non digital-native**: login via
  email+password o Google (niente OTP telefonico — deciso e implementato
  in fase di sviluppo, vedi §2), profilo minimo obbligatorio, bio generata
  da voce-testo; in fase di lancio manuale, un operatore crea il profilo al
  telefono con loro.
- **Notifiche quasi istantanee sulle nuove richieste**: in un mercato
  locale il primo professionista che risponde spesso si aggiudica il
  lavoro — la latenza della coda (Redis/BullMQ) è una feature competitiva,
  non un dettaglio tecnico.
- **App leggera e offline-friendly**: i professionisti sono spesso su
  cantieri con connessione scarsa — caching locale delle richieste, retry
  automatico sull'invio.
- **Dashboard con dati comparativi** ("il tuo profilo ha ricevuto 12
  visite, la media di categoria+zona è 28"): leva di prodotto per l'upsell
  al boost, costruita con dati già raccolti.

---

## 9. Stato del progetto

- [x] Architettura approvata dall'utente
- [x] Decisioni di prodotto (categorie, piani, go-to-market) approvate
- [x] Scaffolding monorepo (Turborepo/pnpm) — build e typecheck verdi su tutti i package
- [x] Setup `apps/api` (NestJS + Prisma + Postgres) — health check + endpoint categorie funzionanti
- [x] Setup `apps/web` (Next.js) — home + pagine categoria SSG (`/cerca/[categoria]`)
- [x] Setup `apps/mobile` (Expo Router) — home + schermata categoria, stessa struttura di rotte del web
- [x] Design system condiviso (`packages/ui`) — Tamagui, `Button` e `ProfessionalCard` usati sia da web che da mobile
- [x] Autenticazione (email+password + Google Sign-In, JWT via `apps/api`) — registrazione, login, logout, sessione persistita testati end-to-end, **in produzione** (sito Vercel + backend Railway, non solo in locale). Bug reale corretto: un professionista con account già esistente che si autenticava con Google dalla pagina `/registrati?ruolo=professionista` (es. da "Sei un professionista?" → "Iscriviti gratis" in header/`per-professionisti`, invece che da `/accedi`) finiva sempre su `/dashboard/profilo` invece che su `/dashboard` — la pagina trattava ogni autenticazione riuscita come una nuova registrazione. `/auth/register` e `/auth/google/verify` restituiscono già `isNewUser` (`AuthResult`, usato altrove per distinguere le due cose); `RegistratiForm.afterAuth` ora lo usa per decidere la destinazione: `/dashboard/profilo` solo se l'account è stato appena creato, `/dashboard` se esisteva già. Verificato con Playwright intercettando `/auth/google/verify` per simulare entrambi i casi (`isNewUser: true`/`false`).
- [x] Ricerca professionisti per categoria/città — `GET /professionals/search` e `/professionals/:id` reali su Postgres, ranking boost→rating→recensioni, SSR/ISR su homepage, `/cerca/[categoria]` e `/professionista/[id]`. Filtro geografico ancora per città (stringa esatta), non raggio PostGIS — ma dal comune scelto in fase di registrazione del profilo si ricavano ora coordinate reali (vedi elenco comuni sotto), pronte per quando si passerà al filtro a raggio.
- [x] Elenco completo comuni italiani con coordinate — `packages/shared/src/data/comuni.ts` (~7900 comuni, dati ISTAT: nome, provincia, regione, lat/lon), non solo i capoluoghi di provincia del precedente `ITALIAN_CITIES` (~110 voci, lasciato per compatibilità ma non più usato nei campi città). `findComuneByName()` usato server-side in `upsertMyProfile` per geocodificare `latitude`/`longitude` reali dal comune scelto dal professionista (prima restavano `0,0` come placeholder). Deciso con l'utente di non usare l'API Google Maps/Places (richiede carta di pagamento sull'account Google Cloud): il dataset ISTAT è gratuito e già completo.
- [x] Mappa vera nei risultati di ricerca — `apps/web/src/components/ResultsMap.tsx` (Leaflet + OpenStreetMap, vedi §2) mostrato di fianco all'elenco (`ResultsListWithMap.tsx`, layout lista a sinistra/mappa a destra sopra la soglia `$gtMd`, come da screenshot miodottore.it fornito dall'utente) su `/cerca/[categoria]` e `/cerca`. Un puntino per professionista con le coordinate reali del comune (vedi voce sopra); click sul puntino apre il profilo. Mostrata anche in modalità "Online" (vedi voce sotto): un professionista che offre consulenza da remoto resta comunque radicato in una zona. Import via `next/dynamic({ ssr: false })`: Leaflet legge `window` al caricamento del modulo, andrebbe in crash lato server se importato direttamente in un componente renderizzato in SSR. La mappa resta visibile anche con zero risultati (es. categoria senza nessun professionista in quella città): zooma comunque sulla città cercata (`findComuneByName` sul parametro città, passato come `fallbackCenter` a `ResultsMap`) invece di sparire o restare fissa sull'inquadratura di default su tutta Italia — coerente col comportamento di miodottore.it dove la mappa è sempre presente nei risultati.
- [x] Autocomplete: elenco visibile subito, non solo dopo aver scritto — `packages/ui/src/Autocomplete.tsx` mostrava un menu vuoto finché non si digitava qualcosa; ora a fuoco con campo vuoto mostra comunque i primi risultati (categorie o comuni), coerente con la richiesta esplicita dell'utente di vedere subito un elenco. Bug corretto nello stesso giro: il menu a discesa spariva dietro alla sezione successiva della homepage — `overflow="hidden"` sull'intero `Hero` (packages/ui) tagliava anche il dropdown, non solo le macchie decorative di sfondo per cui era stato messo (che hanno già il proprio wrapper con `overflow="hidden"` interno, quindi quello esterno era ridondante). Il campo "Cosa cerchi" mostra **solo le categorie** (Idraulico, Giardiniere, ecc., come su miodottore.it), non nomi di attività specifiche — su richiesta esplicita dell'utente, `apps/web/src/lib/searchSuggestions.ts` (`buildSearchSuggestions`) è l'**unica fonte di verità** per l'elenco categorie, costruita da `PROFESSIONAL_CATEGORIES` (packages/shared): stessa lista usata per le caselle categoria cliccabili sotto la ricerca, riusabile anche per un eventuale menu laterale futuro senza doverla duplicare. Il menu a discesa (categorie e comuni) è ora scrollabile con la rotellina — `Autocomplete` avvolge i risultati in un `ScrollView` (da `tamagui`, cross-platform: web e Expo) con altezza massima fissa, invece di tagliare la lista a poche voci senza modo di vederne altre; `maxResults` di default alzato da 6 a 30. L'elenco comuni (`ALL_ITALIAN_CITY_NAMES`) contiene solo comuni italiani (dataset ISTAT, verificato: 20/20 regioni, 110/110 province). Il campo città (in ricerca, profilo professionista e richiesta guidata) mostra l'elenco solo da 3 caratteri digitati in poi (`minChars={3}` su `Autocomplete`) — con ~7900 comuni i primi risultati "a caso" a campo vuoto non aiutavano; il campo categorie della ricerca resta invece visibile subito (solo 10 voci, `minChars` di default a 0). I risultati filtrati sono ordinati con i match che **iniziano** per il testo digitato prima di quelli che lo contengono solo a metà — bug reale segnalato dall'utente: scrivendo "Roma" nel campo città poteva comparire prima "Fabrica di Roma" (l'ordine dei risultati seguiva l'ordine originale del dataset, raggruppato per regione/provincia, non la pertinenza rispetto alla query).
- [x] Modalità di ricerca "A domicilio" / "Online" — tab nella barra di ricerca (`SearchBar`, homepage + pagine risultati), stesso pattern del riferimento miodottore.it ("In studio"/"Online") ma con etichette adattate al nostro dominio (interventi a casa, non studio medico). La ricerca filtra su `ProfessionalProfile.remoteAvailable` (nuovo campo, `POST /professionals/me` lo imposta da un checkbox in `/dashboard/profilo`, "Offro anche consulenza online" — realizza quanto già annunciato in CLAUDE.md §1 come "eventualmente consulenza da remoto"). Badge "📹 Online" su `ProfessionalCard` quando attivo. Il campo città resta selezionabile anche in modalità "Online" (opzionale): inizialmente veniva nascosto e scartato del tutto in questa modalità, ma un professionista che offre consulenza da remoto è comunque radicato in una zona, e un cliente può voler restringere la ricerca lì — richiesta esplicita dell'utente. Città e `remoteAvailable` sono filtri indipendenti in AND lato `ProfessionalsService.search`. La mappa risultati è mostrata anche in modalità "Online" (`showMap` sempre `true` in `CercaContent`/`CategoryContent`, decisione ribaltata rispetto a quando il campo città era nascosto): da mobile con lo stesso bottone "🗺️ Mostra mappa" della modalità "A domicilio", da desktop aperta subito a destra allo stesso modo.
- [x] Pagina "tutti i professionisti" (`/cerca`, senza categoria) — raggiunta quando la ricerca non riconosce una categoria specifica (solo città, solo "Online", o nome libero): elenco già popolato via SSR (stesso pattern SEO di `/cerca/[categoria]`), non una pagina vuota in attesa di digitare qualcosa. Routing di ricerca centralizzato in `apps/web/src/lib/searchNavigation.ts` (`buildSearchDestination`), usato da homepage, header categoria e header "tutti i professionisti" così i tre punti di ingresso alla ricerca si comportano allo stesso modo.
- [x] Richiesta guidata + fan-out lead — `POST /guided-requests` (autenticato) crea la richiesta e i `Lead` per i professionisti compatibili in categoria+città (o il singolo professionista se la richiesta parte dal suo profilo), pagina `/preventivo` e `/le-mie-richieste` funzionanti end-to-end. Se si arriva da un professionista specifico (`?professionista=`), la categoria è già determinata dalla sua specialità: `GuidedRequestForm` mostra un&apos;etichetta bloccata invece della griglia di scelta cliccabile, non ha senso farla ri-scegliere. Upload foto ora implementato: `POST /guided-requests/photos` (JWT, `FileInterceptor`) carica su Cloudinary (stessa trasformazione resize+compressione automatica dell&apos;immagine profilo professionista, cartella `guided-requests`) — nessun nuovo servizio di object storage, riusa la stessa integrazione già approvata in CLAUDE.md §2 per le immagini profilo, che al momento in cui l&apos;upload foto era stato rimandato non esisteva ancora. Fino a 3 foto per richiesta (`guidedRequestSchema.photoUrls`, un upload per foto, stato di caricamento/errore per singolo slot in UI). Suggerimento IA sulla categoria dalla foto (menzionato in §7-8) resta rimandato. Il cliente può modificare (`PATCH /guided-requests/:id`, solo descrizione e città — non la categoria, determina già a chi è stata inoltrata) o eliminare (`DELETE /guided-requests/:id`, cascata su `Lead`/`Quote` via Prisma) una richiesta già inviata, finché non è `CLOSED` (una prenotazione derivata esiste già a quel punto — bloccato sia per business logic sia per un vincolo di chiave esterna reale: `Booking.quoteId` non è in cascade). In `/le-mie-richieste`, "Modifica" apre un form inline (stesso `Autocomplete` città del form di creazione), "Elimina" richiede una seconda conferma prima di procedere. Ogni richiesta mostra ora anche una sezione "Inviata a" con i professionisti che l'hanno effettivamente ricevuta (`GuidedRequestsService.listForClient` include `leads.professionalProfile`, esposto come `sentTo` su `ClientGuidedRequest`: foto/icona categoria via `ProfessionalAvatar`, nome attività, categoria+città, badge "✓ Verificato") — richiesta esplicita dell'utente, prima non era chiaro a chi fosse arrivata la richiesta se non aprendo i preventivi ricevuti uno per uno. Il selettore foto (sia qui che in `/urgente`) usa ora un solo tasto "+ Aggiungi" con un unico `<input type="file" accept="image/*">` senza l'attributo `capture`: su iOS/Android questo fa comparire il menu nativo del sistema ("Scatta foto"/"Libreria foto", stile iPhone) invece di due tasti separati — richiesta esplicita dell'utente dopo che la versione a due tasti (uno con `capture="environment"` per aprire subito la fotocamera) risultava meno familiare del picker nativo a cui gli utenti iOS sono abituati. La selezione categoria (sia qui che in `/urgente`, stesso `GuidedRequestForm`) ha ora anche un `<select>` nativo oltre alla griglia di caselle cliccabili già esistente — scorciatoia più rapida su schermi piccoli, richiesta esplicita dell'utente; entrambi i controlli condividono lo stesso stato `categorySlug`, selezionare da uno aggiorna anche l'altro.
- [x] Preventivo strutturato in-app — `POST /quotes` (solo se il professionista ha ricevuto il lead), `POST /bookings/from-quote/:id` per l'accettazione cliente → crea `Booking` e chiude la richiesta. Modello a lead a pagamento: il prezzo per lead è calcolato e salvato (`Lead.priceEurCents`, standard vs urgente), ma il gate di pagamento reale al professionista arriva con Stripe (vedi voce sotto) — oggi i lead sono visibili gratis in dashboard. Il preventivo non è più due campi fissi manodopera/materiali: nuovo modello Prisma `QuoteItem` (nome + range di prezzo min/max, stesso pattern di `ProfessionalService`), un professionista può aggiungere quante voci servono (es. "Manodopera", "Materiali", "Trasporto"), ognuna col proprio range — richiesta esplicita dell'utente. `QuotesService.createOrUpdate` sostituisce la lista per intero ad ogni invio/modifica (delete+createMany, stesso pattern delle prestazioni). Form in `/dashboard` (`LeadCard`) parte con una voce "Manodopera" precompilata, rinominabile/rimovibile, con bottone "+ Aggiungi voce"; visualizzazione (in `/le-mie-richieste` e nell'agenda prenotazioni della dashboard professionista) tramite `formatServicePriceRange` già esistente, riusata senza duplicarla.
- [x] Recensioni vincolate a prenotazione confermata — `POST /reviews` accetta solo `bookingId` con status `COMPLETED`, un cliente non può recensire due volte la stessa prenotazione; il rating mostrato in ricerca è sempre calcolato dalle recensioni reali, mai un valore statico. Foto del lavoro svolto opzionali (`Review.photoUrls`, fino a 3, stesso pattern/limite di `GuidedRequest.photoUrls`): `POST /reviews/photos` carica su Cloudinary (stessa integrazione di profilo/richiesta guidata), form di recensione in `/le-mie-richieste` con upload per singola foto, mostrate come miniature sotto ogni recensione nel profilo pubblico del professionista. Le miniature (recensioni) e la foto profilo nell'header sono ora cliccabili per aprirle a schermo intero — `apps/web/src/components/PhotoLightbox.tsx` (overlay DOM grezzo, stesso pattern di `ImageCropModal`, nessuna libreria aggiunta), frecce prev/next quando una recensione ha più foto, richiesta esplicita dell'utente. Sezione "Recensioni" del profilo pubblico mostra anche la media in stelle in forma grafica — `apps/web/src/components/StarRating.tsx`: due righe di stelle SVG sovrapposte (una grigia, una dorata ritagliata in `overflow:hidden` alla percentuale esatta del voto, es. 4,5/5 → 90%) per rendere correttamente anche i voti frazionari, non solo stelle intere — più il numero di recensioni tra parentesi (es. "(160 recensioni)"), richiesta esplicita dell'utente.
- [x] Dashboard professionista — `/dashboard/profilo` (creazione/modifica profilo pubblico) e `/dashboard` (richieste ricevute con invio preventivo inline, agenda prenotazioni con stato). Promemoria automatici anti no-show non ancora implementati: serve integrare Resend/Twilio (già nello stack approvato) con un job schedulato (BullMQ), rimandato insieme a Stripe.
- [x] Abbonamenti Stripe (upsell da Free a Pro/Business) — `POST /billing/subscription/checkout` crea una Stripe Checkout Session (mode subscription), webhook `POST /billing/webhook` (firma verificata, body raw) aggiorna `Subscription` su `checkout.session.completed`. Pagina `/per-professionisti` collegata al checkout reale.
- [x] Pacchetti di visibilità/boost ricerca — `POST /billing/boost/checkout` (Boost locale/Badge reputazione/Storia di successo, 30gg), sezione "Aumenta la tua visibilità" in dashboard. Pagamento lead: `POST /billing/leads/:id/checkout` implementato e testato lato API, non ancora esposto in UI (i lead restano visibili gratis in dashboard, vedi nota sopra).
  - **Da fare prima del lancio**: il codice Stripe è completo e testato (percorso "non configurato" verificato end-to-end), ma servono le chiavi reali per attivarlo — variabili d'ambiente richieste su `apps/api`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS`, più `FRONTEND_URL` per i redirect di successo/annullo. Senza queste variabili gli endpoint rispondono con un errore chiaro invece di andare in crash (stesso pattern già usato per `GOOGLE_CLIENT_ID`).
- [x] Flusso "richiesta urgente" con instant-match — `/urgente` riusa lo stesso motore di `/preventivo` (componente condiviso `GuidedRequestForm`) con `isUrgent=true`: lead a prezzo maggiorato (€8 vs €5, CLAUDE.md §7.5), fan-out identico, badge "🔴 Urgente" visibile nella dashboard professionista. "Instant-match" oggi significa fan-out immediato via API, non ancora push notification in tempo reale al professionista: quello arriva con l'integrazione notifiche (Resend/Twilio + BullMQ), stessa dipendenza dei promemoria anti no-show.
- [x] Area account cliente ("Il mio account") — menu a tendina nell'header (`AccountMenu`, click-to-open) con voci diverse per ruolo: cliente → Impostazioni dell'account, Professionisti salvati, Le mie visite; professionista → Dashboard, Profilo pubblico, Impostazioni dell'account. Elenco voci centralizzato in `apps/web/src/lib/accountMenuItems.ts`, condiviso da `AccountMenu` e `AccountSidebar` (niente duplicazione). `PATCH /auth/me` (nome/cognome/data di nascita/email/telefono), `POST /auth/change-password` (password attuale opzionale se l'account è nato con Google Sign-In e non ha ancora una password — `GET/PATCH /auth/me` espone `hasPassword` per distinguere "Impostare la password" da "Aggiorna password" in UI) e `DELETE /auth/me` (cancellazione account, cascade su tutte le entità collegate via Prisma `onDelete: Cascade`, richiede di scrivere "ELIMINA" per conferma) su `/account` — layout a due colonne (sidebar sinistra + campi a destra, righe etichetta/valore) modellato sullo screenshot di miodottore.it fornito dall'utente. Rispetto a quel riferimento, omesse volutamente "Cambia firma" e "Sicurezza dell'account" (2FA): nessuna funzionalità reale dietro in questo dominio, e "Wallet"/"I miei pagamenti": nel nostro modello il cliente non paga sulla piattaforma (paga il professionista, per lead/abbonamento/boost) — da aggiungere solo se il modello di business cambia. `SavedProfessional` (nuovo modello Prisma) + `GET/POST/DELETE /saved-professionals` per il tasto "♡ Salva" sul profilo professionista e la lista `/professionisti-salvati`.
- [x] Immagine profilo professionista — `ProfessionalProfile.imageUrl` (nuovo campo Prisma), upload via `POST /professionals/me/image` (`FileInterceptor`, JWT-guarded) che carica su **Cloudinary** (scelto con l'utente al posto di Vercel Blob o di salvare il file nel database: gratuito, CDN + resize automatico inclusi, `apps/api/src/cloudinary/`) e salva l'URL sul profilo. UI di caricamento in `/dashboard/profilo` (bottone "Carica immagine" + anteprima circolare, input file nascosto attivato via ref, niente drag&drop). L'immagine è visibile ovunque compare `ProfessionalCard` nei risultati (`/cerca`, `/cerca/[categoria]`, homepage, `/professionisti-salvati`) tramite il nuovo componente `apps/web/src/components/ProfessionalAvatar.tsx`, che mostra l'immagine se presente e altrimenti ricade sull'icona colorata di categoria (`CategoryIconBadge`) già esistente — stesso slot `icon` di `ProfessionalCard`, nessuna modifica a `packages/ui` (l'`<img>` resta web-only in `apps/web`, coerente con la nota già presente su `CategoryIconBadge`).
  - **Da fare prima del lancio**: come per Stripe, il codice è completo e testato (percorso "non configurato" verificato end-to-end: mostra un errore chiaro sotto al bottone invece di andare in crash), ma servono le credenziali reali — variabili d'ambiente richieste su `apps/api`: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (account Cloudinary gratuito, nessuna carta di pagamento richiesta al piano free).
  Ritaglio lato client prima dell'upload — `apps/web/src/components/ImageCropModal.tsx` (canvas nativo, nessuna libreria aggiunta): drag per spostare, slider per zoomare, anteprima con maschera circolare identica alla forma dell'avatar mostrato nel resto del sito. Upload lato server ottimizzato con `quality: "auto", fetch_format: "auto"` di Cloudinary (compressione automatica + formato più leggero per il browser richiedente, es. WebP) oltre al resize 800×800 già presente.
  Bug reale corretto: `clampOffset` calcolava il limite di trascinamento verticale usando `displayedWidth` invece di `displayedHeight` — per una foto "lunga" (verticale), `displayedWidth` coincide esattamente con `STAGE_SIZE` (è la dimensione che "copre" esattamente), azzerando il range consentito sull'asse Y e bloccando del tutto il trascinamento verso il basso (impossibile vedere la parte inferiore della foto). Corretto passando larghezza e altezza separate, un limite per asse.
  Bug reale corretto: caricare un'immagine PRIMA di aver salvato il profilo base (nessuna riga `ProfessionalProfile` ancora, es. professionista appena registrato) faceva fallire l'update Prisma con un errore non gestito (`P2025`, record da aggiornare non trovato) → generico Internal Server Error invece di un messaggio chiaro. `ProfessionalsService.updateMyImage` ora usa la stessa guardia (`requireMyProfileId`) già in uso per `getMyLeads`/`getMyBookings`.
- [x] Ricerca sempre aggiornata, mai professionisti eliminati/obsoleti — `/`, `/cerca/[categoria]` e la fetch di ricerca in `packages/api-client` sono passati da ISR (`revalidate = 300`, fino a 5 minuti di dati non aggiornati) a server-rendered ad ogni richiesta (`export const dynamic = "force-dynamic"` sulle pagine + `cache: "no-store"` esplicito sulla fetch stessa — il solo `dynamic` sulla pagina non basta: il Data Cache di Next.js può comunque mantenere in cache la singola fetch). Bug reale trovato dall'utente: un professionista che eliminava l'account restava visibile in ricerca fino alla successiva rigenerazione ISR — inaccettabile per un marketplace (un cliente potrebbe contattare un professionista che non esiste più). Il volume di traffico atteso in fase di lancio (§7: 1 città, poche categorie) non giustifica il rischio pur di risparmiare query al DB.
- [x] Pannello admin minimale — `GET /admin/users` (JWT + `AdminGuard`, verifica il ruolo `ADMIN` rileggendolo dal DB ad ogni richiesta invece di fidarsi del JWT, così una promozione/retrocessione ha effetto immediato) restituisce utenti registrati divisi per ruolo (email, nome, ragione sociale se professionista, data). Pagina `/admin` (nessun link in UI, solo URL diretto) mostra le due liste. Promozione ad ADMIN self-service: `POST /admin/bootstrap` (`AdminBootstrapController`, deliberatamente **senza** `JwtAuthGuard`/`AdminGuard` — quei guard richiedono di essere già ADMIN, impossibile per il primissimo admin) protetto da `ADMIN_BOOTSTRAP_SECRET` (solo variabile d'ambiente su Railway, mai committata; senza quella variabile risponde con un errore chiaro, stesso pattern già usato per Stripe/Cloudinary/Google): email sconosciuta → 404, codice sbagliato → 403, altrimenti promuove e ritorna il nuovo ruolo. Pagina `/admin/promuovi` (form email+codice, nessun link in UI, nessun controllo di login — la protezione è il codice) evita di dover usare la console SQL di Railway per il primo admin.
- [x] Mappa risultati responsive da mobile — `ResultsListWithMap.tsx` non usa più i props responsive di Tamagui per il layout mappa/lista (niente `order` — non supportato da React Native/Tamagui — né `position:"sticky"` tipizzato): usa classi CSS grezze via styled-jsx (incluso in Next.js, nessuna libreria aggiunta). Da mobile la mappa **non appare più automaticamente** (occupava subito spazio sotto la ricerca): un bottone "🗺️ Mostra mappa" nella barra sopra i risultati la apre/chiude a comando, a tutta larghezza sopra la lista. Sopra la soglia resta sempre visibile a fianco della lista (larghezza fluida 40%, tra 260 e 480px, per non forzare overflow orizzontale), alta e sticky in scroll. Soglia a **700px** (non lo `$gtMd` di Tamagui, 1021px): quella lasciava impilata la mappa anche su una finestra desktop "normale" non a schermo intero (~1000px) — bug reale segnalato dall'utente con screenshot, dove la mappa doveva stare a destra e invece appariva sotto la lista. Cliccando un puntino sulla mappa (`ResultsMap.tsx`) non si naviga più subito al profilo: appare un banner in basso sulla mappa (foto/icona categoria, nome attività, categoria+città, rating, "Verificato") con un tasto "✕" per chiuderlo — solo toccando il banner si apre il profilo completo, la mappa resta aperta nel frattempo.
- [x] Indirizzo e prestazioni con prezzo nella card — nuovo modello Prisma `ProfessionalService` (nome + prezzo facoltativo in centesimi, cascade su eliminazione profilo) e campo `ProfessionalProfile.address` (facoltativo: molti professionisti a domicilio non hanno un indirizzo fisso da mostrare). Editabili in `/dashboard/profilo` (campo indirizzo + lista prestazioni con bottone "+ Aggiungi prestazione", ogni voce nome+prezzo in euro convertito in centesimi al salvataggio; la lista viene sostituita per intero ad ogni salvataggio, niente editing granulare per singola voce — coerente con la scala attesa). Mostrati in `ProfessionalCard` (packages/ui, sotto categoria/città: 📍 indirizzo, poi fino a 3 prestazioni con prezzo o "Su richiesta" se non indicato) nei risultati di ricerca e nel profilo pubblico — modellato sullo screenshot di miodottore.it fornito dall'utente. Il prezzo di ogni prestazione è un **range** (`priceMinEurCents`/`priceMaxEurCents`, non più un valore fisso): molti lavori (es. "sostituzione caldaia") hanno un costo che varia da caso a caso, un prezzo unico era fuorviante — richiesta esplicita dell'utente. In `/dashboard/profilo` due campi "Da €"/"a €" per prestazione (validazione: il massimo dev'essere ≥ del minimo). Visualizzazione centralizzata in `formatServicePriceRange` (`packages/shared/src/professionals.ts`, usata da `ProfessionalDetailContent`; duplicata localmente in `packages/ui/src/ProfessionalCard.tsx` che non dipende da `@professionisti/shared`): mostra il range se min e max sono entrambi impostati e diversi, un prezzo singolo se solo uno dei due è impostato (o sono uguali), "Su richiesta" se nessuno dei due lo è. Suggerimenti di prestazioni popolari per categoria (`POPULAR_SERVICES`, `packages/shared/src/categories.ts`, 5 voci per ciascuna delle 13 categorie): in `/dashboard/profilo` una riga di chip cliccabili sopra la lista (solo i nomi non ancora aggiunti) aggiunge una prestazione col nome precompilato — il range di prezzo resta comunque da compilare a mano, è solo una scorciatoia sul nome, richiesta esplicita dell'utente.
- [x] Agenda settimanale del professionista — nuovo modello Prisma `AvailabilitySlot` (fasce orarie ricorrenti: `dayOfWeek` + `startTime`/`endTime`, `dayOfWeek` segue la convenzione `Date.getUTCDay()` — 0=domenica...6=sabato — apposta per confrontare senza conversioni la disponibilità con `Booking.scheduledAt`). Editabile in `/dashboard/agenda` (nuova voce "Agenda" nel menu account professionista, `accountMenuItems.ts`): un editor per giorno della settimana (Lunedì...Domenica) con più fasce orarie aggiungibili/rimovibili, lista sostituita per intero ad ogni salvataggio (stesso pattern delle prestazioni). `GET /professionals/:id/agenda` proietta la disponibilità ricorrente sui prossimi 14 giorni di calendario e barra le fasce che coincidono con una prenotazione reale (`Booking` con status `PENDING`/`CONFIRMED`/`COMPLETED` il cui `scheduledAt` cade dentro quella fascia) — confronto su data/ora UTC dirette, nessuna libreria di timezone introdotta. Mostrata nel profilo pubblico (`ProfessionalDetailContent`, sezione "Agenda" tra Prestazioni e il bottone preventivo, visibile solo se il professionista ha impostato almeno una fascia): elenco giorno per giorno, pillola verde per le fasce libere, grigia con barrato per quelle prenotate. Prenotazione diretta opzionale: `ProfessionalProfile.bookableAgenda` (checkbox in `/dashboard/agenda`, "Permetti ai clienti di prenotare direttamente da questi orari" — default `false`, altrimenti l'agenda resta solo informativa come sopra). Se attiva, le fasce libere nel profilo pubblico diventano cliccabili per un cliente loggato: `POST /professionals/:id/agenda/book` rivalida tutto lato server (mai fidarsi del client) — 403 se `bookableAgenda` è spenta, 404 se la fascia non fa parte della disponibilità ricorrente del professionista, 409 se già prenotata — altrimenti crea direttamente un `Booking` (`PENDING`, nessuna `Quote`) e la fascia si aggiorna subito in UI. **Superata da un giro successivo di correzioni/funzionalità — vedi §11.**

---

## 10. Redesign visivo — "Scheda Intervento"

Iniziativa di redesign completo su brief esterno dettagliato (linguaggio visivo
da disegno tecnico/scheda di lavoro cartacea: griglia cianografica, etichette
mono, filetti sottili, niente ombre/gradienti/emoji). Eseguita per fasi
incrementali, ogni fase deployabile — **non una riscrittura**. Fase 0 (audit)
in `AUDIT.md` (root del repo): mappa stack/route/componenti reali, uso emoji,
fonti dati, form/validazione, dati demo in produzione — riferimento per capire
cosa esisteva prima di ogni fase successiva.

Decisioni prese con l'utente prima di procedere oltre l'audit (il brief
presupponeva Next.js+Tailwind, lo stack reale è Next.js+**Tamagui condiviso
con l'app mobile** — vedi §2/§3, conflitto non risolvibile silenziosamente):

1. **Token e componenti nuovi vivono dentro Tamagui** (`packages/ui`), non in
   un `apps/web/components/ui/` parallelo con Tailwind — mantiene la garanzia
   "stessa interfaccia web+mobile" di CLAUDE.md invece di introdurre un secondo
   design system nello stesso repo.
2. **Icone**: `lucide-react` su web, `lucide-react-native` su mobile per gli
   stessi punti condivisi (icone SVG scritte a mano dove serve un'icona
   identica su entrambe le piattaforme senza due dipendenze parallele, es.
   `CategoryIcons.tsx` già esistente).
3. **Dati demo**: da rimuovere subito dal codice non appena si arriva a
   toccare quella pagina (non in blocco prima del resto) — testimonial statiche
   in `HomeContent.tsx`, etichetta "Profili dimostrativi" fuorviante su dati
   reali. L'account professionista di test "Rossss" (indirizzo esposto) visto
   in produzione **non è gestibile da qui**: va rimosso manualmente su Railway,
   segnalato in `AUDIT.md` §7.

**Fase 1 — token colore/tipografia, `Section`/`Eyebrow` (fatto):**
- `packages/ui/src/tokens.ts`: palette brand (`gesso`, `calce`, `grafite`,
  `grafite70`, `filetto`, `cianografia`, `cianografiaScuro`, `cianografiaVelo`,
  `verificato`, `urgenza`, `ottone`) come costanti raw + `radiusDoc`/`radiusDocLg`
  (4px/8px). **Additivi**: `packages/ui/src/config.ts` estende
  `createTokens({...defaultConfig.tokens, color: {...defaultConfig.tokens.color, ...brand}})`
  invece di sostituire — i token Tamagui di default (`$blue10`, `$color3`,
  `$red10`...) restano intatti e continuano a funzionare su tutte le pagine
  non ancora coinvolte nel redesign.
- Tipografia: **Archivo** (display/heading), **Inter Tight** (body), **IBM
  Plex Mono** (mono/etichette) — cablati come `family` dei font token Tamagui
  già esistenti (`heading`/`body`/`mono`, scale size/weight/lineHeight non
  toccate). Famiglia diversa **per piattaforma sullo stesso token**: su web
  punta alle CSS variable di `next/font` (`apps/web/src/app/fonts.ts`,
  applicate su `<html>` in `layout.tsx`); su native al nome esatto caricato
  via `useFonts` in `apps/mobile/app/_layout.tsx`
  (`@expo-google-fonts/archivo`, `/inter-tight`, `/ibm-plex-mono`, pesi
  700/800, 400/500/600, 500 — installati e caricati, gate del render finché
  non sono pronti). Limite noto e documentato in `config.ts`: React Native non
  supporta il cambio di peso su un'unica famiglia variabile come il CSS — ogni
  peso è una famiglia nativa a parte, il token porta un solo peso
  rappresentativo per ruolo, non ancora una scala completa lato native.
  `Platform.OS` risolve correttamente in `config.ts` (file unico condiviso)
  grazie a `react-native-web`, già dipendenza di `packages/ui`.
- **Nuovo alias webpack obbligatorio** in `apps/web/next.config.mjs`
  (`"react-native$": "react-native-web"` + estensioni `.web.*`): prima
  d'ora nessun file bundlato per il web importava `"react-native"`
  direttamente, quindi il problema non si era mai presentato — Metro
  (Expo) risolve quell'alias in automatico, il webpack di Next.js no.
  Pattern standard per ogni integrazione Tamagui+Next.js, non specifico di
  questo progetto.
- `packages/ui/src/Section.tsx` + `Eyebrow.tsx`: wrapper unico per il ritmo
  verticale delle sezioni (96px desktop / 64px mobile via `$gtSm`, mai
  padding ad-hoc nelle pagine) ed etichetta mono uppercase con filetto 24px.
  Il pattern a griglia cianografica (`tone="blueprint"`) **non genera CSS
  nel componente**: resta portabile al 100% su React Native (stessa ragione
  per cui Leaflet resta `apps/web`-only, vedi §2) — il pattern vero
  (`repeating-linear-gradient`) è la classe utility `.bp-grid` in
  `apps/web/src/app/globals.css`, da applicare dalle pagine dove serve
  (hero, CTA finale — Fase 4, non ancora fatto).
- Verificato: typecheck pulito su `packages/ui`/`apps/web`/`apps/mobile`,
  build di produzione `apps/web` verde, smoke test Playwright su 5 pagine
  (font applicati correttamente via `getComputedStyle`, zero errori nuovi in
  console — i soli fallimenti di rete osservati sono tile OpenStreetMap e
  script Google Identity, bloccati dalla policy di rete dell'ambiente di
  sviluppo, non causati da questo cambio).

**Fase 2 — sistema icone, eliminazione emoji, logo (fatto):**
- **64 emoji sostituite in 23 file** (audit iniziale ne aveva trovate 51 in 22
  file: mancavano `apps/mobile/app` — verificato vuoto — e
  `packages/shared/src/categories.ts`, trovate in un secondo giro con range
  Unicode più ampi). Zero rimaste nel codice sorgente delle interfacce
  (verificato con scansione finale, gli unici `→` residui sono frecce dentro
  commenti di codice, non testo UI).
- **Icone cross-platform**: `packages/ui/src/icons.tsx` (nativo,
  `lucide-react-native`) + `icons.web.tsx` (web, `lucide-react`) — stesso
  pattern di risoluzione per estensione già usato per i font in Fase 1
  (`icons.web.tsx` vince su Next.js grazie a `resolve.extensions` in
  `next.config.mjs`, `icons.tsx` è il default che Metro risolve per
  Expo/mobile). `packages/ui/src/Icon.tsx` è il componente pubblico
  (`<Icon name="wrench" size={20} color={...} />`), unico punto da importare
  da `apps/web`/`apps/mobile`. `color` è un valore letterale (hex/rgba), mai
  `"currentColor"` (non esiste su React Native) — default `brand.grafite`.
  Nei file `apps/web`-only (18 dei 23) le icone sono importate direttamente
  da `lucide-react` (nessun bisogno del layer cross-platform, quel codice
  non gira mai su mobile) — `lucide-react` è ora dipendenza diretta anche di
  `apps/web`, non solo di `packages/ui`.
- **`packages/shared/src/categories.ts`**: il campo `icon` di ogni categoria
  non è più un glifo emoji ma una chiave di `packages/ui/src/icons.tsx`
  (es. `"wrench"`, kebab-case) — coerente col principio che
  `packages/shared` non ha dipendenze UI, porta solo la chiave testuale. Ogni
  punto che prima renderizzava `{category.icon}` come testo (griglia
  categoria in `GuidedRequestForm`, `/dashboard/profilo`, menu a tendina
  categoria, schermata categoria di `apps/mobile`) ora usa `<Icon
  name={category.icon} />`. `CategoryCard` (`packages/ui`, usata da
  `apps/mobile/app/index.tsx`) idem. Il `<select>` nativo non può contenere
  un'icona SVG dentro un `<option>` (i browser la ignorano): lì resta solo
  il testo.
- **`apps/web/src/components/icons/CategoryIcons.tsx`** (badge colorati
  categoria in card/ricerca) **non toccato**: erano già SVG disegnate a mano,
  zero emoji, sistema funzionante — sostituirle con Lucide non era necessario
  per l'obiettivo "zero emoji" della Fase 2 e avrebbe rischiato regressioni
  visive su ricerca/card senza un problema reale da risolvere.
- **Logo**: `packages/ui/src/Logo.tsx` (nativo, `react-native-svg`) +
  `Logo.web.tsx` (web, SVG DOM piatto) — stesso split per-piattaforma delle
  icone, necessario perché lo shim web di `react-native-svg` importa a sua
  volta `@react-native/assets-registry` (sintassi Flow non parsabile dal
  webpack di Next.js, anche passando dal suo stesso entry point `.web.js`):
  bypassato non facendo mai toccare `react-native-svg` al bundle web.
  Marchio quadrato 28×28 blu cianografia con un glifo bianco a due tratti
  (linee ad angolo retto, richiamo alla "squadra da disegno" del brief),
  wordmark "Professionisti" in Archivo 800. Sostituisce "🛠️ Professionisti"
  in `SiteHeader`/`SiteFooter`. `variant="mark"` per spazi stretti.
- **Favicon/icone di sistema**: `apps/web/src/app/icon.svg` (favicon, stesso
  mark, convenzione file-based di Next.js — nessun `<link>` manuale),
  `apple-icon.tsx` (180×180, generato con `next/og` `ImageResponse`: PNG
  richiesto da Apple, non producibile come SVG statico) e
  `opengraph-image.tsx` (1200×630, `next/og`, fondo grafite + marchio +
  claim — l'unico blocco scuro coerente col resto del redesign). Aggiunto
  `metadataBase` in `layout.tsx` (mancava del tutto): senza quello Next.js
  risolve i link social con un fallback `http://localhost:3000` anche in
  produzione.
- Verificato: typecheck pulito su tutti i package, build `apps/web` verde
  (incluse le tre nuove route `icon.svg`/`apple-icon`/`opengraph-image`),
  smoke test Playwright con screenshot su 11 pagine (home, login,
  registrazione, preventivo da loggati — griglia categorie con icone,
  dashboard profilo/agenda, le mie richieste, ricerca con `ProfessionalCard`)
  — zero emoji visibili, zero errori console nuovi.

**Fase 3 — libreria componenti primitivi (fatto):**
- Tutti i nuovi componenti vivono in `packages/ui` (non un
  `apps/web/components/ui/` locale), stessa decisione architetturale delle
  fasi precedenti — restano condivisi con `apps/mobile`.
- **Puramente additiva**: nessuna pagina esistente è stata riscritta per
  usarli in questa fase (arriverà con la Fase 4/5, home e pagine interne).
  Il sito resta visivamente identico a prima — verificato per screenshot
  (vedi sotto).
- `Button.tsx` **esteso**, non sostituito: nuova prop opzionale `variant`
  (`primary | secondary | ghost | urgent`, 48px altezza, radius 4,
  cianografia/grafite/urgenza) — quando `variant` non è passata (tutte le
  decine di usi esistenti oggi) il bottone resta esattamente com'era prima
  (sfondo `$blue10`, radius `$4`), zero regressioni. Le pagine future
  opteranno in modo esplicito per le nuove varianti.
- `Surface.tsx` — il "Card" del brief (superficie bianca, bordo hairline,
  radius 4, niente ombra), **rinominato `Surface`** invece di `Card`: questo
  package già re-esporta `Card` di Tamagui (usato da `CategoryTile` e da
  `ProfessionalCard` con le prop originali `elevate`/`bordered`, non ancora
  riscritte) — un secondo componente con lo stesso nome avrebbe causato un
  conflitto di export o cambiato quelle pagine senza controllo.
- `Chip.tsx`, `Badge.tsx` (varianti `verificato | pro | urgente | nuovo`,
  colori semantici fissi, mai liberi — coerente con la regola di CLAUDE.md
  §1.2 "rosso solo su urgenza, verde solo su verificato, ottone solo su
  pagamento"), `Rating.tsx`, `Field.tsx`, `Avatar.tsx`, `EmptyState.tsx`:
  nuovi, nessun nome in conflitto.
- `Rating.tsx` **non sostituisce** `apps/web/src/components/StarRating.tsx`
  (che resta dov'è, web-only): quello usa una tecnica di ritaglio CSS per il
  riempimento frazionario esatto delle stelle (es. 4,5/5 → 90% di
  riempimento), non portabile su React Native. `Rating.tsx` in `packages/ui`
  arrotonda alla stella intera più vicina per restare cross-platform — stessa
  informazione, precisione visiva diversa, uso diverso (componente di libreria
  condivisa vs. sezione recensioni specifica del profilo pubblico web).
- `Avatar.tsx` mostra la foto reale se `imageUrl` è passato (via `Image` da
  `"react-native"`, che risolve a un `<img>` reale tramite `react-native-web`
  senza la stessa complicazione di `react-native-svg` — vedi nota
  Logo.tsx/Logo.web.tsx in Fase 2), altrimenti iniziali su fondo
  cianografia-velo — mai un'icona placeholder generica.
- Verificato: typecheck pulito su `packages/ui`/`apps/web`/`apps/mobile`,
  build `apps/web` verde, screenshot di regressione sulla homepage (colore
  bottone `rgb(0,129,241)`, identico a prima della modifica a `Button.tsx`,
  zero differenze visive, zero errori console).

**Fase 4 — homepage riscritta sezione per sezione (fatto):**
- `apps/web/src/app/HomeContent.tsx` riscritto: `HomeHero` → griglia categorie
  (`CategoryTile` × 13 + tile "Altro servizio →") → `HowItWorks` (ancora
  `#come-funziona`, linkata dall'header) → `QualitySection` → `ProfessionalsShowcase`
  → `ProCtaSection` → link secondario "Hai un'emergenza?" → `SiteFooter`. Ogni
  sezione avvolta in `FadeInSection` (già esistente, solo i tempi aggiornati
  a 220ms/12px in Fase 1 — timing brief §7), tranne `ProCtaSection` (fondo
  pieno cianografia, deliberatamente sempre visibile per non nascondere il
  CTA principale lato professionisti dietro uno scroll-reveal).
- **`isDemo`** (nuovo campo `ProfessionalProfile`, Prisma) + **`excludeDemo`**
  (nuovo query param `GET /professionals/search` → `packages/api-client` →
  usato solo dalla home) risolvono un problema di correttezza necessario
  prima di poter scrivere sezioni "oneste" sulla home: senza un modo per
  distinguere i professionisti reali dai `PLACEHOLDER_PROFESSIONALS` di
  seed, sia il conteggio "N professionisti" per categoria sia la vetrina
  "Sulla piattaforma" avrebbero pubblicizzato dati finti come reali.
  `CategoriesSeedService`/`seed.ts` impostano `isDemo: true` sui dati
  placeholder; ogni professionista creato da un utente reale resta `false`
  (default schema).
- **`SchedaIntervento.tsx`** (nuovo, `apps/web/src/components`): il
  "documento" animato dell'hero non è decorativo — riflette in tempo reale
  categoria/zona/urgenza scelte nel form (`HomeHero.tsx`), con lo stampo
  "IN ATTESA DI PREVENTIVO" → "PRONTA PER L'INVIO" (verde) solo quando tutti
  e tre i campi sono compilati. `prefers-reduced-motion` rispettato
  (`matchMedia`, disabilita le transizioni CSS). Verificato via Playwright:
  digitando "Idraulico"/"Roma" nel form la card si aggiorna dal vivo.
- **`MegaMenu.tsx`** (nuovo): dropdown "Servizi" desktop a 3 colonne
  (`apps/web/src/lib/megaMenuGroups.ts`, 13 categorie raggruppate in
  "Casa e impianti"/"Manutenzione e spazi"/"Persona e servizi", una
  micro-descrizione di 4 parole per categoria) + drawer mobile a tutta
  altezza con accordion (`<details>/<summary>` nativi, niente libreria).
  Istanza unica: la responsività desktop/mobile vive **dentro** il
  componente stesso (`@media(min-width:860px)` in styled-jsx), mai in un
  wrapper Tamagui `$gtMd`-only esterno — un tentativo iniziale con due
  istanze separate (una nascosta per breakpoint) duplicava lo stato
  open/close ed è stato corretto prima del typecheck.
- **`SiteHeader.tsx`** riscritto: un solo CTA primario ("Richiedi
  preventivo", brief "un solo CTA per schermata") al posto del vecchio
  bottone "Sei un professionista?" — l'audience professionisti resta
  servita dal link testuale "Prezzi" e da `ProCtaSection` più in basso.
  `position:"sticky"` non è un valore tipizzato per il prop `position` di
  Tamagui (React Native non lo supporta): risolto avvolgendo l'header in un
  `<div>` grezzo con lo style sticky inline, la barra vera resta un
  `XStack` Tamagui senza quel prop — stesso limite già documentato per
  `ResultsListWithMap.tsx`.
- **`CategoryTile.tsx`** riscritto su `Surface` (Fase 3): bordo hairline,
  hover via `translateX(2px)` + `borderColor` cianografia, niente ombra né
  scala. `CategoryIconBadge` (icone colorate disegnate a mano, già
  esistenti) **non sostituita** con Lucide qui — coerenza visiva con le
  card di ricerca esistenti; il mega-menu invece usa `Icon`/Lucide,
  contesto più compatto dove è la scelta giusta.
- **Vetrina professionisti onesta** (`ProfessionalsShowcase.tsx`, brief
  §4.6): sotto **12** professionisti reali (`isDemo: false`) in una zona,
  la home mostra un blocco "In costruzione" con raccolta email reale
  invece di una vetrina striminzita o di dati finti — soglia scelta perché
  3-4 profili "in evidenza" darebbero comunque l'impressione (falsa) di
  un'offerta consistente. Il blocco email non è un dead-end decorativo:
  nuovo modello Prisma `WaitlistSignup` + `POST /waitlist` (upsert
  idempotente per email, nessuna autenticazione richiesta) — coerente con
  la regola di progetto di non pubblicare mai una UI che non fa nulla.
  Sopra soglia, `RealShowcase` mostra una riga orizzontale scrollabile di
  card (avatar, nome attività, categoria+città, rating, badge "Verificato").
  Verificato dal vivo: il DB locale ha >12 professionisti non-demo, la
  home mostra `RealShowcase`; il branch `WaitlistBlock` è stato verificato
  solo per lettura di codice/typecheck, non ancora osservato a schermo con
  dati reali sotto soglia.
- **`QualitySection.tsx`** (nuovo) **sostituisce** la vecchia sezione
  "Consigli dai professionisti + Recensioni" a dati demo hardcoded (mai
  pubblicata, coerente con la stessa regola sopra): fondo `$grafite` pieno
  (unico blocco scuro della home oltre a `ProCtaSection`), 3 punti sul
  processo reale che rende affidabile il sistema di reputazione
  (preventivo strutturato, recensioni solo da prenotazione confermata,
  indirizzo mai esposto senza motivo) invece di testimonianze inventate.
- **`SiteFooter.tsx`** riscritto a 4 colonne (logo+claim, Servizi — prime 8
  categorie, Per i clienti, Per i professionisti) su token brand invece dei
  colori Tamagui generici (`$color2`/`$color9`/`$color10`) usati prima.
  **Riga legale del brief §4.8 (Privacy/Cookie/Termini/P.IVA/PEC/link
  ODR) volutamente omessa**: richiede dati reali di un'azienda registrata
  (partita IVA, sede legale, PEC) che non sono disponibili in questa
  sessione — inventarli o linkare pagine `/privacy`/`/cookie`/`/termini`
  inesistenti sarebbe stata una violazione diretta della regola
  "niente UI finta o rotta" seguita in tutto il resto del progetto. Da
  aggiungere quando l'utente fornisce i dati societari reali.
- **Routing hero ripensato** (`HomeHero.tsx`): il campo "Quando?" ha una
  conseguenza reale, non è un riempitivo per animare la Scheda Intervento —
  "Il prima possibile" instrada a `/urgente`, le altre scelte a
  `/preventivo`, categoria non riconosciuta ricade su `/cerca?q=...`
  (stessa ricerca libera di prima, preservata come via di fuga). Richiede
  supporto al prefill città (`?citta=`) in `GuidedRequestForm.tsx`, prima
  gestiva solo `?categoria=`/`?professionista=`.
- Verificato: typecheck pulito su `apps/web`/`packages/ui`/`apps/mobile`,
  build di produzione `apps/web` verde, sessione locale end-to-end
  (Postgres+Redis+API+web) con screenshot Playwright: homepage desktop e
  mobile complete (nessun gap, tutte le `FadeInSection` verificate con
  scroll simulato fino a fondo pagina — un primo giro di screenshot con
  scroll incompleto aveva fatto sembrare `QualitySection` vuota, falso
  positivo dovuto solo al test, non al componente), mega-menu desktop
  (dropdown 3 colonne) e mobile (drawer) aperti entrambi correttamente,
  interazione hero con aggiornamento dal vivo della Scheda Intervento.
  Nessun overflow orizzontale osservato a 390px. Warning di hydration
  cosmetico pre-esistente su `Autocomplete`/`react-native-web`
  (`--placeholderTextColor`, differenza di formattazione dello style
  inline SSR/client, non un errore funzionale) osservato in console, non
  introdotto da questa fase.

**Fase 5 — pagine interne, primo giro: ricerca + profilo pubblico (fatto):**
Scope scelto senza istruzione esplicita del brief su "pagine interne"
(genericamente ~15 route): priorità alle due tipologie che CLAUDE.md §7.6
già indica come più critiche per SEO/business (ricerca e profilo
pubblico) — non un giro esaustivo su ogni pagina interna (dashboard,
account, autenticazione restano nel linguaggio visivo precedente,
rimandate a un giro successivo).
- **`packages/ui/src/ProfessionalCard.tsx`** riscritta su `Surface` (Fase 3)
  invece del `Card` Tamagui originale (`elevate`/`bordered`, ombre): bordo
  hairline, `hoverStyle`/`pressStyle` nativi Tamagui (cross-platform, non
  CSS grezzo — a differenza dell'hover di `CategoryTile.tsx`, che è
  web-only per costruzione) al posto di `scale`/`y` in animazione. Badge
  "Verificato" (`Badge` variant `verificato`) e stelle+conteggio
  (`Rating`, Fase 3) sostituiscono il testo/icona ad-hoc precedente.
  Componente condiviso web+mobile: verificato che `apps/mobile` non lo usa
  ancora (schermata categoria mobile è tuttora un placeholder "in arrivo",
  vedi `apps/mobile/app/cerca/[categoria].tsx`), quindi la riscrittura non
  tocca nulla lato app nativa oggi.
- **Rimossa la visualizzazione pubblica dell'indirizzo esatto** (civico
  completo) da `ProfessionalCard` e da `ProfessionalDetailContent.tsx`:
  problema reale già segnalato in `AUDIT.md` §7 e mai risolto prima
  d'ora — un professionista che compila l'indirizzo di casa/laboratorio in
  `/dashboard/profilo` lo esponeva integralmente in ricerca e nel profilo
  pubblico. Diventato bloccante in questa fase perché `QualitySection.tsx`
  (Fase 4, homepage) promette già esplicitamente "Nessun indirizzo esposto
  senza motivo" — lasciarlo com'era avrebbe reso quella sezione una
  dichiarazione falsa. Il campo indirizzo resta in `/dashboard/profilo` e
  continua ad alimentare la geocodifica Nominatim per il puntino preciso
  sulla mappa (CLAUDE.md §2): solo la resa testuale pubblica è stata
  rimossa, non il dato né il suo uso lato mappa. Città+categoria (già
  mostrate) restano il solo riferimento geografico pubblico.
- **`ProfessionalDetailContent.tsx`** riscritta sui token/primitivi: header
  con `Badge` (`verificato` + `pro` per "In evidenza"/boosted — ottone,
  coerente con la regola "ottone solo su pagamento" essendo un
  posizionamento a pagamento), `Rating` al posto delle stelle ad-hoc,
  sotto-tag su `Chip` (Fase 3) invece di pillole colorate libere, elenco
  prestazioni e recensioni su `Surface`, stato vuoto recensioni su
  `EmptyState` (Fase 3) invece di una riga di testo isolata. Icone lucide
  dirette (`BadgeCheck`, `Heart`, `MapPin`, `Star`) sostituite con `Icon`
  di `@professionisti/ui` per coerenza con la convenzione stabilita nei
  nuovi file di Fase 4 (anche se il file resta web-only, dove tecnicamente
  l'import diretto da `lucide-react` sarebbe ammesso) — aggiunte due chiavi
  nuove al registro icone condiviso (`heart`, `badge-check`,
  `packages/ui/src/icons.tsx`/`icons.web.tsx`, verificate presenti sia in
  `lucide-react` che `lucide-react-native`). Logica di prenotazione agenda
  e salvataggio profilo **non toccata**, solo la resa visiva.
- **`apps/web/src/components/StarRating.tsx`** (tecnica di ritaglio CSS
  per il riempimento frazionario, resta web-only per quello — vedi Fase 3):
  colori hex hardcoded (`#d0d5dd`/`#f5a623`) sostituiti con `brand.filetto`/
  `brand.ottone`, unico residuo di colore libero individuato in questo giro.
- **`CercaContent.tsx`**/**`CategoryContent.tsx`** (header `/cerca` e
  `/cerca/[categoria]`): riscritti su `Eyebrow` + tipografia Archivo +
  token brand invece di `$color2`/`H1`/`Paragraph` Tamagui generici. Il
  tint di sfondo per categoria (`CATEGORY_ACCENT`) è stato rimosso a
  favore di una superficie bianca hairline uniforme, coerente con la
  regola "niente colori liberi fuori dai badge semantici" — resta invece
  `CategoryIconBadge` (icona colorata) accanto al titolo, non è un colore
  di sfondo libero ma la stessa identità visiva categoria già usata
  ovunque nel prodotto (ricerca, profilo, dashboard), decisione di
  coerenza già presa in Fase 4 per `CategoryTile`.
- **`ResultsListWithMap.tsx`**: solo restyling (bordo mappa, bottone
  "Mostra mappa" mobile su token brand/radius 4 invece di pillola
  `border-radius:999px` grigia) — **nessuna modifica alla logica**
  (filtro per inquadratura mappa, soglia 700px, mount-on-visible di
  Leaflet, sticky): area ad alto rischio di regressione già documentata
  con bug reali risolti in passato, toccata solo nelle righe di stile.
- Verificato: typecheck pulito su `apps/web`/`packages/ui`/`apps/mobile`,
  build di produzione `apps/web` verde, sessione locale end-to-end
  (Postgres+Redis+API+web) con screenshot Playwright su `/cerca/idraulico`
  (desktop e mobile) e due profili pubblici (uno senza recensioni — verificato
  lo stato vuoto `EmptyState`, uno con recensione+foto+agenda prenotabile):
  nessun indirizzo visibile in nessuna delle due viste, badge/rating/chip
  renderizzati correttamente, zero errori console/pageerror.

**Correzione post-Fase 4 — ricerca ripristinata come funzione primaria
dell'hero homepage:** la Fase 4 aveva sostituito l'hero con un form di
richiesta guidata (categoria/città/urgenza → `/preventivo` o `/urgente`,
"Scheda Intervento" animata a fianco), coerente col brief ma una scelta di
prodotto che l'utente ha esplicitamente respinto dopo averla vista: la home
deve tornare ad avere la **ricerca** (non la richiesta guidata) come
funzione principale — stessa barra "A domicilio"/"Online" + città + tasto
"Cerca" di prima del redesign. Corretto senza toccare il resto del
linguaggio visivo di Fase 4 (tipografia Archivo, eyebrow mono, sfondo
blueprint): `HomeHero.tsx` ora monta `SearchBar` (`packages/ui`, già
esistente e già usata da `SearchHeader.tsx` nelle pagine risultati e da
`apps/mobile`) invece del form categoria/città/urgenza, con lo stesso
routing (`buildSearchDestination`, `apps/web/src/lib/searchNavigation.ts`)
già usato dagli altri punti di ingresso alla ricerca — nessun secondo
comportamento parallelo. `SchedaIntervento.tsx` è stato eliminato (non
aveva più senso senza i campi categoria/urgenza del form guidato, ed era
usata solo lì): a differenza dei casi già documentati in questo file in
cui una feature "rimandata" resta nel codice per una fase successiva,
qui la feature stessa (richiesta guidata in hero) è stata scartata come
scelta di prodotto, non solo rimandata — nessun motivo di tenere il
componente. `SearchBar.tsx` (condiviso web+mobile) è stato ricolorato sui
token brand in questo stesso giro (era rimasto sui colori Tamagui stock
— `$blue10`/`$color3`/`$color9`— mai toccato nelle fasi precedenti),
visto che torna ad essere l'elemento centrale della homepage: beneficio
automatico anche per `SearchHeader` e per la home di `apps/mobile`, che
la riusano. Verificato: typecheck pulito su `apps/web`/`packages/ui`/
`apps/mobile`, build `apps/web` verde, sessione locale con Playwright —
ricerca "Idraulico"+"Roma" da homepage porta correttamente a
`/cerca/idraulico?citta=Roma`, tab "Online" cambia placeholder/copy come
nelle pagine risultati, nessun errore console, nessun overflow mobile.

**Fase 6 — anti-spam, SEO, accessibilità, performance (fatto):**
Scope deciso senza istruzione esplicita del brief originale per questa fase
(testo non più disponibile verbatim in questa sessione): anti-spam/rate
limiting (già segnalato come rimandato in `AUDIT.md` §6), più SEO/
accessibilità/performance come da indicazione generica delle fasi
successive. Verificato con un audit reale (Lighthouse locale, non solo
lettura di codice) prima e dopo, non solo assunto.

- **Rate limiting** — `@nestjs/throttler` (`apps/api`): limite globale
  prudente (60 richieste/minuto per IP, `ThrottlerModule.forRoot` in
  `app.module.ts`) più limiti più stretti sugli endpoint pubblici a
  rischio: `POST /auth/register` (5/min), `POST /auth/login` e
  `POST /auth/google/verify` (10/min — credential stuffing/brute force),
  `POST /waitlist` (5/min — unico endpoint del tutto pubblico senza
  account di mezzo), `POST /guided-requests` e `POST /reviews` (10/min —
  autenticati ma comunque capaci di fan-out/pubblicazione). `app.set("trust
  proxy", 1)` in `main.ts`: senza, dietro il proxy di Railway il limite
  avrebbe contato tutte le richieste come provenienti da un solo IP interno,
  azzerando la protezione per-utente invece di limitarla per IP reale.
  **Honeypot** su `POST /waitlist` (unico form pubblico senza account):
  `waitlistSignupSchema.website`, campo tenuto fuori schermo in UI
  (`WaitlistBlock`, non `display:none` — alcuni bot lo ignorano proprio per
  quello) — se arrivano valorizzato il controller finge un successo senza
  scrivere nulla.
  **Bug reale scoperto e risolto durante l'implementazione, da tenere a
  mente per pacchetti aggiunti in futuro ad `apps/api`**: dopo
  `pnpm --filter @professionisti/api add @nestjs/throttler`, `ThrottlerGuard`
  falliva a runtime nel risolvere `Reflector` al terzo parametro del
  costruttore — **non un errore nel codice**, ma un artefatto del linker
  hoisted di pnpm (`.npmrc`, richiesto da Expo): il nuovo pacchetto era
  stato hoistato nel `node_modules` di root senza un symlink locale in
  `apps/api/node_modules/@nestjs/throttler`, quindi il suo `require("@nestjs/core")`
  risolveva un'istanza fisica diversa (e quindi una classe `Reflector`
  diversa, per identità di modulo) rispetto a quella usata dal resto di
  `apps/api`. Una guardia globale falliva così in silenzio (nessun crash,
  nessun rate limiting applicato — verificato con richieste ripetute,
  sempre `201` oltre il limite) invece di bloccare. `pnpm install`/
  `pnpm dedupe` da soli non bastavano a ricreare correttamente i symlink;
  risolto con `rm -rf apps/api/node_modules && pnpm install` (reinstall
  mirato, non l'intero monorepo). Probabile solo di questa sessione di
  sviluppo locale con installazioni incrementali ripetute — un deploy
  Railway pulito (`pnpm install` da lockfile, non `pnpm add` incrementale)
  non dovrebbe riprodurlo, ma se un futuro pacchetto aggiunto ad `apps/api`
  desse un errore di risoluzione dipendenze superficialmente identico, è il
  primo sospetto da controllare prima di cercare bug nel codice.
- **SEO** — `apps/web/src/app/robots.ts` (Next.js file convention):
  esclude dalla scansione le pagine senza valore come contenuto indicizzato
  e dietro login (`/accedi`, `/registrati`, `/password-dimenticata`,
  `/account`, `/le-mie-richieste`, `/professionisti-salvati`, `/dashboard/*`,
  `/admin/*`) — nessuna di queste può usare `noindex` via `<meta>` perché
  sono pagine `"use client"` nel file stesso (non un server component con
  `generateMetadata`), `robots.txt` è l'unico modo corretto di escluderle
  senza riscriverne la struttura solo per questo.
  `apps/web/src/app/sitemap.ts`: pagine statiche (home, `/cerca`, le 13
  categorie, `/per-professionisti`) più una voce per ogni professionista
  reale (`excludeDemo: true`, stessa regola già applicata altrove per non
  pubblicizzare dati del seed) — se l'API non risponde il sitemap resta
  comunque valido con le sole pagine statiche invece di fallire del tutto.
  **JSON-LD** `LocalBusiness` su `/professionista/[id]` (`page.tsx`, server
  component): nome, url, immagine, `aggregateRating` se ci sono recensioni
  — indirizzo solo `addressLocality` (città), mai la via esatta, stessa
  scelta già fatta per la UI del profilo in Fase 5. Nuova costante
  `apps/web/src/lib/siteUrl.ts` (`SITE_URL`): prima l'URL assoluto del sito
  era ripetuto come stringa hardcoded solo in `layout.tsx`, ora è la stessa
  fonte usata anche da `robots.ts`/`sitemap.ts`/JSON-LD.
- **Accessibilità** — skip link ("Vai al contenuto", `layout.tsx` +
  `.skip-link` in `globals.css`): fuori schermo finché non riceve il focus
  da tastiera, evita di dover attraversare header+mega-menu ad ogni cambio
  pagina; `{children}` ora avvolto in `<main id="main-content">` come
  landmark di destinazione. `accessibilityRole="button"` aggiunto a tutte
  le card/tile cliccabili introdotte in Fase 3-5 (`ProfessionalCard`,
  `CategoryTile`, riga professionisti in `ProfessionalsShowcase`, tile
  "Altro servizio" in `HomeContent`, fasce orario prenotabili e foto
  cliccabili in `ProfessionalDetailContent`) — mancava del tutto, uno
  screen reader non le annunciava come elementi interattivi.
  **Bug reale trovato e corretto nello stesso giro**: un primo tentativo
  aveva aggiunto anche un `accessibilityLabel` personalizzato riassuntivo
  (es. "Apri il profilo di X") su card che contengono già più righe di
  testo visibile (nome, categoria, città, rating) — violazione WCAG 2.5.3
  "Label in Name" (rilevata da axe/Lighthouse: `label-content-name-mismatch`),
  perché il nome accessibile non includeva tutto il contenuto visibile.
  Corretto rimuovendo l'`accessibilityLabel` personalizzato dove il
  contenuto visibile è già una descrizione sufficiente (lasciando solo
  `accessibilityRole="button"`, il nome accessibile si calcola dal
  contenuto) — mantenuto solo dove non c'è testo visibile in conflitto
  (foto cliccabili, che non hanno alternativa testuale propria) o dove il
  testo visibile è un sottoinsieme genuino dell'etichetta (fascia oraria
  "09:00–13:00" + label "Prenota la fascia 09:00–13:00", che la contiene
  per intero). `PhotoLightbox.tsx`: aggiunto `role="dialog"`
  `aria-modal="true"` e chiusura con Escape (mancava del tutto — l'unico
  modo di uscire da un overlay a schermo intero era il click). Contrasto
  colore: `SiteHeader.tsx`, link "Accedi" passato da `$blue10` Tamagui
  stock (contrasto 3.84:1 su bianco, sotto la soglia 4.5:1 richiesta per
  testo normale) a `brand.cianografia` (8.37:1) — unico problema di
  contrasto rilevato da Lighthouse sull'intero sito, ma sull'header
  globale quindi presente su ogni pagina. `StarRating.tsx`
  (`apps/web/src/components`): ultimi due colori hex hardcoded rimasti nel
  codice sorgente (`#d0d5dd`/`#f5a623`) sostituiti con `brand.filetto`/
  `brand.ottone`. Punteggio Lighthouse Accessibility dopo questi fix:
  **100/100** su home, `/cerca/[categoria]`, `/professionista/[id]`
  (era 96-100 prima, con `color-contrast` e poi `label-content-name-mismatch`
  come soli problemi).
- **Performance** — punteggio Lighthouse reale (locale, non solo lettura di
  codice) su home/categoria/profilo: **51-65/100**, sensibilmente sotto il
  95 citato tra i criteri di accettazione del brief originale. Causa
  principale identificata (non ipotizzata): main-thread work/bootup time
  dominati da script evaluation (Tamagui + `react-native-web` + runtime
  Lucide), non da un singolo file facilmente ottimizzabile — un
  compromesso architetturale già deciso esplicitamente per condividere il
  design system con `apps/mobile` (CLAUDE.md §2/§3), non qualcosa da
  rifattorizzare unilateralmente in questa fase senza discuterne (andrebbe
  contro la regola "non introdurre framework o servizi alternativi senza
  prima discuterne"). `unused-css-rules`/`unused-javascript` sono in gran
  parte le classi atomiche generate da Tamagui per l'intera app, stesso
  compromesso. **Non azionabile e lasciato invariato**: `bf-cache`
  fallisce perché la home usa `cache-control: no-store` — deliberato (vedi
  voce "Ricerca sempre aggiornata" più sopra in questo file), reintrodurre
  il bf-cache richiederebbe riportare la cache e con essa il bug reale già
  risolto (professionisti eliminati visibili in ricerca). Il punteggio
  misurato qui è indicativo, non sostitutivo di un audit reale su Vercel in
  produzione (CDN, HTTP/2, hardware reale invece di CPU throttling
  simulato su una macchina condivisa) — da rifare a deploy attivo prima di
  considerare chiuso il punto.

**Fase 5, secondo giro — pagine interne restanti (fatto):** completa il
giro rimasto in sospeso dopo il primo passaggio ricerca+profilo pubblico:
autenticazione (`/accedi`, `/registrati`, `/password-dimenticata`), area
cliente (`/account`, `/professionisti-salvati`, `/le-mie-richieste`), form
condiviso (`GuidedRequestForm`, usato da `/preventivo` e `/urgente`),
dashboard professionista (`/dashboard`, `/dashboard/profilo`,
`/dashboard/agenda`) — stesso trattamento delle pagine già fatte: `Field`/
`Surface`/`Badge`/`EmptyState`/`Button variant=`/token brand al posto di
`AuthInput`/`H1`/`H2`/`Paragraph`/colori Tamagui generici. Logica di
business **non toccata in nessuna pagina**, solo la resa visiva.

- **`Field.tsx`** (`packages/ui`, Fase 3) esteso con uno slot opzionale
  `rightElement` (usato per il toggle mostra/nascondi password): prima
  supportava solo label+input+hint/errore. Niente icona a sinistra dentro
  il campo (a differenza del vecchio `AuthInput`): la label mono sopra
  basta a identificare il campo, coerente con l'estetica "scheda tecnica".
  Aggiunte due chiavi icona al registro condiviso: `eye`/`eye-off` (toggle
  password) e `check` (spunta nelle checkbox di `/dashboard/profilo` e
  `/dashboard/agenda`, sostituisce un uso improprio di `badge-check` in un
  primo tentativo).
- **Bug reale scoperto e corretto**: `SearchBar.tsx` e `Autocomplete.tsx`
  (`packages/ui`) usano `useState` ma non erano mai stati marcati
  `"use client"` — latente da sempre (mai emerso perché nessun Server
  Component puro aveva mai importato dal barrel di `@professionisti/ui`
  senza un client component di mezzo), esploso in build ("You're importing
  a component that needs useState... none of its parents are marked with
  'use client'") solo quando `/password-dimenticata/page.tsx` è stato
  toccato per la prima volta. `/password-dimenticata` è passata dal
  pattern "pagina server con solo HTML grezzo" (per evitare esattamente
  questo problema) al pattern page.tsx+Content.tsx già usato da
  `/preventivo`: renderizzare Tamagui direttamente in un vero Server
  Component fallisce comunque in build ("createContext is not a
  function"), un componente `"use client"` intermedio è necessario. Lo
  stesso file aveva anche un secondo `<main>` proprio, che duplicava il
  landmark `<main>` appena introdotto in `layout.tsx` (Fase 6) — rimosso.
- **`AccountSidebar.tsx`** (menu laterale di tutte le pagine account/
  dashboard) ricolorato una sola volta qui: beneficio automatico su tutte
  le pagine di questo giro, che lo condividono.
- **Bug reale corretto nello stesso giro**: il testo di aiuto del campo
  "Indirizzo preciso" in `/dashboard/profilo` diceva ancora "comparirà
  anche nella tua card e nel tuo profilo pubblico" — non più vero da
  quando l'indirizzo esatto è stato rimosso dalla resa pubblica in Fase 5
  (primo giro). Corretto per non promettere al professionista qualcosa
  che il prodotto non fa più.
- Verificato: typecheck pulito su `apps/web`/`packages/ui`/`apps/mobile`,
  build di produzione verde su tutte le 24 route, screenshot Playwright
  autenticati (token JWT iniettato in `localStorage`) su
  `/dashboard`, `/dashboard/profilo`, `/dashboard/agenda`, `/account`,
  `/le-mie-richieste`, `/professionisti-salvati`, `/preventivo`,
  `/urgente` — zero errori console, categoria selezionabile, checkbox
  funzionante, empty state coerenti.

**Fase "motion" — micro-interazioni e movimento coerente (fatto):**
Scope auto-definito senza istruzione esplicita del brief originale per
questa fase (testo non più disponibile in questa sessione, solo
un'etichetta generica nel riepilogo): tre interventi mirati a rendere
coerente il poco movimento già presente nel sito (hover di
`CategoryTile`, apertura mega-menu, `FadeInSection`, header sticky, skip
link) invece di aggiungere animazioni nuove non richieste — coerente con
la regola generale del progetto di non introdurre funzionalità oltre
lo scope.
- **Token di timing/easing condivisi** — `packages/ui/src/tokens.ts`:
  `motionEasing` (`cubic-bezier(0.2, 0.8, 0.2, 1)`), `motionFast` (150ms,
  micro-interazioni: hover, focus, chevron), `motionBase` (220ms,
  transizioni di layout: fade-in, apertura pannelli) — sostituiscono i
  valori identici ma scritti a mano in punti diversi (`CategoryTile.tsx`,
  `SiteHeader.tsx`, `MegaMenu.tsx`, `FadeInSection.tsx`), più un valore
  precedentemente incoerente (`mega-drawer` usava 200ms, allineato a
  `motionBase`). Esportati da `packages/ui/src/index.ts`. Il CSS puro
  (`globals.css`, skip link) non può importare costanti JS: valore
  duplicato come stringa letterale identica, commentato per tenerlo
  allineato manualmente se cambia.
- **`prefers-reduced-motion: reduce` globale** — prima solo la (ormai
  eliminata, vedi correzione post-Fase 4) `SchedaIntervento.tsx` lo
  rispettava, via `matchMedia` in JS, un pattern che avrebbe richiesto di
  essere ripetuto in ogni componente che anima qualcosa. Sostituito con
  un'unica regola in `globals.css` (`* , *::before, *::after { animation-
  duration: 0.01ms !important; transition-duration: 0.01ms !important;
  animation-iteration-count: 1 !important; scroll-behavior: auto
  !important; }`): le transizioni diventano istantanee (lo stato finale
  resta corretto, es. `FadeInSection` è comunque visibile) invece di
  essere nascoste o disabilitate. Verificato con Playwright
  (`browser.newContext({ reducedMotion: "reduce" })`):
  `transition-duration` sullo skip link passa da `0.15s` a `1e-05s`.
- **Stato di caricamento con micro-animazione** — nuovo
  `apps/web/src/components/LoadingState.tsx`: sostituisce il testo
  statico "Caricamento..." ripetuto uguale in 6 punti (`/admin`,
  `/professionisti-salvati`, `/le-mie-richieste` ×2, `/dashboard` ×2) con
  un pulsare lento (`.loading-pulse`, keyframe in `globals.css`, 1.4s
  `ease-in-out` — deliberatamente diverso da `motionEasing`, pensata per
  un ciclo simmetrico infinito e non per una transizione direzionale
  one-shot) che dà un segnale di attività reale invece di un testo fermo;
  rispetta `prefers-reduced-motion` tramite la stessa regola globale sopra
  (nessun controllo aggiuntivo necessario). Applicata via `className`
  diretto sul componente Tamagui (`Text`) — stesso pattern già in uso per
  `.bp-grid` (Fase 4): i componenti Tamagui inoltrano `className` al nodo
  DOM su web (`react-native-web`), niente `<style jsx>` scoped necessario.
  Un solo caso lasciato volutamente invariato:
  `/dashboard/profilo` ha un "Caricamento..." dentro l'etichetta di un
  bottone disabilitato durante l'upload immagine — feedback di stato di
  un bottone, un pattern diverso da un placeholder di caricamento a sé
  stante, non un candidato per `LoadingState`.
- Verificato: typecheck pulito su `apps/web`/`packages/ui`/`apps/mobile`,
  build di produzione `apps/web` verde (24 route), sessione locale
  end-to-end (Postgres+Redis+API+web) con Playwright: nessun errore
  console/pageerror su home e `/le-mie-richieste` (autenticata, token JWT
  iniettato in `localStorage`), screenshot di controllo su entrambe —
  home con la ricerca A domicilio/Online invariata, `/le-mie-richieste`
  con `EmptyState` corretto.

Fasi successive (pagine interne restanti — dashboard, account,
autenticazione — erano già state coperte dal giro "Redesign restanti"
sopra; nessun'altra fase nota rimane in coda) non ancora identificate.
Riga legale del footer da completare quando disponibili i dati societari
reali (vedi Fase 4).

---

## 11. Agenda — motore di disponibilità e prenotazioni (v2)

Richiesta esplicita dell'utente ("sviluppare in modo impeccabile l'agenda")
di correggere i bug reali della prima versione (§9, "Agenda settimanale del
professionista") e aggiungere le funzionalità mancanti — non solo restyling.
Portata concordata con l'utente tramite `AskUserQuestion` prima di
procedere: bug di correttezza + fasce a capienza + giorni di chiusura +
doppio calendario, non solo i bug.

**Bug di correttezza corretti:**
- **Race condition sulla doppia prenotazione** — `bookAgendaSlot`
  (`ProfessionalsService`) non aveva alcuna protezione contro due clienti
  che toccano la stessa fascia nello stesso istante: entrambi potevano
  superare il controllo "libera?" prima che l'altro scrivesse. Corretto
  avvolgendo controllo+creazione in una transazione Postgres
  `Serializable` (`Prisma.TransactionIsolationLevel.Serializable`): una
  delle due transazioni viene rifiutata con un errore di serializzazione
  (`P2034`), tradotto in un 409 pulito invece di propagarsi come 500.
  **Nessuna modifica allo schema** (niente vincolo `@@unique` su
  `Booking.scheduledAt`): quel campo ha già un secondo significato per le
  prenotazioni da preventivo (data stimata di inizio lavori, non uno slot
  esatto — due preventivi diversi possono legittimamente condividere la
  stessa data), un vincolo globale le avrebbe rotte. Stesso pattern
  riusato in `GuidedRequestsService.create` per la capienza delle fasce
  generiche (vedi sotto). Verificato con un test reale a due richieste
  concorrenti (non solo letto il codice): una riceve `201`, l'altra `409`.
- **Overlap fasce orarie** — l'editor permetteva di salvare due fasce
  sovrapposte nello stesso giorno (es. 09:00–13:00 e 10:00–11:00) senza
  alcun avviso. `professionalAvailabilitySchema` (packages/shared) ha ora
  un `superRefine` che rifiuta l'intero payload se due fasce dello stesso
  giorno si sovrappongono — stessa validazione applicata sia lato client
  (editor) sia lato server (`ZodValidationPipe`), un'unica fonte di verità.
- **Ordinamento prenotazioni** — `ProfessionalsService.getMyBookings`
  ordinava `scheduledAt: "desc"`: un professionista vedeva per primo
  l'impegno più lontano nel futuro invece del prossimo. Corretto in `asc`.
- **Prenotazioni dirette bloccate a `PENDING` per sempre** —
  `bookAgendaSlot` crea la prenotazione come `PENDING`, ma prima di questo
  giro nessuna azione permetteva di farla avanzare (la dashboard mostrava
  "Segna come completato" solo per lo stato `CONFIRMED`). `BookingsService.
  updateStatus` accetta ora anche `CONFIRMED`; il nuovo calendario
  "Prenotazioni" mostra il bottone "Conferma" per le prenotazioni `PENDING`.
- **Cliente senza modo di annullare** — un cliente che prenotava
  direttamente una fascia esatta dall'agenda pubblica non aveva alcun modo
  di disdire (solo il professionista poteva farlo). Nuovo endpoint
  `PATCH /bookings/:id/cancel` (`BookingsService.cancelForClient`, solo
  per prenotazioni proprie in stato `PENDING`/`CONFIRMED`) + bottone
  "Annulla prenotazione" in `/le-mie-richieste` (doppia conferma, stesso
  pattern già in uso per l'eliminazione di una richiesta guidata).

**Giorni di chiusura straordinaria** — nuovo modello Prisma
`AvailabilityException` (`professionalProfileId` + `date`, unique
composito): blocca una data specifica (ferie, festività, imprevisto)
senza toccare la ricorrenza settimanale, che ha un ciclo di vita
indipendente (cambia di rado, le eccezioni si aggiungono/rimuovono una
alla volta) — da qui la scelta di un modello separato invece di un campo
su `AvailabilitySlot`. `getPublicAgenda` e `bookAgendaSlot` rispettano
l'eccezione (nessuna fascia mostrata/prenotabile in quella data); nuovi
endpoint `POST`/`DELETE /professionals/me/availability/exceptions[/:date]`.
In `/dashboard/agenda`, ogni colonna giorno (vista Settimana/Giorno) ha un
bottone "Chiudi giorno"/"Riapri giorno" per la data specifica mostrata.

**Fasce a capienza ("generiche") → richiesta di preventivo** — richiesta
esplicita dell'utente, arrivata a metà del giro di lavoro: oltre alla
fascia "esatta" (capienza 1, prenotazione istantanea se `bookableAgenda`
è attivo), il professionista può impostare `maxBookings` > 1 su una fascia
(es. "9–13, fino a 5 richieste"). Un click su una fascia generica nel
profilo pubblico **non prenota nulla**: apre `/preventivo` precompilato
con professionista/categoria/data/fascia oraria (nuovi query param `data`/
`fasciaOraria`, mostrati in `GuidedRequestForm` come blocco informativo
"Fascia richiesta" — stesso pattern del blocco categoria bloccata quando
si arriva dal profilo di un professionista specifico). La richiesta
guidata (`GuidedRequest`) porta ora due campi opzionali,
`preferredDate`/`preferredTimeSlot` (+ `professionalProfileId`
denormalizzato, prima ricavabile solo tramite `Lead`), valorizzati solo in
questo percorso — usati per contare quante richieste sono già state
inviate per quella data+fascia esatta (capienza), con lo stesso pattern di
transazione `Serializable` del punto sopra per evitare che due clienti
superino insieme il limite. `GuidedRequestsService.resolveGenericSlot`
rivalida server-side che la fascia esista davvero come "generica" e che la
data non sia un giorno di chiusura, prima di accettare la richiesta —
stessa cautela già applicata a `bookAgendaSlot`. `bookAgendaSlot` rifiuta
esplicitamente (403) un tentativo di prenotare direttamente una fascia
generica: quel percorso resta riservato alle fasce esatte. L'agenda
pubblica (`GET /professionals/:id/agenda`) espone ora `maxBookings` +
`bookedCount` per fascia (sostituisce il precedente `booked: boolean`,
che bastava solo per le fasce esatte) — sul profilo pubblico le fasce
generiche si mostrano con bordo tratteggiato ottone e contatore
"N/M richieste" invece del bordo verde pieno delle fasce esatte.

**Doppio calendario in stile Apple Calendar** — richiesta esplicita
dell'utente ("un calendario dove imposti gli orari e un altro dove
compaiono le prenotazioni, con dettagli al click"), con vista
Giorno/Settimana/Mese selezionabile. Prima di costruirlo è stato mostrato
un mockup HTML di due alternative (calendario solo-disponibilità vs
calendario con anche gli eventi reali sovrapposti) via Artifact, per
allineare l'aspettativa prima di un investimento di sviluppo consistente;
l'utente ha scelto la prima (`AskUserQuestion`), coerente con la struttura
poi realizzata: due calendari separati invece di uno che mescola due fonti
di dati diverse nella stessa griglia.
- **Nessuna libreria di calendario aggiunta**: nessuna era nello stack
  approvato (CLAUDE.md §2), introdurne una senza discuterne avrebbe
  violato la regola §5.1. Costruito da zero con Tamagui + CSS grid via
  `styled-jsx` (stesso pattern già in uso per `ResultsListWithMap`/
  `MegaMenu`, componenti "difficili" che Tamagui da solo non rende bene).
  Nuove utility di date pure in `apps/web/src/lib/calendarDates.ts`
  (nessuna libreria di date: stessa convenzione "data pura in UTC, mai
  convertita al fuso del browser" già in uso in tutto il modulo agenda).
- **`apps/web/src/components/calendar/CalendarShell.tsx`**: componente
  condiviso (toggle Giorno/Settimana/Mese, navigazione precedente/oggi/
  successivo, griglia settimana a colonne, griglia mese con indicatori a
  pallino) — gestisce solo il guscio, il contenuto di ogni giorno è deciso
  dal chiamante via render prop (`renderDayColumn`/`renderMonthCell`).
  Deliberatamente **web-only** (non in `packages/ui`): stesso confine già
  stabilito per Leaflet/MegaMenu/ResultsListWithMap, coerente con le
  schermate agenda di `apps/mobile` tuttora un placeholder "in arrivo".
  Usato due volte, con dati e stato di navigazione completamente
  indipendenti (evita di dover tenere sincronizzate due fonti di dati
  nella stessa griglia):
  - **"Disponibilità"** (`/dashboard/agenda`, tab di default): editor
    delle fasce ricorrenti. Ogni colonna giorno mostra le fasce già
    impostate (chip piena cianografia per le esatte, tratteggiata ottone
    per le generiche, con badge "capienza max N" e un'icona di avviso se
    `hasUpcomingBooking` è vero) più un editor inline per aggiungerne una
    nuova o modificarne una esistente (start/end/capienza) — con nota
    esplicita che la modifica si applica a tutti i giorni della settimana
    corrispondenti, non solo alla data mostrata (la ricorrenza è
    settimanale, non per data esatta). Rimuovere una fascia con
    prenotazioni future richiede un secondo click di conferma (stesso
    pattern a due passaggi già in uso per l'eliminazione di una richiesta
    guidata). `MyAvailability` (packages/shared) espone ora
    `hasUpcomingBooking` per fascia (calcolato incrociando sia `Booking`
    che `GuidedRequest.preferredDate/preferredTimeSlot`, a seconda che la
    fascia sia esatta o generica) ed `exceptionDates`.
  - **"Prenotazioni"** (tab secondaria): eventi reali (`Booking`, incluse
    sia le prenotazioni da preventivo accettato sia quelle dirette da
    fascia esatta), un blocco colorato per stato (`PENDING` ottone,
    `CONFIRMED` verde, `COMPLETED` grigio, `CANCELED`/`NO_SHOW` rosso)
    per colonna giorno. Click su un evento apre
    `BookingDetailPanel.tsx` (overlay DOM, stesso pattern di
    `PhotoLightbox` — `role="dialog"`, chiusura con Escape/click sul
    backdrop, nessuna libreria aggiunta): cliente, data/ora, voci
    preventivo, bottoni Conferma/Completa/Annulla in base allo stato
    corrente. La vecchia lista piatta di prenotazioni in `/dashboard` è
    stata sostituita da un riepilogo breve ("N prenotazioni in arrivo")
    con link a questo calendario, invece di mostrare la stessa
    informazione in due punti diversi del sito.

**Verificato**: typecheck pulito su tutti i package (`shared`, `database`,
`api-client`, `ui`, `api`, `web`, `mobile`), build di produzione `apps/web`
verde. Test funzionali reali contro l'API locale (non solo letture di
codice): validazione overlap rifiutata (400), eccezione aggiunta/rimossa,
tre richieste su una fascia generica a capienza 3 accettate e la quarta
rifiutata (409, capienza esaurita), agenda pubblica che riflette
`bookedCount` aggiornato, due prenotazioni concorrenti sulla stessa fascia
esatta — una accettata (201), l'altra rifiutata (409) — tentativo di
prenotazione diretta su una fascia generica rifiutato (403), conferma
professionista (`PENDING`→`CONFIRMED`) e cancellazione cliente entrambe
verificate. Screenshot Playwright su `/dashboard/agenda` (entrambe le tab,
viste Settimana/Mese) e sul profilo pubblico (pillola fascia generica con
contatore, form `/preventivo` precompilato con la fascia richiesta) —
zero errori console.

**Rifiniture successive, richieste esplicite dell'utente:**
- **Sovrapposizione segnalata subito, non solo al salvataggio** —
  l'editor inline (`SlotEditorInline`) calcola l'overlap ad ogni render
  (`slotEditorLiveError`, stessa logica di `professionalAvailabilitySchema`
  ma valutata lato client mentre si scelgono gli orari): bordo ed errore
  rossi immediati, bottone "Salva" disabilitato finché la fascia si
  sovrappone a un'altra dello stesso giorno — prima l'unico feedback
  arrivava dopo il click su "Salva agenda" e il giro fino al server.
- **Vista a schermo intero** — bottone (icona `maximize-2`/`minimize-2`)
  nell'header del calendario condiviso (`CalendarShell`), visibile su
  entrambi i calendari "Disponibilità"/"Prenotazioni": apre un overlay
  fisso a tutto viewport con lo stesso guscio (toggle vista, navigazione,
  griglia), nessuna Fullscreen API del browser — stesso pattern DOM già
  in uso per `PhotoLightbox`/`BookingDetailPanel` (più affidabile della
  vera Fullscreen API in contesti sandboxed/iframe), chiusura con Escape
  o con lo stesso bottone.
- **Editor fascia in pop-up invece che incastrato nella colonna** — richiesta
  esplicita dell'utente: il riquadro con orario inizio/fine e capienza,
  aperto cliccando il tasto "+" o una fascia già impostata, non appare più
  come piccolo box incastrato dentro la colonna del giorno (`SlotEditorInline`,
  campi 74px/12px, poco leggibile) ma come overlay centrato a schermo
  (`SlotEditorModal`, `apps/web/src/app/dashboard/agenda/page.tsx`): stesso
  pattern DOM di `BookingDetailPanel`/`PhotoLightbox` (`role="dialog"`,
  chiusura con Escape o click sul backdrop), campi orario più grandi
  (130px/17px) con etichetta del giorno ("Lunedì", ecc.) in testa. La colonna
  del calendario mostra solo le fasce già salvate (`SlotChip`, invariato) più
  il tasto "+"; l'errore di sovrapposizione "dal vivo" (già esistente) è
  mostrato dentro il pop-up invece che nel piccolo riquadro — il banner sotto
  lo schema del calendario resta ma solo quando nessun pop-up è aperto (altrimenti
  duplicava lo stesso messaggio dietro l'overlay semi-trasparente).

---

## 12. Ricerca professionisti — proporzioni card in stile miodottore.it + mini-agenda

Richiesta esplicita dell'utente, con screenshot di riferimento
(risultati di ricerca miodottore.it): le card dei risultati di ricerca
dovevano avere le stesse proporzioni del riferimento (immagine profilo
grande, gerarchia di dimensioni carattere per nome/specialità/rating,
mappa grande a fianco con controllo di espansione) — poi, a metà turno,
richiesto anche di replicare la mini-agenda inline per card (colonne
Oggi/Domani/... con pillole orario cliccabili in verde).

- **`ProfessionalCard`** (`packages/ui`) riscritta: avatar da 44px a 88px
  (passato dal chiamante, non cambia il componente in sé — vedi
  `ResultsListWithMap.tsx`), nome attività a 22px/800 (era `$5`/700), riga
  categoria+specializzazioni a 15px (nuova prop `subTags`, fino a 3,
  es. "Idraulico · impianti civili, caldaie"), spunta "Verificato" come
  icona accanto al nome invece del badge testuale (più simile al
  riferimento), città con icona `map-pin`, prestazioni a 14px (era 12px).
  **Nessun indirizzo esatto ri-esposto**: la rimozione dell'indirizzo
  pubblico dalla card (Fase 5, redesign) resta — il riferimento
  miodottore.it mostra "Indirizzo"/"Online" come tab, ma nel nostro dominio
  quell'indirizzo è appositamente nascosto (CLAUDE.md §10, motivo
  privacy/sicurezza già deciso), quindi non riprodotto; resta il badge
  "📹 Online" già esistente.
- **Mini-agenda per card** (`ProfessionalAvailabilityPreviewDay[]`, nuovo
  tipo in `packages/shared/src/professionals.ts`): fino a 4 giorni
  (Oggi/Domani/giorno abbreviato) × 3 orari liberi per giorno, solo fasce
  esatte (`maxBookings=1`, quelle a capienza restano estranee a questa
  anteprima — richiedono comunque un preventivo, non ha senso una pillola
  "cliccabile rapida" per quelle) e solo se il professionista ha
  `bookableAgenda` attivo. **Calcolata in un'unica query batch per l'intera
  pagina di risultati** (`ProfessionalsService.buildAvailabilityPreviews`,
  `apps/api/src/professionals/professionals.service.ts`): mai una query per
  professionista dentro `search()`, che sarebbe un N+1 reale in un endpoint
  di ricerca (a differenza di `getPublicAgenda`, chiamata una sola volta per
  la pagina di un singolo profilo). Click su una pillola naviga a
  `/professionista/{id}#agenda` (non prenota direttamente dalla card): nuovo
  anchor `id="agenda"` con `scrollMarginTop` in `ProfessionalDetailContent.tsx`
  per compensare l'header sticky — la prenotazione vera resta quella già
  esistente sulla pagina profilo, nessuna logica di prenotazione duplicata
  nella card.
- **Bug reale scoperto e corretto durante la verifica visiva** (non
  ipotizzato, riprodotto con Playwright): un nome attività lungo
  (es. "Rossi Idraulica 194621734", ~26 caratteri) faceva andare a capo
  l'intera mini-agenda SOTTO il blocco informativo invece che a fianco, pur
  restando spazio a sufficienza una volta che il testo si spezza
  correttamente su più righe — nomi più corti (es. "Rossi Idraulica Test")
  sulla stessa larghezza di colonna restavano invece correttamente
  affiancati. Causa: il blocco sinistro della card aveva `flex={1}` senza
  `flexBasis={0}` esplicito — con `flex-basis:auto` (il default), il
  browser usa la larghezza "a contenuto pieno" (non spezzata) del nome come
  ipotesi nel calcolo del wrap dell'intero `flexWrap` esterno, invece di
  rispettare il solo `minWidth={260}` già impostato. Corretto aggiungendo
  `flexBasis={0}` sul blocco sinistro e `minWidth={0}` sulla colonna
  interna (stesso principio "CSS Grid/Flexbox: gli item non si restringono
  sotto la dimensione del contenuto per default" già documentato altrove in
  questo file per `CalendarShell`).
- **`ResultsListWithMap.tsx`**: bottone "Espandi mappa"/"Riduci mappa"
  (icona `maximize-2`/`minimize-2` di lucide-react, stato `mapExpanded`)
  sovrapposto in alto a destra della mappa — allarga la colonna mappa da
  40%/480px a 58%/760px (la colonna lista si restringe di conseguenza,
  `flex:1` sul suo contenitore, nessun calcolo manuale necessario), solo da
  desktop (`>=700px`, stessa soglia già in uso per l'affiancamento
  lista/mappa). Nessuna modifica alla logica di mount-on-visible di Leaflet
  o al filtro per inquadratura, solo il controllo di larghezza.
- **`/professionisti-salvati`**: stesso avatar ingrandito (72px, leggermente
  più piccolo della ricerca) e `subTags` passati per coerenza visiva; niente
  mini-agenda qui (il backend restituisce `availabilityPreview: []` per
  questa lista — non vale la query batch aggiuntiva per un elenco personale
  corto, la mini-agenda esiste solo nei risultati di ricerca).
- Verificato: typecheck pulito su `packages/shared`/`packages/ui`/
  `apps/api`/`apps/web`/`apps/mobile`, build di produzione `apps/web` verde,
  sessione locale end-to-end (Postgres+Redis+API+web) con Playwright:
  card con mini-agenda popolata (professionista con `bookableAgenda` e fasce
  esatte libere), click su una pillola naviga correttamente a
  `/professionista/{id}#agenda` con scroll alla sezione giusta, bottone
  "Espandi mappa" allarga la colonna e la lista si restringe di conseguenza,
  vista mobile (390px) impila correttamente card e mini-agenda sotto senza
  overflow orizzontale, zero errori console/pageerror nuovi (l'unico
  warning osservato, `accessibilityState` non riconosciuto su `Chip`, è
  preesistente dalla Fase 3 e non toccato in questo giro).

**Rimozione prestazione in `/dashboard/profilo`**: il tasto "×" per
rimuovere una voce già inserita in "Prestazioni offerte" era un `Button
variant="ghost"` con icona grigia, poco visibile — richiesta esplicita
dell'utente di renderlo rosso con un riquadro rosso accanto alla voce.
Sostituito con un riquadro 36×36 bordato `brand.urgenza`, sfondo
`brand.urgenzaVelo`, icona X rossa (`apps/web/src/app/dashboard/profilo/page.tsx`)
— stesso principio semantico "rosso solo su urgenza/distruttivo" già in
uso altrove nel redesign (es. i chip di conflitto nell'agenda).
Bug reale corretto subito dopo, segnalato dall'utente: su schermo stretto
(cellulare) la riga di una prestazione (nome, prezzo min, "a", prezzo max,
tasto rimuovi) andava a capo in modo scomposto — il tasto "×" finiva isolato
su una riga a parte, staccato dalla voce a cui si riferiva. Corretto
raggruppando prezzo min/"a"/prezzo max/tasto rimuovi in un unico blocco
`flexWrap="nowrap"`: quel gruppo va a capo (sotto al nome) come unità sola
quando lo spazio non basta, ma non si spezza mai più al suo interno — il
tasto rimuovi resta sempre affiancato al prezzo. Nessuna modifica al layout
desktop (tutto in un'unica riga, come già era).

**Calendario "Prenotazioni", vista Settimana — solo l'orario**: richiesta
esplicita dell'utente, stesso principio già applicato a `SlotChip` nel
calendario "Disponibilità" ("nella vista settimanale scrivere solo l'orario
piccolo in modo da farlo entrare nella colonna", CLAUDE.md §11). Il blocco
prenotazione in `renderBookingDayColumn` mostrava orario + nome cliente su
due righe: nella colonna stretta della vista Settimana (7 colonne) il nome,
di lunghezza variabile, era quello che rischiava di non starci — ora
`compact = bookingView === "week"` nasconde il nome e riduce leggermente
padding/font dell'orario, mostrato sempre su una sola riga
(`numberOfLines={1}`). La vista Giorno (una sola colonna, molto più spazio)
resta invariata: orario + nome cliente.

**Eliminazione fascia disponibilità spostata nel pop-up**: `SlotChip`
(calendario "Disponibilità") aveva un tasto "×" separato dal resto della
fascia per la rimozione — su cellulare si sovrapponeva visivamente al
riquadro della fascia, poco chiaro (richiesta esplicita dell'utente). Tutta
la fascia è ora un unico target: click/tap apre sempre `SlotEditorModal`
(stesso pop-up già usato per orario/capienza), che in fondo mostra un link
"Elimina fascia" — presente solo quando si modifica una fascia già
esistente (`onDelete` prop assente quando si sta creando una fascia nuova).
Stessa doppia conferma di prima per le fasce con prenotazioni future
(`hasUpcomingBooking`), ora come stato locale del pop-up
(`confirmingDelete`) invece che nello stato della pagina: `key={editingKey}`
sul `<SlotEditorModal>` forza un componente nuovo (quindi uno stato di
conferma azzerato) ogni volta che si apre una fascia diversa.

**Indirizzo preciso della richiesta + dati di contatto del cliente in
agenda/dashboard** — richiesta esplicita dell'utente (percorso completo:
richiesta → preventivo → accettazione → il professionista deve poter
vedere nome/cognome, indirizzo, telefono, email per andare a svolgere il
lavoro): nuovo campo `GuidedRequest.address` (facoltativo, via e numero
civico — sulla richiesta, non sul profilo cliente: un cliente può avere
lavori in indirizzi diversi da una richiesta all'altra), editabile in
`GuidedRequestForm.tsx` (`/preventivo`, `/urgente`) e nel form di modifica
inline di `/le-mie-richieste`. Il pagamento trattenuto dalla piattaforma
all'accettazione del preventivo (menzionato dall'utente) resta
esplicitamente rimandato a prima del lancio, insieme a Stripe/Cloudinary
(CLAUDE.md §9) — non implementato in questo giro.
- `ProfessionalsService.getMyBookings` ora seleziona anche
  `client.phone`/`client.email` e, quando la prenotazione viene da un
  preventivo accettato, `quote.guidedRequest.address` (`null` per le
  prenotazioni dirette dall'agenda pubblica, che non hanno una
  GuidedRequest collegata). `clientName` combina ora nome **e** cognome
  (`[name, surname].filter(Boolean).join(" ")`) — prima esponeva solo il
  nome di battesimo (`booking.client.name`), insufficiente per un
  professionista che deve presentarsi sapendo con chi ha a che fare.
- `BookingDetailPanel.tsx` (calendario "Prenotazioni" in
  `/dashboard/agenda`): nuova sezione "Contatti cliente" — telefono come
  link `tel:`, email come link `mailto:`, indirizzo con icona `map-pin`.
  Mostrata solo se almeno uno dei tre è presente.
- **Nuova sezione "Lavori accettati" in `/dashboard`**: sostituisce il
  breve riepilogo "N prenotazioni in arrivo" (introdotto nella Fase
  "motion", §9) con un elenco vero delle prenotazioni `CONFIRMED`/
  `COMPLETED` (non `PENDING` — una prenotazione diretta da agenda pubblica
  ancora da confermare non è "accettata" da questo lato; non
  `CANCELED`/`NO_SHOW`), ognuna con data/ora, stato, nome e cognome,
  telefono/email (link diretti), indirizzo e voci del preventivo — proprio
  la richiesta esplicita dell'utente ("un elenco dei lavori accettati con
  tutti i dettagli del cliente"). Il link "Apri il calendario completo"
  resta per la vista calendario piena.
- **Foto della richiesta guidata visibili al professionista**: `ProfessionalLead.
  guidedRequest.photoUrls` era assente dal tipo condiviso pur esistendo già
  nello schema (`GuidedRequest.photoUrls`, usato per l'upload lato cliente)
  — bug di esposizione dati corretto nello stesso giro (richiesta esplicita
  dell'utente, "potrà vedere tutti i dati del cliente con le richieste e
  foto"): `LeadCard` in `/dashboard` mostra ora le miniature (fino a 3)
  sotto la descrizione, oltre all'indirizzo con icona `map-pin`.
- Nuove icone nel registro condiviso (`packages/ui/src/icons.tsx`/
  `icons.web.tsx`): `phone`, `mail`.
- Verificato end-to-end con l'API locale (non solo lettura di codice):
  richiesta guidata con indirizzo → lead con indirizzo e foto lato
  professionista → preventivo inviato → accettato dal cliente → prenotazione
  con nome+cognome/telefono/email/indirizzo corretti, sia in
  `BookingDetailPanel` (agenda) sia nella nuova sezione "Lavori accettati"
  (dashboard). Screenshot Playwright su entrambe le viste, zero errori
  console.

**Prossimo giro (non ancora implementato, descritto dall'utente ma non
richiesto per questo turno)**: quando il professionista compila la data di
inizio di un preventivo, le opzioni dovrebbero derivare dalla propria
agenda (fasce impostate in `/dashboard/agenda`, escludendo gli orari già
occupati da altre prenotazioni) invece di un semplice `<input type="date">`
libero come oggi; il cliente dovrebbe poter non solo accettare ma anche
"modificare" un preventivo ricevuto, scegliendo un'altra data sempre tra
quelle disponibili nell'agenda del professionista. Notifiche email/SMS/
WhatsApp su nuovo lead + un sottomenu impostazioni per disattivarle
restano anch'esse esplicitamente rimandate dall'utente a prima del lancio.

**Data del preventivo legata all'agenda + modifica cliente (fatto)** —
implementato nel giro successivo, scope confermato con l'utente tramite
`AskUserQuestion` (elenco fasce libere prossimi 14gg, non un mini-calendario
embedded; il cliente propone una modifica che il professionista deve
riconfermare, mai un cambio diretto senza passare da lui — evita doppie
prenotazioni accidentali sulla stessa fascia).
- **`QuoteStatus` nuovo valore `MODIFICATION_REQUESTED`** + `Quote.
  clientProposedDate` (nullable): il cliente ha proposto una data diversa,
  in attesa che il professionista confermi (→ crea la `Booking`, stesso
  esito di un'accettazione normale) o rifiuti (→ torna `SENT` con la data
  originale, `clientProposedDate` azzerato).
- **`GET /professionals/me/available-slots`** (`ProfessionalsService.
  getMyAvailableSlots`): fasce esatte (`maxBookings=1`) libere nei
  prossimi 14 giorni del professionista autenticato, stesso orizzonte di
  `getPublicAgenda` ma come elenco piatto (non raggruppato per giorno) e
  **ignora `bookableAgenda`** apposta — quel flag governa solo la
  prenotazione diretta pubblica, qui il professionista guarda la propria
  agenda per pianificare un preventivo, non per farsi prenotare da un
  cliente. Usato in `/dashboard` (`LeadCard`) per sostituire il vecchio
  `<input type="date">` libero con un `<select>` di fasce reali; se non ce
  ne sono (agenda non ancora impostata) ricade sul vecchio input libero
  con una nota che rimanda a `/dashboard/agenda`, invece di bloccare
  l'invio del preventivo.
- **`QuotesService.proposeDate`/`confirmProposedDate`/`rejectProposedDate`**
  (`apps/api/src/quotes/`, nuovi endpoint `POST /quotes/:id/propose-date`,
  `/confirm-proposed-date`, `/reject-proposed-date`): la fascia proposta
  dal cliente è sempre rivalidata server-side contro l'agenda reale del
  professionista (`resolveFreeExactSlot`, stessa cautela già applicata a
  `bookAgendaSlot`/`resolveGenericSlot` altrove — mai fidarsi di quanto
  inviato dal client), e la conferma del professionista avviene dentro la
  stessa transazione Postgres Serializable anti race-condition già in uso
  per `bookAgendaSlot`/`BookingsService.createFromQuote` (P2034 → 409
  pulito), per evitare che la fascia proposta venga occupata da qualcun
  altro tra la proposta e la conferma.
- **`/dashboard` (`LeadCard`)**: `ProfessionalLead.hasQuote` (booleano)
  sostituito con `ProfessionalLead.quote` (oggetto con id/status/date o
  `null`) — più informazione utile per la card senza una seconda chiamata.
  Quando lo stato è `MODIFICATION_REQUESTED`, la card mostra la data
  proposta dal cliente con due bottoni "Conferma questa data"/"Rifiuta".
- **`/le-mie-richieste` (`QuoteCard`, nuovo componente)**: mostrava già
  `estimatedStartDate` nel tipo ma non lo rendeva mai a schermo — bug di
  esposizione dati corretto nello stesso giro (il cliente non poteva
  vedere quando il professionista proponeva di iniziare). Bottone "Proponi
  altra data" apre un `<select>` caricato lazy dall'agenda pubblica del
  professionista (`GET /professionals/:id/agenda`, filtrato alle sole
  fasce esatte libere — stesso endpoint già usato dalla pagina profilo
  pubblica, nessun nuovo endpoint pubblico necessario) accanto al bottone
  "Accetta preventivo" già esistente; a `MODIFICATION_REQUESTED` mostra lo
  stato "in attesa di conferma del professionista" invece dei bottoni.
- Verificato end-to-end con l'API locale e Playwright (non solo
  typecheck): professionista invia preventivo scegliendo una fascia dalla
  propria agenda (28 fasce libere su 14gg × 2 al giorno) → cliente propone
  una fascia diversa dall'agenda pubblica del professionista → stato
  preventivo `MODIFICATION_REQUESTED` con `clientProposedDate` corretto →
  professionista conferma → `Booking` creata con `scheduledAt` uguale alla
  data proposta dal cliente (non quella originale del professionista).
  Screenshot su tutte le fasi (form preventivo con select, avviso proposta
  lato cliente, avviso conferma lato professionista), zero errori console.

**Nota facoltativa sulla data proposta** — richiesta esplicita dell'utente:
quando il cliente propone un'altra data (`/le-mie-richieste`), una
textarea opzionale sotto la selezione della fascia permette di aggiungere
dettagli scritti (es. "posso solo dopo le 17"). Nuovo campo `Quote.
clientProposedNote` (nullable, azzerato insieme a `clientProposedDate`
quando il professionista rifiuta o conferma la proposta — stesso ciclo di
vita). Mostrata al professionista nel blocco "Il cliente ha proposto
un'altra data" in `/dashboard`, e al cliente stesso nello stato "in attesa
di conferma" finché il professionista non decide. Verificato end-to-end
con l'API locale e Playwright: nota inserita dal cliente, salvata
correttamente, visibile sulla dashboard del professionista.

**Scelta cliente/professionista in fase di registrazione** — bug reale
segnalato dall'utente: cliccando "Registrati" da `/accedi` (unico punto
d'ingresso del sito che arriva a `/registrati` senza un ruolo già deciso
nell'URL, a differenza dei link "Iscriviti gratis"/"Sei un
professionista?" sparsi nel sito, che passano già `?ruolo=professionista`)
si finiva sempre sulla registrazione cliente, senza possibilità di
scegliere. `apps/web/src/app/registrati/page.tsx`: nuovo componente
`RoleChoiceScreen` (due caselle cliccabili "Sono un cliente"/"Sono un
professionista", icone `search`/`hard-hat` già presenti nel registro
condiviso) mostrato quando il parametro `ruolo` nell'URL non è né
`professionista` né il nuovo valore esplicito `cliente` (prima l'assenza
del parametro significava implicitamente cliente, senza un modo di
distinguere "nessuna scelta fatta" da "ha scelto cliente"). La scelta
aggiorna l'URL (`router.replace`, `?ruolo=cliente`/`?ruolo=professionista`,
preservando eventuali altri query param già presenti) invece di tenere lo
stato solo in memoria, così il link resta condivisibile/ricaricabile.
Bug dei Rules of Hooks evitato in fase di scrittura (auto-corretto prima
di ogni verifica, stesso tipo di errore già documentato altrove in questo
file per `/dashboard/agenda`): i sei `useState` di `RegistratiForm`
restano tutti dichiarati incondizionatamente prima del `return` anticipato
che mostra `RoleChoiceScreen`, mai dopo. Verificato: typecheck pulito,
Playwright contro l'app locale — da `/accedi`, click su "Registrati" porta
alla schermata di scelta; scegliendo "cliente" si atterra sul form
cliente (`?ruolo=cliente`), scegliendo "professionista" sul form
professionista (`?ruolo=professionista`); i link esistenti che passano già
`?ruolo=professionista` (footer, `/per-professionisti`, ecc.) continuano a
saltare la schermata di scelta esattamente come prima — nessuna
regressione verificata sui punti d'ingresso già in uso.

**Header — overflow orizzontale da cellulare** — bug reale segnalato
dall'utente con screenshot ("Richiedi un preventivo nella homepage vista
da cellulare sfora troppo a destra"): sui telefoni più stretti (verificato
da 320px, iPhone SE, in su) il contenuto dell'header (logo con wordmark
"Professionisti" + hamburger `MegaMenu` + link "Accedi" + bottone
"Richiedi preventivo") superava la larghezza del viewport, causando scroll
orizzontale su tutta la homepage — non solo nell'header ma sull'intera
pagina, perché nessun elemento lì dentro si restringeva sotto la propria
larghezza di contenuto (`XStack` con `justifyContent="space-between"`,
nessun `flexShrink`/wrap). Corretto in `apps/web/src/components/
SiteHeader.tsx` con due interventi mirati, senza toccare il layout
desktop:
1. **Logo solo marchio sotto $xs** (breakpoint Tamagui ≤660px): due
   `XStack` con `display`/`$gtXs` invertiti (stesso pattern già in uso
   nello stesso file per "Come funziona"/"Prezzi" sotto `$gtMd`) mostrano
   `<Logo variant="mark" />` (28×28, senza wordmark) sotto $xs e
   `<Logo variant="full" />` sopra — `variant="mark"` esisteva già in
   `Logo.web.tsx`/`Logo.tsx` proprio per "spazi stretti" (Fase 2 del
   redesign) ma non era ancora usato da nessun punto del sito.
2. **Padding/gap ridotti sotto $xs**: il bottone "Richiedi preventivo"
   (`paddingHorizontal="$4"` → `$3` sotto `$xs`) e il gap tra "Accedi" e
   il bottone (`$4` → `$3`) — a 320px il solo cambio del logo lasciava
   ancora 6px di troppo.
Verificato con Playwright (non solo lettura di codice): confrontato
`document.documentElement.scrollWidth` vs `clientWidth` su 320/360/390/
414/430/660/661px — zero overflow su tutte le larghezze, incluso dopo
scroll fino in fondo alla pagina (la riga orizzontalmente scorrevole di
`ProfessionalsShowcase` resta legittimamente scrollabile nel proprio
contenitore, non contribuiva all'overflow di pagina). Screenshot di
controllo su 320px e desktop (1280px, invariato: logo con wordmark,
"Accedi" e bottone a piena dimensione). Zero errori console.

**Nome cliccabile nelle richieste ricevute/inviate** — richiesta esplicita
dell'utente: sia nelle richieste ricevute dal professionista (`/dashboard`)
sia in quelle inviate dal cliente (`/le-mie-richieste`) deve comparire il
nome della controparte, cliccabile per aprirne la scheda.
- **Lato cliente** (professionista visto dal cliente): i professionisti
  hanno già un profilo pubblico reale (`/professionista/[id]`), quindi il
  nome diventa un link diretto lì. La sezione "Inviata a" lo era già; ora
  anche `quote.businessName` in `QuoteCard` e `booking.businessName` in
  `BookingRow` (entrambe in `apps/web/src/app/le-mie-richieste/page.tsx`)
  sono link — entrambi i tipi (`ClientGuidedRequest.quotes[]` e
  `ClientBooking`) avevano già `professionalProfileId` esposto, nessuna
  modifica al backend necessaria qui.
- **Lato professionista** (cliente visto dal professionista, `LeadCard` in
  `/dashboard`): prima non veniva mostrato alcun nome. Il cliente **non**
  ha un profilo pubblico in questo marketplace (solo i professionisti ne
  hanno uno) — cliccare il nome apre invece un overlay leggero,
  `ClientProfileModal` (nuovo, `apps/web/src/components/ClientProfileModal.tsx`,
  stesso pattern di `BookingDetailPanel`/`PhotoLightbox`: `role="dialog"`,
  chiusura con Escape/click sul backdrop). Mostra solo `Avatar` (iniziali) +
  nome — **non** telefono/email/indirizzo: quella scelta di privacy era già
  esplicita in CLAUDE.md §12 ("il professionista deve poter vedere i dati
  di contatto" solo dopo l'accettazione del preventivo, vedi
  `AcceptedJobCard`/`BookingDetailPanel`), non ribaltata qui — la scheda lo
  segnala esplicitamente ("saranno visibili qui e in agenda non appena il
  preventivo verrà accettato") invece di apparire vuota senza spiegazione.
  Nuovo campo `ProfessionalLead.guidedRequest.clientName` (nome+cognome,
  stesso `[name, surname].filter(Boolean).join(" ")` già in uso in
  `getMyBookings`): `ProfessionalsService.getMyLeads` ora include
  `guidedRequest.client` nella query Prisma.
Verificato end-to-end con l'API locale e Playwright (non solo
typecheck/lettura di codice): nome cliente visibile in una richiesta
ricevuta reale, click apre la scheda con iniziali+nome corretti; preventivo
inviato dal professionista, click sul nome dell'attività nel preventivo
ricevuto lato cliente naviga correttamente a `/professionista/{id}`. Zero
errori console in entrambi i flussi.

**Correzione — contatto cliente visibile dalla prima richiesta, non solo
dopo l'accettazione**: decisione di privacy ribaltata su richiesta esplicita
dell'utente ("il contatto deve essere visibile dalla prima richiesta, non
da quando la accetta"). La scelta precedente (telefono/email mostrati solo
su `ProfessionalBooking`/`AcceptedJobCard`, dopo l'accettazione del
preventivo — vedi CLAUDE.md §12 "Indirizzo preciso della richiesta + dati
di contatto del cliente") è quindi superata per telefono/email: un
professionista deve poter contattare il cliente anche solo per chiarire i
dettagli prima ancora di formulare un preventivo. `ProfessionalsService.
getMyLeads` ora seleziona anche `client.phone`/`client.email` e li espone
su `guidedRequest.clientPhone`/`clientEmail` (nuovi campi, `ProfessionalLead`
in `packages/shared/src/dashboard.ts`) — stesso identificativo `Lead`, nessun
nuovo endpoint. `ClientProfileModal.tsx` mostra ora telefono (link `tel:`)
ed email (link `mailto:`) sotto nome/avatar, non più la nota "saranno
visibili dopo l'accettazione". L'indirizzo preciso della richiesta
(`GuidedRequest.address`) era già visibile da subito in `LeadCard` (è il
luogo del lavoro, non un dato di contatto personale) — invariato.
Verificato end-to-end con l'API locale e Playwright: richiesta guidata
inviata senza alcun preventivo formulato → telefono/email del cliente già
presenti nella risposta di `GET /professionals/me/leads` e visibili nella
scheda cliente aperta dalla dashboard, prima di ogni invio di preventivo.
Zero errori console.

**Cinque correzioni/funzionalità, stesso giro (richieste esplicite
dell'utente):**

1. **Modifica foto della richiesta guidata** — `guidedRequestUpdateSchema`
   (`packages/shared`) ha ora `photoUrls` opzionale (a differenza di
   `guidedRequestSchema.photoUrls`, che ha `.default([])`): se assente nel
   payload il set esistente non viene toccato, se presente lo sostituisce
   per intero — stesso pattern "sostituzione per intero" già in uso per
   prestazioni/voci di preventivo. `GuidedRequestsService.update` applica
   la sostituzione solo se `input.photoUrls !== undefined`.
   `GuidedRequestsService.listForClient` espone ora anche `photoUrls`
   (mancava del tutto lato cliente, solo lato professionista in
   `ProfessionalLead`). Form di modifica in `/le-mie-richieste`
   (`GuidedRequestCard`) riusa lo stesso pattern miniatura+tasto "×"+tasto
   "+" già presente in `GuidedRequestForm`/`LeadCard` (nessun nuovo
   componente), stesso upload `POST /guided-requests/photos`.
2. **Foto delle richieste ricevute ingrandibili** — le miniature in
   `LeadCard` (`/dashboard`) erano statiche; ora cliccabili, aprono
   `PhotoLightbox` (già esistente, usato per le foto delle recensioni):
   nessun nuovo componente, solo il collegamento mancante.
3. **Bug reale: orari disponibili assenti nell'invio preventivo** —
   `ProfessionalsService.getMyAvailableSlots` filtrava
   `AvailabilitySlot` con `maxBookings: 1`, escludendo del tutto un
   professionista che avesse impostato la propria agenda solo con fasce a
   capienza (`maxBookings > 1`, una funzionalità legittima e già
   documentata in CLAUDE.md §11 per il fan-out delle richieste guidate) —
   in quel caso l'elenco tornava vuoto e il form preventivo (`LeadCard`)
   ricadeva silenziosamente sul vecchio `<input type="date">` libero,
   dando l'impressione che l'agenda non fosse mai stata letta. Rimosso il
   filtro `maxBookings: 1`: qui il professionista sta solo scegliendo
   quando iniziare un lavoro già concordato (non sta consumando la
   capienza di quella fascia, che riguarda semmai il fan-out delle
   richieste guidate), quindi anche le fasce a capienza sono candidate
   valide. Riprodotto e verificato con l'API locale prima e dopo il fix
   (agenda composta solo da fasce a capienza → 0 risultati prima, 14 dopo).
4. **Richiesta non più modificabile dopo il primo preventivo ricevuto** —
   richiesta esplicita dell'utente: se un professionista ha già inviato un
   preventivo basato su descrizione/città/indirizzo/foto della richiesta,
   il cliente che le cambia dopo invaliderebbe silenziosamente quel
   lavoro. `GuidedRequestsService.update` ora conta le `Quote` collegate
   (di qualunque professionista, non solo di uno specifico — il fan-out
   può aver raggiunto più professionisti) e rifiuta con 403 se almeno una
   esiste. Lato UI, `GuidedRequestCard` separa `canDelete` (invariato,
   solo `status !== CLOSED`) da un nuovo `canEditDetails` (`canDelete &&
   quotes.length === 0`): il tasto "Modifica" sparisce a favore di una
   nota ("Non modificabile: hai già ricevuto un preventivo."), "Elimina"
   resta invariato (non era nello scope di questa richiesta).
5. **Il professionista può rivedere il preventivo che ha inviato** —
   prima `LeadCard` mostrava solo lo stato ("Preventivo inviato"), non il
   contenuto. `ProfessionalLead.quote` (packages/shared) ha ora anche
   `items`/`notes` (`ProfessionalsService.getMyLeads` include
   `quotes.items` nella query Prisma); nuovo blocco "Il tuo preventivo" in
   `LeadCard` con voci+prezzi, data di inizio e note, visibile ogni volta
   che `lead.quote` esiste — indipendentemente dallo stato, quindi visibile
   anche insieme al blocco "Il cliente ha proposto un'altra data" quando
   presente.

Verificato end-to-end con l'API locale e Playwright (non solo
typecheck): agenda a sole fasce di capienza → 14 slot liberi restituiti e
`<select>` popolato nel form preventivo in UI; preventivo inviato con voci
reali → "Il tuo preventivo" visibile sulla dashboard del professionista con
nome voce, prezzo e note; tentativo di modifica della richiesta dopo
l'arrivo del preventivo → tasto "Modifica" sostituito dalla nota in UI e
`PATCH /guided-requests/:id` rifiutato con 403 lato server; foto allegata a
una richiesta → miniatura cliccabile in `LeadCard` che apre
`PhotoLightbox`; `PATCH` con `photoUrls: []` su una richiesta senza
preventivo ancora → foto rimosse correttamente. Zero errori console in
tutti i flussi.

**Indirizzo di lavoro strutturato all'accettazione del preventivo, tab di
navigazione, foto in anteprima** — tre richieste esplicite dell'utente,
stesso giro:

1. **Indirizzo libero alla richiesta, indirizzo strutturato solo
   all'accettazione**: il campo indirizzo di `GuidedRequestForm`/modifica
   richiesta resta un campo unico opzionale (nessun civico obbligatorio a
   questo punto — corretto durante il giro dopo un chiarimento
   dell'utente: "va bene anche solo l'indirizzo senza numero civico"), con
   testo esplicativo che avvisa: l'indirizzo completo con tutti i dettagli
   verrà richiesto solo se si accetta un preventivo. Nuovo schema
   `acceptQuoteSchema` (`packages/shared`): `recipientName`,
   `recipientSurname`, `recipientPhone`, `street`, `houseNumber`,
   `addressExtra` (opzionale: scala/piano/interno/azienda), `postalCode`,
   `city`, `province` — tutti obbligatori tranne `addressExtra`. Nuovi
   campi omonimi su `Booking` (Prisma, nullable a livello DB: le
   prenotazioni dirette da agenda pubblica non passano da questa
   schermata). `POST /bookings/from-quote/:quoteId` accetta ora questo
   payload (`BookingsService.createFromQuote`), lo salva sulla
   prenotazione creata. Nuovo componente `apps/web/src/components/
   AcceptQuoteModal.tsx` (stesso pattern overlay di ClientProfileModal/
   BookingDetailPanel): otto campi in riquadri separati (`Field` di
   `@professionisti/ui`), prefill da nome/cognome/telefono dell'account se
   presenti ma sempre modificabili (chi riceve il professionista sul
   lavoro può non coincidere con l'intestatario dell'account), validazione
   client-side con messaggio "Campo obbligatorio." sotto ogni campo
   mancante. Due pulsanti come richiesto: **"Salva"** (azione reale,
   accetta il preventivo e salva l'indirizzo tramite
   `apiClient.acceptQuote`) e **"Vai al pagamento"** — disabilitato finché
   non si salva, poi mostra un messaggio onesto ("Il pagamento in
   piattaforma non è ancora attivo: accordati con il professionista")
   invece di un link finto: il pagamento in-app per il lavoro (distinto da
   abbonamenti/boost/lead, già implementati) resta esplicitamente
   rimandato (vedi CLAUDE.md §9) — architettura discussa con l'utente ma
   non ancora implementata, dato il prezzo per range (manodopera/materiali)
   invece di un importo fisso. `formatBookingAddress`
   (`packages/shared/src/professionals.ts`) compone i campi strutturati in
   un'unica riga leggibile, riusata sia da `AcceptedJobCard`
   (`/dashboard`) che da `BookingDetailPanel` (agenda "Prenotazioni") al
   posto del vecchio `address` libero quando presente — fallback al vecchio
   campo per le prenotazioni create prima di questa funzionalità o dirette
   da agenda pubblica.
2. **Caselle "Richieste ricevute"/"Lavori accettati"** (richiesta esplicita
   dell'utente, "il più facile e ordinata la visualizzazione"): sia
   `/dashboard` (professionista) che `/le-mie-richieste` (cliente,
   "Le mie richieste"/"Lavori accettati") ora mostrano un selettore a due
   pillole con il conteggio tra parentesi invece di impilare entrambe le
   sezioni una sotto l'altra — stesso pattern a pillola attiva/inattiva già
   in uso per i tab "A domicilio"/"Online" di `SearchBar`. `BoostSection`
   (dashboard professionista) resta sempre visibile sotto la sezione
   attiva, non è parte del toggle.
3. **Foto già visibili nell'anteprima delle richieste inviate**: prima
   comparivano solo entrando in modifica. `GuidedRequestCard` (lato
   cliente) mostra ora le miniature subito nella vista non-modifica,
   cliccabili per aprirle a schermo intero — stesso `PhotoLightbox` già
   collegato lato professionista in `LeadCard`.

Verificato end-to-end con l'API locale e Playwright: form di accettazione
con campi vuoti → errori di validazione mostrati, non invia nulla; campi
compilati → preventivo accettato, `Booking` creato con tutti i campi
strutturati, visibile su `/dashboard` (tab "Lavori accettati") con nome
completo, telefono e indirizzo composto correttamente; tab professionista
e cliente presenti e funzionanti con conteggi corretti; foto allegata a una
richiesta visibile subito in `/le-mie-richieste` senza dover aprire
"Modifica", click apre `PhotoLightbox`; copy del campo indirizzo in
`/preventivo` verificata a schermo (nessun civico richiesto, avviso sul
dettaglio richiesto in seguito). Zero errori console in tutti i flussi.

**Prenotazione annullata resa visibile al professionista** — richiesta
esplicita dell'utente: prima, quando un cliente annullava una prenotazione
già confermata (`PATCH /bookings/:id/cancel`), spariva silenziosamente
dalla sezione "Lavori accettati" (`acceptedJobs` filtrava solo CONFIRMED/
COMPLETED) — il professionista non se ne accorgeva se non aprendo il
calendario completo. `acceptedJobs` (`/dashboard`) include ora anche
CANCELED (non NO_SHOW/PENDING, fuori scope di questa richiesta);
`AcceptedJobCard` mostra la casella con bordo e sfondo rossi
(`brand.urgenza`/`brand.urgenzaVelo`, stesso token semantico "rosso solo su
urgenza/distruttivo" già in uso altrove) ed etichetta "Annullata" al posto
di "Confermato"/"Completato". Verificato end-to-end con l'API locale e
Playwright: preventivo accettato → prenotazione confermata → annullata dal
cliente → ancora visibile in "Lavori accettati" con casella rossa e testo
"Annullata" (colore bordo confermato via `getComputedStyle`). Zero errori
console.

**Fasce orario per data esatta, non più ricorrenti per sempre di default**
— cambio di comportamento sostanziale, richiesta esplicita dell'utente
dopo un chiarimento fatto con `AskUserQuestion` (due opzioni proposte: (a)
rendere più visibile la nota già esistente sul comportamento ricorrente,
oppure (b) cambiare il comportamento di default a "per data", con una
spunta per renderlo ricorrente solo nel mese corrente — l'utente ha scelto
la (b), un cambio architetturale, non solo di copy).

Prima, ogni fascia aggiunta in `/dashboard/agenda` valeva per **ogni**
occorrenza futura di quel giorno della settimana, indefinitamente (nessun
modo di impostare un orario per una singola data). Ora il comportamento di
default è l'opposto: una fascia aggiunta vale **solo** per la data esatta
su cui si è cliccato "+"; una nuova spunta "Ripeti per tutti i \<giorno\>
di \<mese\>" nel pop-up (`SlotEditorModal`, solo per una fascia nuova, mai
in modifica di una già esistente) crea invece una fascia per ciascuna data
del mese corrente con lo stesso giorno della settimana, invece di
introdurre un concetto di ricorrenza indefinita bis.

- **Schema**: `AvailabilitySlot.date DateTime?` (Prisma). `date` valorizzata
  = fascia legata a quella data esatta (nuovo default). `date` null = 
  comportamento storico (ricorrenza settimanale indefinita per
  `dayOfWeek`) — non più creabile dalla UI, ma le fasce già esistenti
  create prima di questa funzionalità continuano a funzionare esattamente
  come prima: nessuna migrazione distruttiva dei dati.
- **`packages/shared`**: `availabilitySlotSchema.date` (ISO opzionale).
  `professionalAvailabilitySchema`'s overlap check riscritto da "raggruppa
  per dayOfWeek" a un confronto a coppie basato su
  `slotsShareAnOccurrence` (due fasce potrebbero cadere nella stessa data
  di calendario: stessa data esatta, oppure una fascia esatta e una
  ricorrente sullo stesso giorno della settimana) — necessario perché due
  fasce ora possono confliggere anche senza condividere lo stesso
  `dayOfWeek` "sulla carta" in modi che il vecchio raggruppamento non
  avrebbe colto.
- **`apps/api/src/common/availability.util.ts`** (nuovo): `slotAppliesOnDate`,
  unico punto di verità per "questa fascia vale per questa data?", riusato
  da `getMyAvailableSlots`, `getMyAvailability` (incluso il calcolo di
  `hasUpcomingBooking`, ora anch'esso per-data quando la fascia è datata),
  `getPublicAgenda`, `buildAvailabilityPreviews` (mini-agenda di ricerca).
  Le query Prisma `findFirst` che prima cercavano solo per `dayOfWeek`
  (`bookAgendaSlot`, `GuidedRequestsService.resolveGenericSlot`,
  `QuotesService.resolveFreeExactSlot`) ora usano `OR: [{ date }, { date:
  null, dayOfWeek }]` per corrispondere sia a una fascia datata sia a una
  ricorrente storica.
- **`apps/web/src/lib/calendarDates.ts`**: `slotAppliesOnDateStr`
  (equivalente client-side, per l'evidenziazione "dal vivo" delle
  colonne/sovrapposizioni senza round-trip al server) e
  `datesInMonthForWeekday` (tutte le date del mese di calendario che
  contiene una data ancora con lo stesso giorno della settimana — usata
  dalla spunta "ripeti").
- **`/dashboard/agenda`**: `editingKey` per una fascia nuova è passato da
  `"new-<dayOfWeek>"` a `"new-<dateStr>"` (la colonna su cui si è cliccato
  "+" determina ora la data esatta, non solo il giorno della settimana).
  Il pop-up mostra la data completa ("Lunedì 10 agosto", non solo
  "Lunedì") e, solo quando si crea una fascia nuova, la spunta "Ripeti per
  tutti i lunedì di agosto". Testo informativo in cima alla pagina
  aggiornato di conseguenza.

Verificato end-to-end con l'API locale e Playwright (non solo
typecheck): fascia aggiunta senza spuntare "Ripeti" → esattamente 1 fascia
salvata con `date` valorizzata; fascia aggiunta con "Ripeti" spuntato (un
mercoledì) → 5 fasce salvate, una per ciascun mercoledì di luglio 2026
(1/8/15/22/29), giorni della settimana e date tutte distinte confermate
via API; agenda pubblica (`GET /professionals/:id/agenda`) mostra la
fascia SOLO sulla data esatta, non su altre date con lo stesso giorno
della settimana (comportamento "per data", non ricorrente, confermato
esplicitamente contro il vecchio comportamento); prenotazione diretta
contro una fascia datata riuscita (201), un secondo tentativo sulla
stessa fascia rifiutato (409, race condition ancora protetta dalla stessa
transazione Serializable di prima). Screenshot della vista Settimana:
"09:00–13:00" (senza ripeti) visibile solo su lunedì 27, "15:00–16:00"
(con ripeti) visibile solo sul mercoledì di quella settimana (29), non
sulle altre colonne. Zero errori console.

**Tutti i campi di "Richiedi un preventivo" obbligatori** — richiesta
esplicita dell'utente: indirizzo e foto, prima entrambi facoltativi, sono
ora obbligatori come categoria/descrizione/città (indirizzo: solo la via è
richiesta qui, il numero civico resta rimandato alla schermata di
accettazione preventivo — vedi voce sopra; foto: almeno una delle 3).
`guidedRequestSchema` (`packages/shared`): `photoUrls` da
`.max(3).default([])` a `.min(1, "Aggiungi almeno una foto.").max(3)`,
`address` da `.optional()` a `.min(1, "L'indirizzo è obbligatorio.")` —
`guidedRequestUpdateSchema` (modifica di una richiesta già inviata)
**non** toccato, `photoUrls`/`address` restano opzionali lì per un motivo
diverso (omesso nel payload = non li tocca, non "vuoto è accettabile").
`GuidedRequestForm.handleSubmit` valida entrambi lato client prima
dell'invio, stessi messaggi d'errore dello schema server-side. Verificato
end-to-end con l'API locale e Playwright: richiesta senza indirizzo/foto
rifiutata dal backend con 400; form blocca l'invio mostrando "Indica
l'indirizzo."/"Aggiungi almeno una foto." finché entrambi non sono
compilati. Zero errori console.

**Numeretto di notifiche non lette nell'header** — richiesta esplicita
dell'utente: "quando arriva una nuova richiesta o una risposta o un
aggiornamento nella dashboard deve comparire un numeretto con le novità da
visualizzare vicino al nome", chiarito subito dopo con "quello in alto a
destra dopo aver effettuato il login che puo essere visualizzato solo dal
proprietario logicamente" — badge accanto al nome in `AccountMenu`
(header), mai visibile a nessuno tranne l'account loggato stesso (l'intero
componente già ritorna `null` se `!user`).
- **Riusato il modello Prisma `Notification` già esistente** (`userId`,
  `channel`, `type`, `payload`, `readAt`) invece di introdurre un
  meccanismo parallelo tipo `dashboardLastSeenAt`: era già scritto (mai
  letto) da `GuidedRequestsService.create` per il fan-out lead (`NEW_LEAD`)
  ma non aveva ancora né un endpoint di lettura né altri punti di
  creazione — la base corretta su cui costruire, non uno scarto.
- **`apps/api/src/notifications/`** (nuovo modulo): `NotificationsService.
  notify(userId, type, payload)` è il punto unico di creazione di una
  notifica (canale sempre `PUSH` — nessun invio reale, Expo Push/Resend/
  Twilio restano rimandati, CLAUDE.md §9: solo la riga che alimenta il
  conteggio non letti); `unreadCount`/`markAllRead` sono le due query dirette
  dietro i nuovi endpoint `GET /notifications/unread-count` e
  `POST /notifications/mark-all-read` (`NotificationsController`, JWT-guarded,
  sempre sull'utente autenticato — mai un `userId` passato dal client).
  `NotificationsModule` esporta il service, importato da `QuotesModule` per
  i tre nuovi punti di creazione nel ciclo di vita del preventivo
  (`QuotesService`): `createOrUpdate` notifica il cliente (`NEW_QUOTE`, solo
  al primo invio — non ad ogni modifica successiva dello stesso preventivo,
  il cliente l'ha già visto), `proposeDate` notifica il professionista
  (`QUOTE_DATE_PROPOSED`), `confirmProposedDate`/`rejectProposedDate`
  notificano il cliente (`QUOTE_DATE_CONFIRMED`/`QUOTE_DATE_REJECTED`).
- **`AuthContext.tsx`** esteso con `unreadCount`/`refreshUnreadCount`/
  `markNotificationsRead`: il conteggio si ricarica ogni volta che `user`
  cambia (login/logout), fallisce in silenzio su errore di rete transitorio
  (un badge che non si aggiorna non deve rompere il resto dell'app).
  `AccountMenu.tsx` mostra un pallino rosso col numero (max "9+") accanto al
  nome quando `unreadCount > 0`, con `accessibilityLabel` che lo annuncia
  ("Il mio account, N novità da visualizzare").
- **Azzeramento all'apertura della pagina pertinente**, non con un click
  separato sul badge: `/dashboard` (professionista) e `/le-mie-richieste`
  (cliente) chiamano `markNotificationsRead()` in un `useEffect` al mount —
  stessa logica "aprire la pagina è la conferma di averla vista" già in uso
  altrove nel progetto, nessun nuovo pattern di interazione da imparare.
- **Nessuna migrazione Prisma necessaria**: il modello `Notification`
  esisteva già con tutti i campi richiesti.
- Verificato end-to-end con l'API locale (non solo typecheck) e Playwright:
  registrato cliente+professionista, richiesta guidata inviata → conteggio
  non letti del professionista passa da 0 a 1 (`NEW_LEAD`), badge "1"
  visibile nell'header dopo login, sparisce dopo aver visitato `/dashboard`
  e resta a 0 al reload; professionista invia preventivo → conteggio non
  letti del cliente passa a 1 (`NEW_QUOTE`), si azzera dopo aver visitato
  `/le-mie-richieste`. Screenshot di entrambi gli stati (badge presente/
  assente), zero errori console nuovi (l'unico errore di rete osservato,
  `ERR_TUNNEL_CONNECTION_FAILED`, è la stessa limitazione di rete
  dell'ambiente di sviluppo già documentata altrove in questo file, non
  causata da questa feature). Typecheck pulito su tutti i package
  (`shared`, `database`, `api-client`, `api`, `web`, `mobile`).

**"Lavoro terminato" con importo preciso + "Annulla intervento" con nota
per il cliente** — richiesta esplicita dell'utente, in "Lavori accettati"
(dashboard professionista): prima `AcceptedJobCard` era puramente
informativa, zero azioni (segnare completato/annullare esisteva solo nel
calendario "Prenotazioni" tramite `BookingDetailPanel`, un cambio di stato
semplice senza dettagli). Chiarito con l'utente (mid-turn, non
`AskUserQuestion` — l'utente ha risposto direttamente in chat prima che la
domanda posta venisse considerata) che "lavoro terminato" non è un
semplice cambio di stato: apre una finestra dove inserire l'importo
preciso dell'intervento seguendo le voci del preventivo, con la
possibilità di aggiungerne altre, totale calcolato dal vivo.
- **Nuovo modello Prisma `BookingFinalItem`** (nome + prezzo esatto in
  centesimi, cascade su eliminazione prenotazione) + `Booking.
  finalAmountEurCents` (somma denormalizzata, per non dover sempre fare la
  join) + `Booking.cancellationNote` (nota facoltativa). Le `QuoteItem`
  originali (range min/max) non vengono mai toccate: restano l'offerta di
  riferimento, l'importo finale è un dato separato — stesso principio già
  seguito per non confondere preventivo e prenotazione altrove nel
  progetto.
- **`BookingsService.completeWithFinalAmount`**: accetta solo prenotazioni
  `CONFIRMED` di cui il professionista è titolare, sostituisce per intero
  le `BookingFinalItem` (stesso pattern delete+createMany di
  `QuotesService.createOrUpdate`), calcola il totale server-side (mai
  fidarsi di un totale inviato dal client) e porta lo stato a `COMPLETED`.
  `BookingsService.cancelByProfessional`: stesso controllo di titolarità,
  consentito su qualunque stato non ancora concluso, salva
  `cancellationNote` (`trim() || null`) — distinto da `cancelForClient`
  (nessuna nota lì: il cliente non deve spiegazioni al professionista) e
  dal generico `updateStatus` usato dal calendario (resta invariato, per
  le transizioni senza dettagli come `PENDING`→`CONFIRMED`). Entrambi i
  nuovi metodi notificano il cliente (`JOB_COMPLETED`/
  `BOOKING_CANCELED_BY_PROFESSIONAL`) tramite `NotificationsService`
  (§13): il badge nell'header si aggiorna anche per questi due eventi,
  non solo per lead/preventivi.
- **`CompleteJobModal.tsx`** (nuovo, `apps/web/src/components`): una riga
  per ogni voce del preventivo originale (nome fisso, range preventivato
  mostrato come riferimento sotto) con un campo "Importo finale (€) *"
  da compilare — tutte obbligatorie, un professionista non può lasciarne
  una senza importo. Sotto, "+ Aggiungi voce" per costi extra non
  preventivati (nome+importo entrambi liberi, tasto rimozione rosso
  36×36, stesso pattern già in uso in `/dashboard/profilo` per le
  prestazioni). Totale ricalcolato dal vivo ad ogni input. Overlay
  `role="dialog"`, stesso pattern di `AcceptQuoteModal`/
  `BookingDetailPanel`.
- **`CancelBookingModal.tsx`** (nuovo): singola `textarea` "Nota per il
  cliente (facoltativa)" — lasciata facoltativa (non obbligatoria):
  l'utente non ha specificato il vincolo quando gli è stato chiesto
  esplicitamente, si è preferito il default a minor attrito. Bordo/tasto
  di conferma su `brand.urgenza` (variant `urgent`), coerente con la
  regola di progetto "rosso solo su urgenza/distruttivo".
- **Convenzione asterisco sui campi obbligatori** (richiesta esplicita
  dell'utente, arrivata mentre si costruiva `CompleteJobModal`): ogni
  campo obbligatorio ha ora un `*` nella label, con una riga di legenda
  "* Campo obbligatorio." in fondo al modulo — applicata sia ai nuovi
  moduli (`CompleteJobModal`) sia, per coerenza, a `AcceptQuoteModal`
  (retrofit: prima diceva solo "Tutti i campi sono obbligatori tranne
  quello facoltativo" in testo libero, senza indicare quali).
- **Lato cliente** (`/le-mie-richieste`, `BookingRow`): importo finale
  (voci + totale) mostrato per un lavoro `COMPLETED`, nota di
  annullamento mostrata per un lavoro `CANCELED` — stesso blocco replicato
  in `AcceptedJobCard` lato professionista, nessuna differenza di dati tra
  le due viste.
- Verificato end-to-end con l'API locale (non solo typecheck) e
  Playwright: preventivo a due voci (Manodopera, Materiali) accettato →
  prenotazione confermata → "Lavoro terminato" con importi esatti diversi
  dal range preventivato → prenotazione `COMPLETED` con
  `finalAmountEurCents` corretto (somma esatta delle due voci), cliente
  vede lo stesso totale in "Lavori accettati" e riceve la notifica
  (badge); percorso parallelo con una seconda prenotazione → "Annulla
  intervento" con nota → prenotazione `CANCELED` con `cancellationNote`
  salvata, cliente la vede in "Lavori accettati" e riceve la notifica.
  Screenshot di entrambi i pop-up e degli stati finali, zero errori
  console. Typecheck pulito su tutti i package.

**Bug reale: fasce di disponibilità create su un giorno già passato,
invisibili ovunque** — segnalato dall'utente ("clicco 'proponi altra data'
e non vedono le disponibilità inserite dal professionista"). Riprodotto
(non solo ipotizzato): la vista Settimana di `/dashboard/agenda` mostra di
default l'intera settimana corrente (lunedì-domenica), che include giorni
già trascorsi se oggi non è lunedì — il tasto "+ Aggiungi fascia oraria"
restava comunque cliccabile su quelle colonne passate (solo il toggle
"Chiudi/Riapri giorno" era già nascosto lì, non l'aggiunta fasce). Una
fascia salvata con `date` nel passato non può più comparire da nessuna
parte per costruzione: `getPublicAgenda`/`getMyAvailableSlots` filtrano
sempre a partire da oggi — il professionista vedeva la fascia nel proprio
editor (che non filtra per data) e pensava di averla impostata
correttamente, ma restava un dato orfano invisibile sia nell'agenda
pubblica del profilo sia nel flusso "Proponi altra data" del cliente.
Corretto in `renderDayColumn` (`apps/web/src/app/dashboard/agenda/page.tsx`):
il tasto "+" non viene più mostrato per un giorno con `isPast` vero (stessa
variabile già usata per nascondere "Chiudi/Riapri"), sostituito da
un'etichetta "Giorno passato" quando quella colonna non ha già fasce
salvate — un giorno passato resta comunque visibile con le fasce
storiche già presenti, semplicemente non se ne possono aggiungere di
nuove. Nessuna validazione aggiunta lato server (schema Zod): avrebbe
rifiutato in blocco anche il salvataggio di agende già contenenti fasce
orfane preesistenti da questo bug, un rischio peggiore del problema che
risolve — la UI è l'unico punto da cui si può creare una fascia nuova,
quindi è l'unico punto che deve essere corretto. Verificato end-to-end con
l'API locale e Playwright (non solo lettura di codice): cliccando il tasto
"+" sulla prima colonna della vista Settimana di default (un giorno
passato) prima del fix si otteneva una fascia con `date` nel passato,
sistematicamente assente da `GET /professionals/:id/agenda`; dopo il fix
le colonne passate mostrano "Giorno passato" (6 su 7 nel caso di test,
essendo oggi domenica) e il tasto resta solo sull'unico giorno valido;
una fascia aggiunta lì compare correttamente nell'agenda pubblica e nel
`<select>` di "Proponi altra data" lato cliente. Zero errori console.

**Badge notifiche: aggiunto un refresh periodico** — a seguito della
segnalazione "i numeretti non compaiono ancora", verificato che la logica
di base funziona correttamente (badge visibile subito dopo login/al
caricamento della pagina, confermato di nuovo con Playwright), ma
identificato un gap reale: `unreadCount` in `AuthContext` si aggiornava
solo quando l'oggetto `user` cambiava (login, logout, `refreshUser`), mai
mentre l'utente restava semplicemente con la scheda aperta — un
professionista già sulla dashboard quando arriva un nuovo lead non vedeva
comparire il numero finché non ricaricava la pagina o rifaceva il login,
in contrasto con "notifiche quasi istantanee" già promesso in CLAUDE.md
§8. Corretto con un `setInterval(refreshUnreadCount, 45_000)` in
`AuthContext.tsx` mentre `user` è valorizzato, ripulito su logout/unmount
— nessuna infrastruttura push/websocket in questo stack (notifiche reali
via Expo Push/Resend/Twilio restano rimandate, CLAUDE.md §9), 45s è un
compromesso pragmatico di polling senza sovraccaricare l'API né richiedere
nuova infrastruttura.

**Immagine profilo anche per gli account cliente** — richiesta esplicita
dell'utente: prima solo `ProfessionalProfile.imageUrl` esisteva, un
account cliente non poteva caricarne una. Nuovo campo `User.imageUrl`
(Prisma, facoltativo) + `POST /auth/me/image` (`AuthController`, JWT-guarded,
`FileInterceptor`, stesso `CloudinaryService`/cartella "professionisti" già
usata per l'immagine profilo professionista — non è un dato specifico del
ruolo, è la stessa "immagine profilo" per qualunque account, non serve
separarla). `GET/PATCH /auth/me` espongono ora `imageUrl` insieme agli
altri campi. Sezione "Immagine profilo" in `/account` (stesso pattern
avatar circolare 72px + `ImageCropModal` già usato in
`/dashboard/profilo`: ritaglio quadrato/circolare lato client prima
dell'upload, nessun componente duplicato). `AccountMenu` (header) mostra
ora l'avatar (foto reale o iniziali su fondo cianografia-velo, componente
`Avatar` di `packages/ui`, Fase 3) accanto al nome, non solo il testo —
visibile su ogni pagina del sito essendo nell'header globale.
Verificato end-to-end con l'API locale e Playwright: `imageUrl` null alla
registrazione, avatar con iniziali "GC" visibile nell'header; percorso
"non configurato" (nessuna `CLOUDINARY_*` in questo ambiente locale,
stesso stato già documentato per l'immagine profilo professionista)
verificato sia via API diretta (400 con messaggio chiaro) sia in UI
(errore mostrato sotto al bottone "Carica immagine", form non bloccato,
`imageUrl` resta `null`) — nessun crash. Typecheck pulito su tutti i
package.
- **Da fare prima del lancio**: stesso promemoria già presente per
  l'immagine profilo professionista — servono le credenziali reali
  (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`)
  per attivare l'upload in produzione, nessuna variabile nuova richiesta
  (stesso account Cloudinary).
- **Correzione**: nascosta di nuovo per i professionisti (richiesta
  esplicita dell'utente) — un professionista ha già la propria immagine
  profilo pubblica (`ProfessionalProfile.imageUrl`, editabile in
  `/dashboard/profilo`); quella appena aggiunta qui (`User.imageUrl`) non è
  mostrata da nessuna parte pubblicamente, mostrarla anche in
  `/account` per un professionista sarebbe ridondante e fuorviante (farebbe
  pensare che cambi l'immagine pubblica). La sezione "Immagine profilo" in
  `/account` ora si nasconde con `user.role !== "PROFESSIONAL"`; l'endpoint
  `POST /auth/me/image` resta comunque disponibile (usato dai clienti).

**Popup "toast" per nuove notifiche + numeretto per sezione** — richiesta
esplicita dell'utente: "quando si ricevono nuovi aggiornamenti fai
visualizzare un piccolo popup dinamico in alto, es. 'Fantastico, hai
ricevuto un nuovo preventivo' oppure 'Wow, hanno accettato un tuo
preventivo'", seguita da "quando si clicca sulla dashboard... indica anche
in quale sezione c'è stato l'aggiornamento con un numerico".
- **Bug/lacuna reale scoperta durante l'implementazione**: nessuna
  notifica veniva creata quando un cliente accetta un preventivo — il
  professionista non aveva modo di saperlo se non controllando
  manualmente. Nuovo tipo `QUOTE_ACCEPTED`, creato in
  `BookingsService.createFromQuote` (richiede `professionalProfile.userId`,
  aggiunto all'`include` della query `quote`) — proprio l'esempio "wow,
  hanno accettato un tuo preventivo" citato dall'utente.
- **`NotificationsService.listUnread`** (nuovo, `GET /notifications/unread`):
  a differenza di `unreadCount` (solo il numero), restituisce le notifiche
  non lette con `type`/`payload`/`createdAt` (limite 20) — serve al toast
  per sapere COSA è successo, non solo quante cose.
- **`apps/web/src/lib/notificationCopy.ts`**: mappa statica
  `type → { icon, message }` con testo simpatico in italiano per ogni
  evento (`NEW_LEAD`, `NEW_QUOTE`, `QUOTE_ACCEPTED`,
  `QUOTE_DATE_PROPOSED/CONFIRMED/REJECTED`, `JOB_COMPLETED`,
  `BOOKING_CANCELED_BY_PROFESSIONAL`) — ogni `type` corrisponde sempre allo
  stesso ruolo destinatario, nessuna logica per ruolo necessaria.
- **`AuthContext.tsx`** esteso con `toasts`/`dismissToast`/
  `unreadNotifications`: `checkForNewNotifications` (stesso poll da 45s già
  in uso per il badge) confronta le notifiche non lette con quelle già
  viste in questa sessione (`Set` in un `useRef`, non re-render). Il primo
  controllo dopo login stabilisce solo la "baseline" (nessun toast) —
  altrimenti un professionista con 5 notifiche già in attesa da giorni
  vedrebbe 5 popup tutti insieme al primo caricamento, non è quello che
  "arriva ora" significa. Solo le notifiche viste per la prima volta DOPO
  la baseline diventano un toast.
- **`ToastStack.tsx`** (nuovo, montato una sola volta in `layout.tsx`
  accanto a `SiteHeader`, non solo su dashboard/le-mie-richieste): pila in
  alto al centro, ogni toast si chiude da solo dopo 6s o al click,
  `position:"fixed"` non tipizzato in Tamagui (stesso limite già
  documentato per l'header sticky) — risolto con un `<div>` grezzo,
  contenuto Tamagui all'interno.
- **Numeretto per sezione** (`Richieste ricevute`/`Lavori accettati` su
  `/dashboard`, `Le mie richieste`/`Lavori accettati` su
  `/le-mie-richieste`): `apps/web/src/lib/notificationSections.ts` mappa
  ogni `type` alla sezione a cui appartiene (es. `NEW_LEAD`→Richieste
  ricevute, `QUOTE_ACCEPTED`→Lavori accettati lato professionista;
  `NEW_QUOTE`→Le mie richieste, `JOB_COMPLETED`→Lavori accettati lato
  cliente). Badge rosso sul tab, stesso stile del badge nell'header.
- **Race condition reale scoperta e corretta con Playwright** (non solo
  ipotizzata): la prima versione calcolava il numeretto per sezione dal
  conteggio "live" già mantenuto da `AuthContext` (`unreadNotifications`),
  ma quello viene aggiornato dallo stesso poll usato per badge/toast — su
  un caricamento diretto di `/dashboard` (link profondo, non navigazione
  interna), l'effetto che segna tutto come letto (`markNotificationsRead`,
  già presente) e l'effetto che aggiorna `unreadNotifications` partono
  nello stesso istante, e l'ordine di arrivo delle risposte HTTP non è
  garantito: se la `PATCH` di "segna come letto" vince, il numeretto per
  sezione risultava sempre 0 anche se un attimo prima c'era davvero un
  aggiornamento — riprodotto: su un `goto` diretto a `/dashboard` il badge
  di sezione non appariva mai, mentre su navigazione interna (client-side,
  dopo aver già visitato un'altra pagina) appariva quasi sempre per
  puro caso di timing. Corretto rendendo la sequenza esplicita: sia
  `/dashboard` che `/le-mie-richieste` ora recuperano l'elenco delle
  notifiche non lette con una chiamata dedicata (`apiClient.
  unreadNotifications`), calcolano lo snapshot per sezione, e SOLO DOPO
  (`.finally`) chiamano `markNotificationsRead()` — mai in parallelo.
  Verificato end-to-end con Playwright: caricamento diretto (`page.goto`)
  di `/dashboard` con una richiesta non letta in attesa → badge "1" sul
  tab "Richieste ricevute" sempre presente (ripetuto più volte), badge
  dell'header comunque azzerato (il "segna come letto" avviene comunque,
  solo dopo).
- Verificato end-to-end con l'API locale e Playwright (non solo
  typecheck): toast "🎉 Fantastico! Hai ricevuto una nuova richiesta."
  comparso ~45s dopo l'arrivo di un nuovo lead mentre il professionista
  era già sulla home (nessun reload), sparito da solo dopo ~6s; nessun
  toast al primo caricamento nonostante 0 notifiche pregresse (baseline
  corretta); badge di sezione "1" su "Richieste ricevute" verificato su
  caricamento diretto della dashboard, ripetuto senza fallimenti. Zero
  errori console in tutti i flussi. Typecheck pulito su tutti i package
  (`shared`, `database`, `api-client`, `api`, `web`, `mobile`).

**Data/fascia oraria richiesta visibile anche dopo l'invio** — richiesta
esplicita dell'utente: quando la richiesta guidata parte da una fascia
"generica" dell'agenda pubblica di un professionista (`preferredDate`/
`preferredTimeSlot`), prima era visibile solo nel form al momento
dell'invio (blocco "Fascia richiesta" in `GuidedRequestForm`), mai più
dopo — bug di esposizione dati: `ClientGuidedRequest` portava già questi
due campi ma `GuidedRequestCard` (`/le-mie-richieste`) non li rendeva mai.
Aggiunta una riga con icona `calendar` (data+fascia, es. "mercoledì 5
agosto · 09:00–13:00") accanto a indirizzo/foto già mostrati, visibile
solo quando entrambi i campi sono valorizzati. Verificato end-to-end con
l'API locale e Playwright: richiesta creata con `preferredDate`/
`preferredTimeSlot` da una fascia generica → riga visibile correttamente
in `/le-mie-richieste`, zero errori console.

**Ciclo di vita completo lead→preventivo: rifiuto/ritiro ad ogni stadio** —
tre richieste esplicite dell'utente nello stesso giro: (1) "al
professionista dai la possibilità di rifiutare una richiesta di preventivo
dove si aprirà un popup con note da inserire", (2) "quando un cliente
riceve un preventivo, dai l'opzione per rifiutare il preventivo oltre ad
accettarlo", (3) "nei preventivi inviati, dai la possibilità di annullare
o modificare un preventivo" (lato professionista).
- **Nuovo `LeadStatus.DECLINED`** + `Lead.declineNote` (facoltativo):
  `ProfessionalsService.declineLead` (`PATCH /professionals/me/leads/:id/decline`)
  — consentito solo se il professionista non ha già inviato un preventivo
  per quella richiesta (a quel punto si ritira il preventivo, non si
  rifiuta più il lead in sé). Notifica il cliente (`LEAD_DECLINED`).
- **Nuovo `QuoteStatus.WITHDRAWN`** (distinto da `REJECTED`, già presente
  nello schema ma mai realmente impostato da nessun percorso prima
  d'ora): stesso stato finale "non più valido" di `REJECTED`, ma il
  messaggio mostrato all'altra parte dev'essere diverso a seconda di chi
  ha agito — `QuotesService.rejectByClient` (`POST /quotes/:id/reject`,
  il cliente rifiuta l'intero preventivo, non solo una data proposta
  — distinto da `rejectProposedDate`) e `QuotesService.
  withdrawByProfessional` (`POST /quotes/:id/withdraw`, il professionista
  ritira un preventivo prima che il cliente lo accetti). Notificano
  rispettivamente il professionista (`QUOTE_REJECTED`) e il cliente
  (`QUOTE_WITHDRAWN`).
- **"Modifica preventivo"**: `QuotesService.createOrUpdate` ora rifiuta
  (403) di aggiornare un preventivo il cui stato non è più `SENT` (prima
  nessun controllo — un preventivo `ACCEPTED`/`REJECTED`/`WITHDRAWN`/
  `MODIFICATION_REQUESTED` sarebbe stato silenziosamente riscrivibile,
  confondendo il ciclo di vita gestito da altri endpoint). In
  `/dashboard`, `LeadCard.startEditingQuote()` riapre il modulo invio
  preventivo precompilato con voci/note/data esistenti — stesso modulo
  già usato per il primo invio, nessun componente duplicato.
- **`CancelBookingModal.tsx` reso parametrizzabile** (title/description/
  notePlaceholder/confirmLabel/confirmingLabel, default invariati):
  riusato tale e quale per il pop-up "Rifiuta richiesta" (stesso pattern
  "nota facoltativa + conferma rossa" già corretto per l'uso originale,
  invece di duplicare un intero componente quasi identico).
- **`sentTo` (lato cliente)** espone ora `declined`/`declineNote` per
  professionista: badge "Ha rifiutato" + nota, invece di lasciare il
  cliente a chiedersi perché un professionista non risponde mai.
- **Due bug reali scoperti e corretti durante la verifica** (non solo
  ipotizzati, riprodotti con un test end-to-end contro l'API locale):
  1. `QuotesService.rejectByClient` chiamava `notificationsService.notify`
     passando `quote.professionalProfileId` invece dello `userId` del
     professionista — `Notification.userId` referenzia `User`, non
     `ProfessionalProfile`: la chiamata falliva con un errore 500
     (violazione del vincolo di chiave esterna) invece di notificare.
     Corretto includendo `professionalProfile` nella query e usando
     `quote.professionalProfile.userId`.
  2. `BookingsService.createFromQuote` non controllava mai lo stato del
     preventivo prima di accettarlo — l'unica guardia era "non ha già una
     prenotazione", quindi un preventivo già `REJECTED` (dallo stesso
     cliente) o `WITHDRAWN` (dal professionista) restava comunque
     accettabile. Corretto aggiungendo il controllo di stato.
- Verificato end-to-end con l'API locale (non solo typecheck) e
  Playwright: rifiuto lead con nota → cliente vede "Ha rifiutato" +
  nota, doppio rifiuto bloccato (403); cliente rifiuta un preventivo
  ricevuto → professionista notificato, tentativo di accettarlo comunque
  bloccato (403, bug #2 sopra riprodotto e poi confermato corretto);
  professionista ritira un preventivo inviato → cliente vede "Il
  professionista ha ritirato questo preventivo"; professionista modifica
  un preventivo ancora `SENT` (voci/note aggiornate, stesso id, stato
  resta `SENT`), poi tentativo di modificarlo dopo l'accettazione del
  cliente correttamente bloccato (403). Screenshot di entrambe le
  dashboard (cliente e professionista) con tutti e quattro gli stati
  visibili contemporaneamente, zero errori console. Typecheck pulito su
  tutti i package.

**Galleria "lavori svolti" (fino a 10 foto) + filtri/ordinamento/quantità
nelle quattro liste** — due richieste esplicite dell'utente nello stesso
giro:

1. **Galleria lavori svolti**: chiarimento esplicito dell'utente sul punto
   "foto profilo" già in coda — non foto profilo multiple, ma foto reali di
   lavori completati, "in modo che gli utenti aprendo l'account del
   professionista possano avere un'idea dei lavori svolti". Nuovo campo
   `ProfessionalProfile.portfolioUrls String[] @default([])` (Prisma),
   distinto da `imageUrl` (la foto profilo singola). Stesso pattern/limite
   già in uso per `GuidedRequest.photoUrls`/`Review.photoUrls`: upload una
   foto alla volta (`POST /professionals/me/portfolio-photos`, stessa
   integrazione Cloudinary, cartella `professionisti-portfolio`), l'URL
   entra nell'array solo al salvataggio vero e proprio del profilo (`PUT
   /professionals/me`), non persistito subito dall'endpoint di upload.
   Sezione "Foto dei lavori svolti (fino a 10, opzionale)" in
   `/dashboard/profilo` (stessa griglia miniatura+tasto "×" rosso+tasto "+"
   già in uso per le foto della richiesta guidata). Sul profilo pubblico
   (`ProfessionalDetailContent.tsx`), sezione "Lavori svolti" tra Prestazioni
   e Agenda: griglia di miniature cliccabili che aprono `PhotoLightbox`
   (stesso componente già usato per le foto delle recensioni), `?? []`
   difensivo sul campo (stessa cautela già documentata per
   `review.photoUrls`/agenda: web e API si deployano indipendentemente,
   un'API non ancora aggiornata potrebbe non includere ancora il campo).
2. **Filtri/ordinamento/quantità nelle quattro liste** — richiesta esplicita
   dell'utente: "fai visualizzare un massimo di 5 eventi e poi con la
   scelta possono essere aumentati a 10 o 20... dai la possibilità di
   modificare l'ordine di visualizzazione ad esempio: per data di
   intervento, per data di ricezione, per ultimo aggiornamento" — estende
   ed assorbe una richiesta precedente rimasta in coda (filtri per stato in
   "Richieste ricevute"/"Lavori accettati", con esempi già dati
   dall'utente: "preventivo inviato, preventivo accettato" lato
   professionista, "completati, annullati, da effettuare" lato lavori).
   Nuovo componente condiviso `apps/web/src/components/ListControls.tsx`
   (tre `<select>` nativi: Filtra/Ordina per/Mostra) e helper
   `sortListItems` — usati identicamente dalle quattro liste (Richieste
   ricevute e Lavori accettati in `/dashboard`; Le mie richieste e Lavori
   accettati in `/le-mie-richieste`). Tutto calcolato **client-side**
   (filtro, ordinamento, `slice(0, pageSize)`): niente nuovi query param
   lato server, coerente con la scala di lancio già documentata (CLAUDE.md
   §7, 1 città/poche categorie) — le liste sono già interamente scaricate
   dagli endpoint esistenti.
   - **`updatedAt`** aggiunto a `GuidedRequest`, `Lead`, `Quote` (Prisma,
     `@default(now()) @updatedAt` — il default era necessario per una
     `db push` additiva su tabelle già popolate, senza `--force-reset`).
     `Booking` aveva già sia `createdAt` che `updatedAt`, nessuna
     migrazione lì. "Ultimo aggiornamento" per una richiesta/lead riflette
     il più recente tra l'evento sulla riga stessa e quello di un
     eventuale preventivo collegato (`GuidedRequestsService.listForClient`,
     `ProfessionalsService.getMyLeads`) — un preventivo accettato/rifiutato
     conta come "aggiornamento" della richiesta anche se la riga
     `GuidedRequest` in sé non è cambiata.
   - **"Per data di intervento"** (`scheduledAt`) è cronologico
     **ascendente** (il prossimo intervento in cima), stesso principio già
     seguito in `ProfessionalsService.getMyBookings`; "per data di
     ricezione"/"per ultimo aggiornamento" restano invece discendenti (il
     più recente in cima). Disponibile solo per le due liste "Lavori
     accettati" (hanno un `Booking.scheduledAt` reale) — le due liste
     "richieste" offrono solo ricezione/ultimo aggiornamento, non avendo
     una singola data di intervento certa finché non arriva un preventivo.
   - **Filtri per stato**, valori distinti per lista:
     "Richieste ricevute" (professionista) — Tutte / In attesa di
     preventivo / Preventivo inviato / Preventivo accettato / Rifiutate;
     "Lavori accettati" (professionista) — Tutti / Da effettuare /
     Completati / Annullati; "Le mie richieste" (cliente) — Tutte / In
     attesa di risposte / Inviata ai professionisti / Chiusa (riusa
     `STATUS_LABEL` già esistente); "Lavori accettati" (cliente) — Tutti /
     In attesa / Confermata / Completata / Annullata / Non presentato
     (riusa `BOOKING_STATUS_LABEL` già esistente).
   - **Quantità visibile**: 5/10/20, default 5 (richiesta esplicita
     dell'utente). I contatori nelle etichette dei tab ("Richieste ricevute
     (7)") restano sul totale non filtrato — solo l'elenco sotto rispetta
     filtro/quantità — per non far sembrare sparite delle richieste che
     esistono ma sono semplicemente fuori dalla pagina corrente.
   - `ListControls` compare solo quando la lista ha almeno un elemento
     (nessun controllo su una lista vuota); un messaggio dedicato
     ("Nessuna richiesta corrisponde al filtro selezionato.") distingue
     "lista vuota per davvero" da "lista svuotata dal filtro corrente".
3. Verificato end-to-end con l'API locale (non solo typecheck) e
   Playwright: upload foto lavori svolti senza credenziali Cloudinary in
   locale → errore chiaro (400, stesso pattern "non configurato" già
   verificato per l'immagine profilo), mai un crash; `portfolioUrls`
   scritte direttamente sul DB di test → esposte correttamente sia da `GET
   /professionals/:id` (pubblico) che da `GET /professionals/me`, e
   round-trip corretto attraverso `PUT /professionals/me`; galleria "Lavori
   svolti" visibile sul profilo pubblico con lightbox funzionante al click;
   sezione upload visibile in `/dashboard/profilo` con le miniature
   esistenti già mostrate. Sette richieste guidate create per un singolo
   professionista/cliente di test: `updatedAt` presente su tutte e quattro
   le risposte API (`guided-requests/me`, `professionals/me/leads`,
   `professionals/me/bookings`, `bookings/me`); controllo "Mostra"
   verificato a 5 di default sia lato professionista che lato cliente,
   cambio a 10/20 riflesso subito in UI; filtro "Rifiutate" su
   `/dashboard` narrows correttamente a una sola card con badge "Richiesta
   rifiutata"; ordinamento "Data di ricezione" (default) verificato per
   ordine decrescente su `/le-mie-richieste` con 7 richieste. Zero errori
   console in tutti i controlli. Typecheck pulito su tutti i package
   (`shared`, `database`, `api-client`, `api`, `web`, `mobile`), build di
   produzione `apps/web` verde (24 route).

**Paginazione vera per "Mostra"** — richiesta esplicita dell'utente: "su
mostra ad esempio 5, se ce ne sono di più ad esempio andranno in altre
pagine selezionabili". Prima `ListControls`/`sortListItems` tagliavano
l'elenco a `pageSize` con `slice(0, pageSize)`: gli elementi oltre la
quantità scelta sparivano semplicemente, senza alcun modo di raggiungerli
— non era ancora paginazione, solo un limite. Nuovo componente
`Pagination` (`apps/web/src/components/ListControls.tsx`): frecce
precedente/successivo + un pulsante numerato per ogni pagina (stile a
pillola, stessi token brand delle altre pillole/tab del sito), invisibile
(ritorna `null`) quando c'è una sola pagina — coerente con lo stesso
principio già seguito per `ListControls` stesso (non occupare spazio per
un controllo inutile).
- **Stato di pagina per lista** (`leadsPage`/`bookingsPage` in
  `/dashboard`, `requestsPage`/`clientBookingsPage` in
  `/le-mie-richieste`): `totalPages = Math.max(1, Math.ceil(lunghezza /
  pageSize))`, `effectivePage = Math.min(page, totalPages)` — quest'ultimo
  evita di restare bloccati su una pagina che non esiste più (es. pagina 3
  aperta, poi si passa a "Mostra 20" e tutto entra in una sola pagina, o si
  applica un filtro che restringe l'elenco).
- **Cambiare filtro, ordinamento o quantità riporta sempre a pagina 1**
  (`updateLeadsStatusFilter`/`updateLeadsSort`/`updateLeadsPageSize` e i
  quattro equivalenti nelle altre liste, wrapper attorno ai setter di
  stato passati a `ListControls`): restare su un numero di pagina fisso
  dopo aver cambiato i criteri con cui l'elenco viene composto sarebbe
  confuso (es. pagina 3 di un filtro può diventare vuota o mostrare
  contenuto diverso sotto un filtro nuovo).
- Verificato end-to-end con l'API locale (non solo typecheck) e
  Playwright: 9 richieste guidate create per un cliente/professionista di
  test (sotto la soglia di rate limiting 10/min di `/guided-requests`,
  CLAUDE.md §"Rate limiting" — 12 avrebbe fatto scattare un 429, riprodotto
  e corretto durante la scrittura del test) → esattamente 2 pulsanti pagina
  su entrambe le liste (`/le-mie-richieste` e `/dashboard`) con "Mostra 5"
  di default; pagina 1 mostra le 5 più recenti (ordinamento "Data di
  ricezione" discendente, verificato per contenuto esatto), pagina 2 le 4
  rimanenti senza sovrapposizioni; "Pagina precedente" riporta
  correttamente da pagina 2 a pagina 1; passando a "Mostra 20" tutte e 9
  le richieste entrano in un'unica pagina e i pulsanti pagina spariscono;
  tornando a "Mostra 5" i pulsanti ricompaiono (2). Stessa verifica
  ripetuta lato professionista su `/dashboard` (tab "Richieste ricevute").
  Zero errori console. Typecheck pulito su tutti i package, build di
  produzione `apps/web` verde (24 route).

**Login professionista → Dashboard, non la home** — richiesta esplicita
dell'utente: "quando un professionista effettua l'accesso la pagina
successiva che deve essere aperta è la Dashboard". `/accedi` mandava
sempre a `redirectTo` (query param `?redirect=` o, in sua assenza, `"/"`)
indipendentemente dal ruolo — un professionista senza un redirect
esplicito in URL finiva sulla home invece che in Dashboard, a differenza
di `/registrati` (già corretto in un giro precedente per lo stesso
motivo). `AuthContext.login()` ora ritorna l'utente appena caricato
(`CurrentUser | null`, prima `Promise<void>`) invece di aspettare un
re-render per leggere `user` dal contesto — necessario perché subito dopo
`await login(token)` bisogna già sapere il ruolo per decidere dove
reindirizzare, nella stessa funzione. `/accedi` (sia login email+password
sia Google) reindirizza ora a `/dashboard` se il ruolo è `PROFESSIONAL` e
non è stato passato un `?redirect=` esplicito in URL (quest'ultimo vince
sempre — es. "Accedi come professionista" da `/dashboard/profilo` con
sessione scaduta deve tornare lì, non in Dashboard). Verificato end-to-end
con l'API locale e Playwright: login email+password di un professionista
senza redirect → atterra su `/dashboard`; stesso login con
`?redirect=/dashboard/profilo` in URL → atterra lì invece, il redirect
esplicito vince. Zero errori console, typecheck pulito.

**Agenda — eliminazione massiva delle fasce + propagazione di una modifica
a tutte le stesse settimane del mese** — due richieste esplicite
dell'utente nello stesso giro:

1. **Tasto "Modifica" in `/dashboard/agenda`** (calendario "Disponibilità"):
   apre `BulkDeleteAvailabilityModal` per eliminare in blocco le fasce
   corrispondenti a un ambito scelto — "Giorni specifici" (griglia di
   caselle numerate per ogni giorno del mese visualizzato, multi-selezione),
   "Mese intero" (tutte le fasce di quel mese, incluse quelle ricorrenti
   storiche con `date` nullo) o "Giorni della settimana" (una casella per
   Lunedì...Domenica, seleziona tutte le occorrenze di quei giorni nel
   mese) — più un filtro opzionale "Solo un orario preciso" (due campi
   orario, match esatto su inizio/fine) da combinare con qualunque ambito.
   Un contatore live ("N fasce corrispondenti") aggiorna il conteggio ad
   ogni cambio di selezione; "Elimina" richiede una seconda conferma
   (stesso pattern a due passaggi già in uso altrove), con avviso
   aggiuntivo se una delle fasce selezionate ha una prenotazione futura.
   Nessun nuovo endpoint backend: la rimozione avviene sullo stato locale
   `slots` (stesso pattern già in uso per l'eliminazione di una singola
   fascia da `SlotEditorModal`), persistita solo al successivo "Salva
   agenda" — `upsertMyAvailability` sostituisce già l'intera lista ad ogni
   salvataggio. Nuovi helper condivisi in `calendarDates.ts`: `datesInMonth`
   (tutte le date di un mese) e `datesInMonthForGivenWeekday` (le date di un
   mese su un giorno della settimana scelto indipendentemente da una data di
   ancoraggio) — `datesInMonthForWeekday` esistente riscritta per riusare
   quest'ultimo invece di un calcolo a parte.
2. **Propagare la modifica di una fascia esistente (es. capienza) a tutte
   le stesse occorrenze del mese** — richiesta esplicita dell'utente:
   "quando si modifica il numero massimo delle prenotazioni... dai la
   possibilità di selezionare per tutti i giorni della settimana
   selezionato del mese, altrimenti se non spuntata andrà a modificare
   solo quel giorno". La spunta "Ripeti per tutti i \<giorno\> del mese"
   in `SlotEditorModal` (prima visibile solo creando una fascia nuova,
   dove aggiunge una fascia per occorrenza) è ora visibile anche
   modificando una fascia già esistente legata a una data esatta
   (etichetta diversa: "Applica anche a tutti i \<giorno\> del mese" —
   nessuna spunta per le fasce ricorrenti storiche senza data, che non
   hanno un mese su cui questo scoping abbia senso). Se spuntata,
   `commitSlotEdit` propaga il nuovo orario/capienza a tutte le fasce
   "gemelle" del mese: stesso giorno della settimana **e** stesso
   orario originale della fascia in modifica (non qualunque altra fascia
   che capita di cadere lo stesso giorno) — la ri-validazione di
   sovrapposizione esclude le fasce del gruppo stesso dal controllo (si
   stanno aggiornando insieme) ma verifica ancora contro eventuali altre
   fasce indipendenti su quei giorni. Se non spuntata, comportamento
   invariato: solo quella fascia viene modificata.
   `CalendarShell.tsx`: le celle della vista Mese hanno ora un
   `accessibilityLabel` descrittivo ("Vai al 2 Agosto 2026") — mancava del
   tutto, un piccolo miglioramento di accessibilità emerso scrivendo il
   test end-to-end (serviva un modo affidabile di navigare a un giorno
   specifico senza contare i click "settimana successiva").
   Nuove icone nel registro condiviso: `pencil` (tasto "Modifica"),
   `trash-2` (tasto "Elimina" del pop-up di eliminazione massiva).
3. Verificato end-to-end con l'API locale (non solo typecheck) e
   Playwright: 5 fasce seminate in un mese (4 sullo stesso giorno della
   settimana, 1 su un giorno diverso) → ambito "Giorni specifici" (2
   selezionati) conta 2, "Mese intero" conta 5, "Giorni della settimana"
   (il giorno comune) conta 4, aggiungendo il secondo giorno conta 5,
   "Mese intero" + orario preciso 09:00–10:00 conta 1; eliminazione reale
   di 2 fasce → stato locale sceso a 3, persistito correttamente via
   `PUT /professionals/me/availability` dopo "Salva agenda" (verificato
   che le date eliminate non sono più tra le fasce restituite dall'API).
   Propagazione: 4 fasce seminate (3 sullo stesso giorno della settimana,
   1 di controllo su un giorno diverso con lo stesso orario) → modifica
   della capienza di una delle tre con la spunta attiva → le altre due
   sullo stesso giorno della settimana aggiornate alla stessa capienza,
   la fascia di controllo (giorno diverso) invariata — confermato via API
   dopo il salvataggio. Zero errori console in tutti i controlli.
   Typecheck pulito su tutti i package (`shared`, `database`,
   `api-client`, `ui`, `api`, `web`, `mobile`), build di produzione
   `apps/web` verde (24 route).

**Homepage — categorie in una riga scorrevole** — richiesta esplicita
dell'utente: "nella homepage nelle categorie di cosa hai bisogno? deve
esserci un elenco scorrevole su un'unica riga dove si può scorrere a
destra e sinistra sia con una freccetta che scorrendo col dito". La
griglia `flexWrap` precedente (le categorie andavano a capo su più righe)
è sostituita da `apps/web/src/components/CategoryCarousel.tsx`: una riga
`overflow-x: auto` (scroll touch nativo del browser, già funzionante di
suo) con due freccette che chiamano `scrollBy` su un ref — nessuna
libreria di carosello aggiunta, stesso principio "CSS puro per i
componenti che Tamagui non rende bene" già seguito per
`MegaMenu`/`ResultsListWithMap`/`CalendarShell`. Le freccette sono
nascoste via CSS su un dispositivo touch-only (`@media (hover: none)`,
`.category-carousel-arrow`, `globals.css`): lì lo swipe nativo basta,
mostrarle occuperebbe solo spazio senza motivo. **Bug reale scoperto e
corretto durante la verifica**: la regola `display: none` dentro quel
`@media` non aveva alcun effetto — un inline style (`display: "flex"`,
impostato nel componente per centrare l'icona) vince sempre su una
regola esterna senza `!important`, indipendentemente dal fatto che la
media query corrisponda; corretto aggiungendo `!important` alla sola
regola dentro il blocco `@media`. Scrollbar visiva nascosta
(`scrollbar-width: none` + `::-webkit-scrollbar { display: none }`) sulla
riga, lo scroll resta comunque possibile. Verificato con Playwright (non
solo lettura di codice, e non sul primo tentativo: un primo giro di
verifica aveva dato un falso negativo per un server di produzione rimasto
attaccato alla porta da un avvio precedente non terminato correttamente,
servendo ancora il build vecchio — individuato confrontando l'hash del
CSS servito con quello effettivamente presente su disco dopo la build) —
con `devices["iPhone 13"]` di Playwright (non un semplice
`viewport`+`hasTouch`, che non basta a far corrispondere `(hover: none)`
in Chromium): freccette visibili e funzionanti su desktop (click destro/
sinistro cambia `scrollLeft`), freccette assenti su un profilo touch
reale, riga scrollabile via swipe nativo su entrambi, nessun overflow
orizzontale introdotto sulla pagina. Zero errori console. Typecheck
pulito, build di produzione verde.

**Nota per il prossimo giro (non implementato)**: richiesta esplicita
dell'utente di sostituire le icone colorate delle categorie con foto
reali (es. "qualcuno che lavora") nella stessa riga scorrevole, per dare
un sentimento più genuino al cliente. Non implementato in questo giro:
richiede una decisione sulla fonte delle foto (upload diretto
dell'utente, servizio di stock photo da integrare — nessuno ancora
approvato in tabella §2 — o generazione) prima di poter procedere, per
non introdurre hotlink a immagini esterne non verificate o scelte a
casuale.

**Login professionista → Dashboard (giro precedente al carosello categorie,
stesso principio già applicato a `/registrati`)**: `/accedi` mandava sempre
a `redirectTo` (query param `?redirect=` o, in sua assenza, `"/"`)
indipendentemente dal ruolo. `AuthContext.login()` ora ritorna l'utente
appena caricato (`Promise<CurrentUser | null>`, prima `Promise<void>`) —
necessario per poter decidere il redirect nella stessa funzione subito dopo
`await login(token)`, senza aspettare un re-render per leggere `user` dal
contesto. `/accedi` (sia login email+password sia Google) reindirizza ora a
`/dashboard` se il ruolo è `PROFESSIONAL` e non è stato passato un
`?redirect=` esplicito in URL (quest'ultimo vince sempre — es. "Accedi come
professionista" da `/dashboard/profilo` con sessione scaduta deve tornare
lì, non in Dashboard).

**"Richiedi preventivo" nascosto in header per un professionista già
autenticato** — richiesta esplicita dell'utente: quell'azione è pertinente
solo per un cliente, non per chi gestisce il proprio profilo professionale.
`SiteHeader.tsx` nasconde il bottone con `user?.role !== "PROFESSIONAL"`
— il link omonimo in `SiteFooter.tsx` resta invariato (non è nello scope,
il footer non è specifico del ruolo loggato).

**Agenda — apertura di default su "Prenotazioni" + avviso disponibilità
assente** — richiesta esplicita dell'utente: l'ordine dei tab è invertito
("Prenotazioni" prima di "Disponibilità", `activeTab` iniziale
`"prenotazioni"`) perché le prenotazioni sono l'informazione più
urgente/time-sensitive quando si apre l'agenda. Se `slots.length === 0`,
un banner (visibile su entrambi i tab) segnala "Non hai ancora impostato la
tua disponibilità" con un bottone "Aggiungi disponibilità" che passa al tab
"Disponibilità" — spiega perché un professionista senza fasce impostate
riceve meno prenotazioni, invece di lasciarlo scoprirlo da solo.

**Agenda — eliminazione in blocco delle fasce: modalità di selezione
inline, non un pop-up separato** — richiesta esplicita dell'utente, arrivata
in due passaggi. Prima versione: un pop-up (`BulkDeleteAvailabilityModal`)
con ambiti "Giorni specifici"/"Mese intero"/"Giorni della settimana" +
filtro opzionale per orario preciso. L'utente ha poi chiesto esplicitamente
di **non aprire una schermata nuova**: il pop-up è stato rimosso del tutto
e sostituito da una modalità di selezione diretta sullo stesso calendario
"Disponibilità" già esistente (`CalendarShell`, Giorno/Settimana/Mese) —
tasto "Modifica" nella toolbar attiva `selectionMode` (icona `pencil`→`x`,
etichetta "Modifica"→"Annulla"), senza alcun `role="dialog"` aperto.
- **Selezione a tre livelli, stesso stato (`selectedSlotIndexes: Set<number>`)**:
  singola fascia (click su una `SlotChip` in Giorno/Settimana/Mese — in
  modalità selezione il click seleziona invece di aprire `SlotEditorModal`),
  giorno intero (`toggleDaySelection`, click sull'etichetta "Seleziona
  giorno" sopra le fasce della colonna, oppure click sulla cella di un
  giorno in vista Mese — lì il click NON naviga a Giorno come seconda
  fascia normalmente farebbe, la modalità selezione intercetta il click),
  mese intero (`toggleMonthSelection`, link testuale "Seleziona tutto il
  mese" nella toolbar, scoped al mese di `currentDate`). "Elimina" richiede
  una seconda conferma (stesso pattern a due passaggi già in uso altrove);
  la rimozione avviene solo sullo stato locale `slots`, persistita al
  successivo "Salva agenda" (`upsertMyAvailability` sostituisce già
  l'intera lista, nessun nuovo endpoint necessario).
- **Casellina di spunta su ogni elemento selezionabile** — richiesta
  esplicita dell'utente ("deve esserci una casellina per capire che si può
  cliccare"): nuovo componente locale `SelectionCheckbox` (riquadro 14×14,
  bordo cianografia, sfondo cianografia piena + icona `check` bianca
  quando selezionato, altrimenti vuoto) al posto delle sole icone
  `plus`/`check`/`calendar` colorate usate nella prima stesura — più
  riconoscibile come controllo cliccabile a colpo d'occhio. Usata in tre
  punti: dentro `SlotChip` (fascia singola, Giorno/Settimana/Mese), prima
  del testo "Seleziona giorno"/"Giorno selezionato" (colonna giorno in
  Giorno/Settimana), al posto dell'icona `check`/`calendar` nella cella
  Mese (accanto al conteggio fasce del giorno).
- Verificato end-to-end con l'API locale (non solo typecheck) e Playwright:
  nessun `role="dialog"` presente dopo aver cliccato "Modifica"; selezione
  di un giorno intero dalla vista Mese senza navigare a Giorno; selezione
  di singole fasce dalla vista Settimana; "Seleziona tutto il mese" arriva
  a selezionare tutte le fasce presenti; eliminazione reale delle fasce
  selezionate seguita da "Salva agenda" → 0 fasce rimaste lato API;
  screenshot di entrambi gli stati (casella vuota/casella selezionata,
  blu piena con spunta bianca) su Giorno e su Mese. Zero errori console.
  Typecheck pulito, build di produzione verde.

**Fasce generiche (capienza): la capienza mostrata riflette trattative
concluse, non semplici richieste in arrivo** — tre correzioni richieste
esplicitamente dall'utente sullo stesso ciclo di vita ("cliccare per
richiedere non deve già sbarrare l'orario", "quando si conclude la
trattativa aggiorna l'agenda", "annullare una prenotazione deve liberare
di nuovo la fascia"):
1. **Bug reale corretto**: il backend esponeva già `guidedRequest.
   preferredDate`/`preferredTimeSlot` sul Lead (`ProfessionalLead`,
   `ProfessionalsService.getMyLeads`), ma `LeadCard` (`/dashboard`) non li
   mostrava mai — il professionista non sapeva quale orario il cliente
   avesse effettivamente richiesto cliccando una fascia generica
   dell'agenda pubblica. Nuovo blocco "Orario richiesto: ..." (icona
   `calendar`, stesso formato già usato in `/le-mie-richieste`) sotto
   l'indirizzo nella card. `LeadCard` preseleziona ora anche quella stessa
   fascia (se ancora libera nella propria agenda) come data di inizio del
   preventivo, invece della prima fascia libera qualsiasi — il
   professionista deve proporre l'orario richiesto, non uno a caso.
2. **`bookedCount`/`hasUpcomingBooking` per le fasce generiche
   (`maxBookings > 1`) ricalcolati da `Booking` reali, non più da
   `GuidedRequest.preferredDate/preferredTimeSlot`** — richiesta esplicita:
   il semplice arrivo di una richiesta di preventivo (il cliente che
   clicca per richiedere) non deve "sbarrare" l'orario né consumare la
   capienza mostrata pubblicamente; solo una trattativa conclusa
   (preventivo accettato → `Booking` creato da `BookingsService.
   createFromQuote`) deve farlo. `getPublicAgenda` e `getMyAvailability`
   (`ProfessionalsService`) ora contano/verificano contro lo stesso array
   `bookings` (status `PENDING`/`CONFIRMED`/`COMPLETED`, già filtrato a
   monte) già usato per le fasce esatte, tramite il nuovo helper
   `countBookingsInSlot` (generalizzazione di `isSlotBooked`, che ora è
   solo `> 0` di quello). La query separata su `GuidedRequest` per le
   fasce generiche è stata rimossa in entrambi i metodi: non serve più.
   **Non toccato deliberatamente**: il conteggio di capienza dentro
   `GuidedRequestsService.resolveGenericSlot` (quante richieste sono già
   arrivate per quella fascia, usato per bloccare la N+1 con 409 "capienza
   esaurita") resta basato su `GuidedRequest`, non su `Booking` — è un
   meccanismo distinto e già testato (fan-out/anti-spam sulle richieste in
   arrivo, non sulle trattative concluse), non nello scope di questa
   richiesta e un suo cambiamento avrebbe rischiato di rompere un
   comportamento già verificato.
3. **Liberazione automatica alla cancellazione**: nessuna logica dedicata
   necessaria — una prenotazione annullata (`CANCELED`/`NO_SHOW`) non è
   mai nel set `bookings` filtrato a monte (`status: { in: ["PENDING",
   "CONFIRMED", "COMPLETED"] }`), quindi esce da sola dal conteggio non
   appena annullata, sia per le fasce esatte che per quelle generiche.
Verificato end-to-end con l'API locale (non solo typecheck): fascia
generica a capienza 3, richiesta guidata creata → `bookedCount` pubblico
resta 0/3 (nessun consumo alla sola richiesta); professionista vede
"Orario richiesto" sulla propria dashboard; preventivo inviato per
quell'orario e accettato dal cliente → `bookedCount` sale a 1/3 solo ora;
prenotazione annullata dal cliente → `bookedCount` torna a 0/3. Zero
errori console, typecheck pulito su tutti i package.

**Giro di correzioni/funzionalità — casellina selezione, header professionista,
note prenotazione, freccette caroselli, "Proponi altra data", badge
notifiche nei sottomenu, swipe agenda** (tutte richieste esplicite
dell'utente nello stesso giro):

1. **Casellina di spunta nella modalità selezione dell'agenda** —
   ogni elemento selezionabile in modalità "Modifica" (calendario
   "Disponibilità") mostra ora una `SelectionCheckbox` (riquadro 14×14,
   bordo cianografia, sfondo pieno + icona `check` bianca quando
   selezionato) al posto delle sole icone colorate poco riconoscibili
   come controlli cliccabili: singola fascia oraria (`SlotChip`),
   etichetta "Seleziona giorno"/"Giorno selezionato", conteggio fasce
   nella cella della vista Mese.
2. **Bug reale corretto: selezione "traslata" su altri giorni/mesi** —
   segnalato dall'utente in tre passaggi ("cliccando un giorno seleziona
   l'intera colonna", "'Seleziona tutto il mese' seleziona anche oltre il
   mese visualizzato", "cliccando un orario non deve traslare negli altri
   giorni"). Causa reale: una fascia ricorrente storica (`date: null`,
   residuo del comportamento precedente al passaggio "per data esatta",
   §11) vale per QUALUNQUE data con lo stesso giorno della settimana,
   senza limite di tempo (`slotAppliesOnDateStr`) — la selezione multipla
   avviene per indice di riga in `slots`, non per singola occorrenza:
   selezionare quell'indice da "un giorno" o "un mese" lo faceva apparire
   selezionato su OGNI cella con lo stesso giorno della settimana, in
   qualunque vista e mese passato/futuro. Corretto su due livelli:
   - `toggleDaySelection`/`toggleMonthSelection` (scorciatoie di gruppo,
     `apps/web/src/app/dashboard/agenda/page.tsx`) escludono ora le fasce
     con `date === null` dal calcolo — non hanno un confine temporale su
     cui "un giorno"/"un mese" abbia senso. Stessa esclusione nel calcolo
     "tutto selezionato" per il render delle etichette/celle.
   - **Le fasce ricorrenti storiche non partecipano più alla selezione
     multipla nemmeno con il click diretto sul singolo `SlotChip`**: unica
     soluzione che rispetta i dati sottostanti senza introdurre una
     materializzazione implicita (che avrebbe convertito silenziosamente
     "per sempre" in un orizzonte finito, un data-loss reale). `SlotChip`
     ha una nuova prop `isLegacyRecurring`: quando vera, il chip non ha
     `onPress`/`role="button"`, mostra un'icona `calendar` al posto della
     casellina e il testo "Fascia ricorrente HH:MM–HH:MM, non selezionabile
     qui" — resta eliminabile solo uscendo da "Modifica" e cliccandola
     normalmente (`SlotEditorModal` → "Elimina fascia", che avvisa già che
     l'eliminazione riguarda ogni occorrenza).
   Verificato con Playwright (non solo lettura di codice): selezione di
   una fascia a data esatta non seleziona una fascia ricorrente storica
   sullo stesso giorno come effetto collaterale; navigando su un giorno
   diverso nessuna fascia lì appare selezionata; una fascia ricorrente
   storica non è più raggiungibile con "Seleziona fascia" e non appare mai
   selezionata su nessuna sua occorrenza futura.
3. **Doppio Escape corretto in `BookingDetailPanel`** — bug reale trovato
   durante l'implementazione del punto 6 sotto: sia `PhotoLightbox` che
   `BookingDetailPanel` registrano un handler `keydown` sullo stesso
   `document` per Escape; un solo tasto Escape chiudeva contemporaneamente
   sia la foto a schermo intero sia il pannello sottostante, invece di
   tornare al pannello. Corretto ignorando l'Escape nel pannello mentre
   `openPhotoIndex !== null`.
4. **Nome attività al posto del nome personale nell'header** — richiesta
   esplicita dell'utente: un professionista è identificato dalla propria
   attività, non dal nome dell'intestatario dell'account (un cliente vede
   invece sempre il proprio nome come prima). `/auth/me`/`/auth/me` PATCH
   (`AuthController.withBusinessName`) recuperano ora `ProfessionalProfile.
   businessName`/`imageUrl` con una query dedicata solo per i professionisti
   (`User` non ha questi campi, vivono su `ProfessionalProfile`, entità
   separata) ed espongono `businessName`/`businessImageUrl` nel tipo
   `CurrentUser`. `AccountMenu.tsx`: `displayName`/`displayImageUrl`
   ricadono sul nome/immagine personale finché il professionista non ha
   ancora creato il profilo (`businessName`/`businessImageUrl` restano
   `null` in quel caso) — mai un'etichetta vuota. Stesso principio esteso
   su richiesta esplicita successiva anche all'**icona in alto a destra**:
   mostra la foto profilo pubblica (`ProfessionalProfile.imageUrl`) quando
   disponibile, non le sole iniziali — `User.imageUrl` (immagine
   dell'account) resta sempre `null` per un professionista, l'upload in
   `/account` è disabilitato per quel ruolo (§12, "Immagine profilo anche
   per gli account cliente").
5. **Descrizione, foto e nota privata nel pannello prenotazione** —
   richiesta esplicita dell'utente: cliccando una prenotazione nel
   calendario "Prenotazioni" devono comparire anche "descrivi il lavoro" e
   le foto della richiesta originale, più la possibilità di scrivere una
   nota personale. Nuovo campo Prisma `Booking.professionalNote`
   (nullable) — privato, mai visto dal cliente, modificabile
   indipendentemente dallo stato della prenotazione, a differenza di
   `cancellationNote` (quella è per il cliente). `ProfessionalBooking`
   (packages/shared) espone ora `description`/`photoUrls` (dal
   `GuidedRequest` collegato via `quote`, `null`/`[]` per le prenotazioni
   dirette da agenda pubblica che non ne hanno una) e `professionalNote`.
   Nuovo endpoint `PATCH /bookings/:id/note` (`BookingsService.
   updateProfessionalNote`). `BookingDetailPanel.tsx`: sezioni "Descrizione
   del lavoro"/"Foto del cliente" (miniature cliccabili → `PhotoLightbox`,
   stesso componente già in uso altrove) e "Note personali (solo per te)"
   con textarea + bottone "Salva nota" (visibile solo quando il testo
   cambia rispetto al valore salvato). `key={booking.id}` sul punto di
   montaggio in `/dashboard/agenda` garantisce uno stato fresco ad ogni
   apertura di una prenotazione diversa.
6. **Freccette sul carosello "Sulla piattaforma" (vetrina professionisti)**
   — richiesta esplicita dell'utente: le freccette del carosello categorie
   in homepage esistevano già (fase precedente), ma il carosello
   `RealShowcase` (professionisti verificati in vetrina,
   `ProfessionalsShowcase.tsx`) usava un semplice `overflow="scroll"` senza
   alcun controllo visibile. Riusa lo stesso componente `CategoryCarousel`
   (già generico, accetta `children`) invece di duplicare il codice delle
   freccette — nessun nuovo componente. Ogni card avvolta in un
   `<div style={{ flexShrink: 0 }}>` (stesso pattern già in uso in
   `HomeContent.tsx` per le categorie), larghezza fissa (`width={220}`
   invece di `minWidth`) per coerenza col contenitore flex.
7. **Bug reale corretto: "Proponi altra data" non mostrava mai orari per
   un professionista con sole fasce a capienza** — segnalato dall'utente
   ("non compaiono le date disponibili"). Riprodotto e isolato: il filtro
   client-side (`startChoosingDate`, `/le-mie-richieste`) escludeva
   esplicitamente `slot.maxBookings !== 1`, quindi un professionista che
   avesse impostato l'agenda solo con fasce generiche non offriva mai
   nulla al cliente in questo flusso — stesso identico bug già corretto in
   un giro precedente per `ProfessionalsService.getMyAvailableSlots` (lato
   professionista, scelta della data di un preventivo): "si sta scegliendo
   quando iniziare un lavoro già concordato, non consumando la capienza
   pensata per il fan-out delle richieste guidate". Corretto con lo stesso
   principio su entrambi i lati:
   - Client: rimosso il filtro `maxBookings === 1`, resta solo `bookedCount
     < maxBookings`.
   - Server (`QuotesService.resolveFreeExactSlot`, usato da `proposeDate`):
     rimosso `maxBookings: 1` dal filtro di ricerca della fascia; il
     controllo "fascia già presa" passa da booleano a conteggio con soglia
     `slot.maxBookings` (stesso principio di `countBookingsInSlot` già in
     uso altrove per `bookedCount`).
   - Server (`QuotesService.confirmProposedDate`): stesso cambio da
     booleano a conteggio — qui `clientProposedDate` è solo un timestamp
     esatto (nessun riferimento diretto alla `AvailabilitySlot` sottostante
     salvato su `Quote`), la fascia corrispondente e la sua `maxBookings`
     vengono recuperate con un bounds-check (`timeStr >= startTime &&
     timeStr < endTime`) sulle fasce candidate del professionista per
     quella data/giorno della settimana, stesso principio di
     `slotAppliesOnDate`.
   Verificato end-to-end con l'API locale e Playwright: professionista con
   SOLO una fascia generica (capienza 3) → cliente propone una data su
   quella fascia (select popolato, prima vuoto) → professionista conferma
   → `Booking` creato correttamente rispettando la capienza residua.
8. **Numeretto di notifiche anche nei sottomenu + evidenza nella lista** —
   richiesta esplicita dell'utente: oltre al totale accanto al nome
   nell'header, il numero deve comparire anche sulla singola voce del
   menu a tendina che porta alla pagina con la novità (es. "Dashboard" per
   un professionista, "Le mie visite" per un cliente), e la card/riga
   specifica con l'aggiornamento nella lista dev'essere evidenziata, non
   solo il conteggio aggregato del tab. Nuove funzioni in
   `apps/web/src/lib/notificationSections.ts`:
   - `accountMenuUnreadCounts(role, notifications)`: mappa `{href: count}`
     per le voci di `AccountMenu` — tutte le notifiche di un ruolo
     confluiscono oggi in un'unica pagina (`/dashboard` o
     `/le-mie-richieste`, le stesse già coperte da
     `professionalSectionCounts`/`clientSectionCounts`), quindi la mappa
     ha una sola voce diversa da zero. `AccountMenu.tsx` mostra un badge
     rosso (stesso stile del totale nell'header) accanto alla label di
     ogni voce con `count > 0`.
   - `unreadGuidedRequestIds`/`unreadBookingIds(notifications)`: estraggono
     dal `payload` (mai `guidedRequestId` e `bookingId` insieme nello
     stesso evento — vedi i punti di creazione in `NotificationsService`)
     l'insieme di ID con un aggiornamento non letto. `/dashboard` e
     `/le-mie-richieste` calcolano questi Set nello stesso `useEffect` che
     già recupera lo snapshot per i numeretti di sezione (prima di
     `markNotificationsRead`, stessa sequenza esplicita già in uso per
     evitare la race condition documentata sopra in questo file) e li
     passano come prop `isNew` a `LeadCard`/`AcceptedJobCard` (dashboard)
     e `GuidedRequestCard`/`BookingRow` (le-mie-richieste): un `Badge
     variant="nuovo"` ("Nuovo") accanto allo stato quando `isNew` è vero.
   - `AuthContext.markNotificationsRead` svuota ora anche
     `unreadNotifications` localmente (prima solo `unreadCount`, tramite
     `setUnreadCount(0)`): senza, il badge per voce di menu sarebbe
     rimasto "sporco" fino al prossimo poll da 45s dopo aver visitato la
     pagina che le segna come lette.
   Verificato con Playwright: badge numerico visibile sulla voce
   "Dashboard" del menu dopo un nuovo lead, badge "Nuovo" sulla card
   corrispondente nella lista.
9. **Cliente avvisato quando il professionista modifica la data di un
   preventivo già inviato** — richiesta esplicita dell'utente. Prima
   `QuotesService.createOrUpdate` notificava il cliente solo al primo
   invio (`NEW_QUOTE`), mai per le modifiche successive (voci, note, data)
   — corretto per il solo caso in cui l'`estimatedStartDate` cambia
   davvero: nuovo tipo `QUOTE_DATE_CHANGED` (confrontato per timestamp
   esatto, `existingQuote.estimatedStartDate.getTime() !== data.
   estimatedStartDate.getTime()`), notificato SOLO in quel caso — una
   modifica che tocca solo voci/note non genera questa notifica, il
   cliente non ha bisogno di saperlo se "quando" non cambia. Aggiunto al
   copy del toast (`notificationCopy.ts`) e alla sezione "Le mie
   richieste" lato cliente (`CLIENT_RICHIESTE_TYPES`,
   `notificationSections.ts`). Verificato con l'API locale: modifica che
   cambia la data → esattamente 1 notifica `QUOTE_DATE_CHANGED`; una
   seconda modifica successiva che NON cambia la data (solo note) → nessuna
   nuova notifica di questo tipo (resta a 1).
10. **Foto profilo del cliente nella scheda aperta dal nome** — richiesta
    esplicita dell'utente: `ClientProfileModal` (aperta cliccando il nome
    cliente in una richiesta ricevuta, `/dashboard`) mostrava solo iniziali.
    Nuovo campo `ProfessionalLead.guidedRequest.clientImageUrl`
    (`User.imageUrl` del cliente, stesso campo già usato per l'avatar
    dell'account cliente altrove) esposto da `ProfessionalsService.
    getMyLeads` (già includeva `client` per intero nella query, nessuna
    modifica alla query Prisma) e passato ad `Avatar` nel modal.
11. **Swipe per navigare l'agenda** — richiesta esplicita dell'utente:
    orizzontale (sinistra/destra) in vista Giorno/Settimana, verticale
    (sù/giù) in vista Mese. `CalendarShell.tsx`: `onTouchStart`/
    `onTouchEnd` (mai `onTouchMove`/`preventDefault` — lo scroll naturale
    della pagina resta sempre intatto durante il gesto, valutato solo a
    gesto concluso) su un `<div>` che avvolge la griglia, soglia 60px +
    dominanza di un asse sull'altro (1.5×) per non scattare su un tap o su
    uno scroll di pagina con una leggera componente diagonale. Riusa
    `handlePrev`/`handleNext` già esistenti (stessa logica dei bottoni
    freccia). Verificato con eventi `TouchEvent` sintetici via Playwright
    (non solo lettura di codice): swipe orizzontale in vista Settimana
    cambia settimana, swipe verticale verso l'alto in vista Mese avanza al
    mese successivo.

Verificato in blocco: typecheck pulito su tutti i package (`shared`,
`database`, `api-client`, `ui`, `api`, `web`, `mobile`), build di
produzione `apps/web` verde (24 route). Sessione completa riavviata da
zero a metà lavoro (container riciclato per inattività, working tree e
dati Postgres sopravvissuti) — tutti i test end-to-end sopra rieseguiti
con successo sull'ambiente ripristinato, non solo esistenti da una sessione
precedente.

**Correzioni al giro precedente — swipe verticale Mese, selezione fasce
ricorrenti, dettagli richiesta in "Lavori accettati"** (tutte richieste
esplicite dell'utente, arrivate subito dopo aver verificato le funzionalità
del giro sopra):

1. **Swipe verticale disattivato in vista Mese** — lo swipe sù/giù per
   cambiare mese (introdotto nel giro precedente) confliggeva con lo
   scroll verticale naturale della pagina in quella vista; rimosso su
   richiesta esplicita, lo swipe orizzontale in Giorno/Settimana resta
   invariato. `CalendarShell.tsx`: `handleTouchStart`/`handleTouchEnd`
   ritornano subito (no-op) quando `view === "month"`.
2. **Bug reale corretto: "Modifica" non permetteva più di selezionare
   alcuna fascia** — regressione introdotta dal fix precedente per il
   "traslare" (§ sopra), che aveva escluso del tutto le fasce ricorrenti
   storiche (`date: null`) dalla selezione tramite click diretto. Per un
   professionista la cui agenda fosse composta SOLO da fasce di questo
   tipo (creata prima del passaggio "per data esatta"), questo rendeva
   l'intera modalità "Modifica" inutilizzabile — un problema più grave del
   bug che risolveva. Corretto ripristinando la selezione diretta per
   qualunque fascia (`SlotChip` non ha più la prop `isLegacyRecurring`,
   rimossa): una fascia ricorrente selezionata da una cella può tornare a
   comparire "già selezionata" anche nelle sue altre occorrenze quando si
   naviga — accettato come comportamento corretto (è letteralmente la
   stessa riga, eliminarla rimuove ogni occorrenza) piuttosto che
   bloccare la selezione. Restano invece limitate alle fasce con data
   esatta solo le scorciatoie di gruppo "giorno"/"mese"
   (`toggleDaySelection`/`toggleMonthSelection`, non toccate in questo
   giro): quelle sì "traslavano" in modo fuorviante su celle mai toccate
   dall'utente, il problema originale resta corretto lì.
3. **Descrizione del lavoro, foto del cliente e nota privata anche nella
   sezione "Lavori accettati" della Dashboard** — richiesta esplicita
   dell'utente: gli stessi tre blocchi già presenti in `BookingDetailPanel`
   (calendario "Prenotazioni") ora compaiono anche in `AcceptedJobCard`
   (`/dashboard`, tab "Lavori accettati"), stessi campi già esposti da
   `ProfessionalBooking` (`description`, `photoUrls`, `professionalNote`),
   nessuna chiamata API aggiuntiva. Miniature cliccabili aprono lo stesso
   `PhotoLightbox` già in uso altrove; la nota si salva con lo stesso
   endpoint `PATCH /bookings/:id/note` già esistente
   (`apiClient.updateBookingNote`), bottone "Salva nota" visibile solo
   quando il testo cambia rispetto al valore già salvato — stesso pattern
   di `BookingDetailPanel`, nessun componente duplicato salvo la resa
   inline nella card invece che in un overlay.

Verificato end-to-end con l'API locale e Playwright: fascia ricorrente
storica (unica presente nell'agenda di un professionista di prova)
nuovamente selezionabile ed eliminabile tramite "Modifica"; swipe verticale
sintetico sulla vista Mese non cambia più il mese visualizzato; preventivo
accettato con descrizione+foto → entrambe visibili in "Lavori accettati",
lightbox funzionante al click sulla miniatura, nota privata scritta e
persistita correttamente dopo un reload. Rieseguite anche le regressioni
del giro precedente (selezione isolata tra fasce esatte/generiche,
casellina di spunta, selezione inline con scorciatoie di gruppo) — tutte
ancora verdi. Zero errori console in tutti i flussi. Typecheck pulito su
tutti i package, build di produzione `apps/web` verde (24 route).

**Bug reale corretto: la selezione dell'agenda restava "sporca" cambiando
settimana, e in vista Mese non selezionava nulla** — il fix precedente
(sopra, punto 2) aveva ripristinato il click diretto sulle fasce ricorrenti
storiche ma non aveva toccato la causa di fondo: `selectedSlotIndexes` era
uno `Set<number>` chiavato sul solo **indice globale** della fascia
nell'array `slots`. Per una fascia ricorrente storica (`date: null`, vale
per ogni occorrenza futura del suo giorno della settimana via
`slotAppliesOnDateStr`), quell'indice viene renderizzato in celle diverse
(settimane diverse in vista Settimana, mesi diversi in vista Mese) — una
volta selezionato in una cella, risultava "selezionato" ovunque quella
stessa fascia comparisse, mai deselezionandosi navigando altrove
(segnalato dall'utente: "selezionando un orario in visualizzazione
settimana rimane flaggata anche quando cambio settimana"). In vista Mese il
problema era complementare: quella cella non mostra singole fasce, solo un
conteggio + una casella aggregata per giorno, il cui unico punto di
click (`onSelectDay` → `toggleDaySelection`) escludeva esplicitamente le
fasce ricorrenti storiche (`slot.date !== null`) — per un'agenda composta
solo da fasce di questo tipo, `dayIndexes.length` era sempre 0 e il click
non selezionava nulla ("nel mensile non si seleziona").

Corretto sostituendo la chiave di selezione con una **chiave composita per
occorrenza**, `${indice}:${dataISO}` (`selectedSlotKeys: Set<string>`,
funzione `slotKey`, `apps/web/src/app/dashboard/agenda/page.tsx`): la
stessa fascia ricorrente, mostrata in due celle diverse, genera ora due
chiavi diverse — selezionarla in una non la fa comparire selezionata
nell'altra. Questo rende sicuro includere anche le fasce ricorrenti
storiche nelle scorciatoie di gruppo "Seleziona giorno"/"Seleziona tutto il
mese" (`toggleDaySelection`/`toggleMonthSelection`), che prima le
escludevano apposta per evitare il bug del "bleed" tra celle — l'esclusione
non serve più con chiavi per occorrenza, quindi è stata rimossa: la vista
Mese ora seleziona correttamente anche le fasce ricorrenti (una chiave per
ogni occorrenza nel mese mostrato), risolvendo anche il secondo sintomo
segnalato. `deleteSelectedSlots` mappa le chiavi selezionate agli indici
sottostanti (deduplicati) prima di filtrare `slots`: eliminare una fascia
ricorrente rimuove comunque l'intera riga (ogni occorrenza futura, non solo
quelle scelte) — vincolo del modello dati invariato (nessuna eccezione per
singola data su una fascia ricorrente), non un effetto collaterale di
questo cambio.

Verificato end-to-end con l'API locale e Playwright (non solo lettura di
codice): fascia ricorrente storica selezionata in vista Settimana →
navigando alla settimana successiva la stessa fascia (occorrenza diversa)
risulta NON selezionata → tornando alla settimana originale la selezione
precedente è ancora presente; click su una cella di vista Mese con una
fascia ricorrente storica → selezione funzionante (conteggio +1),
click di nuovo → deselezione, selezione+eliminazione+salvataggio → fascia
rimossa correttamente lato API. Scorciatoie di gruppo riverificate con un
mix di fasce esatte + una ricorrente su un giorno della settimana condiviso
+ una fascia di controllo su un altro giorno: "Seleziona giorno" conta
solo le fasce di quella cella, "Seleziona tutto il mese" include ora
correttamente ogni occorrenza della fascia ricorrente nel mese mostrato
(comportamento nuovo e più completo di prima, reso possibile dalla chiave
per occorrenza). Rieseguite le regressioni dei due giri precedenti
(selezione diretta su fasce ricorrenti, swipe verticale disattivato in
Mese, dettagli lavoro in "Lavori accettati") — tutte ancora verdi. Zero
errori console in tutti i flussi. Typecheck pulito su tutti i package,
build di produzione `apps/web` verde (24 route).

---

## 13. Raggio di ingaggio del professionista (fan-out geografico)

Richiesta esplicita dell'utente: ogni `ProfessionalProfile` può impostare
due raggi indipendenti (km, max 25 ciascuno) entro cui riceve richieste dal
fan-out delle richieste guidate — `engagementRadiusKm` per le richieste
standard, `urgentEngagementRadiusKm` per quelle urgenti
(`GuidedRequest.isUrgent`). Prima di questa funzionalità **non esisteva
alcun filtro geografico per raggio** nel fan-out (né un `calculateDistanceKm`
né una costante fissa da sostituire, contrariamente a quanto inizialmente
presupposto): `GuidedRequestsService.create` filtrava solo per
`categoryId` + uguaglianza esatta della stringa città — un professionista a
Roma non riceveva mai una richiesta da un comune limitrofo con nome
diverso, per quanto vicino. Questa lacuna è stata colmata insieme
all'introduzione dei due raggi, non solo aggiunta come feature isolata.

- **Schema** (`packages/database/prisma/schema.prisma`):
  `ProfessionalProfile.engagementRadiusKm`/`urgentEngagementRadiusKm`
  (`Float @default(25)`, così i profili esistenti restano al comportamento
  più permissivo finché il professionista non li restringe esplicitamente).
- **Validazione** — `updateEngagementRadiusSchema` (`packages/shared/src/
  schemas.ts`, range 1-25 km su entrambi i campi, messaggi d'errore
  espliciti) è l'unica fonte di verità, applicata dalla `ZodValidationPipe`
  su `PATCH /professionals/me/engagement-radius`
  (`ProfessionalsService.updateEngagementRadius`) — stesso pattern di
  validazione già in uso per ogni altro endpoint del modulo, nessuna
  doppia validazione nel service. Endpoint separato dal resto del profilo
  (`PUT /professionals/me`) apposta: la mappa ha un proprio bottone
  "Salva" indipendente dal form principale.
- **Matching per raggio** — nuovo `apps/api/src/common/geo.util.ts`
  (`calculateDistanceKm`, formula haversine, unico punto di verità).
  `GuidedRequestsService.matchProfilesForFanOut` (privato, sostituisce il
  vecchio filtro per stringa città nel fan-out generico — il percorso
  "richiesta diretta a un professionista specifico" resta invariato,
  nessun controllo di raggio lì): geocodifica la città della richiesta
  con `findComuneByName` (stesso dataset ISTAT già usato per
  geolocalizzare il professionista in `upsertMyProfile`, nessun nuovo
  servizio di geocoding), poi calcola la distanza da ciascun candidato
  della categoria e lo include solo se entro il raggio pertinente
  (`urgentEngagementRadiusKm` se `isUrgent`, altrimenti
  `engagementRadiusKm`) — un professionista con coordinate ancora a `0,0`
  (comune non geocodificato) non entra mai nel fan-out, stessa convenzione
  già usata da `ResultsMap.tsx` per escludere i puntini senza posizione.
  Se il nome città della richiesta non è un comune riconosciuto dal
  dataset (fallback), si ricade sul vecchio comportamento (match esatto
  per stringa) invece di non inoltrare a nessuno — un fan-out perso
  sarebbe un problema peggiore di un match meno preciso.
- **Componente mappa — Leaflet isolato in un solo file** (richiesta
  esplicita dell'utente, in vista della migrazione a Google Maps prevista
  prima del lancio): `apps/web/src/components/EngagementRadiusMap.tsx`
  contiene **solo** rendering Leaflet (`react-leaflet`, stessa libreria
  già in uso per `ResultsMap.tsx` — nessuna libreria nuova introdotta) —
  marker fisso sulla posizione del professionista + due `Circle`
  sovrapposti (raggio in metri, conversione km×1000 fatta qui), colori
  `brand.verificato` (verde, tratto pieno, standard) e `brand.ottone`
  (ottone/dorato, tratteggiato, urgente) — riuso dei token brand esistenti
  invece di colori arbitrari nuovi, scelta che coincide quasi
  letteralmente con "forest green"/"brass" indicati come esempio. Zoom
  iniziale calcolato una sola volta al montaggio sul raggio massimo
  possibile (25 km, `L.latLng(...).toBounds(...)`) così i cerchi restano
  sempre visibili senza dover re-inquadrare la mappa (instabile) ad ogni
  trascinamento dello slider. Nessuno stato di form, nessuna chiamata API:
  componente puramente di visualizzazione, controllato via props
  (`latitude`, `longitude`, `engagementRadiusKm`, `urgentEngagementRadiusKm`).
  **`apps/web/src/components/EngagementRadiusSection.tsx`** è il
  componente "di business" separato (stato dei due slider, validazione
  implicita via `min`/`max` HTML, salvataggio, messaggi di errore/successo):
  non importa mai `leaflet`/`react-leaflet` direttamente, vede
  `EngagementRadiusMap` tramite `next/dynamic({ssr:false})` (stesso motivo
  già documentato altrove in questo file: Leaflet legge `window` al
  caricamento del modulo) e gli passa solo i valori correnti come props —
  la migrazione futura a Google Maps richiederà di riscrivere solo
  `EngagementRadiusMap.tsx`, non questo file né i suoi chiamanti. Due
  `<input type="range">` nativi (min 1, max 25, stesso pattern già in uso
  in `ImageCropModal.tsx` per lo zoom, nessun componente Slider Tamagui
  introdotto) aggiornano il cerchio corrispondente in tempo reale mentre
  si trascina (prop controllata, nessun debounce). Montato in
  `/dashboard/profilo` come sezione a parte (proprio bottone "Salva",
  `Surface` distinta dal form principale) — visibile solo dopo il primo
  salvataggio del profilo base (richiede `latitude`/`longitude` già
  geocodificate, quindi non prima che il professionista abbia scelto una
  città).
- **`MyProfessionalProfile`** (`packages/shared/src/dashboard.ts`) esteso
  con `latitude`/`longitude`/`engagementRadiusKm`/`urgentEngagementRadiusKm`
  — servivano al frontend per centrare la mappa e precompilare gli
  slider, non esposti prima d'ora da `GET /professionals/me`.
- Verificato end-to-end con l'API locale (non solo typecheck) e
  Playwright: raggio fuori range (30 km, 0 km) rifiutato con 400 e
  messaggio esplicito sia in isolamento sia insieme a un raggio valido;
  salvataggio valido persistito e riletto correttamente da
  `GET /professionals/me`; due professionisti nella stessa categoria/città
  con raggi diversi (uno stretto 2 km, standard) — una richiesta
  **standard** a ~14 km di distanza (comune limitrofo, non lo stesso nome
  città) non arriva a chi ha il raggio stretto, la stessa richiesta
  **urgente** (raggio largo 25 km sullo stesso profilo) sì, confermato sia
  per assenza/presenza del lead sia per il prezzo del lead ricevuto
  (standard vs urgente). UI: mappa Leaflet montata con marker + 2 cerchi
  renderizzati, slider funzionanti con etichette live, salvataggio dalla UI
  verificato end-to-end fino alla persistenza in DB. Zero errori console.
  Typecheck pulito su tutti i package (`shared`, `database`, `api-client`,
  `ui`, `api`, `web`, `mobile`), build di produzione `apps/web` verde
  (24 route).

---

## 14. Selezione intelligente dei Lead, espansione automatica, scadenza

Richiesta esplicita dell'utente: il fan-out di una richiesta guidata non
contatta più tutti i professionisti compatibili (categoria + raggio di
ingaggio, §13) senza limite — sceglie i migliori, tiene una coda di
riserva, espande automaticamente se non rispondono, e sia i singoli Lead
che l'intera richiesta scadono da soli col tempo. Prima di implementare,
l'utente ha chiarito esplicitamente il criterio guida: le cose che non
esistevano ancora andavano aggiunte come funzionalità nuove, riusando solo
ciò che nel progetto era già simile — non un mandato a introdurre
infrastruttura o campi paralleli a quanto già presente.

- **Selezione (`GuidedRequestsService.selectLeadCandidates`,
  `matchProfilesForFanOut`)** — nuova costante `MAX_LEADS_PER_REQUEST = 3`
  (stesso posto/stile di `LEAD_PRICE_STANDARD_EUR_CENTS`, non un
  `RADIUS_KM` che non esisteva). Sopra il limite: 1 slot sempre riservato a
  un professionista scelto a caso tra quelli **senza** recensioni ancora
  (mai escluso a vita solo perché nuovo), il resto ai migliori per rating.
  Nessun nuovo campo "punteggio di affidabilità" salvato: riusa lo stesso
  rating già calcolato **live** dalle recensioni reali in
  `ProfessionalsService.search`/`getById` (mai un valore statico, stesso
  principio già documentato altrove in questo file) — è esattamente il
  "qualcosa di già simile" da riusare invece di introdurre un secondo
  segnale di qualità parallelo. I candidati non selezionati restano in
  `GuidedRequest.reserveCandidateIds` (nuovo campo, `String[]`: stesso
  pattern già in uso per liste ordinate come `photoUrls`/`subTags`, non una
  tabella dedicata né un campo `Json` — nel progetto non se ne usa mai uno
  per dati di dominio strutturati).
- **Scadenza ed espansione** — nuovi campi `Lead.expiresAt`/`wasExpanded`
  e `GuidedRequest.expiresAt`/`closedReason` (enum
  `GuidedRequestClosedReason`: `EXPIRED`/`CANCELED_BY_CLIENT`/`COMPLETED`),
  tutti nullable per compatibilità con le righe esistenti (stessa
  convenzione già usata per `AvailabilitySlot.date`: nullable = "nessun
  comportamento nuovo per i dati vecchi", non un dato mancante da temere).
  Nuovo valore `EXPIRED` su `LeadStatus` (non riusato `DECLINED`: sono
  semanticamente diversi, un lead scaduto non è un rifiuto attivo e non
  deve mostrare al cliente una nota di rifiuto che non esiste).
  `GuidedRequestsService.expandLeadQueue` pesca il prossimo candidato dalla
  coda di riserva e gli crea un nuovo Lead (`wasExpanded: true`) — dentro
  una transazione Postgres `Serializable` (stesso principio già in uso per
  `bookAgendaSlot`/`resolveGenericSlot`: due espansioni concorrenti sulla
  stessa richiesta non devono poter pescare due volte lo stesso candidato).
  Richiamata subito da `ProfessionalsService.declineLead` (non serve
  aspettare il job per un rifiuto esplicito — richiede che
  `ProfessionalsModule` importi `GuidedRequestsModule`, nessuna dipendenza
  circolare) e da un nuovo job schedulato.
- **Nessun sistema di scheduling esisteva nel progetto** nonostante
  Redis/BullMQ compaia nella tabella stack (§2) come scelta approvata:
  verificato con una ricerca su tutto `apps/api`, zero import di
  `bullmq`/`ioredis`/`@nestjs/schedule`, nessun `docker-compose`, nessuna
  variabile Redis configurata — un'infrastruttura solo "promessa" (più
  punti di CLAUDE.md rimandano promemoria automatici a "quando ci sarà
  BullMQ", mai arrivato). Introdotto `@nestjs/schedule` (nuova dipendenza,
  `ScheduleModule.forRoot()` in `AppModule`): un cron in-process, senza
  Redis da provisionare, coerente con la scelta pragmatica "niente
  infrastruttura nuova se non strettamente necessaria" già seguita altrove
  nel progetto (Nominatim invece di Google Geocoding, ISTAT invece di
  Google Places, ecc.) — se in futuro l'API girerà su più istanze andrà
  rivisto (rischio di doppia esecuzione), non un problema alla scala
  attuale (§7, singola città). Stesso problema di risoluzione moduli già
  documentato per `@nestjs/throttler` riscontrato di nuovo installando
  questo pacchetto (il pacchetto non risolve nel `node_modules` locale di
  `apps/api` con `node-linker=hoisted`): risolto con lo stesso fix già
  noto, `rm -rf apps/api/node_modules && pnpm install`.
  `GuidedRequestsService.runExpiryCheck` (`@Cron(EVERY_5_MINUTES)`), due
  passaggi indipendenti:
  1. Lead `PENDING` con `expiresAt` superato **e senza una Quote
     collegata** (bug potenziale evitato: `Lead.status` non viene mai
     aggiornato quando un professionista invia un preventivo — resta
     `PENDING` per sempre, verificato leggendo `QuotesService.
     createOrUpdate` — quindi il controllo scadenza deve escludere
     esplicitamente chi ha già risposto incrociando `Quote` per la stessa
     coppia `guidedRequestId`+`professionalProfileId`, l'unico modo
     disponibile: `Quote` non ha una relazione diretta con `Lead` nello
     schema). Marcati `EXPIRED`, poi espansi.
  2. `GuidedRequest` `OPEN`/`MATCHED` con `expiresAt` superato: i Lead
     `PENDING` residui marcati `EXPIRED` (senza espansione, la richiesta
     stessa sta chiudendo), la richiesta passa a `CLOSED` con
     `closedReason: EXPIRED`, il cliente notificato
     (`GUIDED_REQUEST_EXPIRED`, nuovo tipo in `notificationCopy.ts` e
     `notificationSections.ts`).
  Costanti: `URGENT_LEAD_EXPIRY_MINUTES = 20`, `STANDARD_LEAD_EXPIRY_HOURS
  = 4`, `URGENT_REQUEST_EXPIRY_DAYS = 7`, `STANDARD_REQUEST_EXPIRY_DAYS =
  14`.
- **`GET /guided-requests/:id/status`** (nuovo endpoint, nuovo tipo
  `GuidedRequestStatusSummary` in `packages/shared`): tre numeri
  (`totalContacted`, `responded` — chiunque abbia inviato almeno un
  preventivo, qualunque stato attuale anche se poi ritirato/rifiutato —
  `pending`), mai l'identità dei professionisti contattati né dettagli
  interni (`expiresAt`, `wasExpanded`). `statusMessage` sostituisce i
  numeri in due casi: richiesta `CLOSED` (testo diverso per
  `EXPIRED`/`CANCELED_BY_CLIENT`/`COMPLETED`, tramite `closedReason`) o
  ancora aperta ma con coda di riserva esaurita e nessuna risposta — testo
  esatto richiesto dall'utente. Nuovo blocco in `/le-mie-richieste`
  (`GuidedRequestCard`) che lo mostra, fetch lazy per card.
- **`closedReason: COMPLETED`** aggiunto nei **due** punti (non uno solo)
  che chiudono una `GuidedRequest` creando una `Booking`:
  `BookingsService.createFromQuote` e
  `QuotesService.confirmProposedDate` — il secondo esisteva già ma non
  era stato considerato nella richiesta originale, trovato leggendo il
  codice.
- **Cancellazione lato cliente convertita da hard delete a soft-close** —
  `GuidedRequestsService.remove` (`DELETE /guided-requests/:id`, stessa
  rotta, stesso contratto HTTP) non fa più `prisma.guidedRequest.delete()`
  con cascata su `Lead`/`Quote`: imposta `status: CLOSED, closedReason:
  CANCELED_BY_CLIENT` e marca i Lead `PENDING` residui `EXPIRED`. Cambio
  di comportamento necessario, non opzionale: una riga davvero cancellata
  non potrebbe più rispondere a `GET /guided-requests/:id/status` dopo la
  cancellazione, e lo storico Lead/Quote andrebbe perso con lei. Nessuna
  notifica di scadenza in questo caso (scelta esplicita del cliente, non
  un timeout).
- **Coinvolgimento di professionisti che si iscrivono dopo** — nessun
  flusso di verifica admin esiste nel progetto da usare come innesco
  (`ProfessionalProfile.verified` non viene mai impostato da nessuna
  parte del codice, verificato con una ricerca su tutto `apps/api`, e non
  governa oggi né la visibilità in ricerca né l'eleggibilità al fan-out):
  l'evento reale "il professionista diventa eleggibile" coincide con la
  **creazione del profilo**, coerente con come funziona già il resto del
  sistema. `ProfessionalsService.upsertMyProfile` verifica se la riga
  esisteva già PRIMA dell'upsert (che da solo non lo dice), e solo alla
  primissima creazione chiama il nuovo
  `GuidedRequestsService.matchNewProfileToOpenRequests`: cerca
  `GuidedRequest` `OPEN`/`MATCHED` nella stessa categoria, entro il
  raggio del nuovo profilo, **con la coda di riserva già esaurita**
  (nessun Lead `PENDING` attivo — altrimenti c'è già qualcuno in corsa),
  crea un Lead e notifica.
- **Frontend** — `/dashboard` (`LeadCard`/filtri): bug reale corretto, il
  filtro "In attesa di preventivo" trattava un Lead scaduto (`EXPIRED`)
  come ancora in attesa (escludeva solo `DECLINED`) — un professionista
  vedeva richieste non più azionabili tra quelle aperte. Nuovo filtro
  "Scadute" a parte (mai unito a "Rifiutate": un lead scaduto non ha una
  nota di rifiuto da mostrare), nuova etichetta "Richiesta scaduta" sulla
  card, bottone "Invia preventivo" nascosto anche per `EXPIRED` (prima
  solo per `DECLINED`).
- Verificato end-to-end con l'API locale (non solo typecheck/build):
  fan-out con 4 candidati compatibili → esattamente 3 Lead creati
  (`matchedProfessionals`), rifiuto di uno dei tre → espansione immediata
  verso il quarto candidato in coda (coda poi esaurita, 0 candidati
  rimasti), stato aggregato (`totalContacted: 4, responded: 0, pending:
  3`) coerente col mix rifiutato/attivi, cancellazione soft-close
  (`204`) seguita da una lettura di stato ancora riuscita (`200`, "Hai
  annullato questa richiesta.") con i Lead ancora presenti — non
  cancellati per davvero. Percorso "nuovo professionista": un solo
  candidato iniziale che rifiuta (coda vuota) → `statusMessage` "nessun
  professionista disponibile" col testo esatto richiesto → un secondo
  professionista compatibile si registra nella stessa categoria/zona →
  riceve subito un Lead per la richiesta ancora aperta, stato aggiornato
  di conseguenza. **Nota sull'ambiente di test**: la sessione ha
  ripetutamente urtato contro il limite 5/min di `/auth/register` a causa
  di rerun ravvicinati dello script di verifica (ogni run crea 3-5 nuovi
  account) — non un problema del prodotto, un artefatto dell'ambiente di
  sviluppo che ha richiesto alcune attese tra un tentativo e l'altro prima
  di ottenere un run pulito; un primo bug reale nel test stesso (dati
  "fantasma" accumulati da run falliti precedenti che falsavano la
  selezione, non un bug del codice applicativo) è stato trovato e corretto
  ripulendo il database e aggiungendo pulizia automatica degli account di
  test a fine script. Zero errori applicativi in tutti i flussi.
  Typecheck pulito su tutti i package (`shared`, `database`, `api-client`,
  `ui`, `api`, `web`, `mobile`), build di produzione `apps/web` verde
  (24 route).

---

## 15. Metriche di affidabilità del professionista

Richiesta esplicita dell'utente: tracciare metriche di affidabilità per
ogni professionista **fin da ora**, anche con un solo professionista per
categoria/zona — così esiste già uno storico quando ce ne sarà più di uno
da confrontare. Istruzione esplicita che ha guidato ogni scelta di questa
funzionalità: *"le cose che devono essere implementate e normale non ci
siano e vanno aggiunte come nuove funzionalità a meno che non ci sia già
qualcosa di simile"* — stesso principio già seguito per il fan-out
intelligente dei lead (§14).

**Schema** — nuovo modello Prisma `ProfessionalMetrics`, relazione 1:1 con
`ProfessionalProfile` (`onDelete: Cascade`), **non creato alla creazione
del profilo**: la riga nasce solo al primo evento rilevante (`upsert` in
ogni metodo di `ProfessionalMetricsService`), coerente con "poco dato è
meglio di un dato falso a zero". Nomi dei campi tradotti in camelCase/
inglese per coerenza con il resto dello schema (l'utente li aveva
specificati in italiano/snake_case nella richiesta): `avgResponseTimeMinutes`,
`totalResponsesMeasured` (contatore di supporto per la media mobile, non
richiesto esplicitamente ma necessario per calcolarla correttamente),
`totalRequestsReceived`, `acceptedRequests`, `completedJobs`, `acceptedJobs`,
`avgRating`, `reviewCount`, `honoredAppointments`, `totalAppointments`,
`lastActivityAt` (default `now()`), `reliabilityScore` (nullable).

**`apps/api/src/professional-metrics/professional-metrics.service.ts`** —
punto unico di scrittura, un metodo per evento, richiamato esplicitamente
dal service che compie l'azione (nessun trigger/middleware Prisma, stessa
convenzione di tutto il progetto: es. `NotificationsService.notify()`).
Ogni metodo fa `upsert` (crea la riga se non esiste) e ricalcola
`reliabilityScore` alla fine (`refreshScore`, privato) — "esegui questa
funzione ogni volta che uno dei campi sopra viene aggiornato", richiesta
esplicita dell'utente.

**I 7 eventi e dove sono agganciati esattamente** (richiesta esplicita
dell'utente, STEP 5: riportare file per file dove ogni evento è cablato):

1. **Richiesta ricevuta** (`recordRequestReceived`) — incrementa
   `totalRequestsReceived`. Tre punti di creazione di un `Lead`, tutti in
   `apps/api/src/guided-requests/guided-requests.service.ts`: fan-out
   iniziale (`create()`), espansione dalla coda di riserva
   (`expandLeadQueue()`), coinvolgimento di un professionista che si
   iscrive dopo con una richiesta ancora aperta (`matchNewProfileToOpenRequests()`).
2. **Prima risposta a un Lead** (`recordFirstResponse`) — media mobile di
   `avgResponseTimeMinutes` (formula esatta richiesta dall'utente:
   `nuova_media = ((vecchia_media × n) + nuovo_valore) / (n+1)`), minuti
   trascorsi da `Lead.createdAt` a ora. Agganciato in
   `apps/api/src/quotes/quotes.service.ts`, `createOrUpdate()`, solo sul
   ramo `!existingQuote` (il primo preventivo inviato per quel lead, non
   le modifiche successive).
3. **Richiesta accettata / lavoro accettato** (`recordJobAccepted`) —
   incrementa `acceptedRequests`+`acceptedJobs`. Tre punti dove un
   preventivo diventa una `Booking` reale ("accettato" in questo
   dominio): `apps/api/src/bookings/bookings.service.ts` `createFromQuote()`
   (il cliente accetta dalla schermata preventivo) e
   `apps/api/src/quotes/quotes.service.ts` `confirmProposedDate()` (il
   professionista conferma una data proposta dal cliente).
4. **Lavoro completato** (`recordJobCompleted`) — incrementa
   `completedJobs`. Due punti in `apps/api/src/bookings/bookings.service.ts`:
   `updateStatus()` quando lo stato passa a `COMPLETED` (calendario
   "Prenotazioni") e `completeWithFinalAmount()` (pop-up "Lavoro
   terminato" con importo preciso, `/dashboard`).
5. **Recensione lasciata** (`recordReview`) — ricalcolo esatto (non media
   mobile: il volume di recensioni resta basso) di `avgRating`,
   incrementa `reviewCount`. Agganciato in
   `apps/api/src/reviews/reviews.service.ts`, `create()`.
6. **Appuntamento onorato/mancato** (`recordAppointmentOutcome`) — stessi
   due punti dell'evento 4 (`BookingsService.updateStatus()` per
   `COMPLETED`/`NO_SHOW`, `completeWithFinalAmount()` per `COMPLETED`):
   `CANCELED` non conta né come onorato né come mancato (deciso
   esplicitamente, un annullamento non è un appuntamento mancato).
7. **Ultima attività** (`touchActivity`, nessun incremento, solo il
   timestamp) — agganciato in cinque punti aggiuntivi rispetto agli eventi
   sopra (che aggiornano `lastActivityAt` già come parte del loro upsert):
   login professionista (`apps/api/src/auth/auth.service.ts`, `login()` e
   `verifyGoogleToken()` sul ramo utente esistente — mai alla
   registrazione, dove non esiste ancora un `ProfessionalProfile` a cui
   agganciare la riga), modifica di un preventivo già inviato
   (`QuotesService.createOrUpdate()`, ramo `existingQuote`), nota privata
   su una prenotazione (`BookingsService.updateProfessionalNote()`),
   annullamento di un intervento da parte del professionista
   (`BookingsService.cancelByProfessional()`), rifiuto di un lead
   (`ProfessionalsService.declineLead()`), aggiornamento dell'agenda
   settimanale (`ProfessionalsService.upsertMyAvailability()`).

**STEP 3 — `calculateReliabilityScore`** (funzione pura, esportata separata
dal service per poterla testare senza un DB davanti): sotto
`MIN_COMPLETED_JOBS_FOR_SCORE = 3` lavori completati il punteggio resta
`null` — troppo pochi dati per essere affidabile, richiesta esplicita
dell'utente. Formula esatta richiesta: `tasso_completamento × 0.3 +
(valutazione_media/5) × 0.3 + tasso_risposta_normalizzato × 0.2 +
tasso_puntualità × 0.2`, con `tasso_risposta_normalizzato = clamp(1 -
tempo_medio/120, 0, 1)` (`RESPONSE_TIME_CEILING_MINUTES = 120`) e i tassi
di completamento/puntualità a 0 quando il denominatore è 0 (nessuna
divisione per zero).

**STEP 4 — il punteggio non instrada ancora nulla**: nessun punto di
`matchProfilesForFanOut`/`selectLeadCandidates` (§14, selezione dei Lead)
legge `reliabilityScore` — verificato con una ricerca su tutto `apps/api`,
l'unico file che lo referenzia è `professional-metrics.service.ts` stesso.
Esplicitamente rimandato dall'utente a un punto futuro con più
professionisti da confrontare per categoria/zona.

**Wiring dei moduli**: `ProfessionalMetricsModule` (nuovo, esporta il
solo `ProfessionalMetricsService`) importato direttamente da ogni modulo
che ne ha bisogno — `GuidedRequestsModule`, `QuotesModule`,
`BookingsModule`, `ReviewsModule`, `AuthModule`, `ProfessionalsModule` —
mai instradato indirettamente tramite un altro service, per tenere le
dipendenze esplicite (stessa convenzione già in uso per
`NotificationsModule`).

Verificato end-to-end con l'API locale (non solo typecheck/build): tre
cicli completi richiesta→preventivo→accettazione→completamento→recensione
per un professionista di test, con asserzioni dopo ogni ciclo (script
self-cleaning, `DELETE /auth/me` su tutti gli account creati). Nessuna
riga `ProfessionalMetrics` esiste prima del primo evento (confermato
`null`); dopo il primo ciclo tutti e 6 i contatori/valori sono corretti
(`totalRequestsReceived=1`, `totalResponsesMeasured=1`, `acceptedJobs=1`,
`completedJobs=1`, `honoredAppointments/totalAppointments=1/1`,
`avgRating=5, reviewCount=1`) e `reliabilityScore` resta `null`; dopo il
secondo ciclo `avgRating` corretto a 4 (media di 5 e 3) e il punteggio
resta ancora `null` (2 lavori completati, sotto soglia); dopo il terzo
ciclo (soglia raggiunta) `reliabilityScore` calcolato a `0.94`, verificato
a mano contro la formula esatta (completionRate=1, ratingComponent=0.8,
responseRateNormalized≈1, punctualityRate=1 → 0.3+0.24+0.2+0.2=0.94,
combaciante). Login professionista e aggiornamento agenda confermati
aggiornare `lastActivityAt` (evento 7) con un `sleep` di oltre un secondo
tra le chiamate per escludere coincidenze di timestamp. Typecheck pulito
su tutti i package (`shared`, `database`, `api-client`, `ui`, `api`,
`web`, `mobile`), build di produzione `apps/web` verde (24 route), avvio
reale dell'API locale verificato senza errori di risoluzione del grafo
delle dipendenze NestJS.

**Paginazione: torna in cima alla lista al cambio pagina + controllo anche
sopra** — richiesta esplicita dell'utente ("quando cambio pagina fammi
tornare alla visualizzazione più sopra... dai il numero delle pagine anche
nella parte superiore, non solo quella inferiore"). Applicata alle quattro
liste che condividono `Pagination`/`ListControls` (`apps/web/src/components/
ListControls.tsx`): "Le mie richieste"/"Lavori accettati" in
`/le-mie-richieste` e "Richieste ricevute"/"Lavori accettati" in
`/dashboard` — stesso trattamento su entrambe le pagine, non solo quella
nominata dall'utente, essendo lo stesso componente riusato con lo stesso
bug. `Pagination` stesso non è stato toccato (già generico, bastava
montarlo due volte); in ciascuna delle quattro pagine: un `useRef`
(`listTopRef`, condiviso dalle due tab di ciascuna pagina — solo una è
montata alla volta) attaccato allo `YStack` che avvolge `ListControls` +
lista, una seconda istanza di `<Pagination>` subito dopo `ListControls`
(prima della lista, non solo dopo), e i quattro handler `onPageChange`
(`goToRequestsPage`/`goToClientBookingsPage` in `/le-mie-richieste`,
`goToLeadsPage`/`goToBookingsPage` in `/dashboard`) ora chiamano anche
`listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })`
oltre ad aggiornare lo stato di pagina. Verificato con Playwright (non
solo lettura di codice): 2 controlli "Pagina 2" presenti su ciascuna delle
quattro liste (sopra e sotto), click su quello in fondo dopo aver scrollato
in fondo alla pagina riporta lo scroll verso l'alto (`window.scrollY`
sceso da 2321 a 231 nel test). Zero errori console nuovi.

**Orario preferito da agenda reale quando si richiede un preventivo a un
professionista specifico** — richiesta esplicita dell'utente: cliccando
"Richiedi un preventivo a [nome attività]" dal profilo pubblico (bottone
generico, distinto dal click su una singola pillola di fascia generica
già esistente, che porta già `data`/`fasciaOraria` bloccati in URL — quel
percorso resta invariato), il form ora offre comunque un orario tra
quelli realmente liberi nell'agenda del professionista, invece di non
offrirne alcuno. `GuidedRequestForm.tsx`: quando `professionalProfileId`
è presente ma l'URL non porta già `data`/`fasciaOraria`, un
`useEffect` carica `GET /professionals/:id/agenda` (stesso endpoint
pubblico già usato dal profilo, `apiClient.getProfessionalAgenda`,
nessun nuovo endpoint) e `flattenPickableSlots` estrae solo le fasce
**generiche** (capienza > 1) ancora libere (`bookedCount < maxBookings`)
sui prossimi giorni della finestra dell'agenda — le fasce **esatte**
(capienza 1) restano fuori: quelle sono prenotazione diretta istantanea
(`bookAgendaSlot`, un flusso completamente separato senza `Quote`), non
una richiesta di preventivo, offrirle qui avrebbe fatto fallire la
validazione server-side (`resolveGenericSlot` rifiuta esplicitamente
`maxBookings <= 1`). Nuovo `<select>` "Orario preferito (facoltativo)"
con "Nessuna preferenza di orario" come opzione di default (il campo
resta facoltativo, un professionista può non avere fasce generiche
impostate) — mostrato solo quando esistono fasce selezionabili, nessun
messaggio quando non ce ne sono (stesso principio "niente UI per
un'informazione che non esiste" già seguito altrove). La fascia scelta
alimenta le stesse variabili `preferredDate`/`preferredTimeSlot` già
usate dal percorso "pillola cliccata sul profilo" (nessun campo nuovo
nello schema/DB): quando l'URL le blocca già, questo nuovo picker non
viene mai mostrato, le due sorgenti non si sovrappongono mai. Verificato
end-to-end con l'API locale e Playwright (non solo typecheck): agenda
seminata con una fascia generica (capienza 5) su 3 giorni consecutivi →
`<select>` popolato con le 3 date reali e il conteggio posti liberi;
selezione di una fascia → invio reale del form (upload foto intercettato
con una risposta finta, Cloudinary non configurato in locale) →
`POST /guided-requests` catturata via `page.route` conferma
`preferredDate`/`preferredTimeSlot` esattamente uguali alla fascia scelta
nel menu, richiesta accettata dal backend reale (schermata "Richiesta
inviata!"). Zero errori console nuovi. Typecheck pulito su tutti i
package, build di produzione `apps/web` verde (24 route).

---

## 16. Video nelle gallerie, correzioni form di autenticazione, soft-delete account cliente

Quattro richieste esplicite dell'utente, stesso giro di lavoro.

**Video oltre alle foto, limite a 5** — "ovunque c'è la possibilità di
caricare le foto... fai in modo da poter caricare anche i video e aumenta
il limite a 5". Applicato alle tre gallerie a più elementi (richiesta
guidata, recensioni, portfolio professionista) — non ai singoli avatar
(immagine profilo account/professionista), dove un video non avrebbe senso
e l'utente non li ha citati.
- **Backend**: `CloudinaryService.uploadMedia` (nuovo, accanto a
  `uploadImage` esistente, non sostituito — `uploadImage` resta in uso per
  i due upload di avatar singolo): sceglie `resource_type: "video"` o
  `"image"` in base al mimetype del file, trasformazione `quality: "auto"`
  per i video (nessun resize: ridimensionare un video ha implicazioni di
  durata/bitrate diverse da un'immagine, fuori scope senza una richiesta
  esplicita in merito) contro il resize 800×800 già esistente per le foto.
  `guided-requests.controller.ts`/`reviews.controller.ts`/
  `professionals.controller.ts` (endpoint portfolio): `fileFilter` accetta
  ora `image/*` **o** `video/*`, nuovo `MAX_MEDIA_SIZE_BYTES = 50MB` (contro
  `MAX_IMAGE_SIZE_BYTES = 8MB`, un video pesa naturalmente di più) solo su
  questi tre endpoint — gli upload di avatar singolo restano a 8MB/solo
  immagine. Nome del campo/della risposta (`image`/`imageUrl`) invariato
  per compatibilità con `uploadFile` in api-client (già generico, non
  specifico alle immagini) e con tutti i chiamanti esistenti.
- **Schema di validazione** (`packages/shared/src/schemas.ts`):
  `guidedRequestSchema.photoUrls`/`guidedRequestUpdateSchema.photoUrls`/
  `reviewSchema.photoUrls` da `.max(3)` a `.max(5)`. `portfolioUrls` (già
  `.max(10)`, più permissivo) invariato — non ha senso ridurlo.
- **Frontend**: `apps/web/src/lib/media.ts` (`isVideoUrl`, per estensione
  del file) + `apps/web/src/components/MediaPreview.tsx` (nuovo,
  sostituto drop-in di `<img>` nelle griglie di miniature: `<video muted
  playsInline>` se l'URL è un video, altrimenti `<img>`, stesso
  `objectFit: cover` di prima) — usato in tutti gli 8 punti che
  renderizzavano foto di queste tre gallerie (`GuidedRequestForm`,
  `le-mie-richieste` ×3, `dashboard` ×2, `BookingDetailPanel`,
  `ProfessionalDetailContent` ×2, `dashboard/profilo` portfolio) più
  `PhotoLightbox.tsx` (viewer a schermo intero: `<video controls autoPlay>`
  per un video). `MAX_PHOTOS`/`MAX_REVIEW_PHOTOS`/`MAX_REQUEST_PHOTOS` da 3
  a 5, `accept="image/*"` → `accept="image/*,video/*"` sui tre `<input
  type="file">` corrispondenti, etichette "Foto" → "Foto o video" in UI.
  Verificato end-to-end con l'API locale (non solo typecheck): 6 elementi
  rifiutati (400) e 5 accettati su `guidedRequestSchema`/`reviewSchema`; un
  file `video/mp4` accettato dal `fileFilter` (fallisce solo più avanti per
  Cloudinary non configurato in locale, mai per il tipo). Typecheck pulito
  su tutti i package, build di produzione `apps/web` verde (24 route).

**Correzioni form di autenticazione** (segnalazioni esplicite dell'utente,
stesso giro):
1. **"Il sistema del telefono chiede sempre se salvare la password"
   durante la registrazione** — bug reale: il campo password di
   `/registrati` non aveva alcun `autoComplete`, lasciando al
   browser/gestore password del telefono l'euristica meno affidabile per
   capire se si tratta di una password nuova o esistente. Aggiunto
   `autoComplete="new-password"` al campo password di `/registrati`
   (`Field` di `@professionisti/ui` forwarda la prop a `Input`/react-native-
   web, che la mappa all'attributo HTML nativo) e `autoComplete=
   "current-password"` al campo password di `/accedi` — stessa correzione
   anche sui due campi password (attuale/nuova) di `/account` (cambio
   password), pur non citati esplicitamente, stesso bug potenziale con lo
   stesso fix a costo zero.
2. **Campo "Conferma password" in registrazione** — richiesta esplicita:
   "chiedi nome, e-mail, password, conferma password". Nuovo stato
   `confirmPassword` in `RegistratiForm`, validato prima dello schema zod
   (`password !== confirmPassword` → "Le password non coincidono.", stesso
   pattern client-side già in uso per altri controlli del form), proprio
   toggle mostra/nascondi indipendente dal campo password principale.
   Verificato con Playwright: 2 campi con `autoComplete="new-password"` in
   `/registrati`, mismatch bloccato con il messaggio corretto, 1 campo con
   `autoComplete="current-password"` in `/accedi`.

**Asterischi solo sui campi realmente obbligatori in `/account`** —
richiesta esplicita: "leva gli asterischi dai campi non obbligatori".
`updateAccountSchema` (`packages/shared`) ha **tutti** i campi opzionali
lato server; lato client (`handleSaveProfile`) solo Nome (min 2 caratteri)
ed Email (non vuota) bloccano davvero il salvataggio se mancanti — Cognome
e Data di nascita no. `FieldRow` in `/account/page.tsx` aveva `required`
(che mostra l'asterisco) anche su questi ultimi due, contraddicendo il
comportamento reale: rimosso da "Cognome" e "Data di nascita", lasciato su
"Nome" ed "Email" (gli unici davvero bloccanti).

**Soft-delete dell'account cliente — preservare recensioni/richieste/
prenotazioni** — richiesta esplicita dell'utente: "quando un account viene
eliminato devono rimanere le recensioni scritte da quell'account e deve
rimanere nei vari preventivi ricevuti dal professionista... con una
dicitura tipo 'account eliminato'... nei lavori terminati deve rimanere
traccia completa". Prima di questo cambio, `DELETE /auth/me` cancellava
fisicamente lo `User`, che aveva `onDelete: Cascade` su `GuidedRequest`
(→ a cascata `Lead`/`Quote`/`QuoteItem`) e su `Booking` (→ a cascata
`BookingFinalItem`/`Review`) — un cliente che eliminava l'account
cancellava silenziosamente tutto lo storico del professionista con lui,
comprese le recensioni che aveva scritto.
- **Schema**: nuovo campo `User.deletedAt DateTime?`. `AuthService.
  deleteAccount` non fa più `prisma.user.delete()`: se l'account è un
  professionista, il suo `ProfessionalProfile` viene comunque cancellato
  per davvero come prima (stesso comportamento pre-esistente, deliberato —
  la richiesta dell'utente riguarda solo il lato cliente, non l'annuncio
  pubblico di un professionista che chiude); poi lo `User` viene
  aggiornato invece che cancellato: `deletedAt` valorizzato, PII
  anonimizzata (`email` sostituita con `deleted-{id}@deleted.invalid` per
  liberare il vincolo unico e permettere una nuova registrazione alla
  stessa email vera, `phone`/`googleId`/`passwordHash`/`name`/`surname`/
  `birthDate`/`imageUrl` azzerati). Login impossibile di conseguenza
  (email non corrisponde più, password azzerata, googleId azzerato) senza
  dover invalidare nulla esplicitamente. **Non modificato**: `JwtAuthGuard`
  resta stateless (nessuna query DB ad ogni richiesta autenticata) — un
  token JWT già emesso prima della cancellazione resta valido fino a
  scadenza naturale (max 30gg); cambiarlo avrebbe richiesto una query DB
  per ogni richiesta autenticata dell'intero sito, un cambio di
  architettura/performance non richiesto esplicitamente e fuori scope per
  questo giro.
- **`ProfessionalLead.guidedRequest.clientAccountDeleted`/
  `ProfessionalBooking.clientAccountDeleted`** (nuovi campi booleani,
  `packages/shared/src/dashboard.ts`): calcolati da `client.deletedAt !==
  null` in `ProfessionalsService.getMyLeads`/`getMyBookings`.
  `clientName`/`clientPhone` restano `null` per un cliente eliminato
  (naturale conseguenza dell'anonimizzazione) — bug reale trovato e
  corretto durante la verifica: `clientEmail` esponeva invece l'email
  sintetica `deleted-{id}@deleted.invalid` (scritta solo per liberare il
  vincolo unico, non un vero indirizzo), corretto forzandolo a `null`
  esplicitamente quando `client.deletedAt` è valorizzato, in entrambi i
  metodi.
- **Blocco "ulteriori operazioni sul preventivo"**: `QuotesService.
  createOrUpdate` (invio di un nuovo preventivo o modifica di uno già
  inviato) rifiuta ora con 403 ("Il cliente ha eliminato il proprio
  account...") se `lead.guidedRequest.client.deletedAt` è valorizzato —
  richiede di includere `client` nella query del `lead` (prima solo
  `guidedRequest: true`). Deliberatamente **non bloccate**: ritiro di un
  preventivo già inviato (`withdrawByProfessional`, pulizia della propria
  coda, non richiede il cliente) e rifiuto di un lead
  (`ProfessionalsService.declineLead`) — entrambe azioni del solo
  professionista, non "operazioni sul preventivo" nel senso della
  richiesta.
- **Frontend** (`apps/web/src/app/dashboard/page.tsx`): `LeadCard` mostra
  "Account eliminato" (testo neutro `brand.grafite70`, stesso stile già in
  uso per un altro stato "non più azionabile", "Richiesta scaduta" —
  niente `Badge` colorato, non è né un successo né un'urgenza) al posto
  del nome cliente cliccabile; i bottoni "Invia preventivo" e "Modifica
  preventivo" spariscono, sostituiti da una nota "Il cliente ha eliminato
  il proprio account: non puoi più inviare un preventivo per questa
  richiesta." (il bottone "Rifiuta richiesta" resta disponibile, non è
  un'operazione bloccata). `AcceptedJobCard` (lavori accettati/terminati)
  mostra "· Account eliminato" accanto al nome, senza nascondere nient'altro
  — `recipientName`/`recipientSurname`/`recipientPhone` (raccolti
  nella schermata di accettazione preventivo, non PII dell'account) e
  `finalAmountEurCents`/`finalItems` restano visibili intatti, "traccia
  completa" come richiesto.
- Verificato end-to-end con l'API locale (non solo typecheck) e
  Playwright: ciclo completo richiesta→preventivo→accettazione→
  completamento→recensione per un cliente di test, poi `DELETE /auth/me`
  → login con le vecchie credenziali rifiutato (401) → lead/prenotazione
  ancora presenti via `GET /professionals/me/leads`/`/bookings` con
  `clientAccountDeleted: true`, `clientName`/`clientPhone`/`clientEmail`
  tutti `null` → recensione ancora visibile su `GET /professionals/:id`
  pubblico → tentativo di inviare un preventivo per una seconda richiesta
  (mai risposta) dello stesso cliente eliminato rifiutato con 403 →
  registrazione di un nuovo account con la stessa email originale riuscita
  (email liberata correttamente). UI: Playwright conferma l'etichetta
  "Account eliminato" e l'assenza del bottone "Invia preventivo" nella
  dashboard del professionista. **Nota sull'ambiente di test**: la
  verifica ha incontrato lo stesso problema di inquinamento dati da run
  ripetuti già documentato altrove in questo file (professionisti/
  richieste di test residue nella stessa città/categoria che si
  affiancavano ai dati del test corrente, coinvolti automaticamente dal
  meccanismo "nuovo professionista si iscrive → richieste aperte esistenti"
  di CLAUDE.md §14) — non un bug applicativo, risolto ripulendo il
  database e usando una città isolata per il test finale. Typecheck pulito
  su tutti i package, build di produzione `apps/web` verde (24 route).

**Bug reale: lampo del bottone "Richiedi preventivo" per un account
professionista già autenticato** — segnalato dall'utente ("ogni volta che
si carica la pagina esce sempre per qualche istante in alto a destra
richiedi preventivo"). `SiteHeader.tsx` nasconde già quel bottone con
`user?.role !== "PROFESSIONAL"`, ma quella condizione non teneva conto di
`isLoading` (lo stato di caricamento iniziale di `AuthContext`, già
gestito correttamente qualche riga sopra per `AccountMenu`/"Accedi"):
mentre l'autenticazione è ancora in corso `user` è `null`/`undefined`, e
`undefined !== "PROFESSIONAL"` risulta vero — il bottone compariva quindi
per l'istante tra il primo render e la risoluzione di `user`, anche per un
professionista già loggato, sparendo solo quando `user.role` si
stabilizzava. Corretto aggiungendo lo stesso controllo `!isLoading` già
usato per l'altro ramo dell'header: `{!isLoading && user?.role !==
"PROFESSIONAL" ? (...) : null}`. Verificato con Playwright (non solo
lettura di codice): professionista autenticato, campionamento della
visibilità del bottone ogni 30ms per 1,5s su ciascuna di 6
pagine/navigazioni (home, dashboard, profilo, agenda, account, di nuovo
home) — 80 campioni totali, zero lampi rilevati; bottone confermato
assente a stato stabile. Cliente autenticato e visitatore anonimo:
bottone visibile correttamente in entrambi i casi (nessuna regressione).
Zero errori console nuovi. Typecheck pulito su `apps/web`.

**Dati di contatto/indirizzo raccolti alla richiesta, non più all'accettazione
+ indirizzo di default nell'account** — due richieste esplicite dell'utente,
stesso giro:

1. "Tutti i campi che chiedevi al cliente una volta che accettava un
   preventivo... voglio che li inserisca subito appena [invia] un
   preventivo (ad esempio numero di telefono indirizzo preciso e tutti gli
   altri campi), ma verranno visualizzati al professionista tutti questi
   dettagli specifici solo quando si è conclusa la trattativa e confermato
   l'appuntamento" — i campi prima raccolti solo in `AcceptQuoteModal`
   (nome/cognome/telefono del destinatario, via, civico, dettagli, CAP,
   provincia) si spostano su `GuidedRequestForm` (`/preventivo`,
   `/urgente`), obbligatori come gli altri campi della richiesta (tranne
   `addressExtra`). La visibilità resta invariata rispetto a prima:
   nascosti al professionista finché non crea una `Booking` da un
   preventivo accettato.
2. "Tutti quelli informazioni... possono essere inserite nella finestra
   impostazioni dell'account, in modo che quando si richiede un preventivo
   escano automaticamente compilate già nei campi" — nuovi campi
   `User.street`/`houseNumber`/`addressExtra`/`postalCode`/`city`/
   `province` (Prisma, tutti facoltativi), editabili in una nuova sezione
   "Indirizzo" di `/account` (`updateAccountSchema` esteso, nessun
   asterisco: mai obbligatori per usare l'account, stessa convenzione già
   in uso per Cognome/Data di nascita). `GuidedRequestForm` li usa **solo
   come prefill iniziale** (un `useEffect` con un `useRef` sentinella
   "già applicato", eseguito appena `user` è disponibile — gli `useState`
   sopra sono dichiarati prima che `user` sia noto, quindi il valore
   iniziale da solo non basta, stesso motivo per cui `/account` sincronizza
   i propri campi con un effetto dedicato invece che nell'inizializzatore
   di `useState`): il form resta sempre modificabile per singola richiesta,
   un cliente può avere lavori in indirizzi diversi da una richiesta
   all'altra (principio già stabilito per `GuidedRequest.address` prima di
   questa funzionalità).

**Schema** (`packages/database`): `GuidedRequest` guadagna
`recipientName`/`recipientSurname`/`recipientPhone`/`houseNumber`/
`addressExtra`/`postalCode`/`province` (tutti `String?` a livello DB,
obbligatori lato Zod alla creazione tranne `addressExtra` — stessa
convenzione già in uso per `address`/via). `address` (via) e `city`
esistevano già e restano gli stessi campi, non duplicati. `Booking`
conserva gli stessi campi omonimi introdotti in un giro precedente
(§"Indirizzo di lavoro strutturato"): quello schema non cambia, cambia
solo **da dove** arrivano i valori.

**Backend**:
- `BookingsService.createFromQuote(clientId, quoteId)` non accetta più un
  terzo argomento `AcceptQuoteInput` (rimosso da schema condiviso, era
  usato solo qui): copia `recipientName`/`recipientSurname`/
  `recipientPhone`/`street`(da `guidedRequest.address`)/`houseNumber`/
  `addressExtra`/`postalCode`/`city`/`province` direttamente da
  `quote.guidedRequest` al momento della creazione della `Booking`. Nessuna
  validazione aggiuntiva necessaria qui: i campi sono già stati validati
  (obbligatori) alla creazione della richiesta.
- `ProfessionalsService.getMyLeads`: **non** espone i nuovi campi
  strutturati sul `guidedRequest` del lead (solo `address`/`city` restano
  visibili, come già prima) — verificato esplicitamente con un test che
  controlla l'assenza delle chiavi (`!("recipientName" in ...)`), non solo
  che il valore sia `null`, per essere sicuri che il backend non li
  restituisca affatto prima della conferma.
- `GuidedRequestsService.create`/`update`: persistono i nuovi campi;
  `update` li accetta come opzionali (stesso pattern "sostituzione solo se
  presente" già in uso per `photoUrls`), bloccato dallo stesso vincolo
  preesistente "non modificabile dopo il primo preventivo ricevuto"
  (`GuidedRequestsService.update`, nessun cambiamento a quella regola).
- `GuidedRequestsService.listForClient` (il cliente vede la propria
  richiesta): espone i nuovi campi per intero — sono i dati del cliente
  stesso, nessun problema di privacy nel mostrarli a chi li ha inseriti.
- `AuthController.withBusinessName`/`AuthService.updateAccount` estesi con
  i sei campi indirizzo dell'account.

**Frontend**:
- `GuidedRequestForm.tsx`: il vecchio campo "Indirizzo" singolo (solo via)
  è sostituito da un blocco "Chi riceverà il professionista" (nome,
  cognome, telefono, via, civico, dettagli scala/piano/interno, CAP,
  provincia) — tutti obbligatori tranne i dettagli. Stesso form riusato da
  `/preventivo` e `/urgente`.
- `apps/web/src/app/account/page.tsx`: nuova sezione "Indirizzo" (via,
  civico, scala/piano/interno, CAP, città, provincia), nessun campo
  obbligatorio.
- **`AcceptQuoteModal.tsx` eliminato** (non un file "svuotato", rimosso per
  intero: i dati che raccoglieva sono già disponibili prima
  dell'accettazione). `QuoteCard` (`/le-mie-richieste`) accetta ora
  direttamente con un click su "Accetta preventivo" — nessun overlay,
  `apiClient.acceptQuote(token, quoteId)` non richiede più un body. Il
  messaggio "Vai al pagamento" (pagamento in piattaforma non ancora
  attivo, invariato da prima) resta disponibile come link testuale sotto
  "Accettato" invece che dentro il vecchio modale.
- Form di modifica di una richiesta già inviata (`GuidedRequestCard` in
  `/le-mie-richieste`, visibile solo finché nessun preventivo è arrivato)
  esteso con gli stessi campi, stesso schema `guidedRequestUpdateSchema`
  già usato per `address`/`photoUrls`.

Verificato end-to-end con l'API locale (non solo typecheck) e Playwright:
richiesta senza `recipientPhone` rifiutata con 400; richiesta completa
accettata, fan-out riuscito; lato professionista (`GET
/professionals/me/leads`) i campi strutturati sono **assenti** dalla
risposta (non solo `null`) prima di ogni conferma, `address`/`city`
restano visibili; lato cliente (`GET /guided-requests/me`) tutti i campi
sono visibili; preventivo inviato e accettato **senza alcun body** nella
richiesta HTTP → `Booking` con tutti i campi copiati correttamente dalla
`GuidedRequest`, ora visibili al professionista (`GET
/professionals/me/bookings`). UI: salvataggio indirizzo da `/account`
persistito e verificato via API; form `/preventivo` aperto subito dopo
mostra i campi già precompilati con i valori dell'account (nome, via,
civico, CAP, provincia); invio reale dalla UI con payload catturato via
`page.route` conferma i campi corretti nella richiesta; dashboard
professionista **non** contiene in nessun punto del DOM il CAP o
l'indirizzo completo prima della conferma; click su "Accetta preventivo"
in `/le-mie-richieste` crea la prenotazione senza aprire alcun
`role="dialog"`, "Vai al pagamento" mostra il messaggio corretto. Zero
errori console in tutti i flussi. Typecheck pulito su tutti i package
(`shared`, `database`, `api-client`, `ui`, `api`, `web`, `mobile`), build
di produzione `apps/web` verde (24 route).

**Salvataggio dati destinatario come predefiniti dell'account** — richiesta
esplicita dell'utente: "quando un cliente immette i dati durante il
preventivo se non sono ancora presenti in impostazioni account dopo il
salva chiedi se vuole che diventino i dati predefiniti così da salvarli in
impostazioni account". `GuidedRequestForm.tsx`: al momento del prefill
(stesso `useEffect` che precompila i campi dall'account), calcola
`accountMissingFields` — vero se anche uno solo tra nome/cognome/telefono/
via/civico/CAP/città/provincia dell'account era vuoto — senza confrontare
i valori poi effettivamente digitati dal cliente (la condizione riguarda
solo "l'account non li aveva ancora", non "il cliente li ha cambiati").
Solo in quel caso, dopo l'invio riuscito della richiesta, la schermata
"Richiesta inviata!" mostra un riquadro con "Vuoi salvare questi dati come
predefiniti nel tuo account?" e due bottoni ("Sì, salva" →
`apiClient.updateAccount` con i valori appena inseriti nel form, seguito da
`refreshUser()`; "No, grazie" → nasconde il riquadro senza altra azione).
Verificato: typecheck pulito, build verde.

## 17. Fascia oraria completa nei preventivi + segnalazione orario modificato

Tre richieste esplicite dell'utente, stesso giro:

1. "Quando si accetta un preventivo non visualizzare solo il primo orario
   ma tutta la fascia d'orario" — `Quote.estimatedStartDate` era sempre
   stato un singolo istante (solo l'inizio), anche quando la scelta
   veniva da una fascia agenda con un `endTime` noto e scartato al
   momento dell'invio del preventivo. Nuovi campi Prisma
   `Quote.estimatedEndDate`/`clientProposedEndDate` e
   `Booking.scheduledEndAt` (tutti nullable: null per date indicate a
   mano senza agenda, o per righe precedenti a questa funzionalità — in
   quel caso resta il solo inizio, come prima). `LeadCard.handleSendQuote`
   (`/dashboard`) calcola ora anche `estimatedEndDate` dalla fascia scelta
   (`slot.endTime`) e lo invia insieme a `estimatedStartDate`.
   `QuotesService.resolveFreeExactSlot` (usato da `proposeDate`) ritorna
   ora sia inizio che fine della fascia proposta dal cliente
   (`clientProposedEndDate`, salvata sul preventivo). Ogni punto che
   mostra la data di un preventivo/prenotazione (dashboard "Il tuo
   preventivo"/"Il cliente ha proposto un'altra data", `/le-mie-richieste`
   "Data proposta"/"In attesa di conferma", righe lavori accettati su
   entrambi i lati, `BookingDetailPanel` del calendario) mostra ora
   `HH:MM–HH:MM` invece del solo orario di inizio, tramite due helper
   locali per file (`formatDateTimeRange`/`formatSentAt` in
   `dashboard/page.tsx`, `formatQuoteDateRange`/`formatSentAt` in
   `le-mie-richieste/page.tsx`) — nessun pacchetto di date aggiunto, stessa
   convenzione "wall clock UTC" già in uso per le fasce agenda.
2. "Nei preventivi inviati... inserisci in automatico anche la data di
   invio preventivo con l'orario visibile sia dal cliente che dal
   professionista" — `Quote.createdAt` esisteva già nello schema (mai
   esposto): ora restituito come `quote.sentAt` sia da
   `ProfessionalsService.getMyLeads` che da
   `GuidedRequestsService.listForClient`, mostrato come "Inviato il ..."
   (data+ora reali nel fuso del browser, a differenza delle fasce agenda
   che sono sempre "wall clock UTC") in entrambe le viste.
3. "Se al preventivo ricevuto il professionista modifica l'orario inserito
   dal cliente evidenzialo quando viene restituito al cliente... e la
   stessa cosa se la modifica il cliente rendilo evidenziato al
   professionista" — comportamento simmetrico:
   - **Professionista → cliente**: nuovo campo calcolato
     `quote.timeChangedFromRequest` (`GuidedRequestsService.listForClient`,
     via il nuovo helper privato `preferredStartDate` che combina
     `GuidedRequest.preferredDate`+`preferredTimeSlot` nell'istante di
     inizio effettivamente richiesto) — vero solo quando la richiesta
     porta un orario preferito (nata da una fascia generica dell'agenda
     pubblica) *e* il professionista ha inviato il preventivo con un
     `estimatedStartDate` diverso. `QuoteCard` (`/le-mie-richieste`)
     mostra in quel caso un riquadro ottone "Il professionista ha
     proposto un orario diverso da quello richiesto (HH:MM–HH:MM)."
   - **Cliente → professionista**: il blocco "Il cliente ha proposto
     un'altra data" in `LeadCard` (`/dashboard`) era già visivamente
     evidenziato (bordo+sfondo ottone, testo in grassetto) fin dalla sua
     introduzione — nessun cambiamento necessario oltre a mostrarci ora
     anche la fascia completa.
   - **Bug reale scoperto e corretto durante la verifica** (segnalato
     dall'utente in un messaggio successivo, non ipotizzato):
     "quando si accetta un lavoro al termine delle trattative, il
     professionista non visualizza tutti i dettagli... come indirizzo
     preciso e numero di telefono". Causa: `QuotesService.
     confirmProposedDate` (il percorso di accettazione che segue una
     trattativa sulla data — distinto da `BookingsService.
     createFromQuote`, il percorso di accettazione diretta) creava la
     `Booking` senza copiare `recipientName`/`recipientSurname`/
     `recipientPhone`/`street`/`houseNumber`/`addressExtra`/`postalCode`/
     `city`/`province` dalla `GuidedRequest` collegata — l'unico dei due
     percorsi di creazione prenotazione rimasto non aggiornato quando
     questi campi erano stati spostati dalla schermata di accettazione
     alla richiesta stessa (vedi sezione precedente di questo file).
     Corretto allineando `confirmProposedDate` allo stesso pattern di
     copia già usato in `createFromQuote`.
Verificato end-to-end con l'API locale (non solo typecheck) e Playwright:
fascia scelta dall'agenda (09:00–10:00) → `estimatedEndDate` presente e
corretto sia lato professionista che cliente, `sentAt` un timestamp reale
recente coerente su entrambi i lati, `scheduledEndAt` presente e corretto
sulla prenotazione dopo l'accettazione diretta; percorso trattativa (cliente
propone 14:00–15:30, professionista conferma) → `clientProposedEndDate`
presente prima della conferma, prenotazione risultante con
`recipientName`/`recipientSurname`/`recipientPhone`/`street`/`houseNumber`/
`postalCode`/`province` tutti presenti (bug fix confermato) e
`scheduledEndAt` coerente con la fascia confermata; richiesta con orario
preferito (09:00–13:00) + preventivo su orario diverso (15:00–16:00) →
`timeChangedFromRequest` vero; stesso scenario con orario coincidente →
`timeChangedFromRequest` falso. UI: range orario visibile in
`/le-mie-richieste` ("16:00–17:00"), "Inviato il" presente, riquadro di
avviso "orario diverso da quello richiesto" visibile con la fascia
originale citata; dashboard professionista (tab "Lavori accettati") con
range orario, telefono e indirizzo preciso del cliente tutti visibili dopo
l'accettazione. Zero errori console in tutti i flussi. Typecheck pulito su
tutti i package (`shared`, `database`, `api-client`, `ui`, `api`, `web`,
`mobile`), build di produzione `apps/web` verde (24 route).

---

## 18. "Non presentato" + rimborso, trattativa data con "Modifica", dettagli completi in "Lavori accettati"

Tre richieste esplicite dell'utente, stesso giro.

**"Non presentato" + richiesta di rimborso (lato cliente)** — "dai la
possibilità al cliente una volta che accetta un lavoro e terminate le
trattative col professionista, successivamente alla data e l'orario
prestabiliti di poter cliccare su non presentato, dove si aprirà una
finestra che chiede di contattare 'nome'... oppure chiedere il rimborso."
- **Nuovi campi additivi su `Booking`**: `refundRequested Boolean
  @default(false)` + `refundRequestedAt DateTime?`. Deliberatamente **non**
  riusato lo stato `NO_SHOW` già esistente sull'enum `BookingStatus`: quel
  valore significa già "il cliente non si è presentato" (impostabile dal
  professionista) — la direzione opposta, semanticamente diversa. Non tocca
  `status`: il professionista può ancora segnare il lavoro
  completato/annullato, resta libero di contestare la segnalazione.
- **`BookingsService.reportProfessionalNoShow`** (`PATCH
  /bookings/:id/report-no-show`, JWT): consentito solo su una prenotazione
  propria `CONFIRMED`, solo dopo che `scheduledEndAt` (o `scheduledAt` se
  l'ora di fine non è nota) è realmente passata — mai fidarsi del client su
  questo controllo — e solo una volta. Notifica il professionista
  (`BOOKING_NO_SHOW_REPORTED`, nuovo tipo in `notificationCopy.ts`/
  aggiunto a `PROFESSIONAL_LAVORI_TYPES`).
- **`BookingsService.listForClient`** espone ora anche
  `professionalPhone`/`professionalEmail`/`professionalAddress` (dal
  `ProfessionalProfile`/`User` del professionista) e `refundRequested` —
  servono al popup per "Contatta" senza una chiamata separata.
- **`ReportNoShowModal.tsx`** (nuovo, `apps/web/src/components`): stesso
  pattern overlay di `ClientProfileModal`/`CancelBookingModal`. Due strade,
  non un'azione automatica: "Contatta {professionista}" rivela
  telefono/email/indirizzo (link `tel:`/`mailto:`), "Richiedi un rimborso"
  chiama l'endpoint e mostra un messaggio onesto — nessun pagamento reale
  da rimborsare in piattaforma (non ancora attivo, CLAUDE.md §9): "Abbiamo
  avvisato... il rimborso va concordato direttamente con il
  professionista", stesso principio già seguito per "Vai al pagamento".
- **`/le-mie-richieste` (`BookingRow`)**: bottone testuale rosso "Non
  presentato" visibile solo quando `status === "CONFIRMED"` e la fine
  dell'appuntamento è già passata e non già segnalato; dopo la
  segnalazione mostra un box rosso invece del bottone. Stesso banner
  rosso lato professionista (`AcceptedJobCard`, `/dashboard`) quando
  `refundRequested` è vero.

**Trattativa data — "Modifica" al posto di limitarsi a
confermare/rifiutare** — due richieste in sequenza: "quando gli arriva al
professionista può... cliccare su Conferma (verde) Modifica (in giallo,
dove può modificare sia la data che l'orario... già impostati sull'ultima
data/orario proposti, con una casella di testo... e inviare) e Rifiuta (in
rosso)"; poi, simmetricamente, "la stessa cosa il cliente può effettuare
modifica, dove nel gruppo data ora ci sarà l'ultimo proposto e può anche
solo scrivere qualcosa nella casella di testo... e fare invia".
- **Lato cliente** (`/le-mie-richieste`, `QuoteCard`): il bottone
  "Proponi altra data" è rinominato **"Modifica"** — comportamento
  invariato (`startChoosingDate`/`handleProposeDate`, già esistenti), ma
  ora precompilato sull'**ultima data/orario proposti** (il preventivo
  attuale, `quote.estimatedStartDate`/`estimatedEndDate`) invece che sulla
  prima fascia libera qualsiasi: il cliente può accettare implicitamente
  la stessa fascia scrivendo solo una nota, senza dover ri-scegliere nulla.
- **Lato professionista** (`/dashboard`, `LeadCard`, quando
  `quote.status === "MODIFICATION_REQUESTED"`): tre bottoni invece di due
  — **Conferma** (verde, `brand.verificato`, comportamento invariato:
  `handleConfirmDate` crea la prenotazione), **Modifica** (giallo,
  `brand.ottone`, nuovo) e **Rifiuta** (rosso, `variant="urgent"`,
  comportamento invariato: `handleRejectDate`, torna alla data originale).
  "Modifica" apre un modulo inline — `<select>` di fasce libere
  dall'agenda reale (`availableSlots`, stesso prop già passato a
  `LeadCard`), precompilato sulla fascia proposta dal cliente se ancora
  libera, + textarea nota facoltativa + "Invia".
- **Nuovo `QuotesService.counterProposeDate`** (`POST
  /quotes/:id/counter-propose-date`, JWT): consentito solo su un
  preventivo proprio `MODIFICATION_REQUESTED` senza prenotazione già
  creata. Rivalida la fascia scelta contro l'agenda reale
  (`resolveFreeExactSlot`, stessa cautela già in uso per
  `proposeDate`/`bookAgendaSlot` — mai fidarsi ciecamente dell'input),
  aggiorna `estimatedStartDate`/`estimatedEndDate`, torna a `SENT`,
  azzera `clientProposedDate`/`clientProposedEndDate`/`clientProposedNote`
  (la trattativa riparte con una nuova offerta), salva la nota in
  `Quote.professionalCounterNote` (nuovo campo, distinto da `notes`: quello
  sono le voci/dettagli del preventivo, mai sovrascritti da questo flusso)
  e notifica il cliente (`QUOTE_DATE_CHANGED`, tipo già esistente — stesso
  significato "il professionista ha cambiato la data del tuo preventivo").
  `professionalCounterNote` azzerato quando il cliente propone di nuovo
  (`proposeDate`, nuova trattativa da capo). Esposto lato cliente
  (`GuidedRequestsService.listForClient`), mostrato in `QuoteCard` come
  box evidenziato "Il professionista ti ha risposto: ..." quando lo stato
  è tornato `SENT` con una nota presente.
- **Correzione richiesta esplicitamente durante lo stesso giro**: "se non
  è stato modificato il gruppo data ora non deve uscire 'ha proposto
  un'altra data'" — un cliente che usa "Modifica" solo per scrivere una
  nota, senza cambiare data/ora, non ha "proposto un'altra data" in senso
  proprio. Nuovo helper `describeDateChangeKind` (`apps/web/src/app/
  dashboard/page.tsx`, confronto su stringa "wall clock UTC", stessa
  convenzione già in uso in tutto il modulo agenda) confronta
  `quote.estimatedStartDate`/`EndDate` (la data attuale, prima della
  proposta) con `quote.clientProposedDate`/`EndDate` (la proposta appena
  arrivata) e distingue quattro casi — `none` ("Il cliente ti ha scritto
  (stessa data: ...)"), `time` ("ha proposto un altro orario"), `date`
  ("ha proposto un'altra data"), `both` ("ha proposto un'altra data e
  orario") — nel banner mostrato al professionista. Stessa cautela non
  applicata simmetricamente al banner `professionalCounterNote` lato
  cliente (manca un confronto affidabile: `clientProposedDate` è già
  azzerato al momento in cui il cliente lo vede) — quel banner resta
  neutro ("Il professionista ti ha risposto:") apposta, per non rischiare
  un'affermazione falsa sul cambio o meno di data/ora.

**"Lavori accettati" (cliente) — tutti i dati utili, non solo quelli del
professionista** — "oltre ai dati della persona [professionista] deve
venire anche i dati del preventivo da lui inviato all'inizio come la
descrizione dell'evento con il titolo, le foto e il preventivo accettato".
`BookingsService.listForClient` include ora anche `quote.items` e
`quote.guidedRequest.category` (join già presente lato professionista in
`ProfessionalsService.getMyBookings`, mai esposta prima lato cliente) ed
espone `categorySlug`/`categoryLabel` (il "titolo"), `description`,
`photoUrls` (dalla `GuidedRequest` originale) e `quoteItems`/`quoteNotes`
(le voci e note del preventivo accettato — il range concordato, distinto
dall'importo finale esatto già mostrato a lavoro terminato in
`finalItems`). `null`/`[]` per le prenotazioni dirette da agenda pubblica
(`bookAgendaSlot`), che non hanno una `GuidedRequest`/`Quote` collegata.
`BookingRow` (`/le-mie-richieste`, tab "Lavori accettati") mostra ora,
sotto data/ora: categoria in grassetto come titolo, descrizione, foto in
miniatura cliccabili (stesso `PhotoLightbox` già in uso altrove) e un
blocco "Preventivo accettato" con voci+range di prezzo+note — sopra il
blocco "Importo finale" già esistente (mostrato solo a lavoro `COMPLETED`).

Verificato end-to-end con l'API locale (non solo typecheck) e Playwright:
segnalazione no-show rifiutata (403) prima della fine dell'appuntamento,
forzando `scheduledEndAt` nel passato via query diretta (senza attendere
un giorno reale) la segnalazione viene accettata, una seconda segnalazione
sulla stessa prenotazione rifiutata, `/bookings/me` e
`/professionals/me/bookings` riflettono `refundRequested: true` su
entrambi i lati, notifica `BOOKING_NO_SHOW_REPORTED` ricevuta dal
professionista. Cliente propone la stessa data/ora con solo una nota →
lato professionista `estimatedStartDate === clientProposedDate` (nessun
cambio reale, banner userà "none"); professionista usa "Modifica" su un
orario diverso → preventivo torna `SENT` con la nuova data,
`clientProposedDate` azzerato, `professionalCounterNote` visibile lato
cliente con il testo corretto; tentativo di `counter-propose-date` senza
una proposta in sospeso rifiutato (403). UI Playwright: card "Lavori
accettati" con titolo categoria/descrizione/voce preventivo/nota tutti
visibili; dashboard professionista con i tre bottoni Conferma/Modifica/
Rifiuta, apertura di "Modifica" con `<select>` precompilato e textarea,
invio che fa sparire il banner di trattativa (preventivo tornato `SENT`).
Zero errori console in tutti i flussi. Typecheck pulito su tutti i package
(`shared`, `database`, `api-client`, `ui`, `api`, `web`, `mobile`).

---

## 19. Rebrand "Vicinato" — sostituzione del brief "Scheda Intervento"

Richiesta esplicita dell'utente, in qualità di valutazione UX/UI sul sito
reale (screenshot Playwright, non solo lettura di codice): la home risultava
"troppo fredda, manca di empatia e contatto umano" — conseguenza diretta e
prevedibile del brief "Scheda Intervento" originale (§10: griglia
cianografica blu, hairline, mono maiuscolo, palette grigio/blu fredda).
Dopo aver mostrato quattro anteprime statiche a confronto (home attuale +
tre concept: Portineria/Vicinato/Giornale di Casa, ispirati esplicitamente
"ai migliori siti sulla stessa tematica" su richiesta dell'utente, senza
vincolo di continuità con colori/stile del sito esistente), l'utente ha
scelto **Vicinato** (pesca + verde smeraldo saturo, tipografia arrotondata
amichevole, blocchi di colore pieno) e ha chiesto esplicitamente: **tutte
le pagine del sito**, non solo la home — "cambia totalmente tutte le
pagine nel nuovo stile, niente deve rimanere nel vecchio stile". Le foto
professionali reali sono state esplicitamente rimandate a un giro
successivo.

**Leva principale — pochi file, effetto su tutto il sito**: il sito era già
ben centralizzato dal redesign "Scheda Intervento" precedente — la quasi
totalità delle pagine referenzia i colori tramite `brand.*`
(`packages/ui/src/tokens.ts`), mai hex letterali. Ricolorare i **valori**
di quell'oggetto (stessi nomi di chiave, mai rinominati/rimossi — la
stessa regola additiva già documentata nei commenti del file) ripropaga
automaticamente il nuovo stile su ~50 file senza doverli riscrivere uno
per uno, lo stesso meccanismo già sfruttato nel redesign originale:
- `gesso` (sfondo pagina): da grigio chiarissimo a pesca `#FDEFE1`.
- `calce` (sfondo card): bianco pieno, invariato.
- `grafite`/`grafite70` (testo): da grigio/blu freddo a inchiostro caldo
  `#2B2420`/`#6E6459`.
- `cianografia`/`cianografiaScuro`/`cianografiaVelo` (accento primario,
  bottoni/link/focus): da blu a verde smeraldo `#189A63`/`#0E7A4C`/
  `#DCF3E7`.
- `verificato`: verde foresta `#3D6B3E`, deliberatamente distinto dal
  verde smeraldo dei CTA per restare leggibile come stato semantico a sé.
- `urgenza`/`urgenzaVelo`: **invariati** (rosso resta rosso — cambiarlo
  avrebbe confuso una convenzione universale).
- `ottone`: invariato concettualmente (accento dorato per pagamento/boost).
- `radiusDoc`/`radiusDocLg`: da 4/8 ("documento tecnico") a 20/32, molto
  più morbidi.
- Nuovo `shadowVicinato` (stringa CSS box-shadow, per i pochi punti
  web-only che non passano da `Surface`).

**Font**: `apps/web/src/app/fonts.ts` sostituisce Archivo con **Fredoka**
(`next/font/google`, pesi 500/600/700 — max disponibile 700, contro l'800
di Archivo: alcuni `fontWeight="800"` sparsi nel codice restano non
patchati uno per uno, rischio visivo basso, il browser ricade sul peso più
vicino disponibile). Stessa CSS variable `--font-display`, nessuna
modifica a `packages/ui/config.ts` (già generico). Corpo/mono (Inter
Tight/IBM Plex Mono) invariati.

**Primitivi condivisi** (letti da ogni pagina, non solo home):
- `Button.tsx`: nessuna modifica strutturale, eredita `brand.cianografia`
  ricolorato + `radiusDoc` più morbido — ogni bottone `variant="primary"`
  del sito diventa verde smeraldo pillolato automaticamente.
- `Surface.tsx`: **bordo hairline rimosso** (`borderWidth: 0`, prima 1px
  `brand.filetto`) in favore di un'ombra soffice — "angoli quasi nulli +
  filetto" era esattamente il linguaggio da documento tecnico che l'utente
  ha giudicato freddo. Ogni componente che usa `Surface` (card
  professionista, pop-up, pannelli agenda, pricing card) eredita il cambio
  senza essere toccato.
- `Badge.tsx`: da pillola hairline + mono maiuscolo a pillola piena
  arrotondata, testo `$body` grassetto.
- `Eyebrow.tsx`: da hairline + mono maiuscolo a pillola colorata piena
  (`cianografiaVelo`/testo `cianografiaScuro`, o traslucido su sfondo
  scuro) — stesso principio di `Badge.tsx`.
- `Chip.tsx`: nessuna modifica necessaria (già una pillola colorata, non
  parte del problema "freddo").
- `Section.tsx`: nessuna modifica necessaria (il pattern `.bp-grid` non è
  più referenziato da nessun componente dopo la riscrittura di
  `HomeHero.tsx`, vedi sotto).

**Sweep mono-maiuscolo → registro caldo** (scoperto durante la verifica
visiva, non previsto nel piano iniziale): ricolorare i token non basta a
togliere la sensazione "documento tecnico" se le micro-etichette restano
in IBM Plex Mono maiuscolo con `letterSpacing` — lo stesso identico
pattern (`fontFamily="$mono" ... textTransform="uppercase"`) risultava
duplicato inline in **37 punti su 18 file** in tutto il sito (label di
campo, stato prenotazione, intestazioni di sezione in pop-up/pannelli),
mai centralizzato in un componente condiviso. Convertiti in blocco
(script mirato sul pattern esatto, poi 5 casi multi-riga corretti a mano)
a `fontFamily="$body" fontWeight="700"`, stessa dimensione o leggermente
maggiore per compensare la minor densità del mono. **Lasciato invariato**
il mono per cifre tabulari vere (prezzi, orari `HH:MM`, km, conteggi) —
uso già sanzionato esplicitamente in §10 Fase 1 ("mono mantenuto solo per
cifre tabulari"), coerente con la convenzione originale, non un residuo da
correggere. Toccati anche due componenti "su misura" con lo stesso pattern
non catturato dal filtro puramente testuale: il selettore vista
Giorno/Settimana/Mese di `CalendarShell.tsx` (da segmented control con
hairline verticali tra le voci a pillola piena senza divisori, stesso
principio di `SearchBar.tsx`) e `SearchBar.tsx` stesso, che aveva un
bordo hairline residuo (`borderWidth={1} borderColor={brand.filetto}`)
mai notato prima perché visivamente sottile — rimosso in favore della
stessa ombra soffice di `Surface`.

**Componenti home riscritti** (i più "su misura" per l'estetica blueprint,
non recuperabili solo ricolorando token): `HomeHero.tsx` (pannello verde
pieno arrotondato con `SearchBar` incorporata, via il pattern `.bp-grid`
— la barra di ricerca resta la funzione primaria della home, non
sostituita da un form di richiesta guidata, decisione già presa e
documentata in una correzione precedente), `CategoryTile.tsx`/
`CategoryCarousel.tsx` (hover a sollevamento+rotazione invece che
cambio-colore-bordo, coerente con `Surface` senza più bordo),
`QualitySection.tsx` (pannello scuro caldo, eredita automaticamente),
`HowItWorks.tsx` (numeri "01/02/03" mono sostituiti da badge circolari
pieni, linea di collegamento tratteggiata → solida arrotondata),
`ProCtaSection.tsx` (da cianografia a smeraldo pieno, `Eyebrow tone="dark"`
al posto dell'eyebrow hairline inline), `SiteHeader.tsx` (ombra morbida
al posto dell'hairline sotto scroll), `SiteFooter.tsx` (titoli colonna da
mono maiuscolo a `$body` grassetto, hairline superiori rimossi),
`MegaMenu.tsx` (pannello desktop senza bordo, solo ombra; titoli colonna
idem sweep sopra), `Logo.tsx`/`Logo.web.tsx` (raggio del marchio 6→9,
colore già ereditato da `brand.cianografia`).

**Carosello "Nuovi professionisti", stile miodottore.it** (richiesta
esplicita dell'utente, arrivata a metà turno mentre un agente Explore era
già in corsa sulla ricerca del design system): `ProfessionalsShowcase.tsx`
(`RealShowcase`) ora ordina una copia locale dei professionisti per
`createdAt` decrescente — **mai** l'ordinamento condiviso di
`ProfessionalsService.search()` (boost→rating→recensioni, leva di
monetizzazione, invariato) — e mostra `Badge variant="nuovo"` per i
profili creati negli ultimi 30 giorni. Nuovo campo `createdAt` aggiunto a
`ProfessionalSearchResult` (`packages/shared`) ed esposto dai tre soli
punti che costruiscono quel tipo (`ProfessionalsService.search`/`getById`,
`SavedProfessionalsService.listForUser`) — verificato con una ricerca
mirata che non ce ne fossero altri. Soglia `MIN_PROFESSIONALS_TO_SHOWCASE
= 12` invariata: sotto soglia mostra ancora `WaitlistBlock` (mai una
vetrina finta), confermato che l'ambiente locale ha ≥12 professionisti non
demo e infatti mostra `RealShowcase` con badge "Nuovo" e ordine corretto.

**Foto stock temporanee nel solo carosello vetrina** — richiesta esplicita
dell'utente ("nel frattempo metti immagini finte"), chiarita con
`AskUserQuestion` prima di procedere per il conflitto diretto con il
principio "mai dati/immagini finte" seguito ovunque nel resto del prodotto
(`Avatar.tsx`: "foto vera o iniziali, mai altro"; `WaitlistBlock`: mai una
vetrina finta sotto soglia). L'utente ha scelto esplicitamente **foto
stock di persone** (non illustrazioni astratte) **solo nel carosello
vetrina della home**, con l'intesa esplicita che vengano rimosse prima del
lancio ufficiale — annotato come TODO commentato direttamente nel codice
(`ProfessionalsShowcase.tsx`), stesso pattern "Da fare prima del lancio"
già in uso per Stripe/Cloudinary. Implementato con **randomuser.me**
(servizio pubblico pensato apposta per foto placeholder di persone in
demo/prototipi — non hotlink di contenuto arbitrario non verificato,
distinzione esplicitamente rilevante dato che CLAUDE.md aveva già
segnalato la cautela su questo punto per le icone categoria in una nota
precedente): assegnazione deterministica per id professionista (hash
stabile su 10 foto), così lo stesso profilo mostra sempre la stessa foto
invece di "mischiarsi" ad ogni reload. **Deliberatamente non toccato**
`Avatar.tsx` (rimane "foto vera o iniziali, mai altro" ovunque nel resto
del sito — ricerca, profilo pubblico, dashboard): il fallback finto è
iniettato solo dentro `RealShowcase` passando un `imageUrl` calcolato
all'`Avatar` esistente, nessuna modifica al componente condiviso.

**Correzione post-verifica: ombre troppo marcate (quattro giri, fino a
zero)** — segnalato dall'utente dopo la prima passata ("troppo scure le
varie ombre, ad esempio delle card dei professionisti dopo la ricerca e
del carosello sulla home con la lista"), poi tre volte di seguito ("ancora
meno ombra"/"ancora meno") dopo ogni correttivo. Causa reale del primo
sintomo: l'ombra di `Surface` (originale `shadowRadius: 14`, offset
verticale 6, opacità α~0.14) si estendeva abbastanza da sovrapporsi
visivamente con la card successiva in una lista fitta
(`ResultsListWithMap.tsx`, gap `$3`), leggendosi come una riga scura
continua tra le card invece che come una profondità soffice isolata. Dopo
due giri di solo attenuare l'opacità/raggio, il quarto giro ha cambiato
approccio: **nessuna ombra di default** per ogni superficie "in flusso"
(card in lista, hero, header, caroselli) — `Surface.tsx` default,
`SearchBar.tsx`, `CategoryCarousel.tsx` (frecce), `ProfessionalsShowcase.tsx`
(card vetrina) hanno `shadowRadius`/`boxShadow` azzerati del tutto,
contando solo sul contrasto bianco-su-pesca per separare gli elementi.
Un accenno di ombra (α 0.015–0.02, raggio 4–6) resta **solo** dove
un'ombra ha una funzione reale — una superficie sollevata sopra altro
contenuto, non semplicemente una card nel flusso normale: `Surface`
variante `floating` (dropdown/modali), `AccountMenu.tsx` dropdown,
`MegaMenu.tsx` pannello, `SiteHeader.tsx` sticky solo mentre `scrolled`.
Verificato via screenshot Playwright dopo ciascuna delle quattro
correzioni sulla stessa pagina di risultati ricerca.

**Altri residui "vecchio stile" trovati durante la verifica pagina per
pagina** (non previsti nel piano iniziale, scoperti solo con screenshot
reali, non con la sola lettura di codice):
- `/per-professionisti` non era mai stato toccato da nessuna fase del
  redesign precedente: usava ancora `H1`/`H2`/`Paragraph` e token Tamagui
  stock (`$blue2`, `$blue10`, `$color4`/`$color9`, `$red10`) — la pagina
  più vistosamente "vecchio stile" del sito, un hero blu chiaro e bottoni
  blu stock in un sito ormai verde smeraldo ovunque. Riscritta sui
  primitivi condivisi (`Surface` per le pricing card, `Button
  variant="primary"/"secondary"`, `brand.*`).
- `SearchHeader.tsx` (header di `/cerca`/`/cerca/[categoria]`, la barra di
  ricerca sopra i risultati): sfondo `$blue2` residuo, mai convertito
  in `brand.cianografiaVelo` — visibile come una sottile tinta blu-grigia
  dietro la `SearchBar`, in contrasto con lo sfondo pesca del resto della
  pagina.
- `AccountMenu.tsx`, `SiteHeader.tsx` (link "Come funziona"/"Prezzi"),
  `GoogleSignInButton.tsx`, `/admin`, `/admin/promuovi`: token Tamagui
  stock (`$color9`-`$color12`, `$red10`, `$green10`, `$borderColor`)
  sparsi, mai convertiti. `GoogleSignInButton.tsx` mantenuto
  deliberatamente **neutro** (non verde): un bottone "Continua con Google"
  colorato con l'accento del brand violerebbe le linee guida di branding
  di Google, ricolorato su `brand.gesso`/`brand.filetto`/`brand.grafite`
  invece che sui token grigi Tamagui stock, restando comunque neutro.
  `/admin`/`/admin/promuovi` (nessun link in UI, solo URL diretto, §9):
  stesso trattamento a bassa priorità ma comunque applicato per coerenza,
  nessuna riscrittura strutturale.
- `CategoryCard.tsx` (usata solo da `apps/mobile/app/index.tsx`, non da
  `apps/web`): un solo hover `borderColor: "$blue8"` residuo, corretto a
  `brand.cianografia` — unico punto toccato in questo giro che ha effetto
  visibile su mobile, il resto delle schermate mobile restano
  placeholder "in arrivo" fuori scope (§3).
- **Deliberatamente non toccati**: `CategoryChips.tsx`, `IconFeature.tsx`,
  `TestimonialCard.tsx`, `Hero.tsx` (`packages/ui`) — verificato con una
  ricerca su tutto `apps/web`/`apps/mobile` che non sono importati da
  nessun punto del prodotto: primitivi orfani pre-redesign, zero impatto
  visivo, non rientrano nel principio "niente deve rimanere nel vecchio
  stile" perché non renderizzano mai da nessuna parte.

**Verificato**: typecheck pulito su tutti i package (`shared`, `database`,
`api-client`, `ui`, `api`, `web`, `mobile`), build di produzione `apps/web`
verde (24 route) dopo ogni giro di correzioni. Sessione locale end-to-end
(Postgres+API+web) con screenshot Playwright desktop (1440px) e mobile
(390px) su home, `/cerca`, `/cerca/idraulico`, `/professionista/[id]`,
`/accedi`, `/registrati`, `/per-professionisti`, `/preventivo`, `/urgente`,
`/dashboard`, `/dashboard/profilo`, `/dashboard/agenda`, `/account`,
`/le-mie-richieste`, `/professionisti-salvati` (autenticato con JWT reale
via `localStorage`, account professionista e cliente di test creati e poi
eliminati con `DELETE /auth/me` a fine verifica): zero overflow
orizzontale, zero errori console reali (gli unici osservati — tile
OpenStreetMap, script Google Identity, foto randomuser.me — sono la stessa
limitazione di rete dell'ambiente di sviluppo già documentata altrove in
questo file, non causata da questo rebrand). Header sticky verificato non
duplicato (un artefatto noto di Chromium con `position: sticky` nelle
screenshot `fullPage`, non un bug reale — confermato con uno screenshot
solo-viewport allo scroll iniziale). Zero occorrenze rimaste di
`textTransform="uppercase"` in tutto il monorepo (`apps/web` e
`packages/ui`), zero hex letterali fuori dai token nei punti verificati.

---

## 20. Prenotazione diretta rimossa — ogni fascia apre sempre una richiesta di preventivo, griglia agenda in stile miodottore.it

Richiesta esplicita dell'utente: **nessuna prenotazione istantanea da
ricerca/profilo pubblico**, a prescindere dalla capienza impostata dal
professionista su una fascia (prima solo le fasce "esatte", `maxBookings ===
1`, si prenotavano da sole con `POST /professionals/:id/agenda/book`; quelle
"generiche", `maxBookings > 1`, aprivano già una richiesta di preventivo).
Contestualmente, la vecchia spunta "Permetti ai clienti di prenotare
direttamente le fasce esatte" (`ProfessionalProfile.bookableAgenda`) non ha
più senso — rimossa insieme al meccanismo che governava.

- **Schema**: `ProfessionalProfile.bookableAgenda` rimosso (Prisma,
  `prisma db push --accept-data-loss` in locale — 155 righe non-null perse,
  accettabile: il campo non ha più alcun consumatore). `bookAgendaSlotSchema`/
  `BookAgendaSlotInput` (packages/shared) e l'endpoint `POST
  /professionals/:id/agenda/book` (`ProfessionalsService.bookAgendaSlot`)
  **restano nel backend** (rifiutano ancora esplicitamente le fasce
  generiche con 403, comportamento invariato) ma non hanno più alcun
  chiamante lato frontend — lasciati dormienti invece di rimossi del tutto:
  cancellarli avrebbe richiesto toccare anche tutti i punti che già gestiscono
  correttamente una `Booking` senza `Quote` collegata (creata storicamente
  da questo stesso percorso, es. `formatBookingAddress`,
  `clientAccountDeleted`), un rischio non giustificato da questa richiesta.
- **`ProfessionalDetailContent.tsx`** (profilo pubblico): rimossi
  `handleBookSlot`/`bookingSlot`/`bookingError`/`bookingSuccess` e la
  chiamata a `apiClient.bookAgendaSlot` — ogni fascia libera, esatta o
  generica, è ora un link a `/preventivo?...&data=...&fasciaOraria=...`
  (stesso pattern già in uso solo per le generiche). Rimossa anche la nota
  "Accedi come cliente per prenotare direttamente da questi orari": non più
  pertinente, `GuidedRequestForm` gestisce già da sé il caso "non loggato"
  (redirect a `/accedi?redirect=...`).

**Griglia agenda in stile miodottore.it** — sia nella card di ricerca
(`ProfessionalCard`, `packages/ui`) sia nella sezione "Agenda" del profilo
pubblico, l'anteprima "prossimi orari liberi" (fino a 3 per giorno, giorni
senza nulla di libero saltati) è sostituita da una vera griglia
Oggi+3 giorni: ogni fascia **configurata** in quei giorni compare come riga
(non solo quelle libere), con tre stati — pillola verde cliccabile (libera,
apre la richiesta di preventivo), orario barrato grigio (capienza esaurita,
non cliccabile), "-" (il professionista non ha nulla quel giorno a
quell'orario). "Una volta che quella fascia consuma la capienza non deve
essere più prenotabile" (richiesta esplicita) vale ora uniformemente per
qualunque capienza, non solo per le fasce esatte.
- **`ProfessionalAvailabilityPreviewSlot`** (nuovo tipo,
  `packages/shared/src/professionals.ts`): `{ time, available }`.
  `ProfessionalAvailabilityPreviewDay.times` passa da `string[]` a
  `ProfessionalAvailabilityPreviewSlot[]`, nuovo campo `dateLabel` (es.
  "7 Ago", seconda riga dell'intestazione colonna).
- **`ProfessionalNextAvailableSlot`** (nuovo tipo) + campo
  `ProfessionalSearchResult.nextAvailableSlot`: quando **nessun** giorno
  della finestra visibile ha un orario libero (anche se ne mostra alcuni
  barrati, o anche se non ne ha proprio nessuno configurato), la UI mostra
  al suo posto un riquadro "Prossimo giorno disponibile: 12 Ago, 15:00" +
  pillola "Mostra orari disponibili →" — cercato dal backend fino a
  `PREVIEW_SEARCH_DAYS = 30` giorni avanti, non solo nella finestra di 4
  mostrata. Sulla card di ricerca la pillola naviga come ogni altro slot
  (`/professionista/{id}#agenda`); sul profilo pubblico naviga direttamente
  a `/preventivo` con quella data/fascia precompilate (l'agenda completa a
  14 giorni è già scaricata lì, nessuna ricerca aggiuntiva necessaria: il
  "prossimo libero" per il profilo è calcolato client-side scorrendo
  `agenda.days` già in memoria, un calcolo separato da quello backend usato
  per la sola card di ricerca).
- **`ProfessionalsService.buildAvailabilityPreviews`** riscritta: finestra
  fissa a `PREVIEW_MAX_DAYS = 4` colonne (non più "salta i giorni vuoti,
  fermati al terzo giorno con qualcosa"), ogni fascia esposta con lo stato
  `available` calcolato da `countBookingsInSlot(...) < slot.maxBookings`
  (generalizzazione già esistente, mai stata limitata a `maxBookings: 1`),
  più la ricerca del `nextAvailableSlot` quando la finestra è vuota. Un
  profilo entra nella mappa dei risultati solo se ha qualcosa da mostrare
  (`hasAvailableInWindow || nextAvailableSlot`) — un professionista senza
  agenda, o con agenda sempre esaurita per sempre, non mostra alcuna
  mini-agenda, come già prima.
- **Bug reale corretto durante la verifica** (non solo lettura di codice):
  sul profilo pubblico, il blocco "Agenda" restava condizionato a
  `windowDays.some(day => day.slots.length > 0)` — per un professionista
  con `nextAvailableSlot` ma **zero** fasce configurate nei primi 4 giorni
  (tutte oltre), quella condizione era falsa e l'intera sezione spariva,
  fallback compreso. Corretto in `agendaPreview.hasAvailableInWindow ||
  agendaPreview.nextAvailableSlot` (stesso criterio già usato dal backend
  per includere/escludere un profilo dalla ricerca) — riprodotto e
  verificato con Playwright su un professionista reale con questa
  combinazione di dati.
- **Badge "Online" rinominato** — richiesta esplicita dell'utente: il testo
  "Online" sul badge di `ProfessionalCard` (professionista con
  `remoteAvailable`) poteva far pensare a uno stato di presenza in tempo
  reale ("è online ora"); cambiato in "Offre consulenza online", stesso
  significato già documentato altrove in questo file (consulenza da
  remoto, non presenza istantanea).

Verificato end-to-end con l'API locale (non solo typecheck) e Playwright:
`GET /professionals/search` restituisce `availabilityPreview` a 4 colonne
fisse con stato `available` per fascia e `nextAvailableSlot` quando
pertinente; click su una pillola libera (capienza 1, prima si prenotava da
sola) in `/cerca/idraulico` e sul profilo pubblico apre entrambi
`/preventivo?...&data=...&fasciaOraria=...`, mai una prenotazione diretta;
riquadro "Prossimo giorno disponibile" verificato su entrambe le
superfici, click sulla pillola "Mostra orari disponibili" naviga
correttamente. Typecheck pulito su tutti i package (`shared`, `database`,
`api-client`, `ui`, `api`, `web`, `mobile`), build di produzione `apps/web`
verde (24 route).

**Ombra della tendina "Il mio account" azzerata** — richiesta esplicita
dell'utente, correzione allo stato descritto in §19 ("quattro giri", dove
`AccountMenu.tsx` era rimasta tra i pochi elementi con un accenno di ombra
residuo per essere un vero overlay flottante): azzerata anche lì
(`shadowColor="rgba(43,32,19,0)"`, `shadowRadius={0}`), stessa coerenza
"nessuna ombra" ormai applicata a tutte le altre superfici del sito.

**Menu a discesa homepage tagliato dal pannello hero** — bug reale
segnalato dall'utente ("il menu a tendina... va a finire sotto qualche
altra grafica e non viene visualizzata per intero"): `HomeHero.tsx`
(rebrand "Vicinato", §19) applicava `overflow="hidden"` all'intero
pannello verde per ritagliare le due macchie decorative di sfondo — stesso
identico bug già corretto una volta in `packages/ui/Hero.tsx` (§10, Fase
1) e qui ricomparso nel nuovo hero, che non condivide codice con quello
vecchio. Corretto con lo stesso principio: le macchie decorative hanno ora
un proprio wrapper assoluto con `overflow="hidden"` (stessi bordi
arrotondati del pannello), il resto del pannello (ricerca inclusa) non è
più tagliato. Verificato con Playwright: menu "Cosa cerchi"/"Città" ora
interamente visibile sopra il resto della pagina.

**"Preventivo"/"Richiesta urgente" nella home, fuori dal pannello verde** —
richiesta esplicita dell'utente, poi corretta di posizione nello stesso
giro: un primo tentativo le aveva messe come scorciatoie testuali sulla
destra della riga dei tab "A domicilio"/"Online", dentro `SearchBar.tsx`
(`packages/ui`, nuove prop `onQuoteRequest`/`onUrgentRequest`) — l'utente
ha chiesto di **farle uscire completamente dal riquadro verde** e
mostrarle "appena sotto come due grossi pulsanti". Le due prop sono state
rimosse da `SearchBar.tsx` (tornata alla sola riga dei tab, nessun
residuo): non hanno senso lì una volta spostate fuori dal componente.
`HomeHero.tsx` renderizza ora due `Button` (varianti già esistenti
`primary`/`urgent`, CLAUDE.md §10 Fase 3) affiancati sotto l'intero
pannello verde (non più dentro), stessa larghezza massima del pannello,
`flexWrap` per impilarsi su mobile: "Richiedi preventivo" (icona
`file-text`) e "Richiesta urgente" (icona `zap`, `variant="urgent"` —
stesso token semantico "rosso solo su urgenza" già in uso ovunque nel
prodotto, la resa "grosso pulsante rosso" comunica l'urgenza meglio del
precedente link testuale). Stesso routing di prima (`router.push
("/preventivo")`/`("/urgente")`), solo posizione e resa cambiate.
Verificato con Playwright (desktop e mobile 390px, zero overflow): click
su "Richiedi preventivo" → `/preventivo`, click su "Richiesta urgente" →
`/urgente`, zero errori console. Typecheck pulito su `packages/ui`/
`apps/web`/`apps/mobile`, build di produzione `apps/web` verde.

**Griglia agenda — fascia oraria completa + navigazione ai giorni
successivi** — due richieste esplicite dell'utente sulla stessa griglia
Oggi+3 giorni introdotta in §20: (1) ogni cella deve mostrare l'intera
fascia ("09:00–10:00"), non solo l'orario di inizio; (2) deve essere
possibile scorrere anche ai giorni successivi, non restare bloccati sui
primi 4.
- **Fascia completa**: `ProfessionalAvailabilityPreviewSlot`
  (`packages/shared/src/professionals.ts`) guadagna `endTime`, valorizzato
  da `ProfessionalsService.buildAvailabilityPreviews` insieme a `time`
  (già disponibile su `slot.endTime` a monte, nessuna query aggiuntiva).
  Sul profilo pubblico l'agenda completa (`getPublicAgenda`) aveva già
  `endTime` per costruzione (`ProfessionalAgendaSlot`): lì è bastato
  cambiare la resa testuale da `slot.startTime` a
  `` `${slot.startTime}–${slot.endTime}` ``.
- **Navigazione**: la card di ricerca mostrava solo i primi 4 giorni e mai
  altro. `buildAvailabilityPreviews` ora restituisce `PREVIEW_TOTAL_DAYS =
  14` colonne totali per profilo (stesso orizzonte di `getPublicAgenda`),
  non solo le `PREVIEW_MAX_DAYS = 4` mostrate di default — la UI pagina in
  finestre da 4 colonne sui dati già scaricati, senza una richiesta di
  rete per ogni pagina avanti/indietro. `hasAvailableInWindow`/
  `nextAvailableSlot` (decidono se mostrare la griglia o il riquadro
  "prossimo giorno disponibile" al primo caricamento) restano calcolati
  solo sui primi 4 giorni, invariato — i restanti 10 servono solo alla
  navigazione manuale.
  - `ProfessionalCard.tsx` (`packages/ui`): nuovo stato locale
    `windowOffset` (`useState`, richiede di marcare il file `"use
    client"` — non lo era ancora, stesso bug di build già documentato per
    `SearchBar.tsx`/`Autocomplete.tsx` in Fase 5 secondo giro, qui
    prevenuto aggiungendo la direttiva preventivamente). Frecce
    `chevron-left`/`chevron-right` accanto a "Prossima disponibilità",
    disabilitate (opacità 0.3, non cliccabili) ai due estremi; mostrate
    solo se il professionista ha più di 4 giorni di dati (sempre vero ora
    che se ne scaricano 14, ma il controllo resta per sicurezza). Se la
    pagina raggiunta navigando non ha nulla di libero, niente riquadro
    "prossimo disponibile" (quello vale solo per la primissima finestra,
    offset 0): un testo neutro "Nessun orario libero in questi giorni."
    con le frecce che restano utilizzabili per continuare a scorrere.
  - `ProfessionalDetailContent.tsx` (profilo pubblico): stesso principio,
    stato `agendaWindowOffset` — qui però senza bisogno di query
    aggiuntive dato che `getPublicAgenda` scarica già tutti i 14 giorni in
    un colpo solo lato pagina profilo (`agendaPreview.allDays`, calcolato
    una volta con `useMemo` da `agenda`, la finestra visibile è poi uno
    `slice` dipendente dallo stato di navigazione).
- Verificato con l'API locale (non solo typecheck) e Playwright: risposta
  di `GET /professionals/search` con 14 giorni per profilo e `endTime` su
  ogni slot; card di ricerca con range "09:00–13:00" visibile, click sulla
  freccia avanti sposta la finestra a "Mar–Ven" (11–14 Ago) mostrando
  "Nessun orario libero in questi giorni." per un professionista con
  disponibilità solo più avanti nel mese; stesso comportamento verificato
  sul profilo pubblico (range mostrato, frecce funzionanti, click su una
  pillola libera naviga comunque a `/preventivo?...&fasciaOraria=09:00-10:00`
  corretto). Typecheck pulito su tutti i package (`shared`, `api`, `ui`,
  `web`, `mobile`), build di produzione `apps/web` verde.

**Chi ha annullato, mostrato accanto a "Annullata" in Lavori accettati** —
richiesta esplicita dell'utente: prima l'etichetta rossa "Annullata" non
distingueva se ad annullare fosse stato il cliente o il professionista.
Nuovo campo Prisma `Booking.canceledBy` (enum `BookingCanceledBy`,
`CLIENT`/`PROFESSIONAL`, nullable — `null` per righe annullate prima di
questo campo). Valorizzato nei tre percorsi che possono portare una
prenotazione a `CANCELED`: `BookingsService.cancelForClient` (`CLIENT`),
`BookingsService.cancelByProfessional` (`PROFESSIONAL`, invariato anche
`cancellationNote`) e `BookingsService.updateStatus` quando lo stato
richiesto è `CANCELED` (usato dal calendario "Prenotazioni" —
`PROFESSIONAL`, essendo un metodo chiamabile solo dal professionista,
stessa guardia già esistente su `professionalProfile`). Esposto su
`ProfessionalBooking` (`getMyBookings`) e sul tipo `ClientBooking`
(`BookingsService.listForClient`, in `packages/api-client`, non
`packages/shared` — stessa collocazione già in uso per quel tipo).
Lato UI: `AcceptedJobCard` (`/dashboard`, dove "PROFESSIONAL" equivale a
"tu" da questo punto di vista) mostra "Annullata dal cliente"/"Annullata
da te"; `BookingRow` (`/le-mie-richieste`, dove invece "CLIENT" è "tu")
mostra "Annullata dal professionista"/"Annullata da te" — stesso
`canceledBy`, etichetta diversa a seconda di chi guarda. La riga di stato
di `BookingRow` non era mai stata colorata di rosso per `CANCELED` (solo
`AcceptedJobCard` lo era): corretto nello stesso giro per coerenza, visto
che ora porta un'informazione più specifica ("chi") che merita lo stesso
rilievo visivo già usato altrove per gli stati distruttivi.
`prisma db push` applicato in locale (campo nuovo, nessuna perdita dati).
Verificato end-to-end con l'API locale (non solo typecheck), script
dedicato con cliente+professionista di test e richiesta diretta al
professionista specifico (`professionalProfileId`, evita la selezione dei
lead per rating che nell'ambiente di test — pieno di professionisti "Idraulico"/
"Roma" residui da sessioni precedenti — avrebbe potuto smistare il lead a
un altro professionista): richiesta → preventivo → accettazione →
annullamento lato cliente (`canceledBy: "CLIENT"` confermato su entrambe
le viste, `GET /bookings/me` e `GET /professionals/me/bookings`) e, su una
seconda prenotazione, annullamento lato professionista con nota
(`canceledBy: "PROFESSIONAL"` confermato su entrambe le viste). Account di
test ripuliti a fine script (`DELETE /auth/me`). Typecheck pulito su tutti
i package (`shared`, `database`, `api-client`, `api`, `web`, `mobile`).

**Bug reale: "Accedi con Google" su un'email mai registrata iscriveva
silenziosamente un account cliente** — segnalato dall'utente: "quando faccio
su accedi e poi con google, se non è presente nessun account con quella
email viene iscritto automaticamente come cliente, mentre avevamo detto che
doveva dire che non è presente nessun account con questa e-mail e lo
portasse sulla pagina di registrazione dove c'è la scelta di cliente o
professionista". Causa reale: `AuthService.verifyGoogleToken` creava sempre
un nuovo `User` (ruolo default `CLIENT`) quando nessun account esistente
corrispondeva al token Google, indipendentemente dal fatto che la chiamata
arrivasse da `/accedi` (dove la creazione automatica è sbagliata: un login
non deve mai decidere il ruolo al posto dell'utente) o da `/registrati`
(dove è corretta: l'utente ha già scelto cliente/professionista sulla
schermata di scelta ruolo, §16). Nessun modo di distinguere i due casi
esisteva prima d'ora nello schema della richiesta.
- **`googleVerifySchema`** (`packages/shared`): nuovo campo
  `createIfMissing` (booleano, **default `true`**) — il default preserva
  esattamente il comportamento storico per `/registrati`, che continua a
  chiamare `apiClient.verifyGoogle(idToken, role)` con soli due argomenti
  (il terzo, omesso, diventa `undefined`, eliminato da `JSON.stringify` e
  quindi assente dal body: Zod applica il default `true` sull'assenza della
  chiave, non sul valore `undefined` esplicito — comportamento verificato
  con uno script diretto sullo schema compilato, non solo assunto).
  `/accedi` passa invece esplicitamente `false`.
- **`AuthService.verifyGoogleToken`** (nuovo terzo parametro
  `createIfMissing = true`): se non esiste già un account (né per
  `googleId` né per `email`) **e** `createIfMissing` è `false`, lancia
  `NotFoundException("Nessun account trovato con questa email.")` invece di
  creare l'account — stesso messaggio esatto riusato lato frontend per
  distinguere questo caso specifico da un errore generico (nessun codice
  HTTP strutturato propagato oltre il messaggio dal client HTTP interno di
  `packages/api-client`, quindi il match è sulla stringa del messaggio,
  tenuta identica tra backend e frontend).
- **`apps/web/src/app/accedi/page.tsx`**: `handleGoogleCredential` chiama
  `apiClient.verifyGoogle(idToken, undefined, false)`; nel `catch`,
  `err.message === "Nessun account trovato con questa email."` fa
  `router.push("/registrati?motivo=nessun-account")` invece di mostrare un
  errore generico — nuovo parametro URL, distinto da `?ruolo=`, che non
  determina il ruolo ma solo se mostrare un banner esplicativo.
- **`apps/web/src/app/registrati/page.tsx`**: `RoleChoiceScreen` (la
  schermata di scelta cliente/professionista già esistente, mostrata
  quando `?ruolo=` non è presente/valido) guadagna una prop opzionale
  `noAccountFound`, letta da `searchParams.get("motivo") ===
  "nessun-account"`: mostra un banner rosso "Nessun account trovato con
  questa email. Scegli come registrarti per continuare." sopra le due
  caselle di scelta — la scelta stessa (cliccare "cliente"/"professionista")
  resta identica a prima, nessun comportamento nuovo oltre al banner.
- **`/registrati` non toccato altrove**: la sua chiamata Google
  (`apiClient.verifyGoogle(idToken, role)`, due argomenti) e la logica
  `afterAuth(isNewUser)` restano esattamente come prima — il fix è
  interamente scoped a `/accedi` e al parametro opzionale nello schema
  condiviso.
Verificato end-to-end con l'API locale (non solo typecheck) e Playwright:
non essendo possibile ottenere un vero token Google in questo ambiente
(stessa limitazione di rete già documentata altrove in questo file per lo
script Google Identity), la verifica UI stub-a `window.google` prima del
caricamento pagina (intercettando anche la richiesta verso
`accounts.google.com/gsi/client` per far scattare comunque l'`onload` reale
del componente) e intercetta la risposta di `POST /auth/google/verify` per
simulare sia il caso "account inesistente" (404 col messaggio esatto) sia
il caso "account esistente" (200 con un token JWT reale, ottenuto
registrando davvero un utente via API) — stesso principio già usato in
un giro precedente per `isNewUser` su `/registrati`. Risultati: (1) email
sconosciuta → redirect a `/registrati?motivo=nessun-account`, banner
visibile, schermata di scelta ruolo ancora mostrata (nessuna creazione
account); (2) account esistente → login riuscito, token persistito in
`localStorage`, redirect alla home (nessun blocco falso-positivo per un
utente legittimo); (3) verificato a livello di schema (non solo per
lettura di codice) che la chiamata di `/registrati` continua a risolvere
`createIfMissing: true` mentre quella di `/accedi` risolve `false`, nessuna
regressione sul flusso di registrazione esistente. Zero errori console
(a parte il 404 atteso della richiesta mockata). Typecheck pulito su tutti
i package (`shared`, `api`, `api-client`, `web`).

**Email non salvata dal browser su `/accedi` e `/admin/promuovi`** —
segnalato dall'utente insieme al bug sopra: "quando voglio accedere alla
pagina per admin, non rimangono salvate le mail con cui vi si può
accedere". Causa: il campo Email di `/accedi` non aveva alcun
`autoComplete` (il campo Password aveva già `autoComplete="current-
password"`, ma un gestore credenziali salva la coppia solo se **entrambi**
i campi sono correttamente etichettati); `/admin/promuovi` usa `<input>`
HTML grezzi (non il componente `Field`) senza alcun attributo
`autoComplete`/`name`. Corretto aggiungendo `autoComplete="username"` al
campo Email di `/accedi` (valore standard per l'identificativo di un form
di login, abbinato a `current-password` già presente) e
`autoComplete="email"` + `name="email"` all'`<input type="email">` di
`/admin/promuovi`. Verificato con Playwright: attributo `autocomplete`
presente e con il valore atteso su entrambi i campi.

**Link videochiamata (Meet/Zoom/ecc.) + chiamata WhatsApp diretta** —
richiesta esplicita dell'utente ("procediamo con il link meet e whatsapp"),
seguita a una discussione preliminare su come sviluppare la sezione
"consulenza online" già prevista in CLAUDE.md §1
(`ProfessionalProfile.remoteAvailable`): niente integrazione reale con
Google Meet/Calendar né con l'API Business di WhatsApp (nessuna delle due
è nello stack approvato, §2, e introdurle avrebbe richiesto credenziali/
costi non discussi) — entrambe implementate come link semplici, riusando
dati già raccolti.
- **`Booking.meetingLink String?`** (nuovo campo Prisma, nullable): il
  professionista incolla qui il link della propria videochiamata (Meet,
  Zoom o qualunque altro servizio — nessun vincolo di piattaforma,
  a differenza di un'integrazione reale). Impostabile su **qualunque**
  prenotazione, non solo quelle di un professionista con `remoteAvailable`
  attivo: anche un lavoro tipicamente in presenza può iniziare con una
  videochiamata di sopralluogo. `updateBookingMeetingLinkSchema`
  (`packages/shared`): stringa vuota = link rimosso (stesso pattern di
  `updateBookingNoteSchema`), validazione leggera `http(s)://` solo se non
  vuota. `PATCH /bookings/:id/meeting-link`
  (`BookingsService.updateMeetingLink`): stessa guardia di titolarità già
  in uso per `updateProfessionalNote` (solo il professionista titolare
  della prenotazione può modificarlo). Esposto su `ProfessionalBooking`
  (dashboard professionista) e `ClientBooking` (`packages/api-client`,
  lato cliente) — **visibile ad entrambi**, a differenza di
  `professionalNote` che resta privata: è il cliente che deve poter
  cliccare il link.
- **`BookingDetailPanel.tsx`** (calendario "Prenotazioni") e
  `AcceptedJobCard` (`/dashboard`, tab "Lavori accettati"): stesso pattern
  editor+bottone "Salva link" già in uso per la nota privata (stato locale,
  bottone visibile solo se il valore è cambiato), ma con etichetta "Link
  videochiamata (visibile al cliente)" per non confonderlo con la nota
  privata sopra/sotto. `BookingRow` (`/le-mie-richieste`, tab "Lavori
  accettati"): se `meetingLink` è presente, un link cliccabile "Partecipa
  alla videochiamata" (icona `video`, già nel registro icone) subito sotto
  data/ora — nessun editor lato cliente, è di sola lettura.
- **`buildWhatsAppLink`** (nuovo helper puro,
  `packages/shared/src/professionals.ts`): costruisce un link `wa.me` da un
  numero di telefono già raccolto altrove nel prodotto (nessuna nuova
  richiesta di dato, nessuna API WhatsApp Business) — ripulisce il numero
  da spazi/trattini/`+`, assume il prefisso `39` (Italia, unico mercato di
  lancio, CLAUDE.md §7) se il numero non ne ha già uno esplicito (`+`/`00`
  in testa). Ritorna `null` per un numero vuoto/assente, mai un link rotto.
  Nuova icona condivisa `message-circle` (`packages/ui/src/icons.tsx`/
  `icons.web.tsx`, lucide `MessageCircle`) per il bottone, colorata
  `brand.verificato` (verde, distinto dalla cianografia del telefono/email)
  per distinguerlo visivamente come azione "diretta" alternativa alla
  chiamata.
- **Punti in cui il bottone WhatsApp è comparso accanto al numero di
  telefono già esistente** (mai un punto nuovo isolato — sempre affiancato
  a un link `tel:` già presente): `BookingDetailPanel.tsx` (contatto
  cliente, calendario "Prenotazioni"), `AcceptedJobCard`
  (`/dashboard`, contatto cliente in "Lavori accettati"),
  `ReportNoShowModal.tsx` (contatto professionista, popup "Non presentato"
  lato cliente), `ClientProfileModal.tsx` (scheda cliente aperta dal nome
  in una richiesta ricevuta, `/dashboard`). Non aggiunto dove il numero non
  compare già (es. `LeadCard`, che mostra solo indirizzo/orario prima
  dell'accettazione — il telefono del cliente lì è già visibile altrove,
  vedi §12 "contatto visibile dalla prima richiesta", ma quel punto non
  aveva un link `tel:` da affiancare in questo giro, fuori scope senza una
  richiesta esplicita di aggiungerlo lì).
Verificato end-to-end con l'API locale (non solo typecheck) e Playwright:
script dedicato con professionista+cliente di test e richiesta diretta al
professionista specifico (stesso accorgimento anti-lotteria-lead già
documentato sopra in questo file) — richiesta → preventivo → accettazione
→ `meetingLink` null di default (chiave presente, non assente, su
entrambe le viste) → professionista imposta un link → visibile
immediatamente sia al cliente (`GET /bookings/me`) sia al professionista
stesso (`GET /professionals/me/bookings`) → cancellazione (stringa vuota)
→ torna `null` → link non-URL rifiutato con 400 → tentativo di modificare
il link su una prenotazione di un altro professionista rifiutato (403/404,
guardia di titolarità confermata). `buildWhatsAppLink` verificato con 7
casi (prefisso esplicito `+39`/`0039`, nessun prefisso, numero vuoto/nullo)
tutti corretti. UI Playwright (token JWT iniettato in `localStorage`):
bottone WhatsApp nella dashboard professionista con `href` `wa.me`
corretto dal numero del cliente, campo link videochiamata precompilato con
il valore salvato; lato cliente, link "Partecipa alla videochiamata" con
`href` corretto verso il link Meet impostato dal professionista. Account
di test ripuliti a fine script (`DELETE /auth/me`). Typecheck pulito su
tutti i package (`shared`, `database`, `api-client`, `ui`, `api`, `web`,
`mobile`), build di produzione `apps/web` verde (24 route).

**"Prestazioni offerte" non più etichettata "(opzionale)" + suggerimento
"Consulenza online" tra le prestazioni** — due richieste esplicite
dell'utente, stesso giro. `/dashboard/profilo`: `FieldLabel` della sezione
prestazioni passa da "Prestazioni offerte (opzionale)" a "Prestazioni
offerte" (il campo resta comunque facoltativo lato validazione, solo
l'etichetta cambia). Quando il professionista spunta "Offro anche
consulenza online" (`remoteAvailable`), "Consulenza online" compare ora
tra i chip suggeriti cliccabili sopra la lista prestazioni, insieme a
quelli già suggeriti per la categoria (`POPULAR_SERVICES[categorySlug]`) —
prima la spunta attivava solo il filtro "Online" in ricerca, senza
proporre la prestazione corrispondente tra quelle aggiungibili con un
click. Stesso comportamento "solo il nome, il prezzo resta da compilare a
mano" già in uso per gli altri suggerimenti di categoria. Verificato con
Playwright: chip assente a checkbox non spuntata, presente subito dopo
averla spuntata, click sul chip aggiunge "Consulenza online" come voce
prestazione.

**Eliminazione di una richiesta ricevuta quando l'account del cliente è
stato eliminato** — richiesta esplicita dell'utente: una richiesta il cui
cliente ha eliminato l'account (§16, soft-delete) non è più azionabile
(`QuotesService.createOrUpdate` blocca già l'invio di un nuovo preventivo
su quell'account) e restava altrimenti a ingombrare "Richieste ricevute"
per sempre, senza modo di rimuoverla. Nuovo `DELETE
/professionals/me/leads/:id` (`ProfessionalsService.deleteLead`):
consentito solo se il Lead appartiene al professionista autenticato **e**
`guidedRequest.client.deletedAt` non è `null` — rifiutato con 403 su
qualunque altro lead (account ancora attivo), per non trasformarlo in un
modo generico di far sparire richieste scomode. Elimina solo il proprio
`Lead` (mai la `GuidedRequest`, che può avere altri Lead verso altri
professionisti nello stesso fan-out — CLAUDE.md §14): nessun impatto su
`Quote` già inviate, che non hanno una relazione diretta con `Lead` nello
schema. `LeadCard` (`/dashboard`) mostra un link testuale rosso "Elimina
richiesta" quando `guidedRequest.clientAccountDeleted` è vero, a
prescindere dallo stato del lead (preventivo inviato o no, anche
rifiutato/scaduto) — doppia conferma prima dell'eliminazione vera, stesso
pattern già in uso per "Ritira preventivo"; conferma ricarica l'intera
lista leads (`onChanged`), che di conseguenza non conterrà più la card.
Verificato end-to-end con l'API locale (non solo typecheck) e Playwright:
tentativo di eliminazione prima della cancellazione account rifiutato con
403; tentativo su un lead di un altro professionista rifiutato con 404;
dopo la cancellazione dell'account cliente, eliminazione riuscita e la
richiesta sparisce dalla lista mentre un secondo lead con cliente ancora
attivo resta intatto; doppio tentativo di eliminazione sullo stesso lead
già eliminato rifiutato con 403. UI Playwright: bottone visibile solo per
il lead con account eliminato, doppia conferma funzionante, card sparita
dalla dashboard dopo la conferma.

**Frecce di navigazione dell'agenda ingrandite nel profilo pubblico** —
richiesta esplicita dell'utente: le frecce "Giorni precedenti"/"Giorni
successivi" della griglia agenda su `/professionista/[id]`
(`ProfessionalDetailContent.tsx`, introdotte nella correzione "Griglia
agenda — fascia oraria completa + navigazione ai giorni successivi" più
sopra in questo file) passano da 28×28px (icona 16px, nessuno sfondo) a
40×40px (icona 20px, cerchio pieno `brand.calce`, nessun bordo/ombra) —
stessa resa già in uso per le frecce del carosello categorie in homepage
(`CategoryCarousel.tsx`), riusata qui per coerenza visiva invece di
inventarne una nuova. Nessuna modifica alle frecce equivalenti nella
card di ricerca (`ProfessionalCard.tsx`): la richiesta era scoped
esplicitamente al profilo pubblico ("quando il cliente... ci clicca").
Verificato con Playwright: bounding box della freccia 40×40px sul profilo
pubblico di un professionista con più di 4 giorni di disponibilità.

Typecheck pulito su tutti i package (`shared`, `database`, `api-client`,
`api`, `web`, `mobile`) dopo questi tre interventi, build di produzione
`apps/web` verde (24 route).

**Bug reale: richiesta di preventivo su una fascia esatta (es. 9–13)
sempre rifiutata** — segnalato dall'utente ("stavo provando a prenotare in
una fascia oraria 9-13... mi esce questa scritta"). Causa: `resolveGenericSlot`
(`GuidedRequestsService`, chiamato da `create()` ogni volta che la
richiesta porta `preferredDate`/`preferredTimeSlot`) rifiutava
esplicitamente `slot.maxBookings <= 1` — corretto quando esistevano ancora
le prenotazioni dirette per le fasce esatte (quel percorso, `bookAgendaSlot`,
non passava da qui), ma da quando la prenotazione diretta è stata rimossa
(§20, "ogni fascia apre sempre una richiesta di preventivo, esatta o
generica") il profilo pubblico (`ProfessionalDetailContent.tsx`) linka
**ogni** fascia libera — esatta compresa — a `/preventivo?...&data=...
&fasciaOraria=...`, cioè proprio a questo stesso percorso: da quel momento
ogni tentativo di richiedere una fascia esatta veniva sistematicamente
rifiutato con "Questa fascia oraria non è disponibile per l'invio di una
richiesta di preventivo.". Corretto rimuovendo il vincolo `maxBookings > 1`
(resta solo `!slot`, la fascia deve esistere davvero) — il conteggio
capienza subito dopo in `create()` (basato su `GuidedRequest` con lo stesso
`preferredDate`/`preferredTimeSlot`, non filtrato per stato, comportamento
preesistente non toccato) continua a funzionare correttamente anche per
maxBookings=1: la prima richiesta su quella fascia esatta passa, una
seconda richiesta sulla stessa fascia viene rifiutata con 409 "capienza
già raggiunta" — comportamento corretto per una fascia a capienza 1.
Verificato end-to-end con l'API locale: richiesta su una fascia esatta
9:00–13:00 di **oggi** (stesso scenario segnalato dall'utente) accettata
con successo (prima sistematicamente rifiutata); seconda richiesta sulla
stessa fascia esatta da un secondo cliente correttamente rifiutata con 409.
Typecheck pulito su tutti i package.

**Account professionista: soft-delete invece di cancellazione reale, il
cliente vede "Account eliminato" nei "Lavori accettati" con possibilità di
eliminare la prenotazione** — richiesta esplicita dell'utente. Prima,
`AuthService.deleteAccount` cancellava per davvero il `ProfessionalProfile`
di un professionista che eliminava l'account (`prisma.professionalProfile.
delete()`), che per `onDelete: Cascade` sullo schema portava via in
cascata **anche** tutte le `Booking`/`Review`/`Lead`/`Quote` collegate — un
cliente con una prenotazione passata (magari già completata, con
recensione scritta) perdeva ogni traccia del lavoro svolto non appena il
professionista chiudeva l'account, comportamento mai richiesto e opposto
al principio "traccia completa" già seguito per il soft-delete del
cliente (§16).
- **`ProfessionalProfile.deletedAt DateTime?`** (nuovo campo Prisma,
  simmetrico a `User.deletedAt`): `AuthService.deleteAccount` ora
  aggiorna questo campo invece di cancellare la riga. Nessuno scrubbing dei
  campi del profilo (businessName/città/ecc. restano leggibili — servono al
  cliente per identificare "con chi" aveva a che fare, stesso principio già
  seguito per `recipientName` sui Booking del cliente eliminato).
- **Ogni query pubblica/di discovery su `ProfessionalProfile` filtra
  esplicitamente `deletedAt: null`** (mai affidarsi a un default implicito):
  `ProfessionalsService.search()` (ricerca), `getById()` (profilo pubblico,
  ritorna 404 come se il profilo non fosse mai esistito),
  `GuidedRequestsService.create()` (richiesta diretta a un professionista
  specifico: 404 se il profilo target è stato eliminato — non ha senso
  inoltrare una richiesta a un account chiuso) e
  `matchProfilesForFanOut()` (il fan-out generico esclude i profili
  eliminati dai candidati). **Non toccate deliberatamente**: le query dove
  `professionalUserId` viene dal JWT del professionista stesso (invio
  preventivo, aggiornamento prenotazione, ecc.) — un account eliminato non
  può più autenticarsi con credenziali nuove (email/password/googleId
  azzerati, stesso meccanismo già in uso per il cliente), quel codice resta
  irraggiungibile in pratica senza bisogno di un filtro esplicito, stesso
  principio già documentato per `JwtAuthGuard` in §16.
- **`BookingsService.listForClient`** espone ora
  `professionalAccountDeleted: boolean` (da `professionalProfile.deletedAt
  !== null`) — e `professionalEmail` torna `null` invece dell'indirizzo
  sintetico anonimizzato quando l'account è eliminato, stesso bug già
  corretto in passato per `clientEmail` lato professionista.
- **Nuovo `DELETE /bookings/:id`** (`BookingsService.deleteForClient`):
  il cliente può eliminare dalla propria lista una prenotazione **solo**
  se il professionista ha eliminato l'account (altrimenti 403) —
  simmetrico a `ProfessionalsService.deleteLead` (professionista che
  elimina una richiesta di un cliente eliminato, sezione precedente).
  Cancella la `Booking` per intero (cascata su `BookingFinalItem` e
  sull'eventuale `Review`: quella recensione viveva comunque su un profilo
  non più pubblico, rimuoverla insieme non perde nulla di visibile).
- **`BookingRow`** (`/le-mie-richieste`, tab "Lavori accettati"): quando
  `professionalAccountDeleted` è vero, il nome dell'attività non è più un
  link al profilo pubblico (che non esiste più) ma testo semplice con "·
  Account eliminato" accanto — stesso stile neutro già in uso per "Account
  eliminato" lato professionista (`LeadCard`/`AcceptedJobCard`). Sotto,
  link testuale rosso "Elimina prenotazione" con doppia conferma, stesso
  pattern di `LeadCard.handleDeleteLead`.
Verificato end-to-end con l'API locale (non solo typecheck): ciclo
completo richiesta→preventivo→accettazione→(professionista elimina
l'account) — la prenotazione **sopravvive** (bug di cascata confermato e
corretto: prima sarebbe sparita), `professionalAccountDeleted: true`,
`businessName` ancora visibile, `professionalEmail` `null` (non
l'indirizzo sintetico); il profilo eliminato sparisce da `search()`; il
profilo pubblico ritorna 404; una nuova richiesta guidata diretta a quel
professionista viene rifiutata con 404; eliminazione della prenotazione
da parte del cliente riuscita, doppia eliminazione rifiutata (403/404);
verificato separatamente che un cliente **non** può eliminare una
prenotazione finché il professionista ha ancora l'account attivo (403).
Typecheck pulito su tutti i package (`shared`, `database`, `api-client`,
`api`, `web`), build di produzione `apps/web` verde (24 route).

**Click su un banner "toast" apre l'aggiornamento a cui si riferisce** —
richiesta esplicita dell'utente: prima ogni popup di notifica (§"Popup
'toast' per nuove notifiche...") si limitava a chiudersi al click, senza
portare da nessuna parte. `NotificationToast` (`AuthContext.tsx`) porta ora
anche `type` (il tipo di notifica di origine); nuovo helper
`notificationDestination(type)` in `notificationSections.ts` — riusa le
stesse quattro mappe già esistenti per i numeretti per sezione
(professionista/cliente × richieste/lavori, ogni tipo appartiene sempre a
una sola di queste, mai ambiguo) per restituire `{ page: "/dashboard" |
"/le-mie-richieste", tab: "richieste" | "lavori" }`. `ToastStack.tsx`
naviga lì (`router.push`, con `?tab=...` in query) al click, oltre a
chiudere il toast come già faceva. `/dashboard` e `/le-mie-richieste`
leggono ora `?tab=` (via `useSearchParams`, reattivo — non solo al primo
mount: un click sul toast mentre si è già sulla pagina è una navigazione
superficiale, stessa route, che non rimonta il componente) per selezionare
la tab giusta all'apertura — entrambe le pagine richiedevano di avvolgere
il contenuto in `<Suspense>` per usare `useSearchParams` senza errori in
build (stesso pattern già in uso in `/accedi`/`/registrati`). Verificato
end-to-end con Playwright (non solo lettura di codice, con l'API locale
reale): professionista sulla home, un cliente crea una richiesta diretta
al suo profilo, il popup "🎉 Fantastico! Hai ricevuto una nuova richiesta."
compare tramite il poll reale da 45s (non un evento simulato), click sul
popup naviga a `/dashboard?tab=richieste` con la tab "Richieste ricevute"
selezionata e la richiesta specifica visibile nella lista. Typecheck
pulito su tutti i package, build di produzione `apps/web` verde (24
route).

---

## 21. Cronologia conversazione cliente↔professionista + rifiniture agenda/ricerca

Richiesta esplicita dell'utente: "tieni traccia delle varie conversazioni e
aggiornamenti fatti fra il cliente e il professionista in modo che ognuno
cliccando ad esempio sul preventivo possa vedere la cronologia completa di
quello che è successo con le date dei vari aggiornamenti e il testo... in
lavori accettati, inserisci un pulsante con scritto vai alla richiesta
preventivo, e quindi visualizza tutti gli aggiornamenti" — seguita, nello
stesso giro, da tre richieste aggiuntive: (1) "dai la possibilità ad
entrambi di inserire foto e video dell'aggiornamento dei lavori"; (2)
"sull'agenda del professionista in prenotazioni fai visualizzare la fascia
oraria completa e poi cliccandoci sopra inserisci un pulsante dove ti porta
alla cronologia della richiesta completa"; (3) "quando un cliente cerca il
professionista... dai la possibilità tramite freccetta di far vedere tutte
le prestazioni che offre il professionista poiché ora se ne vedono solo 3".

**Schema — nuovo modello `ConversationEvent`** (non riuso di `Notification`,
che è per-utente ed effimero — marcato "letto", pensato per badge/toast, non
uno storico permanente leggibile da entrambe le parti): `guidedRequestId` +
`professionalProfileId` (la stessa coppia che identifica un "thread" — una
richiesta guidata può aver raggiunto più professionisti, CLAUDE.md §14),
`actor` (enum `CLIENT`/`PROFESSIONAL`/`SYSTEM` — quest'ultimo per gli eventi
automatici del fan-out/espansione, nessuna delle due parti li ha causati
direttamente), `message` (testo già pronto per la UI, non un `type` da
tradurre lato client come `notificationCopy.ts`: qui il testo varia con i
dati reali dell'evento — data proposta, nota scritta, importo finale — mai
fisso per tipo), `mediaUrls` (array, fino a 5, sempre vuoto per gli eventi
automatici).

**`apps/api/src/timeline/timeline.service.ts`** — punto unico di scrittura
(`log()`, richiamato esplicitamente da ogni service che compie l'azione,
stessa convenzione di `NotificationsService.notify()`, mai un trigger
Prisma) e di lettura (`listForUser()`/`addUpdate()`, entrambi verificano che
chi chiama sia il cliente proprietario della richiesta o il professionista
del thread indicato — mai un terzo, nemmeno un altro dei professionisti
coinvolti nello stesso fan-out, stesso principio già seguito da
`GuidedRequestsService.getStatus`). `TimelineModule` importato da
`GuidedRequestsModule`, `QuotesModule`, `BookingsModule`,
`ProfessionalsModule`.

**Eventi automatici agganciati** (un `log()` per ogni punto del ciclo di
vita che genera già una notifica o cambia stato, testo con i dettagli reali
invece di una frase fissa):
- `GuidedRequestsService.create()` — un evento per ogni professionista che
  riceve davvero il Lead dopo la selezione (`MAX_LEADS_PER_REQUEST`,
  CLAUDE.md §14), actor `CLIENT`.
- `GuidedRequestsService.expandLeadQueue()`/`matchNewProfileToOpenRequests()`
  — actor `SYSTEM` (espansione automatica verso il prossimo candidato in
  coda, o coinvolgimento di un professionista appena iscritto).
- `GuidedRequestsService.update()`/`remove()` — actor `CLIENT`, un evento
  per ogni Lead esistente sul thread (modifica dettagli, annullamento).
- `GuidedRequestsService.runExpiryCheck()` (job schedulato) — actor
  `SYSTEM`, sia per un singolo Lead scaduto sia per l'intera richiesta
  chiusa per scadenza.
- `QuotesService.createOrUpdate()` — actor `PROFESSIONAL`: primo invio
  (voci+data), modifica con cambio data, modifica senza cambio data (evento
  comunque tracciato anche se non genera una notifica — richiesta esplicita
  di "tracciare ogni aggiornamento").
- `QuotesService.proposeDate()`/`confirmProposedDate()`/
  `rejectProposedDate()`/`counterProposeDate()`/`rejectByClient()`/
  `withdrawByProfessional()` — un evento per lato per ciascuna transizione
  della trattativa sulla data, con la fascia proposta/confermata e
  l'eventuale nota inclusa nel testo.
- `BookingsService.createFromQuote()` — actor `CLIENT` (accettazione
  diretta).
- `BookingsService.updateStatus()`/`completeWithFinalAmount()`/
  `cancelByProfessional()`/`cancelForClient()`/`reportProfessionalNoShow()`
  — un evento per transizione, incluso l'importo finale
  (`completeWithFinalAmount`) e l'eventuale nota di annullamento. Tutti
  richiedono `include: { quote: true }` sulla query del booking per
  risalire a `guidedRequestId` (assente per le prenotazioni dirette da
  agenda pubblica, `bookAgendaSlot` — dormiente da CLAUDE.md §20 — in quel
  caso nessun evento viene loggato, coerente con "nessun thread senza una
  GuidedRequest").
- `ProfessionalsService.declineLead()` — actor `PROFESSIONAL`, con
  l'eventuale nota di rifiuto.

`apps/api/src/common/format-date.util.ts` (`formatSlotForTimeline`):
formattazione data+fascia per il testo degli eventi, stessa convenzione
"wall clock UTC" già in uso in tutto il modulo agenda (mai convertita al
fuso del browser) — il messaggio è generato lato server e persistito come
testo, deve restare identico a prescindere da chi lo legge in seguito.

**Aggiornamenti scritti a mano, con foto/video** (richiesta esplicita
dell'utente, arrivata mentre il resto della funzionalità era in corso —
non un evento automatico, un vero e proprio messaggio libero):
`timelineUpdateSchema` (`packages/shared`) richiede almeno un testo o
almeno un allegato (mai un evento del tutto vuoto).
`TimelineService.addUpdate()` deduce l'attore da chi chiama (mai passato
dal client) con la stessa verifica di accesso di `listForUser`. Upload
tramite un nuovo endpoint dedicato **aperto a entrambe le parti**
(`POST /guided-requests/timeline-photos`, JWT-guarded ma senza controllo
di titolarità sulla richiesta — a differenza di `POST /guided-requests/
photos`, che è solo per la richiesta guidata originale lato cliente — la
verifica "sei tu il cliente o il professionista di questo thread" avviene
dopo, a `POST :id/timeline` con l'URL già ottenuto), stessa integrazione
Cloudinary (`uploadMedia`, immagine o video, cartella
`timeline-updates`) già in uso per le altre gallerie del prodotto.

**`apps/web/src/components/TimelineModal.tsx`** (nuovo, condiviso tra
dashboard professionista e area cliente): stesso pattern overlay DOM grezzo
di `BookingDetailPanel`/`ClientProfileModal` (`role="dialog"`, chiusura con
Escape/click sul backdrop). Elenco eventi in ordine cronologico (colore per
attore: cianografia/cliente, verde/professionista, grigio/sistema), miniature
cliccabili per gli allegati (`MediaPreview` + `PhotoLightbox`, stesso
componente già in uso per le altre gallerie), form di invio in fondo
(textarea + selettore foto/video con lo stesso pattern "+"/miniatura/tasto
rimuovi già in uso in `GuidedRequestForm`).

**Punti di ingresso** (bottone/link "Cronologia" o "Vai alla richiesta
preventivo" a seconda del contesto — stesso componente ovunque):
- `QuoteCard` (`/le-mie-richieste`, cliente — letteralmente "cliccando sul
  preventivo") e `LeadCard` (`/dashboard`, professionista): link
  "Cronologia" nell'intestazione della card.
- `AcceptedJobCard` (`/dashboard`, "Lavori accettati" professionista) e
  `BookingRow` (`/le-mie-richieste`, "Lavori accettati" cliente): bottone
  "Vai alla richiesta preventivo" — richiesta esplicita dell'utente,
  visibile solo se la prenotazione ha una `guidedRequestId` (assente per le
  prenotazioni dirette da agenda pubblica). Entrambe le pagine risolvono il
  proprio `professionalProfileId` (lato professionista, non esposto altrove
  in queste risposte) con una singola chiamata a
  `apiClient.getMyProfessionalProfile` aggiunta all'effect che carica
  lead/prenotazioni.
- `BookingDetailPanel` (calendario "Prenotazioni" in `/dashboard/agenda`,
  richiesta esplicita successiva dell'utente): nuovo bottone "Vai alla
  cronologia della richiesta" (prop opzionale `onOpenTimeline`, assente per
  prenotazioni senza `guidedRequestId`). Stesso giro: la colonna compatta
  della vista Settimana in `renderBookingDayColumn`
  (`apps/web/src/app/dashboard/agenda/page.tsx`) mostrava solo l'orario di
  inizio della prenotazione — corretto a `HH:MM–HH:MM` (fascia completa),
  stesso principio già applicato ovunque nel prodotto ("non visualizzare
  solo il primo orario ma tutta la fascia d'orario"), resta su una riga
  sola (`numberOfLines={1}` già presente).

**`ProfessionalCard` (`packages/ui`) — "Mostra tutte le prestazioni"**:
richiesta esplicita dell'utente, la card di ricerca troncava sempre a 3
prestazioni senza modo di vederne altre. Nuovo stato locale
`showAllServices`: sopra 3 prestazioni, una riga cliccabile "Mostra tutte
(N)"/"Mostra meno" con icona `chevron-down`/`chevron-up` (nuove chiavi nel
registro icone condiviso, `packages/ui/src/icons.tsx`/`icons.web.tsx`) sotto
l'elenco — `stopPropagation` sul click (stesso pattern già in uso altrove
nello stesso file per non propagare al click della card intera, che naviga
al profilo).

Verificato end-to-end con l'API locale (non solo typecheck) — script
dedicato: richiesta diretta a un professionista specifico → timeline con 1
evento (`CLIENT`, "richiesta inviata") → preventivo inviato → 2° evento
(`PROFESSIONAL`, con voci e data) → cliente legge la stessa timeline → un
professionista estraneo alla richiesta riceve 403 → aggiornamento manuale
del cliente (solo testo) → aggiornamento vuoto (né testo né media)
rifiutato con 400 → aggiornamento manuale del professionista → preventivo
accettato → 5° evento (`CLIENT`, "ha accettato il preventivo") — ordine
cronologico e attore di tutti e 5 gli eventi corretti. Typecheck pulito su
tutti i package (`shared`, `database`, `api-client`, `ui`, `api`, `web`,
`mobile`), build di produzione `apps/web` verde (24 route).

**Bug reale: frecce di navigazione dell'agenda (profilo pubblico) fuori
schermo da cellulare** — segnalato dall'utente con screenshot: la freccia
"Giorni successivi" (40×40px, `ProfessionalDetailContent.tsx`, sezione
Agenda) risultava tagliata a metà sul bordo destro dello schermo, visibile
solo scorrendo orizzontalmente la pagina. Causa: la riga che affianca le
intestazioni dei 4 giorni (`width={90}` ciascuna, 360px totali) e le due
frecce (40+40+gap, ~88px) non aveva alcun `flexWrap` — su un telefono
(~390px di larghezza, meno il padding della card) lo spazio non basta per
entrambi i blocchi sulla stessa riga, e senza wrap le frecce spillavano
oltre il bordo destro invece di andare a capo. Corretto aggiungendo
`flexWrap="wrap"` alla riga contenitore e `flexShrink={0}` al blocco delle
intestazioni giorno (che deve restare su una sola riga, allineato alla
griglia orari sottostante, mai spezzarsi al suo interno): quando lo spazio
non basta, l'intero blocco frecce va a capo sotto le intestazioni invece di
uscire dalla pagina — nessuno scroll orizzontale necessario, richiesta
esplicita dell'utente ("non bisogna scorrere a destra ma entri nella
pagina del telefono"). Verificato con Playwright (non solo lettura di
codice) — prima riprodotto un falso positivo con un nome attività di test
innaturalmente lungo (causa di un overflow di pagina indipendente, nel
bottone "Richiedi un preventivo a ..."), poi con un nome realistico: zero
overflow orizzontale di pagina prima e dopo il click sulla freccia
(`document.documentElement.scrollWidth === clientWidth`), freccia
interamente dentro il viewport (`devices["iPhone 13"]`, 390px). Nessuna
regressione desktop (1280px): le frecce restano sulla stessa riga delle
intestazioni giorno, come prima, screenshot di controllo invariato.

**Bug reale, correzione della correzione sopra: griglia orari dell'agenda
(non solo le frecce) fuori margine da cellulare** — nuovo screenshot
dall'utente (dal sito live su Vercel) con due punti evidenziati: una
pillola barrata "09:00-13:00" quasi al bordo sinistro e uno spazio vuoto
al bordo destro della stessa riga, sintomo dello stesso tipo di overflow
già corretto sopra per le frecce ma questa volta nel corpo della griglia.
Causa: le 4 colonne della griglia (intestazioni giorno + celle orario)
erano fisse a `width={90}` (360px totali) ma senza `flexShrink={0}` — con
il `paddingHorizontal="$4"` della pagina (32px), lo spazio realmente
disponibile su un viewport da 390px è ~358px, **meno** dei 360px richiesti:
un margine negativo di soli 2px in teoria, ma la mancanza di
`flexShrink={0}` lasciava alle singole celle un ammontare di restringimento
non uniforme (una cella con un solo carattere "-" si restringe molto più
di una con un range orario di 11 caratteri), risultando in colonne di
larghezza diversa tra intestazioni e righe orario — lo stesso sintomo
visto nello screenshot (contenuto disallineato/spinto verso i bordi). Non
riprodotto in modo netto in locale su un singolo viewport di test (`iPhone
13`, 390px: overflow di pagina borderline, mai oltre 1-2px), ma il margine
era già troppo risicato per essere considerato sicuro su schermi reali più
stretti o con impostazioni di zoom/densità diverse. Corretto riducendo la
larghezza fissa di colonna da 90 a **78px** (nuova costante
`AGENDA_COLUMN_WIDTH`, stessa larghezza già in uso per lo stesso identico
pattern nella mini-agenda dei risultati di ricerca,
`packages/ui/src/ProfessionalCard.tsx`, dove il problema non si era mai
presentato) sui 4 punti che condividono `width={90}` in
`ProfessionalDetailContent.tsx` (intestazioni giorno + le tre varianti di
cella: vuota "-", barrata/al completo, pillola libera cliccabile) — più
`flexShrink={0}` esplicito su ciascuno, per garantire che intestazioni e
celle orario si restringano sempre in modo identico e restino allineate
anche in condizioni di spazio estremo, invece di affidarsi al
comportamento di default del browser. Verificato con Playwright: zero
overflow di pagina su 390px (l'esatto scenario del secondo screenshot,
riprodotto con una fascia esatta di oggi occupata/barrata + fasce libere
sui 3 giorni successivi, stesso mix del riferimento), con margine di
sicurezza ora ampio (~67px, contro i 2px precedenti) — verificato inoltre
fino a 360px e 375px (larghezze comuni di telefoni Android/iPhone reali)
senza alcun overflow; un overflow residuo di soli 10px compare solo sotto
i 320px (dispositivi come il primissimo iPhone SE del 2016, ormai
irrilevanti nel traffico reale) — non perseguito oltre per non dover
ridurre ulteriormente la leggibilità del testo negli orari. Centri delle
celle verificati numericamente coincidenti con i centri delle rispettive
intestazioni giorno su tutte le colonne (nessun disallineamento). Nessuna
regressione desktop (1280px, zero overflow, layout identico a prima).

**Eliminazione dalla lista per i preventivi ritirati dal professionista** —
richiesta esplicita dell'utente: `ProfessionalsService.deleteLead`
(`DELETE /professionals/me/leads/:id`) permetteva di eliminare una
richiesta dalla lista "Richieste ricevute" solo nel caso "account cliente
eliminato" (CLAUDE.md §20); esteso a un secondo caso, distinto ma con lo
stesso principio ("non tornerà mai più azionabile, ingombrerebbe la lista
per sempre"): un preventivo che il professionista **stesso** ha ritirato
(`Quote.status === "WITHDRAWN"`, `QuotesService.withdrawByProfessional`).
Verificato che la Quote appartenga proprio a questo professionista per
questa richiesta (`guidedRequestId` + `professionalProfileId`, nessuna
relazione diretta Lead↔Quote nello schema, stessa cautela già documentata
in CLAUDE.md §14) prima di consentire l'eliminazione — un preventivo
ancora `SENT` (non ritirato) resta bloccato, così come uno di un altro
professionista. Elimina solo il Lead di questo professionista, mai la
Quote: il cliente deve continuare a vedere il preventivo ritirato nella
propria cronologia (`/le-mie-richieste`) — questa eliminazione riguarda
solo la vista del professionista, stesso principio già seguito per il
caso "account cliente eliminato". Frontend (`LeadCard`, `/dashboard`):
stesso blocco UI già esistente (doppia conferma) ora condizionato su
`canDeleteLead = clientAccountDeleted || quoteWithdrawn`, con etichetta
adattata ("Elimina preventivo ritirato" invece di "Elimina richiesta")
quando il motivo è il ritiro e non l'account eliminato. Verificato
end-to-end con l'API locale (non solo typecheck): eliminazione rifiutata
(403) prima di qualunque preventivo e mentre il preventivo è ancora
`SENT`, riuscita solo dopo il ritiro (`POST /quotes/:id/withdraw`), lead
sparito dalla lista del professionista, cliente che vede ancora il
preventivo ritirato nella propria cronologia (`GET /guided-requests/me`),
un secondo tentativo di eliminazione sullo stesso lead già eliminato
rifiutato. Typecheck pulito su `apps/api`/`apps/web`, build di produzione
`apps/web` verde (24 route).

**Frecce agenda, terza correzione: riga propria sopra i giorni** —
richiesta esplicita dell'utente, ancora insoddisfatto delle due correzioni
precedenti (`flexWrap` sulla riga condivisa, poi la riduzione a
`AGENDA_COLUMN_WIDTH`): "mettile appena sopra i giorni della settimana sul
lato destro senza sforare i bordi del cellulare". Le frecce condividevano
ancora la stessa riga delle intestazioni giorno (`justifyContent="space-
between"` + `flexWrap="wrap"`): su schermi stretti finivano a capo SOTTO
le intestazioni invece che in una posizione prevedibile, e restavano
comunque soggette alla stessa competizione di spazio di quella riga.
Risolto spostandole in una riga propria, indipendente, subito sopra il
blocco intestazioni giorno — `justifyContent="flex-end"` (allineate a
destra, come richiesto), nessun `flexWrap` necessario: un blocco fisso di
soli ~88px (40+8+40) allineato a destra non compete mai per lo spazio con
le 4 colonne da 78px l'una della griglia sottostante (312px), quindi non
sfora mai il bordo del telefono a prescindere dalla larghezza — stesso
principio "due righe indipendenti invece di una condivisa" già
documentato altrove in questo file per situazioni simili. Verificato con
Playwright: freccia "Giorni successivi" interamente dentro il viewport a
390px (`x:332` di `390`, prima proprio quella tagliata a metà nello
screenshot originale dell'utente), zero overflow di pagina prima/dopo il
click, screenshot di conferma con le frecce visibili sopra "Mer/Gio/Ven/
Sab" allineate a destra. Nessuna regressione su griglia (360px/375px
ancora senza overflow, invariato rispetto alla correzione precedente) né
su desktop (1280px, frecce a destra sopra le intestazioni, come da
screenshot di controllo). Typecheck pulito, build di produzione
`apps/web` verde.

## 22. Bug reali, cronologia in stile chat, tipo di intervento (domicilio/online)

Giro di correzioni e funzionalità, tutte richieste esplicite dell'utente
nello stesso turno.

**Bug reale: header mostrava ancora un account eliminato come loggato** —
segnalato con screenshot ("è come se fosse rimasto con l'accesso
effettuato di un account eliminato"). Causa: un JWT emesso prima della
cancellazione (soft-delete, CLAUDE.md §16) resta valido fino a scadenza
naturale per design (`JwtAuthGuard` resta stateless apposta) — ma
`AuthController.me()` non controllava `user.deletedAt`, quindi
continuava a restituire la riga anonimizzata (email sintetica
`deleted-...@deleted.invalid`), mostrata in `AccountMenu` come se
l'utente fosse ancora autenticato. Corretto trattando un account con
`deletedAt` valorizzato come inesistente (`return null`, stesso
comportamento già gestito lato frontend per un token non valido).
`AuthContext.loadUser` ora rimuove anche il token da `localStorage`
quando `/auth/me` risponde `null` (prima solo in caso di errore di
rete): senza, un token di un account eliminato sarebbe stato rispedito
ad ogni ricarico di pagina all'infinito. Verificato con l'API locale:
`/auth/me` con lo stesso JWT dopo `DELETE /auth/me` risponde 200 con
corpo vuoto (interpretato correttamente come `null` sia dal test che da
`packages/api-client`, che già ricade su `null` se `response.json()`
fallisce).

**Bug reale: testo della descrizione non andava a capo** — segnalato con
screenshot ("non si legge, dovrebbe andare a capo") in "Le mie
richieste": stesso bug già documentato e corretto una volta per
`ProfessionalCard` (CLAUDE.md §12) — un blocco flex senza
`flexBasis={0}`/`minWidth={0}` esplicito si dimensiona sulla larghezza
"a contenuto pieno" (non spezzata) del testo invece di rispettare lo
spazio disponibile nella riga, quando condivide la riga con un altro
elemento (qui: lo stato/badge a destra) dentro un contenitore
`flexWrap="wrap"`. Stesso fix applicato sia in `GuidedRequestCard`
(`/le-mie-richieste`) sia in `LeadCard` (`/dashboard`, che aveva già
`flex={1}` ma non gli altri due, stessa causa).

**Rinomina "Le mie visite" → "Le mie richieste"** — voce del menu account
cliente (`accountMenuItems.ts`), corretta a colpo d'occhio più chiara
del nome precedente.

**Unificazione delle etichette che aprono la cronologia** — richiesta
esplicita dell'utente: "Cronologia" (Richieste ricevute/Le mie
richieste), "Vai alla richiesta preventivo" (Lavori accettati, sia lato
cliente che professionista) e "Vai alla cronologia della richiesta"
(click su una prenotazione nel calendario "Prenotazioni") sono lo stesso
identico popup (`TimelineModal`) raggiunto da punti diversi con testi
diversi — tutti rinominati uniformemente in **"Contatta/Cronologia"**.

**`TimelineModal` riscritto come chat con nuvolette colorate** —
richiesta esplicita dell'utente: "crea una sorta di nuvoletta colorata,
differenziando i colori in base a se è il cliente e professionista...
ordina sul lato destro e sinistro del popup in base a chi visualizza".
Nuova prop `viewerRole` (`"CLIENT" | "PROFESSIONAL"`, passata da
ciascuno dei 5 punti di montaggio — 2 in `/dashboard`, 2 in
`/le-mie-richieste`, 1 in `BookingDetailPanel`/`/dashboard/agenda`, ogni
punto conosce già il proprio ruolo per costruzione): i messaggi di chi
sta guardando vanno a destra, quelli dell'altra parte a sinistra (stessa
convenzione di qualunque app di chat) — non un `actor` fisso per lato,
quindi lo stesso evento appare a destra per chi l'ha scritto e a
sinistra per l'altra parte. Sfondo nuvoletta per attore: `cianografiaVelo`
(verde menta, cliente — stesso accento già usato per l'etichetta
"Cliente") e `brand.gesso` (pesca chiaro, già lo sfondo pagina, riusato
qui come tinta neutra per il professionista) — **non** `ottone`: quel
colore resta riservato ai soli contesti di pagamento/boost per
convenzione di progetto. Eventi `SYSTEM` (automatici: fan-out, scadenze,
ecc.) restano centrati senza nuvoletta, non hanno un "lato" essendo di
nessuna delle due parti.

**Notifica + toast cliccabile su un aggiornamento scritto a mano** —
richiesta esplicita dell'utente: prima `TimelineService.addUpdate`
creava l'evento in cronologia ma non notificava mai l'altra parte (a
differenza di ogni altro evento del ciclo di vita del preventivo, che
notifica sempre). Due nuovi tipi di notifica (non uno solo, per
rispettare la stessa convenzione già in uso ovunque — "ogni tipo
corrisponde sempre allo stesso ruolo destinatario", necessaria per
instradare correttamente il click sul toast):
`TIMELINE_MESSAGE_FROM_CLIENT` (ricevuta dal professionista) e
`TIMELINE_MESSAGE_FROM_PROFESSIONAL` (ricevuta dal cliente).
`TimelineModule` importa ora `NotificationsModule`; `resolveActor` è
stato esteso (`resolveActorWithParticipants`) per ritornare anche gli id
utente di entrambe le parti del thread, così `addUpdate` sa a chi
notificare (sempre l'altra parte, mai chi ha appena scritto) senza una
query aggiuntiva. Entrambi aggiunti a `PROFESSIONAL_RICHIESTE_TYPES`/
`CLIENT_RICHIESTE_TYPES` (`notificationSections.ts`): stesso numeretto
per sezione e stesso comportamento "click sul toast apre la pagina
giusta" già in uso per ogni altra notifica, nessun meccanismo nuovo.

**Tipo di intervento (a domicilio/online) sulla richiesta di preventivo** —
richiesta esplicita dell'utente: "in modo che il professionista già sa se
può trattarsi di un intervento a domicilio o online". Nuovo enum Prisma
`ServiceMode` (`HOME`/`ONLINE`) + campo `GuidedRequest.serviceMode`
(nullable: righe esistenti prima di questa funzionalità restano senza,
stessa convenzione già in uso per altri campi opzionali di questo
modello) — obbligatorio lato Zod alla creazione
(`guidedRequestSchema.serviceMode`), facoltativo alla modifica (stesso
pattern "sostituzione solo se presente" già in uso per `photoUrls`).
Due caselle cliccabili "A domicilio"/"Online" in `GuidedRequestForm`
(`/preventivo`, `/urgente`), stesso stile a pillola già in uso per la
selezione categoria nello stesso form. Mostrato come riga con icona
(`house`/`video`) sia in `LeadCard` (`/dashboard`, "Richieste ricevute")
sia in `GuidedRequestCard` (`/le-mie-richieste`, "Le mie richieste").
**Non ancora implementato in questo giro** (esplicitamente rimandato,
scope troppo ampio per lo stesso turno): far sì che le successive
trattative su data/orario (proposta cliente, controproposta
professionista, scelta della fascia per il primo preventivo) mostrino
solo le fasce dell'agenda del professionista compatibili con la stessa
modalità (online/domicilio) della richiesta originale — oggi il
selettore di fasce in questi flussi resta invariato, mostra tutte le
fasce libere indipendentemente dalla modalità. Resta inoltre distinta e
non ancora affrontata la richiesta, più ampia, di poter impostare
online/domicilio **per singola fascia dell'agenda** (con capienza
massima separata per tipo, badge "online" sulla pillola, tab
online/domicilio nella mini-agenda di ricerca) — un'estensione del
modello `AvailabilitySlot` non ancora iniziata.

Verificato end-to-end con l'API locale (non solo typecheck) e Playwright:
`/auth/me` con token di un account appena eliminato risponde in modo che
il frontend lo interpreti come `null` (logout); richiesta guidata senza
`serviceMode` rifiutata con 400, con `serviceMode: "ONLINE"` accettata e
visibile identica su entrambi i lati (cliente e professionista); un
aggiornamento manuale scritto dal cliente genera una notifica
`TIMELINE_MESSAGE_FROM_CLIENT` per il professionista. UI: badge "Contatta/
Cronologia" e "A domicilio" verificati a schermo; messaggio scritto dal
cliente appare a destra quando il cliente stesso riapre la cronologia e a
sinistra quando la apre il professionista (e viceversa per un messaggio
scritto dal professionista); zero overflow orizzontale su mobile (390px)
e desktop (1280px) su "Le mie richieste" con la descrizione lunga del
bug originale. Typecheck pulito su tutti i package (`shared`, `database`,
`api-client`, `api`, `web`), build di produzione `apps/web` verde (24
route).

## 23. Capienza indipendente per modalità (a domicilio/online), filtro data/orario a valle, pannello filtri ricerca + lingue parlate

Completamento dei tre punti lasciati in sospeso a fine §22 (richiesta
esplicita dell'utente "Continua tutto", ripresa dopo la sessione
precedente).

**Capienza indipendente per modalità sulla singola fascia oraria** —
richiesta esplicita dell'utente, testo originale: due caselle "a
domicilio"/"online" nel pop-up di modifica fascia (`SlotEditorModal`),
almeno una obbligatoria per salvare, ciascuna con il proprio numero
massimo di prenotazioni — non una sola capienza condivisa. Un professionista
può quindi offrire, sulla stessa fascia oraria, es. 1 intervento a
domicilio E 5 consulenze online: due pool di capienza indipendenti, non
uno condiviso.
- **Schema**: `AvailabilitySlot.maxBookings` (singolo) sostituito da
  `allowsHome`/`allowsOnline` (booleani) + `homeMaxBookings`/
  `onlineMaxBookings` (interi opzionali, valorizzati solo quando il
  rispettivo `allows*` è vero) — `prisma db push --accept-data-loss`
  applicato in locale (263 valori `maxBookings` esistenti persi,
  accettabile: dati di sviluppo). `Booking.serviceMode` (nuovo campo
  nullable) copiato dalla `GuidedRequest`/richiesta originale al momento
  della creazione, in tutti e tre i punti che creano una `Booking`
  (`BookingsService.createFromQuote`, `QuotesService.confirmProposedDate`) —
  necessario per contare le prenotazioni esistenti separatamente per
  modalità (`countBookingsInSlot`, `apps/api/src/professionals/
  professionals.service.ts`, esteso con un parametro `mode` opzionale).
- **Validazione** (`packages/shared/src/schemas.ts`,
  `availabilitySlotSchema`): `.refine` che rifiuta l'intero payload se né
  `allowsHome` né `allowsOnline` sono veri — stessa validazione applicata
  lato client (errore "dal vivo" nel pop-up, bottone "Salva" disabilitato)
  e lato server (`ZodValidationPipe`).
- **`SlotEditorModal`** (`apps/web/src/app/dashboard/agenda/page.tsx`):
  due caselle "A domicilio"/"Online", ciascuna con un campo numerico
  capienza visibile solo se la casella è spuntata. `SlotChip` mostra una
  piccola icona `video` quando la fascia offre la modalità online
  (richiesta esplicita dell'utente: "deve comparire il simbolo online in
  piccolo sull'orario").
- **Backend, tutti i punti che leggevano/scrivevano `maxBookings`
  riscritti mode-aware**: `ProfessionalsService.buildAvailabilityPreviews`
  (mini-agenda di ricerca, ora calcola `homeAvailable`/`onlineAvailable`
  indipendenti e due `nextAvailableSlot` separati, uno per modalità),
  `getPublicAgenda` (`home`/`online` due oggetti `{maxBookings,
  bookedCount}` indipendenti per fascia, `null` quando quel tipo non è
  offerto), `getMyAvailableSlots` (usato per scegliere la data di un
  preventivo: `homeAvailable`/`onlineAvailable` booleani per fascia),
  `upsertMyAvailability`/`getMyAvailability`, `bookAgendaSlot` (dormiente,
  §20 — capacità controllata su entrambe le modalità). Nel modulo
  `guided-requests`: `resolveGenericSlot` accetta ora un parametro
  `serviceMode` obbligatorio e valida che la fascia offra proprio quella
  modalità (`homeMaxBookings`/`onlineMaxBookings`, 400 esplicito se
  `null`), il riconteggio capienza dentro la transazione Serializable in
  `create()` filtra ora anche per `serviceMode`. Nel modulo `quotes`:
  `resolveFreeExactSlot` (usata da `proposeDate`/`confirmProposedDate`/
  `counterProposeDate`) accetta lo stesso parametro e applica la stessa
  validazione — bug reale trovato e corretto durante l'implementazione: un
  cliente/professionista poteva proporre una fascia che non offriva affatto
  la modalità della richiesta originale (es. una fascia "solo online" per
  una richiesta "a domicilio"), ora rifiutato con 400 e messaggio
  esplicito.
- **Ricerca (`ProfessionalCard`, `packages/ui`) e profilo pubblico
  (`ProfessionalDetailContent`)**: due tab "A domicilio"/"Online" sopra
  "Prossima disponibilità"/l'agenda — richiesta esplicita dell'utente. Il
  tab attivo filtra la griglia a sole le fasce che offrono quella
  modalità (`allowsHome`/`allowsOnline`) e la relativa capienza residua
  (`homeAvailable`/`onlineAvailable`); "Prossimo giorno disponibile" è
  calcolato per modalità (`nextAvailableSlotHome`/`nextAvailableSlotOnline`,
  ProfessionalCard) o dal vivo sui 14 giorni già scaricati
  (ProfessionalDetailContent). Tab di default sulla card di ricerca
  prescelto in base a come si è cercato dalla homepage/pagina risultati
  (`ResultsListWithMap`/`CercaContent`/`CategoryContent` ricevono e
  propagano `defaultMode` da `online` — lo stesso booleano già usato per
  il titolo/copy della pagina risultati).
- **Filtro mode-aware anche nelle fasi successive della trattativa**
  (richiesta esplicita dell'utente: "differenzia sempre se si è partiti
  con una consulenza online anche nelle successive modifiche della data e
  ora"): `GuidedRequestForm.flattenPickableSlots` (orario preferito
  facoltativo quando si arriva dal profilo di un professionista senza una
  fascia già bloccata in URL) filtra ora per la modalità scelta nel form
  (`serviceMode`), con un nuovo `?modalita=` in coda ai link delle pillole
  dell'agenda pubblica (letto come prefill, non bloccato — il backend
  rivalida comunque). `LeadCard` (`/dashboard`, invio preventivo/
  "Modifica" su una proposta) filtra `availableSlots` con
  `modeAvailableSlots` in base a `lead.guidedRequest.serviceMode`.
  `QuoteCard` (`/le-mie-richieste`, "Modifica"/proponi altra data) riceve
  un nuovo prop `serviceMode` (da `request.serviceMode`) e filtra allo
  stesso modo `startChoosingDate`. Un valore `serviceMode` nullo (richieste
  precedenti a questa funzionalità) ricade sempre su "a domicilio" per
  compatibilità.
- Verificato end-to-end con l'API locale (non solo typecheck): fascia con
  capienza online=2/domicilio=1 indipendenti — due richieste online
  accettate, la terza rifiutata (409, capienza online esaurita), una
  richiesta a domicilio sulla stessa fascia comunque accettata (pool
  indipendente), una seconda a domicilio rifiutata (409, capienza
  domicilio esaurita a sua volta); due fasce separate (una solo-domicilio,
  una solo-online) — proporre la fascia sbagliata per la modalità della
  richiesta rifiutato con 400 esplicito, proporre quella giusta accettato,
  `GET /professionals/me/available-slots` conferma `homeAvailable`/
  `onlineAvailable` corretti e indipendenti per le due fasce. UI
  (Playwright): pop-up fascia con le due caselle e relativo errore di
  validazione quando nessuna è spuntata, tab "A domicilio"/"Online"
  presenti sia sulla card di ricerca sia sul profilo pubblico.

**Pannello filtri di ricerca + lingue parlate** — richiesta esplicita
dell'utente, riferimento miodottore.it (screenshot forniti): bottone
"Filtri" sopra "Mostra mappa" in `/cerca`/`/cerca/[categoria]`
(`ResultsListWithMap.tsx`), apre un pannello con tre filtri — tutti
calcolati client-side sui risultati già scaricati (stesso principio già
seguito per `ListControls`/filtro-ordina-mostra nelle liste
richieste/prenotazioni, coerente con la scala di lancio, CLAUDE.md §7):
nessun nuovo query param lato server.
- **"Consulenza online"**: checkbox, filtra a `remoteAvailable === true`.
- **"Date disponibili"**: Oggi / Entro 3 giorni / Qualsiasi giorno
  (default) — controlla se `availabilityPreview` (già scaricato per la
  mini-agenda di ogni card) ha almeno una fascia libera (home o online)
  entro la finestra di giorni scelta.
- **"Lingua parlata"**: campo di ricerca testuale che filtra un elenco a
  pillole delle sole lingue effettivamente parlate tra i professionisti
  nei risultati correnti (non un elenco fisso) — click seleziona (singola
  selezione, click di nuovo per deselezionare).
- **Nuovo campo `ProfessionalProfile.spokenLanguages`** (Prisma,
  `String[] @default(["Italiano"])`): editabile in `/dashboard/profilo`,
  nuova sezione "Lingue parlate" — stesso pattern chip+tasto rimuovi rosso
  già in uso per le prestazioni, campo di testo libero + "+ Aggiungi"
  (anche invio con Enter). Esposto su `ProfessionalSearchResult` (ricerca,
  profilo pubblico, professionisti salvati) e `MyProfessionalProfile`
  (dashboard). Nessun elenco fisso di lingue nel progetto: stesso principio
  già seguito per `subTags`/`portfolioUrls` (array libero, non un enum).
- Verificato end-to-end con l'API locale (non solo typecheck): profilo
  creato con `spokenLanguages: ["Italiano"]` di default, esposto
  correttamente da `GET /professionals/:id` e `GET /professionals/me`. UI
  (Playwright): bottone "Filtri" presente sopra i risultati, pannello che
  mostra correttamente "Consulenza online", "Date disponibili" (tre
  pillole) e "Lingua parlata" (campo + pillola "Italiano" del
  professionista di test).

Verificato in blocco per l'intero giro (mode-aware capacity + pannello
filtri): typecheck pulito su tutti i package (`shared`, `database`,
`api-client`, `ui`, `api`, `web`, `mobile`), build di produzione `apps/web`
verde (24 route).

**Correzione — pop-up centrato ad accordion, non pannello inline** —
richiesta esplicita dell'utente con screenshot di riferimento
(miodottore.it): il pannello filtri, prima un riquadro che si apriva
inline sotto il bottone "Filtri" (spingendo giù la lista, visibile solo
nella colonna sinistra), è stato sostituito da un vero pop-up centrato
sulla pagina — stesso pattern overlay già in uso altrove nel prodotto
(`ClientProfileModal`, `BookingDetailPanel`, `SlotEditorModal`:
`role="dialog"`, sfondo semi-trasparente, chiusura con Escape o click sul
backdrop, contenuto con `stopPropagation`). Le tre sezioni sono ora ad
**accordion**: un titolo cliccabile con chevron (`ChevronDown`/`ChevronUp`
da lucide-react) per ciascuna, il contenuto compare solo per la sezione
espansa — stato `expandedSection` (`"online" | "availability" |
"language" | null`), una sola sezione aperta alla volta, "Consulenza
online" aperta di default (stesso comportamento del riferimento). Il
checkbox "Consulenza online" è diventato un vero interruttore a levetta
(`filters-switch`, CSS puro — nessuna libreria di componenti UI
aggiunta) invece della checkbox nativa del browser, più vicino al
riferimento. Il footer non ha più i due bottoni "Reimposta filtri"/
"Applica" fianco a fianco: un unico bottone verde a piena larghezza
"Mostra N risultati" (conteggio live ricalcolato ad ogni modifica dei
filtri) chiude il pop-up, richiesta esplicita dell'utente — "Reimposta
filtri" resta come link testuale sopra, ma visibile solo quando almeno un
filtro è attivo (`activeFilterCount > 0`), per non occupare spazio
quando non c'è nulla da reimpostare. Verificato con Playwright
(screenshot): pop-up centrato sopra uno sfondo scurito, accordion
funzionante (aprire "Date disponibili" richiude "Consulenza online" e
mostra le pillole Oggi/Entro 3 giorni/Qualsiasi giorno), bottone "Mostra 5
risultati" con il conteggio corretto. Typecheck pulito, build di
produzione `apps/web` verde.

**Fasce senza una modalità durante la conferma di una data proposta** —
completamento della richiesta "far sì che le trattative su data/orario
mostrino solo fasce compatibili con la modalità della richiesta originale"
(§23): un riaudit di ogni punto della negoziazione ha trovato un ultimo
caso non ancora coperto. `QuotesService.confirmProposedDate` calcolava la
capienza della fascia confermata con `matchingSlot?.onlineMaxBookings ??
1` / `matchingSlot?.homeMaxBookings ?? 1` senza controllare prima se quella
fascia offra davvero la modalità della richiesta — se il professionista
avesse disattivato quella modalità sulla fascia tra la proposta del
cliente e la propria conferma, il codice avrebbe silenziosamente trattato
la fascia come disponibile con capienza 1 invece di rifiutare, stesso bug
già corretto altrove (`resolveFreeExactSlot`) ma non qui. Corretto con lo
stesso controllo esplicito (`modeCapacity === null` → `ConflictException`,
messaggio distinto per online/domicilio) prima del calcolo della capienza.
Verificato con l'API locale: conferma di una data proposta su una fascia a
cui il professionista ha nel frattempo tolto la modalità richiesta ora
rifiutata con 409 e messaggio esplicito, invece di essere accettata
silenziosamente. Typecheck pulito su `apps/api`.

---

## 24. Contenuti homepage riscritti + "social proof" reale (ripristinati dopo un annullamento)

Prima richiesta (identica nella sostanza a quella già descritta più sopra)
implementata, poi annullata su richiesta esplicita dell'utente ("La home
page deve ritornare come prima") subito dopo averla vista — vedi la nota
di ripristino, mai cancellata da questo file per tenere traccia della
decisione. Nello stesso turno successivo l'utente ha richiesto di
**rifare** la stessa riscrittura ("Riprendi tutto"), questa volta con testo
di riferimento più preciso sul copy realmente sostituito. Ripristinata
identica nella struttura (stessi file, stesso `GET /stats/platform`), con
due differenze rispetto al primo giro:
1. **Hero**: testo scambiato rispetto al giro precedente — l'eyebrow
   diventa "Non chiamare a caso. Chiamalo giusto." (prima era la headline)
   e la headline diventa "Trova un professionista vicino a te" (prima era
   l'eyebrow "Qualcuno del quartiere..."), su istruzione esplicita e
   puntuale dell'utente. Bottoni CTA sotto il pannello verde **non
   toccati** in questo giro (restano "Richiedi preventivo"/"Richiesta
   urgente" — non menzionati nella lista di questo turno).
2. **`ProCtaSection.tsx`, colonna "Richieste filtrate dall'IA"**: la
   riscrittura precedente aveva riformulato questa colonna per rimuovere
   la promessa di classificazione automatica via IA (mai implementata).
   Questa volta l'utente ha fornito lo stesso testo originale ma
   esplicitamente marcato come funzionalità futura — nuovo campo
   `comingSoon` su `COLUMNS`, reso come pillola "In arrivo" accanto al
   titolo della colonna quando vero. Testo della colonna riportato quasi
   verbatim alla proposta dell'utente ("...non un 'ciao quanto costa?'.");
   la prima colonna ("Agenda e preventivi") resta senza badge. Questo
   risolve la riserva di onestà del giro precedente: la funzionalità non
   è spacciata come già attiva.
3. **Correzioni di onestà mantenute** (stesso principio del giro
   precedente, non ridiscusso esplicitamente in questo turno): in
   `QualitySection.tsx`, "solo chi ha davvero prenotato un intervento può
   lasciarne una" (non "prenotato e pagato" — nessun pagamento in
   piattaforma per il lavoro) e "non compare mai in ricerca o nel profilo
   pubblico: lo vede solo il professionista a cui scrivi" (non "fino alla
   prenotazione" — l'indirizzo è visibile al professionista dalla prima
   richiesta, §12); in `HomeFaq.tsx`, la risposta a "Devo registrarmi per
   ricevere un preventivo?" resta "Sì, serve un account gratuito..." (non
   "No, ti registri solo se vuoi prenotare" — `GuidedRequestForm` richiede
   già login per **inviare** la richiesta, non solo per prenotare).

Stessi file coinvolti del primo giro: `HomeContent.tsx` (props
`platformStats`, riordino Qualità→Come funziona→FAQ), `HomeHero.tsx`,
`CategoryTile.tsx`, `QualitySection.tsx`, `HowItWorks.tsx`,
`ProfessionalsShowcase.tsx` (`WaitlistBlock`), `ProCtaSection.tsx`,
`HomeFaq.tsx` (nuovo), `PlatformStats.tsx` (nuovo), `apps/api/src/stats/`
(nuovo modulo, `GET /stats/platform`), `apps/web/src/app/page.tsx`,
`packages/api-client/src/client.ts`.

Verificato con l'API locale (non solo typecheck) e Playwright: `GET
/stats/platform` risponde con conteggi reali (145 utenti, 173
professionisti nell'ambiente di sviluppo); eyebrow/headline scambiati
correttamente a schermo; pillola "In arrivo" visibile accanto a "Richieste
filtrate dall'IA"; ordine sezioni confermato (Categorie → Qualità → Come
funziona → FAQ); zero overflow orizzontale desktop (1440px) e mobile
(iPhone 13); zero errori console. Typecheck pulito su tutti i package
(`shared`, `api`, `api-client`, `web`), build di produzione `apps/web`
verde (24 route).

---

## 25. Tipo di intervento come toggle nella richiesta di preventivo

Richiesta esplicita dell'utente: la selezione "A domicilio"/"Online" in
`GuidedRequestForm` (`/preventivo`, `/urgente`) diventa uno vero e proprio
toggle (pista unica con le due opzioni affiancate, quella attiva evidenziata
piena — stesso principio visivo dei tab `SearchBar`, applicato qui inline
perché questo controllo governa anche la visibilità di un intero blocco di
campi sotto, non solo un filtro). Quando si seleziona "Online", il blocco
"Chi riceverà il professionista" (nome, cognome, telefono, via, civico, CAP,
provincia) sparisce del tutto: una consulenza da remoto non richiede di
sapere dove passare. Sotto il campo Città compare invece una nota che spiega
perché l'indirizzo non è richiesto e come recuperarlo se serve comunque
("torna su 'A domicilio' per inserirlo").

- **Schema** (`packages/shared/src/schemas.ts`, `guidedRequestSchema`):
  `address`/`recipientName`/`recipientSurname`/`recipientPhone`/
  `houseNumber`/`postalCode`/`province` passano da obbligatori a opzionali
  a livello di tipo, con un nuovo `.superRefine` che li richiede (stessi
  messaggi di errore di prima) solo quando `serviceMode === "HOME"` — per
  `"ONLINE"` restano tutti facoltativi. Nessuna migrazione Prisma
  necessaria: questi campi su `GuidedRequest` erano già `String?` (erano
  solo la validazione Zod a renderli obbligatori).
  `GuidedRequestsService.create` aggiornato per gestire i campi
  potenzialmente assenti (`input.recipientName?.trim() || null`, ecc.)
  invece di assumerli sempre presenti.
- **`GuidedRequestForm.tsx`**: il blocco destinatario è ora avvolto in
  `{serviceMode === "HOME" ? (...) : null}`; validazione lato client nello
  stesso `handleSubmit` applicata solo quando `serviceMode === "HOME"`. La
  richiesta prefilla comunque questi campi dai dati dell'account non
  appena disponibili (comportamento preesistente, invariato): per un
  account che ha già nome/telefono salvati, una richiesta "Online" può
  quindi comunque portare quei valori nel payload anche se il blocco non è
  mai stato mostrato — dato reale dell'account, non un'invenzione, non un
  problema.
- Verificato end-to-end con l'API locale e Playwright (non solo
  typecheck): blocco destinatario nascosto subito dopo aver selezionato
  "Online" (e quando nessuna modalità è ancora scelta), nota esplicativa
  visibile, blocco che ricompare selezionando "A domicilio"; invio reale
  di una richiesta in modalità "Online" senza compilare alcun campo del
  blocco destinatario riuscito (schermata "Richiesta inviata!", payload
  catturato via `page.route` con `address`/`recipientPhone` assenti).
  Typecheck pulito su tutti i package (`shared`, `api`, `api-client`,
  `web`), build di produzione `apps/web` verde (24 route).

---

## 26. Micro-tool "Quanto costa in media" in homepage

Richiesta esplicita dell'utente: uno strumento in homepage dove si può
cercare scrivendo (e filtrare in base a ciò che si scrive) l'elenco delle
prestazioni realmente inserite dai professionisti nel loro profilo, con
range di prezzo basso-alto — **basato su dati reali della piattaforma**,
mai un dato inventato. L'elenco è visibile subito, non solo dopo aver
scritto qualcosa.

- **Backend** — nuovo `GET /professionals/services/price-index`
  (`ProfessionalsController`/`ProfessionalsService.getServicePriceIndex`,
  pubblico, nessun guard): raggruppa tutte le righe `ProfessionalService`
  con almeno un prezzo impostato (esclude le voci "Su richiesta", che non
  hanno un range da mostrare) per nome normalizzato (trim + lowercase,
  nessuna fuzzy-match: testo libero scritto da professionisti diversi
  resta testo libero, unire voci solo per somiglianza avrebbe rischiato di
  accorpare prestazioni davvero diverse). Per ogni gruppo: nome (dalla
  prima occorrenza, non normalizzato), numero di professionisti che la
  offrono, minimo/massimo aggregato tra tutti. Esclude professionisti
  demo/eliminati (`isDemo: false, deletedAt: null`), stessa esclusione già
  applicata ovunque nel prodotto per non contare dati non reali.
- **`PriceEstimatorTool.tsx`** (nuovo, homepage): un solo fetch iniziale
  (`apiClient.getServicePriceIndex()`), filtro per sottostringa
  case-insensitive calcolato client-side ad ogni tasto — stesso principio
  già in uso per `ListControls`/pannello filtri ricerca (CLAUDE.md §23):
  nessun round-trip di rete ad ogni carattere digitato, coerente con la
  scala di lancio (§7). Sezione intera assente se non c'è ancora nessun
  dato reale (`entries.length === 0`, stessa cautela già applicata alla
  vetrina professionisti/social proof: mai una sezione vuota o con numeri
  finti). Riusa `formatServicePriceRange` (`packages/shared`) già in uso
  per le prestazioni sulla card di ricerca e sul profilo pubblico, invece
  di duplicare la formattazione.
- Montato in `HomeContent.tsx` subito dopo `QualitySection` e prima di
  "Come funziona" — coerente col tema "trasparenza" della sezione
  precedente.

Verificato con l'API locale (non solo typecheck) e Playwright: `GET
/professionals/services/price-index` risponde con dati aggregati reali
(es. "Riparazione perdita", 7 professionisti, range reale); sezione
visibile in homepage con l'elenco già popolato prima di scrivere;
filtrando per "perdita" la voce resta visibile, per una stringa senza
corrispondenze compare "Nessuna prestazione trovata per...". Typecheck
pulito su tutti i package (`shared`, `api`, `api-client`, `web`), build
di produzione `apps/web` verde (24 route).

---

## 27. Contatore "Ha completato N interventi questo mese"

Richiesta esplicita dell'utente: un contatore per professionista visibile
sia sulla card piccola (risultati di ricerca) sia sulla scheda ampia
(profilo pubblico) — dato reale, non un dato inventato.

- **`countCompletedThisMonth`** (nuovo, `apps/api/src/common/completed-jobs.util.ts`):
  conta le `Booking` con `status: "COMPLETED"` il cui `updatedAt` cade nel
  mese di calendario corrente. Nessun campo `completedAt` dedicato nello
  schema: `updatedAt` si aggiorna già al momento della transizione a
  `COMPLETED` (`BookingsService.updateStatus`/`completeWithFinalAmount`),
  quindi è un proxy reale e accurato senza richiedere una migrazione.
  Riusato dai tre soli punti che già costruiscono un
  `ProfessionalSearchResult` (stessa lista già documentata per `createdAt`,
  §19): `ProfessionalsService.search`/`getById` e
  `SavedProfessionalsService.listForUser` — tutti e tre avevano già
  `bookings` incluso per intero nella query (usato anche per
  `rating`/`reviewCount`), nessuna query aggiuntiva.
- **`ProfessionalSearchResult.completedThisMonth: number`** (nuovo campo,
  `packages/shared`) — `ProfessionalDetail` lo eredita automaticamente,
  coprendo sia la card di ricerca sia il profilo pubblico con un solo
  campo.
- **`ProfessionalCard.tsx`** (`packages/ui`): nuova riga "Ha completato N
  intervento/interventi questo mese" (verde `brand.verificato`) sotto la
  città, visibile solo se `completedThisMonth > 0` — uno zero non viene
  mai mostrato come se fosse un dato interessante, coerente con la
  cautela già applicata altrove (mai un numero che fa sembrare vuoto o
  fallimentare qualcosa che semplicemente non ha ancora dati).
  `apps/web`: propagato da `ResultsListWithMap.tsx` e
  `/professionisti-salvati`.
- **`ProfessionalDetailContent.tsx`**: stessa riga, stesso colore, sotto
  il `Rating`/"Nessuna recensione ancora" nell'header del profilo
  pubblico.

Verificato end-to-end con l'API locale (non solo typecheck) e Playwright:
ciclo completo richiesta→preventivo→accettazione→conferma→completamento
per un professionista di test → `completedThisMonth: 1` confermato sia
via `GET /professionals/search` sia via `GET /professionals/:id`; riga
"Ha completato 1 intervento questo mese" visibile sia sulla card di
ricerca (`/cerca/idraulico`) sia sul profilo pubblico. Typecheck pulito su
tutti i package (`shared`, `api`, `api-client`, `ui`, `web`, `mobile`),
build di produzione `apps/web` verde (24 route).

---

## 28. Sezione "Perché esistiamo" in homepage

Richiesta esplicita dell'utente: storia personale del fondatore (Luca,
titolare della piattaforma), testo fornito verbatim — a differenza delle
testimonianze/recensioni fittizie già rimosse altrove nel prodotto (§10,
"mai dati demo pubblicati come reali"), qui è il titolare stesso che
racconta la propria esperienza, non un contenuto inventato da questa
sessione. Nuovo componente `WhyWeExist.tsx`, montato in `HomeContent.tsx`
dopo "Come funziona" e prima della micro-FAQ.

Verificato con Playwright: sezione visibile in homepage con il testo
esatto fornito dall'utente, zero overflow orizzontale, zero errori
console. Typecheck pulito, build di produzione `apps/web` verde
(24 route).

---

## 29. Toggle "Intervento urgente?" — selezionabile dalla homepage, preimpostato in ricerca

Richiesta esplicita dell'utente, in due passaggi nello stesso giro: prima
un filtro "mostra solo chi è disponibile nelle prossime 24h" nella pagina
risultati, poi corretto subito dopo — "Intervento urgente deve essere
selezionabile dalla home page per la ricerca" e "una volta effettuata la
ricerca non servirà più quel pulsante poiché andrà a selezionare già nel
filtro pre impostando disponibilità in 24h". Il controllo si sposta quindi
dall'essere un bottone sempre visibile sopra i risultati a una scelta fatta
**prima** di cercare, che poi arriva già applicata.

- **`HomeHero.tsx`**: nuovo toggle a pillola (icona `Zap`, sfondo
  traslucido bianco sul pannello verde) sotto la `SearchBar`, sopra il
  testo "Ricerca gratuita · Nessuna registrazione" — "Intervento urgente?
  Solo disponibili nelle prossime 24h". Stato locale `urgentOnly`, passato
  a `buildSearchDestination` insieme agli altri parametri di ricerca già
  esistenti (città, modalità, categoria).
- **`buildSearchDestination`** (`apps/web/src/lib/searchNavigation.ts`):
  nuovo parametro opzionale `urgentOnly` → aggiunge `?urgente=1` alla
  destinazione (`/cerca` o `/cerca/[categoria]`), stesso pattern già in uso
  per `?online=1`.
- **`/cerca/page.tsx`** e **`/cerca/[categoria]/page.tsx`**: leggono
  `searchParams.urgente === "1"` e lo passano come `initialUrgentOnly` a
  `CercaContent`/`CategoryContent` → `ResultsListWithMap`.
- **`ResultsListWithMap.tsx`**: `filterUrgentOnly` (già esistente, calcolo
  `hasAvailabilityWithin24h` — finestra scorrevole di 24 ore reali,
  combinando data+ora di ogni fascia come "wall clock UTC", diversa dal
  filtro "Date disponibili" che ragiona per giorno di calendario intero)
  ora si inizializza da `initialUrgentOnly` invece che sempre `false`. Il
  **bottone standalone sempre visibile** (introdotto nel passaggio
  precedente dello stesso giro, mai arrivato a un commit) è stato
  **rimosso**: il controllo si sposta dentro il pannello Filtri, come voce
  della sezione "Date disponibili" (stesso principio: entrambi riguardano
  la disponibilità nel tempo) — resta comunque regolabile lì (accendibile/
  spegnibile, incluso da "Reimposta filtri") per chi vuole cambiare idea
  dopo aver cercato, ma non è più un controllo a sé stante che ingombra la
  barra sopra i risultati. Quando si arriva con `?urgente=1` già in URL,
  la sezione "Date disponibili" del pannello Filtri si apre di default
  (invece di "Consulenza online" come di norma) così il filtro attivo è
  subito visibile aprendo il pannello. `activeFilterCount` (mostrato nel
  bottone "Filtri (N)") include ora anche questo filtro.

Verificato con Playwright (non solo lettura di codice): toggle visibile e
funzionante in homepage (desktop e mobile, zero overflow), click su
"Cerca" con il toggle attivo produce `/cerca?citta=Roma&urgente=1`; sulla
pagina risultati il bottone "Filtri" mostra "(1)", il pannello si apre
sulla sezione "Date disponibili" con l'interruttore già acceso
("Switches ON: 1"), spegnerlo e confermare aggiorna il conteggio
risultati dal vivo e il bottone torna a "Filtri" senza contatore. Zero
errori console (a parte `ERR_TUNNEL_CONNECTION_FAILED`, stessa limitazione
di rete dell'ambiente di sviluppo già documentata altrove in questo file).
Typecheck pulito su `apps/web`, build di produzione verde (24 route).

---

## 30. Sezione "Garanzia Piattaforma" in homepage

Richiesta esplicita dell'utente, testo fornito verbatim. A differenza di
ogni altra sezione della homepage — dove non si pubblica mai una promessa
non corrispondente a una funzionalità reale (regola seguita fin dall'inizio
del progetto: mai dati/stat finti, mai testimonianze inventate) — questa
sezione promette esplicitamente cose non ancora implementate: verifica
documenti/assicurazione RC dei professionisti, pagamento protetto in
piattaforma (il pagamento per il lavoro resta rimandato, §9), mediazione
in caso di controversia. Prima di procedere ho chiesto conferma via
`AskUserQuestion` proprio per questo motivo; l'utente ha risposto
**"Pubblicale come scritte"**, assumendosene esplicitamente la
responsabilità come titolare della piattaforma — decisione che vale anche
per le due sezioni analoghe ancora da fare ("Cosa succede se...", footer
con loghi RC/associazione/pagamenti).

`apps/web/src/components/PlatformGuarantee.tsx` (nuovo): eyebrow "Garanzia
Piattaforma", titolo "Ogni intervento è coperto dalla Garanzia
Piattaforma", tre punti su un'unica `Surface` (icona spunta verde + testo)
con il testo esatto fornito dall'utente — nessun badge "in arrivo" qui
(diverso dal caso "Richieste filtrate dall'IA" in `ProCtaSection`, dove
l'utente aveva invece chiesto di segnalarlo come funzionalità futura):
l'istruzione qui è di pubblicare il testo così com'è. Montata in
`HomeContent.tsx` subito dopo `QualitySection` (stessa area "fiducia"
della pagina, prima del micro-tool prezzi).

Verificato con Playwright: sezione visibile con tutti e tre i punti,
identici al testo fornito, zero overflow orizzontale desktop/mobile, zero
errori console. Typecheck pulito, build di produzione `apps/web` verde
(24 route).

---

## 31. "Prezzo totale medio" + totali min/max nei preventivi ricevuti

Richiesta esplicita dell'utente: quando il cliente invia una richiesta di
preventivo generica (fan-out categoria+città, non diretta al profilo di un
professionista specifico) con almeno 1 risposta, mostrare "prezzo totale
medio"; e in ogni preventivo ricevuto, sotto le voci, un riquadro con il
totale dei minimi e uno con il totale dei massimi.

- **`GuidedRequest.professionalProfileId`** (già esistente nello schema,
  valorizzato solo quando la richiesta nasce dal profilo di un
  professionista specifico — vedi CLAUDE.md §14) esposto ora anche da
  `GuidedRequestsService.listForClient`/`ClientGuidedRequest`
  (`packages/api-client`): distingue una richiesta "generica" (`null`) da
  una diretta, condizione richiesta esplicitamente dall'utente per il
  calcolo del prezzo medio.
- **`packages/shared/src/professionals.ts`**: tre nuovi helper puri —
  `formatEurCents` (stesso pattern di formattazione già usato in
  `formatServicePriceRange`), `quotePriceTotals` (somma minimi e massimi
  delle voci di un preventivo: una voce "Su richiesta", senza alcun
  estremo indicato, non contribuisce a nessuno dei due totali — non è una
  spesa a 0€), `averageQuoteTotalEurCents` (media del punto medio
  (min+max)/2 di più preventivi, `null` se nessuno ha un prezzo indicato).
- **`GuidedRequestCard`** (`/le-mie-richieste`): riquadro verde "Prezzo
  totale medio: X €" (icona `coins`, nuova nel registro icone condiviso)
  mostrato solo se `!request.professionalProfileId && averagePriceEurCents
  !== null` — subito sotto lo stato aggregato "Contattati/Risposto/In
  attesa" già esistente.
- **`QuoteCard`**: sotto le voci del preventivo, due riquadri affiancati
  "Totale minimo"/"Totale massimo" (`quotePriceTotals(quote.items)`) —
  nascosti se nessuna voce del preventivo ha un prezzo indicato.

Verificato end-to-end con l'API locale (non solo typecheck/build) e
Playwright: script dedicato con due professionisti in una combinazione
categoria+città isolata (`falegname`/`Bolzano`, zero professionisti
preesistenti — necessario per evitare che il fan-out intelligente,
CLAUDE.md §14, selezionasse professionisti residui di test invece dei due
nuovi tra i 63+ già presenti su categorie/città comuni) — richiesta
generica con due voci di preventivo ricevute (7000–11000 e
10000–15000 centesimi) → media calcolata a mano (9000+12500)/2=10750
centesimi, confermata identica all'output di `averageQuoteTotalEurCents`;
UI: "Prezzo totale medio: 125.00 €" visibile solo sulla richiesta generica
(screenshot), assente sulla richiesta diretta a un professionista
specifico creata nello stesso script; entrambi i preventivi mostrano
"Totale minimo"/"Totale massimo" corretti. Zero errori console. Typecheck
pulito su tutti i package (`shared`, `api`, `api-client`, `ui`, `web`),
build di produzione `apps/web` verde (24 route).

**Eccezione esplicita alla regola "zero emoji"**: richiesta puntuale
dell'utente di anteporre 👋 all'eyebrow dell'hero homepage ("Non chiamare
a caso. Chiamalo giusto." → "👋 Non chiamare a caso. Chiamalo giusto.",
`HomeHero.tsx`). La regola "zero emoji nell'interfaccia" (§10, Fase 2)
resta la convenzione di default del progetto — questa è un'unica
eccezione puntuale su istruzione esplicita dell'utente, non un'inversione
della regola: nessun altro punto del sito è stato toccato.

---

## 32. Stato richiesta in stile Deliveroo (stepper)

Richiesta esplicita dell'utente: "'richiesta' → 'Preventivo inviato' →
'preventivo accettato' → 'Completato' — Trasparenza totale. Il cliente sa
sempre a che punto è la sua richiesta." — nuovo stepper orizzontale a 4
tappe in ogni card di `/le-mie-richieste`.

- **`apps/web/src/components/RequestStepper.tsx`** (nuovo): componente di
  sola resa (`RequestStepper({ stage })`, 4 cerchi collegati da linee,
  verde+spunta per gli stadi raggiunti, contorno grigio per quelli
  futuri) + `computeRequestStage(quotes)`, funzione pura separata che
  deriva lo stadio (0-3) dallo stato reale — mai un valore inventato:
  0 = richiesta esistente senza preventivi; 1 = almeno un preventivo
  inviato (`quotes.length > 0`); 2 = un preventivo con `status ===
  "ACCEPTED"` (accettarlo crea sempre una `Booking`); 3 = quella
  prenotazione ha `bookingStatus === "COMPLETED"`. Un preventivo accettato
  ma poi annullato (`CANCELED`/`NO_SHOW`) resta fermo allo stadio 2 —
  comportamento corretto, il lavoro non è stato completato.
- **`GuidedRequest.professionalProfileId`** (bug di esposizione a parte,
  §31) non bastava: serviva anche lo stato della prenotazione nata
  dall'eventuale preventivo accettato, mai esposto prima lato cliente.
  `GuidedRequestsService.listForClient` include ora `quotes.booking`
  (relazione inversa 1:1 già esistente sullo schema, `Quote.booking`) e
  espone `bookingStatus: quote.booking?.status ?? null` per ogni
  preventivo in `ClientGuidedRequest.quotes[]` (`packages/api-client`).
- Montato in `GuidedRequestCard` subito sotto l'intestazione (categoria/
  città/descrizione), prima del blocco "Contattati/Risposto/In attesa" già
  esistente — la prima cosa che il cliente vede aprendo una card.

Verificato end-to-end con l'API locale (non solo typecheck/build) e
Playwright: script dedicato con 4 richieste in una combinazione
categoria+città isolata (`climatizzazione`/`Cagliari`, zero professionisti
preesistenti, stesso accorgimento anti-lotteria-lead di §31) portate
rispettivamente a stadio 0 (nessun preventivo), 1 (preventivo inviato, non
accettato), 2 (preventivo accettato → `Booking` creata, mai completata) e
3 (stessa prenotazione portata a `COMPLETED` via `PATCH /bookings/:id/
complete`) — `bookingStatus` confermato `null`/`null`/`CONFIRMED`/
`COMPLETED` sui quattro casi rispettivamente. Screenshot Playwright
desktop e mobile (390px): tutti e quattro gli stadi renderizzati
correttamente (cerchi/linee verdi fino allo stadio raggiunto, grigi oltre),
zero errori console. Typecheck pulito su tutti i package (`shared`, `api`,
`api-client`, `ui`, `web`), build di produzione `apps/web` verde
(24 route).

---

## 33. Footer — badge fiducia (assicurazione RC, associazione, pagamenti sicuri)

Richiesta esplicita dell'utente, autorizzati anche se non ancora
implementati ("Inseriscili anche se non ancora implementati") — stessa
decisione di §30/§9 ("Garanzia Piattaforma", "Cosa succede se...").

**Non loghi reali di terzi**: riprodurre il marchio di un'associazione di
categoria o di Stripe/PayPal senza un accordo reale sarebbe un problema a
sé, indipendente dall'autorizzazione a pubblicare promesse non ancora
implementate — quell'autorizzazione copre il testo/la promessa, non l'uso
del marchio altrui. `SiteFooter.tsx` mostra invece tre badge testuali con
icona (nuove `shield`/`credit-card` nel registro icone condiviso,
`packages/ui/src/icons.tsx`/`icons.web.tsx`, verificate presenti sia in
`lucide-react` che `lucide-react-native`): "Professionisti con
assicurazione RC", "Aderente ad associazione di categoria", "Pagamenti
sicuri (Stripe · PayPal)" — riga con separatore sopra la riga di
copyright.

Verificato con Playwright: tutti e tre i badge visibili in homepage,
zero overflow orizzontale desktop/mobile, zero errori console. Typecheck
pulito su `packages/ui`/`apps/web`, build di produzione verde (24 route).

---

## 34. Sezione "Cosa succede se..." in homepage

Richiesta esplicita dell'utente, testo fornito verbatim, stessa
autorizzazione di §30/§33 ("Pubblicale come scritte") — promette
rimborsi/sostituzioni non ancora implementati (nessun pagamento in
piattaforma per il lavoro, CLAUDE.md §9).

`apps/web/src/components/WhatIfSection.tsx` (nuovo): stesso pattern
accordion `<details>/<summary>` già in uso in `HomeFaq.tsx` (nessuna
libreria aggiunta), eyebrow "Cosa succede se..." e le quattro domande/
risposte esatte fornite dall'utente (professionista che non si presenta,
lavoro non fatto bene, preventivo finale più alto, cambio professionista).
Montata in `HomeContent.tsx` subito dopo `PlatformGuarantee` (§30) — stessa
area "fiducia" della pagina, naturale prosecuzione della garanzia
piattaforma.

Verificato con Playwright: tutte e quattro le domande visibili, click sulla
prima espande la risposta corretta, zero overflow orizzontale desktop/
mobile, zero errori console. Typecheck pulito, build di produzione
`apps/web` verde (24 route).

---

## 35. Bug reale: scroll bloccato in "Contatta/Cronologia" (TimelineModal) su mobile

Segnalato dall'utente con screenshot ("non si naviga bene su e giù con
questo finestra aperta") su una conversazione lunga. Causa: il backdrop
del popup (`TimelineModal.tsx`) è un contenitore `position: fixed`,
`display: flex`, `align-items: "center"`, `overflow-y: "auto"` — pattern
noto per rompere lo scroll quando il contenuto supera l'altezza del
viewport (bug diffuso soprattutto su iOS Safari/WebKit): con
`align-items: center` su un flex container con overflow, la parte
superiore dell'elemento che eccede l'altezza disponibile non è
raggiungibile scorrendo, indipendentemente da quanto si scorre verso
l'alto. Corretto cambiando `alignItems: "center"` in `"flex-start"`: il
popup resta centrato orizzontalmente (`justifyContent: "center"`
invariato) ma quando il contenuto è più alto dello schermo si ancora in
alto con lo stesso padding invece di restare centrato verticalmente — via
di fuga strutturale al bug, non una correzione specifica di un browser,
valida su qualunque motore di rendering.

**Stesso pattern presente in altri overlay** (`CompleteJobModal.tsx`,
`ReportNoShowModal.tsx`, `CancelBookingModal.tsx` — tutti con
`alignItems: "center"` + `overflowY: "auto"` sul backdrop): non toccati in
questo giro, la segnalazione dell'utente riguardava specificamente questo
popup — stesso fix da applicare lì se si presenta lo stesso sintomo.

Verificato end-to-end con l'API locale (non solo lettura di codice) e
Playwright, viewport mobile (`devices["iPhone 13"]`): conversazione di
test con 17 eventi (15 aggiornamenti scritti a mano alternati cliente/
professionista + fan-out + invio preventivo, contenuto totale ~2230px,
viewport ~705px). Prima verifica dell'intervallo di scroll raggiungibile:
`scrollTop` portato programmaticamente da 0 a `scrollHeight - clientHeight`
(1525px, l'estremo inferiore) e viceversa a 0 (l'estremo superiore) —
entrambi raggiunti esattamente. Screenshot a `scrollTop=0` conferma
l'intestazione "Cronologia della richiesta" con il tasto di chiusura
interamente visibile (prima nascosta/tagliata secondo la segnalazione);
screenshot a `scrollTop` massimo conferma il campo "Scrivi un
aggiornamento" e il bottone "Invia aggiornamento" interamente visibili in
fondo. Ambiente di sviluppo privo del motore WebKit reale (solo Chromium
pre-installato, `/opt/pw-browsers/`) — non è stato possibile riprodurre
l'esatto bug di iOS Safari, ma la correzione rimuove la causa strutturale
(non un workaround specifico di un motore), verificata comunque con
l'intervallo di scroll completo raggiungibile su Chromium. Zero errori
console. Typecheck pulito, build di produzione `apps/web` verde
(24 route).

---

## 36. Bug reale: overflow orizzontale su mobile in "Lavori accettati" (dashboard) e tab richieste/lavori

Segnalato dall'utente con screenshot (riquadro giallo sulla riga di
bottoni "Lavoro terminato"/"Annulla intervento"/"Contatta/Cronologia" che
sfora oltre il bordo destro dello schermo). Due cause distinte, stesso
sintomo:

1. **Riga bottoni di `AcceptedJobCard`** (`apps/dashboard/page.tsx`):
   `<XStack gap="$2" flexWrap="wrap">` aveva già `flexWrap="wrap"` ma
   nessun vincolo di larghezza — una volta finita sulla propria riga (per
   via del `flexWrap` del genitore, `YStack flexDirection="row" ...`), un
   elemento flex senza `width`/`flex` esplicito si dimensiona sul
   contenuto pieno dei suoi figli (i tre bottoni affiancati) invece di
   adattarsi allo spazio disponibile: il proprio `flexWrap` non ha nulla
   contro cui scattare. Stesso identico principio già documentato più
   volte in questo file per lo stesso tipo di bug (CLAUDE.md §12,
   `ProfessionalCard`) — qui riprodotto e confermato via Playwright:
   overflow di pagina di 130px su un viewport di 390px, riga bottoni larga
   484px invece dei ~318px disponibili. Corretto aggiungendo
   `flex={1} minWidth={200}`: ora la riga si adatta allo spazio
   disponibile sulla propria linea e il suo `flexWrap` interno funziona
   davvero, mandando "Contatta/Cronologia" a capo quando non c'è spazio.
2. **Righe tab "Richieste ricevute"/"Lavori accettati"** (stesso
   `<XStack gap="$2" borderBottomWidth={1} ...>` duplicato identico in
   `apps/dashboard/page.tsx` e `apps/le-mie-richieste/page.tsx`): nessun
   `flexWrap` affatto — due pillole di testo generoso (con conteggio e
   badge) non entravano affiancate su 390px. Aggiunto `flexWrap="wrap"`
   in entrambi i file: sotto una certa larghezza la seconda pillola va a
   capo invece di sforare.

Verificato con Playwright (non solo lettura di codice), API locale reale:
professionista con un lavoro `CONFIRMED` e `guidedRequestId` valorizzato
(tutti e tre i bottoni visibili insieme, il caso peggiore). Prima del fix:
overflow di pagina 130px. Dopo: overflow 0px su viewport 390px,
screenshot di controllo con tab impilate e "Contatta/Cronologia" andato a
capo sotto gli altri due bottoni, nessuna riga che sfora il bordo destro.
Typecheck pulito, build di produzione `apps/web` verde (24 route).

## 37. Città facoltativa in "Richiedi un preventivo" per un intervento online

Richiesta esplicita dell'utente, con screenshot: "in questa schermata la
città poiché si è selezionato online non dev'essere obbligatoria. Nella
spiegazione poco sotto, deve esserci scritto che non è obbligatorio
inserire la città, ma se pensi che sia necessario anche un intervento sul
posto successivo puoi iniziare la ricerca nella zona dell'intervento".
Prima di questo giro il campo Città di `GuidedRequestForm` (`/preventivo`,
`/urgente`) era sempre obbligatorio, a prescindere dalla modalità scelta
("A domicilio"/"Online") — a differenza di indirizzo/destinatario, già resi
facoltativi per l'online in un giro precedente (CLAUDE.md §25).

- **`packages/shared/src/schemas.ts`**: `guidedRequestSchema.city` da
  `z.string().min(2)` a `z.string().optional()`, con l'obbligo spostato
  nella stessa `.superRefine` già usata per indirizzo/destinatario (solo
  quando `serviceMode === "HOME"`) — stesso principio, stesso punto del
  codice, nessuna logica parallela. `guidedRequestUpdateSchema` (modifica
  di una richiesta già inviata) ha ricevuto lo stesso trattamento: città
  opzionale col vincolo condizionato a un `serviceMode === "HOME"`
  eventualmente presente nel payload di modifica (il form di modifica non
  permette di cambiare modalità, quindi in pratica questo vincolo lì non
  scatta mai — la modalità resta quella fissata alla creazione).
- **`apps/api/src/guided-requests/guided-requests.service.ts`**:
  - `GuidedRequest.city` resta una colonna **non-nullable** a livello DB
    (nessuna migrazione Prisma): città assente/vuota viene salvata come
    stringa vuota (`input.city?.trim() ?? ""`), stessa convenzione già in
    uso in questo modello per altri campi opzionali.
  - `matchProfilesForFanOut` (il fan-out generico per categoria+città) non
    aveva alcun comportamento definito per una città vuota — prima di
    questo fix sarebbe ricaduto silenziosamente su un match a stringa
    vuota (`profile.city.toLowerCase() === ""`), zero risultati per
    costruzione. Corretto con un ramo esplicito: città vuota → match sui
    soli professionisti con `remoteAvailable: true` (chi offre consulenza
    da remoto), ignorando del tutto il raggio di ingaggio geografico (non
    c'è una zona da cui calcolare una distanza). Città valorizzata →
    comportamento invariato (raggio via `findComuneByName`/haversine,
    CLAUDE.md §13).
- **`apps/web/src/components/GuidedRequestForm.tsx`**: il controllo
  bloccante `if (!city.trim())` in `handleSubmit` si applica ora solo
  dentro il ramo `serviceMode === "HOME"` (stesso spostamento già fatto
  per indirizzo/destinatario). Label del campo diventa "Città
  (facoltativa)" quando la modalità è "Online"; la nota esplicativa sotto
  l'`Autocomplete` città (prima parlava dell'indirizzo, argomento non
  pertinente a questo campo) è stata riscritta col testo richiesto
  dall'utente: la città non è obbligatoria per una consulenza online, ma
  compilarla resta utile se in un secondo momento può servire un
  intervento sul posto, per poter partire da lì con una ricerca nella
  zona.
- **`apps/web/src/app/le-mie-richieste/page.tsx`** (form di modifica
  inline di una richiesta già inviata, `GuidedRequestCard`): stesso
  principio — il controllo `if (!city.trim())` ora si applica solo se
  `request.serviceMode !== "ONLINE"`, più la stessa nota esplicativa
  breve sotto il campo quando la richiesta è online. Corretta anche la
  resa del titolo card (`{categoryLabel} · {city}`) per non lasciare un
  separatore "· " a vuoto quando la città è assente — stesso fix
  applicato al titolo lead in `apps/web/src/app/dashboard/page.tsx`
  (`LeadCard`).
- Verificato end-to-end con l'API locale (non solo typecheck) e
  Playwright: richiesta guidata `ONLINE` senza alcun campo città inviata
  con successo, `matchedProfessionals >= 1` per un professionista con
  `remoteAvailable: true` nella stessa categoria (nessun professionista
  compatibile per raggio geografico, essendo la città assente — solo il
  match per `remoteAvailable` la trova), città salvata come stringa vuota
  sia lato lead professionista sia lato cliente; una richiesta `HOME`
  senza città correttamente rifiutata con 400 (stesso messaggio di prima,
  "La città è obbligatoria."). UI: dopo aver selezionato "Online" compare
  la label "Città (facoltativa)" e la nuova nota esplicativa, il blocco
  destinatario/indirizzo resta nascosto come già prima; invio del form
  senza mai toccare il campo città riuscito (schermata "Richiesta
  inviata!"), payload della `POST /guided-requests` catturato via
  `page.route` conferma l'assenza della chiave `city` nel body. Zero
  overflow orizzontale, zero errori console nuovi (l'unico osservato,
  `ERR_TUNNEL_CONNECTION_FAILED`, è la stessa limitazione di rete
  dell'ambiente di sviluppo già documentata altrove in questo file).
  Typecheck pulito su tutti i package (`shared`, `api`, `api-client`,
  `web`), build di produzione `apps/web` verde (24 route).

## 38. Stepper di stato visibile anche dall'account professionista

Richiesta esplicita dell'utente: "stepper stile deliveroo visualizzabile
anche dall'account professionista, non solo cliente". Lo stepper introdotto
in CLAUDE.md §32 (`RequestStepper`, "Richiesta → Preventivo inviato →
Preventivo accettato → Completato") era montato solo in `GuidedRequestCard`
(`/le-mie-richieste`, lato cliente); `computeRequestStage` si aspettava un
array di preventivi (`{status, bookingStatus}[]`, il fan-out di una
richiesta generica può ricevere più preventivi da professionisti diversi) —
sul lato professionista un `Lead` ha invece **al più un solo** preventivo
proprio (`lead.quote`, non un array).

- **`ProfessionalLead.quote.bookingStatus`** (nuovo campo,
  `packages/shared/src/dashboard.ts`): mancava del tutto lato
  professionista (esisteva già lato cliente su `ClientGuidedRequest.
  quotes[].bookingStatus`, §32) — `ProfessionalsService.getMyLeads`
  include ora anche `booking: true` nella query dei preventivi
  (`quotes: {..., include: { items: true, booking: true } }`) ed espone
  `bookingStatus: quote.booking?.status ?? null`.
- **`apps/web/src/app/dashboard/page.tsx`** (`LeadCard`): montato
  `<RequestStepper stage={computeRequestStage(lead.quote ? [{status:
  lead.quote.status, bookingStatus: lead.quote.bookingStatus}] : [])} />`
  subito dopo l'intestazione della card, stesso posizionamento già in uso
  lato cliente — `lead.quote` singolo avvolto in un array di un solo
  elemento per riusare `computeRequestStage` senza duplicarne la logica.

Verificato end-to-end con l'API locale (non solo typecheck) e Playwright:
script dedicato con richiesta diretta a un professionista specifico (stesso
accorgimento anti-lotteria-lead già documentato altrove in questo file) che
percorre tutti e 4 gli stadi — nessun preventivo (`lead.quote === null`) →
preventivo inviato (`status: "SENT", bookingStatus: null`) → preventivo
accettato (`status: "ACCEPTED", bookingStatus: "CONFIRMED"`) → lavoro
completato (`bookingStatus: "COMPLETED"`) — confermati tutti e 4 via
chiamate dirette a `GET /professionals/me/leads` dopo ciascuna transizione.
UI: le quattro etichette dello stepper (`Richiesta`/`Preventivo inviato`/
`Preventivo accettato`/`Completato`) verificate presenti in `/dashboard`
con un professionista autenticato, zero overflow orizzontale, zero errori
console nuovi. Typecheck pulito su tutti i package (`shared`, `api`,
`api-client`, `web`), build di produzione `apps/web` verde (24 route).

---

## 39. Simbolo "Nuovo" sul singolo preventivo/lavoro aggiornato

Richiesta esplicita dell'utente: "quando c'è un qualsiasi nuovo
aggiornamento riguardante un preventivo o un lavoro metti anche un simbolo
sul preventivo o sul lavoro per far capire che è proprio quello che ha
ricevuto un aggiornamento/modifica/risposta" — i numeretti per sezione
("Le mie richieste (2)") già esistenti (§ precedente "Numeretto di
notifiche...") dicono quante richieste hanno un aggiornamento, non **quale**
preventivo specifico dentro una richiesta con più preventivi ricevuti (una
richiesta generica può raggiungere più professionisti, CLAUDE.md §14).

- **`unreadQuoteIds`** (nuovo, `apps/web/src/lib/notificationSections.ts`):
  stesso principio già in uso per `unreadGuidedRequestIds`/
  `unreadBookingIds` — estrae `quoteId` dal `payload` delle notifiche non
  lette (`NEW_QUOTE`, `QUOTE_DATE_PROPOSED/CONFIRMED/REJECTED/CHANGED`,
  ecc. portano già questo campo, nessuna modifica al backend necessaria).
  `extractPayloadId` (helper condiviso) esteso per accettare anche
  `"quoteId"` come chiave, oltre a `"guidedRequestId"`/`"bookingId"` già
  supportate.
- **`/le-mie-richieste`**: nuovo stato `newQuoteIds` (calcolato nello
  stesso `useEffect` che già recupera lo snapshot di notifiche non lette
  prima di `markNotificationsRead`, stessa sequenza esplicita già in uso
  per evitare la race condition documentata altrove in questo file).
  `GuidedRequestCard` riceve `newQuoteIds` e lo passa a ciascun
  `QuoteCard` figlio come `isNew={newQuoteIds?.has(quote.id)}`: badge
  `Badge variant="nuovo"` ("Nuovo") accanto al nome dell'attività nel
  singolo preventivo aggiornato, non su tutta la card della richiesta.
- **`/dashboard` (`LeadCard`)**: qui un Lead ha al più **un solo**
  preventivo proprio (`lead.quote`, non un array — a differenza del lato
  cliente), quindi lo stesso `isNew` già calcolato per la card
  (`unreadGuidedRequestIds`) basta a indicare che è proprio quel
  preventivo ad essere cambiato: badge `Nuovo` aggiunto accanto
  all'etichetta "Il tuo preventivo" nel blocco che mostra voci/data/note
  del preventivo già inviato.

Verificato: typecheck pulito su tutti i package (`shared`, `api`,
`api-client`, `ui`, `web`), build di produzione `apps/web` verde
(24 route).

---

## 40. Doppia conferma "Lavoro terminato" con foto/video + recensioni bilaterali "doppio cieco"

Tre richieste esplicite dell'utente nello stesso giro, chiarite con
`AskUserQuestion` prima di implementare (il comportamento letterale
richiedeva un'interpretazione per essere conciliato con la semantica già
esistente di `Booking.status`):

1. *"Quando sia che professionista che cliente cliccano su lavoro
   terminato dai la possibilità di inserire delle foto del lavoro
   terminato"* — foto/video sia lato professionista (già cliccava "Lavoro
   terminato" per l'importo finale) sia lato cliente (prima nessuna azione
   equivalente esisteva).
2. *"Dopodiché si aprirà un altro popup... per il cliente per fare una
   recensione al professionista, e per il professionista per fare una
   recensione al cliente"* — nuova funzionalità, prima non esisteva alcuna
   recensione del professionista sul cliente.
3. *"Saranno pubbliche sul profilo solo quando entrambi avranno effettuato
   la recensione"* — "doppio cieco": una recensione scritta non è visibile
   pubblicamente finché non esiste anche quella della controparte.

**Risposte dell'utente alle domande di chiarimento** (testo esatto,
determinano il design):
- *"Servono i completed da entrambi, ma le recensioni saranno subito
  effettuabili (ma pubblicate solo quando entrambe le recensioni saranno
  scritte, a meno che non passano 3 giorni e li si attiva la recensione
  automatica 5 stelle per lavoro completato, dove nell'elenco recensioni ci
  sarà una parentesi scritta con 'recensione automatica')"* — quindi non
  serve aspettare la controparte per scrivere la propria recensione, solo
  per vederla pubblicata.
- La recensione del professionista sul cliente è visibile nella scheda
  cliente (`ClientProfileModal`, già esistente per nome/contatti) — il
  cliente non ha un profilo pubblico in questo marketplace, quindi non
  esiste un "altrove" dove pubblicarla.
- Se una parte non recensisce mai, un limite di giorni fa scattare la
  recensione automatica a 5 stelle per sbloccare comunque quella già
  scritta.

**Design risultante** (nessuna riscrittura del significato di
`Booking.status`): l'azione "Lavoro terminato" del professionista resta
com'era nei meccanismi (imposta `status: COMPLETED` con l'importo preciso,
CLAUDE.md §"Lavoro terminato con importo preciso...") — la sua stessa
azione **è già** la sua conferma, quindi può recensire il cliente subito
dopo. Il cliente ottiene una **nuova azione indipendente**, "Lavoro
terminato" dal proprio lato (visibile solo quando `status === COMPLETED`,
cioè dopo che il professionista ha già segnalato la fine lavori): conferma
+ foto proprie, e SOLO dopo aver confermato può scrivere la propria
recensione del professionista (comportamento pre-esistente di
`ReviewsService.create`, ora con questo vincolo aggiuntivo). Ogni
recensione diventa pubblica solo quando esiste anche quella della
controparte per la stessa `Booking` — verificato per esistenza della
relazione al momento della query, mai un flag denormalizzato `published`
da tenere sincronizzato.

**Schema** (`packages/database`, `prisma db push --accept-data-loss`):
- `Booking.professionalCompletionPhotoUrls String[] @default([])` (foto
  del professionista, già raccolte al momento di "Lavoro terminato") e
  `Booking.clientCompletionPhotoUrls String[] @default([])` (foto del
  cliente, raccolte alla sua conferma).
- `Booking.clientConfirmedCompletedAt DateTime?` — `null` finché il
  cliente non conferma dal proprio lato; è il campo che gate sia la
  seconda azione ("hai già confermato?") sia la possibilità di recensire.
- `Review.isAutomatic Boolean @default(false)` — distingue una recensione
  reale da una generata automaticamente dopo il timeout.
- Nuovo modello **`ClientReview`** (relazione 1:1 con `Booking`, stesso
  pattern di `Review`): `rating`, `comment`, `mediaUrls`, `isAutomatic` — la
  recensione del professionista sul cliente. Nessuna metrica di
  affidabilità collegata (quelle, CLAUDE.md §15, misurano solo il
  professionista).

**Backend**:
- `BookingsService.completeWithFinalAmount` (professionista): accetta ora
  anche `photoUrls` (`completeBookingSchema` esteso, max 5, opzionali),
  persistite su `professionalCompletionPhotoUrls`.
- Nuovo `BookingsService.clientConfirmComplete` (`PATCH
  /bookings/:id/client-confirm-complete`, JWT): consentito solo sulla
  propria prenotazione, solo se `status === COMPLETED` (il professionista
  deve aver già segnalato la fine), rifiutato con 403 se già confermata
  (`clientConfirmedCompletedAt` già valorizzato — una sola conferma).
  Nuovo `clientConfirmCompleteSchema` (`packages/shared`, solo
  `photoUrls`, max 5 opzionali). Un evento in cronologia (`TimelineService.
  log`, "Il cliente ha confermato che il lavoro è terminato.") quando la
  prenotazione ha una `GuidedRequest` collegata.
- `ReviewsService.create` (cliente → professionista): nuovo controllo
  esplicito, 403 se `!booking.clientConfirmedCompletedAt` — "Conferma
  prima che il lavoro è terminato dal tuo lato.".
- Nuovo modulo `apps/api/src/client-reviews/` (`ClientReviewsService`/
  `ClientReviewsController`, stessa struttura di `reviews/`):
  `POST /client-reviews` (professionista → cliente, consentito solo se
  `booking.status === COMPLETED` — la propria stessa azione di
  completamento è già la conferma, nessun campo aggiuntivo da controllare
  a differenza del lato cliente), rifiutato con 409 se già recensito.
  `POST /client-reviews/photos` (upload media, stessa integrazione
  Cloudinary/cartella dedicata `client-reviews` — mai riusare la cartella
  `reviews`, sono due gallerie concettualmente diverse).
- Nuovo `POST /bookings/completion-photos` (`BookingsController`, JWT):
  upload foto/video del lavoro terminato, condiviso da entrambe le parti
  (professionista e cliente) — cartella Cloudinary dedicata
  `booking-completions`, distinta sia da `reviews` che da
  `client-reviews` (concettualmente è "il lavoro svolto", non "il
  giudizio su come è andata" — nessuna delle due gallerie esistenti era
  la sede corretta).
- **Sblocco automatico "doppio cieco"** — `ReviewsService.
  runAutoPublishCheck()` (`@Cron(CronExpression.EVERY_HOUR)`, stesso
  meccanismo `@nestjs/schedule` già in uso per la scadenza dei lead,
  CLAUDE.md §14): per ogni `Review` reale (`isAutomatic: false`) più
  vecchia di `AUTO_REVIEW_AFTER_DAYS = 3` giorni senza una `ClientReview`
  collegata, genera quella mancante a 5 stelle (`isAutomatic: true`) — e
  simmetricamente per ogni `ClientReview` reale senza una `Review`
  collegata. Query filtrate con la sintassi Prisma per relazioni 1:1
  opzionali nulle (`booking: { clientReview: { is: null } } }`), idempotente
  (una seconda esecuzione sulla stessa riga non duplica nulla, la query
  la esclude già avendo trovato la controparte).
- **Filtro "entrambe esistono" per la pubblicazione** —
  `ProfessionalsService.search()`/`getById()`: i `bookings` di un
  professionista vengono ora filtrati con `.filter(b => b.review !== null
  && b.clientReview !== null)` prima di calcolare `rating`/`reviewCount` e
  di comporre l'array `reviews` esposto pubblicamente — una recensione
  reale scritta ma ancora "in attesa" della controparte non conta né nella
  media né compare nell'elenco, esattamente come richiesto. `reviews[].
  isAutomatic` esposto nel tipo pubblico (`ProfessionalDetail`).

**Frontend**:
- **`CompleteJobModal.tsx`** (professionista) esteso con una sezione foto/
  video (fino a 5, stesso pattern miniatura+tasto rimuovi rosso+tasto "+"
  già in uso ovunque nel prodotto), nuova prop `uploadPhoto` — il
  chiamante (`AcceptedJobCard`) la collega a
  `apiClient.uploadBookingCompletionPhoto`. `alignItems: "flex-start"` sul
  backdrop applicato preventivamente (non dopo una segnalazione): il
  contenuto più alto per via della nuova sezione foto avrebbe potuto
  riprodurre lo stesso bug già corretto altrove per questo pattern
  (CLAUDE.md §35).
- **`ReviewModal.tsx`** (nuovo, `apps/web/src/components`): popup di
  recensione condiviso — stelle 1-5, testo libero, foto/video (fino a 5) —
  parametrizzato via props (`title`/`subtitle`/`uploadPhoto`/`onSubmit`),
  usato **sia** per "il professionista recensisce il cliente" **sia** per
  "il cliente recensisce il professionista": stessa struttura esatta
  richiesta dall'utente per entrambe le direzioni, un solo componente
  invece di due quasi identici.
- **`ClientCompleteModal.tsx`** (nuovo): conferma "Lavoro terminato" lato
  cliente, solo foto/video (nessun importo — quello resta esclusivamente
  del professionista).
- **`AcceptedJobCard`** (`/dashboard`, professionista): `handleComplete`
  ora apre subito `ReviewModal` (recensisci il cliente) dopo
  `apiClient.completeBooking` riuscito; nuovo bottone "Recensisci il
  cliente" resta comunque disponibile in seguito (se il popup viene
  chiuso senza recensire) finché `!booking.hasClientReview`.
- **`BookingRow`** (`/le-mie-richieste`, cliente): l'inline review form
  precedente è stato **sostituito** (non solo esteso) dal nuovo flusso a
  due passaggi — bottone "Lavoro terminato" (visibile quando `status ===
  COMPLETED && !clientConfirmedCompletedAt`) apre `ClientCompleteModal`;
  alla conferma riuscita, se `!booking.hasReview`, si apre subito
  `ReviewModal` (recensisci il professionista) — stesso pattern "apri
  subito dopo" già usato lato professionista. Se già confermato ma non
  ancora recensito, un bottone "Lascia una recensione" resta disponibile
  per riaprire `ReviewModal` in un secondo momento.
- **`ClientProfileModal.tsx`** (scheda cliente, aperta dal nome in una
  richiesta ricevuta): nuova prop opzionale `reviews`
  (`ClientReviewSummary[]`, esportato dallo stesso file) — mostra stelle,
  commento, miniature media e nome dell'attività che ha scritto ciascuna
  recensione, con "(recensione automatica)" quando `isAutomatic` è vero.
  Solo qui: nessun altro punto del prodotto rende pubbliche le recensioni
  del cliente, coerente con "il cliente non ha un profilo pubblico".
- **`ProfessionalDetailContent.tsx`** (profilo pubblico): stessa etichetta
  "(recensione automatica)" aggiunta accanto al voto di ogni recensione
  reale quando `isAutomatic` è vero.

Verificato end-to-end con l'API locale (non solo typecheck/build) — tre
script dedicati, non solo letture di codice:
1. **Ciclo completo doppio-cieco**: richiesta diretta a un professionista
   specifico → preventivo → accettazione → professionista completa con
   foto (`professionalCompletionPhotoUrls` persistite correttamente) →
   professionista recensisce subito il cliente (la propria conferma basta)
   → tentativo del cliente di recensire PRIMA della propria conferma
   rifiutato (403) → profilo pubblico mostra 0 recensioni (solo un lato
   esiste) → cliente conferma con foto proprie
   (`clientCompletionPhotoUrls` persistite, seconda conferma rifiutata
   403) → cliente recensisce il professionista (seconda recensione sulla
   stessa prenotazione rifiutata, 409) → **ora** il profilo pubblico
   mostra la recensione (`isAutomatic: false`) → il professionista vede la
   propria recensione del cliente in `guidedRequest.clientReviews`
   (`GET /professionals/me/leads`).
2. **Sblocco automatico dopo 3 giorni**: professionista completa e
   recensisce subito il cliente, il cliente non conferma né recensisce mai
   — timestamp della `ClientReview` retrodatato di 4 giorni direttamente
   nel DB (simula il tempo trascorso senza attendere davvero), poi
   **la vera classe di produzione compilata** (`ReviewsService`,
   `apps/api/dist/reviews/reviews.service.js`) istanziata con un
   `PrismaClient` reale e `runAutoPublishCheck()` chiamato direttamente
   (stesso codice del cron, non una sua reimplementazione nello script di
   verifica): genera una `Review` automatica a 5 stelle
   (`isAutomatic: true`), il profilo pubblico la mostra con l'etichetta
   corretta, una seconda esecuzione del metodo non duplica nulla
   (idempotenza confermata).
3. **UI reale con Playwright** (token JWT iniettato in `localStorage`,
   chiave `professionisti_token`): lato professionista, click su "Lavoro
   terminato" apre `CompleteJobModal` (`role="dialog"`), invio →
   `ReviewModal` "Recensisci il cliente" si apre da solo, invio con 5
   stelle chiude il popup; lato cliente, click su "Lavoro terminato" apre
   `ClientCompleteModal`, conferma → `ReviewModal` "Recensisci il
   professionista" si apre da solo, invio con 4 stelle + commento chiude
   il popup; `GET /bookings/me` conferma `hasReview: true` e
   `clientConfirmedCompletedAt` valorizzato. Zero `pageerror` durante
   l'intero flusso (gli unici eventi console catturati sono prefetch RSC
   di Next.js verso endpoint bloccati dalla policy di rete dell'ambiente
   di sviluppo, stessa limitazione già documentata altrove in questo
   file — non causati da questa funzionalità).

Typecheck pulito su tutti i package (`shared`, `database`, `api-client`,
`api`, `ui`, `web`), build di produzione `apps/web` verde (24 route).

---

## 41. Nuova pagina `/dashboard/richieste` — vista a pipeline con card espandibili

Richiesta esplicita dell'utente: creare `/dashboard/richieste` seguendo una
specifica dettagliata fornita per intero (palette propria `#1a5f2a`/
Tailwind, 6 stati con badge+bordo colorato, card collassate di default,
timeline mini, form preventivo inline, ecc.). Prima di implementare,
mostrato un esempio visivo via Artifact con quella palette letterale
(richiesta esplicita: "dammi un esempio visivo prima di procedere"); l'utente
ha poi chiesto esplicitamente di **mantenere il sistema "Vicinato"** invece
dei colori/framework della specifica — la pagina reale è quindi Tamagui +
`packages/ui` + token `brand.*` esistenti (CLAUDE.md §19), non Tailwind, e
zero emoji (icone `Icon`/lucide, coerente con la Fase 2 del redesign, CLAUDE.md
§10) al posto dei glifi della specifica originale.

**Pagina puramente additiva**: non sostituisce le "Richieste ricevute" già
presenti su `/dashboard` (`LeadCard`), che restano invariate — è una vista
alternativa più ricca, raggiungibile solo da URL diretto per ora (nessun
link aggiunto al menu, non richiesto). Il bottone header "← Dashboard"
sostituisce il "+ Nuovo preventivo" della specifica originale: quest'ultimo
non ha un corrispettivo reale nel dominio (un preventivo è sempre legato a
una richiesta esistente, non si può "creare dal nulla" per un cliente
scelto a caso) — inventare un'azione che non fa nulla avrebbe violato la
regola di progetto "mai un'azione automatica/UI che non fa nulla".

**I 6 stati non sono un concetto nuovo**: derivati puramente lato client da
campi già esposti da `ProfessionalLead` (`Lead.status`/`Quote.status`/
`Quote.bookingStatus`), nessun nuovo campo per gli stati stessi —
`apps/web/src/lib/requestStage.ts` (`classifyLeadStage`, funzione pura):
`da_quotare` (nessun preventivo), `in_attesa` (`Quote.status === "SENT"`),
`modifica_richiesta` (`"MODIFICATION_REQUESTED"`), `accettata`
(`"ACCEPTED"` con `bookingStatus !== "COMPLETED"`), `completata`
(`bookingStatus === "COMPLETED"`), `scaduta` (`Lead.status === "EXPIRED"`).
Un settimo stato interno, `chiusa` (rifiuto professionista, rifiuto
cliente, o preventivo ritirato — nessuno di questi è tra gli stati/tab
della specifica), non ha un tab dedicato ma viene raggruppato sotto il tab
"Scadute" (stesso significato pratico, "non più azionabile"), con il
motivo esatto mostrato in UI (`describeClosedReason`) invece di
etichettarlo genericamente "scaduta" — non sarebbe stato onesto.

**Palette chiusa "Vicinato" riusata per gli 6 stati** (nessun hex nuovo,
niente blu/viola come nella specifica originale — non esistono nel token
set): `cianografia` (verde smeraldo, "da_quotare" — azione richiesta),
`grafite70`/neutro ("in_attesa" — nessuna azione ora), `ottone` (oro,
"modifica_richiesta" — richiede una decisione, più il bordo tratteggiato
dell'alert box come segnale principale), `verificato` (verde muto,
"accettata"), `grafite70`/neutro ("completata"), `urgenza` (rosso,
"scaduta"/"chiusa"). Componente `StagePill` locale a questa pagina (non
tocca le 4 varianti fisse di `Badge` in `packages/ui`, contratto diverso
"rosso solo urgenza/ottone solo pagamento" — estendere quel componente
avrebbe rischiato di alterarne il significato altrove nel sito). Badge
domicilio/online: icona `house`/`video` + testo, stesso pattern già in uso
altrove (CLAUDE.md §22) invece delle pillole blu/viola della specifica
(mai introdotte nel token set).

**Nota privata per-richiesta — unica aggiunta reale allo schema**: la
specifica vuole una nota privata visibile fin dalla ricezione della
richiesta, prima ancora che esista un preventivo — `Booking.
professionalNote` (già esistente) non basta, si applica solo a una
prenotazione già accettata. Nuovo campo `Lead.professionalNote String?`
(Prisma), `updateLeadNoteSchema` (`packages/shared`), `PATCH
/professionals/me/leads/:id/note` (`ProfessionalsService.updateLeadNote`,
stessa guardia di titolarità di `deleteLead`/`declineLead`), `apiClient.
updateLeadNote`. Salvataggio on-blur (come richiesto), più un bottone
"Salva" esplicito quando il testo cambia.

**Cross-reference con `ProfessionalBooking` per "accettata"/"completata"**:
`ProfessionalLead` non porta l'importo finale fatturato né l'orario esatto
dell'intervento (vivono solo su `Booking`) — la pagina scarica anche
`apiClient.myProfessionalBookings` (stessa chiamata già fatta da
`/dashboard`) e costruisce una `Map<guidedRequestId, ProfessionalBooking>`
per mostrare `scheduledAt`/`scheduledEndAt` ("Intervento: ...") e
`finalAmountEurCents` ("Importo finale") quando pertinenti — nessuna nuova
query lato server.

**Azioni per stato, adattate alla realtà del dominio dove la specifica
proponeva un'azione senza corrispettivo reale** (mai un bottone finto):
- `da_quotare`: Invia preventivo (`apiClient.createQuote`, form inline
  identico a `LeadCard.handleSendQuote`) / Rispondi (apre `TimelineModal`,
  la vera chat già esistente — sostituisce il generico "💬" della
  specifica) / Rifiuta (`apiClient.declineLead`, conferma inline).
- `in_attesa`: Modifica preventivo (`apiClient.createQuote` di nuovo,
  precompilato) / Contatta (`TimelineModal`). Il terzo bottone della
  specifica ("Proponi altra data") è stato omesso qui: in questo stato il
  professionista sta aspettando la risposta del cliente, non esiste
  un'azione reale di "proponi altra data" dal suo lato finché il cliente
  non ha già risposto (quello è esattamente `modifica_richiesta`).
- `modifica_richiesta`: Accetta nuova data (`confirmProposedQuoteDate`) /
  Proponi altra data (`counterProposeQuoteDate`, form inline) / Rispondi
  (`TimelineModal`) — più "Rifiuta la proposta" (`rejectProposedQuoteDate`)
  come link secondario: la specifica non lo elencava tra i tre bottoni
  principali ma è un'azione reale già esistente nel dominio, ometterla
  sarebbe stata una regressione silenziosa di funzionalità.
- `accettata`/`completata`: Vedi in agenda (link a `/dashboard/agenda`) /
  Contatta (`TimelineModal`).
- `scaduta`/`chiusa`: nessun bottone quando non c'è nulla di reale da fare
  (la specifica proponeva "Rinvia preventivo"/"Archivia", nessuno dei due
  ha un endpoint corrispondente — un lead scaduto non è riattivabile, non
  esiste un flag "archiviato"); quando invece la richiesta è eliminabile
  per davvero (`clientAccountDeleted` o preventivo `WITHDRAWN`, stessa
  logica già esistente in `LeadCard`), un link "Elimina richiesta"/"Elimina
  preventivo ritirato" (`apiClient.deleteLead`) sostituisce onestamente
  quei due bottoni.

**Allegati foto/video sul form preventivo (specifica) non implementati**:
`quoteSchema`/`Quote` non hanno un campo per foto — aggiungerlo sarebbe
stato uno scope aggiuntivo reale (nuovo campo Prisma + endpoint upload),
non incluso in questo giro; segnalato all'utente, non costruito come
dropzone finta.

Verificato end-to-end con l'API locale (non solo typecheck): script
dedicato con richiesta diretta a un professionista specifico (stesso
accorgimento anti-lotteria-lead già documentato altrove in questo file) che
percorre l'intero ciclo `da_quotare → in_attesa → modifica_richiesta →
accettata → completata` con chiamate reali (`createQuote`,
`propose-date`, `confirm-proposed-date`, `PATCH /bookings/:id/complete`),
verificando la classificazione attesa ad ogni passo via `GET
/professionals/me/leads`; nota privata salvata e riletta correttamente
anche prima che esista un preventivo; importo finale cross-referenziato
correttamente da `getMyBookings`; due varianti di `chiusa` verificate
(lead rifiutato → non eliminabile, 403; preventivo ritirato →
eliminabile, 200) con lo stesso endpoint `deleteLead` già esistente.
UI con Playwright (token JWT iniettato in `localStorage`, chiave
`professionisti_token`): tab con conteggi corretti e badge rosso su "Da
quotare", card con nome cliente e pillola di stato, click sulla card la
espande (sezioni Dettagli cliente/Descrizione/Note personali/Andamento/
azioni tutte visibili), click su "Invia preventivo" apre il form inline
con voce/Da €/A €. Zero overflow orizzontale su desktop (1280px) e mobile
(390px, `scrollWidth === clientWidth` esatto su entrambi). Zero
`pageerror`; gli unici `console.error` sono prefetch RSC falliti verso
`ERR_TUNNEL_CONNECTION_FAILED`, stessa limitazione di rete dell'ambiente
di sviluppo già documentata altrove in questo file. Typecheck pulito su
tutti i package (`shared`, `database`, `api-client`, `ui`, `api`, `web`),
build di produzione `apps/web` verde (25 route, `/dashboard/richieste`
nuova).

**Rifinitura — colori/tipografia dei 6 stati + azioni allineate a
/dashboard**: richiesta esplicita dell'utente, con screenshot di
riferimento, arrivata dopo aver visto la pagina reale (§41 sopra). Due
richieste distinte nello stesso giro:
1. *"Modifica quella pagina esattamente come questa, quindi con le icone
   sopra a scorrimento... anche con i colori laterali arancioni e blu e
   rosso per quelle scadute, e il colore anche sulle scritte: da
   quotare(giallo) in attesa(blu) accettata(verde"* + *"E anche le
   Dimensioni e il carattere delle scritte"* — eccezione deliberata e
   circoscritta alla palette chiusa "Vicinato" (CLAUDE.md §19), solo per
   `STAGE_STYLE` (i 6 indicatori di stato di questa pagina): hex letterali
   locali (`#FF6B35` arancione/da_quotare, `#0D6EFD` blu/in_attesa,
   `#28A745` verde/accettata, `#DC3545` rosso/scaduta) sostituiscono i
   token `brand.*` usati nella prima stesura — non toccano
   `packages/ui/tokens.ts` né le 4 varianti fisse di `Badge` (quelle
   restano semantiche per il resto del sito). Font più grandi in tutta la
   pagina (pillole di stato, tab, intestazione card: nome cliente passato
   da `$5` Tamagui a 26px esplicito, prezzo/descrizione/categoria tutti
   scalati su). Riga tab riscritta da `XStack` con `flexWrap="wrap"` +
   `overflowX:"auto"` (combinazione che si annullava a vicenda: su
   viewport stretti le pillole andavano a capo invece di scorrere) a un
   `<div>` grezzo con `overflowX:"auto"` puro e `flexShrink={0}` su ogni
   pillola — scorre su una riga sola, coerente con lo screenshot fornito
   ("tutte-da quotare-ecc... a scorrimento"). Conteggio per tab spostato
   da testo inline a un pallino rosso in overlay sull'angolo, mostrato su
   ogni pillola con `count > 0` (prima solo su da_quotare/modifica).
2. *"Implementa i pulsanti come ci sono nella Dashboard già esistente:
   richieste ricevute, lavori accettati"* — un riaudit ha trovato che 3
   azioni già presenti in `/dashboard` (LeadCard/AcceptedJobCard) mancavano
   qui: "Ritira preventivo" (stage `in_attesa`, stesso
   `apiClient.withdrawQuote` con doppia conferma inline), "Lavoro
   terminato"/"Annulla intervento" (stage `accettata`, quando
   `booking.status === "CONFIRMED"` — stessi `CompleteJobModal`/
   `CancelBookingModal` già esistenti, nessuna logica duplicata) e
   "Recensisci il cliente" (stage `completata`, quando
   `!booking.hasClientReview` — stesso `ReviewModal`). Verificato con
   Playwright (API locale reale, non solo lettura di codice): richiesta
   diretta a un professionista specifico portata attraverso tutti e tre
   gli stadi (`in_attesa`→`accettata`→`completata`), i tre bottoni trovati
   e funzionanti, i due popup (`CompleteJobModal`/`ReviewModal`) aperti e
   chiusi senza errori. Zero overflow orizzontale desktop; un 19px di
   overflow mobile osservato nello stesso giro è stato tracciato a un nome
   attività di test innaturalmente lungo (timestamp a 13 cifre nel nome,
   artefatto dei dati di verifica), non un bug della pagina. Typecheck
   pulito, build di produzione verde.

---

## 42. "Lavori accettati" (dashboard professionista) ridisegnato in stile pipeline

Richiesta esplicita dell'utente, con due screenshot di riferimento (elenco
+ vista espansa di una card) — chiesto se applicare questo design alla tab
"Lavori accettati" già esistente in `/dashboard`, alla pipeline di §41, o a
una pagina nuova: l'utente ha scelto esplicitamente, tramite
`AskUserQuestion`, **"Tab 'Lavori accettati' in /dashboard"** — la tab
`AcceptedJobCard` già esistente, non `/dashboard/richieste` né una route
nuova.

- **Backend** — `ProfessionalsService.getMyBookings` include ora
  `guidedRequest.serviceMode` e `guidedRequest.category.{slug,label}` nella
  query esistente (nessuna nuova query, stesso `include` già presente per
  `address`/`description`/`photoUrls`), esposti su `ProfessionalBooking`
  come `categorySlug`/`categoryLabel`/`serviceMode` (nuovi campi,
  `packages/shared/src/dashboard.ts`) — `null` per le prenotazioni dirette
  da agenda pubblica (`bookAgendaSlot`, dormiente da CLAUDE.md §20), che
  non hanno una `GuidedRequest` collegata da cui derivarli. Servivano per il
  titolo della card (categoria) e il nuovo badge modalità, nessuno dei due
  esposto prima di questo giro.
- **Tre pillole "In agenda"/"Completati"/"Tutti"** (con conteggio inline
  dentro la pillola, non un badge d'angolo — diverso dal pattern di §41)
  sostituiscono il precedente `<select>` di `ListControls` per questa sola
  lista (le altre 3 liste che condividono `ListControls` restano
  invariate): riusano lo stesso `BookingStatusFilter`/`bookingMatchesStatus`
  già esistenti (`"toDo"`→In agenda/CONFIRMED, `"completed"`→Completati,
  `"all"`→Tutti, "Annullati" non più un tab a sé — una prenotazione
  annullata resta comunque raggiungibile sotto "Tutti", comportamento
  invariato). "In agenda" è il tab attivo di default (era "Tutti" prima),
  coerente con lo screenshot fornito.
- **Barra filtri** — ricerca cliente/indirizzo (client-side, stesso
  principio "niente round-trip di rete" già seguito per gli altri filtri
  del sito, CLAUDE.md §23), filtro data (`BookingDateFilter`: "Tutto"/
  "Questa settimana"/"Prossima settimana" — calcolato su settimane
  lunedì-domenica nel fuso del browser) e filtro zona (`<select>`, zone
  distinte calcolate su **tutti** i lavori accettati, non sui soli
  risultati già filtrati — altrimenti la lista delle zone si
  restringerebbe insieme ai risultati, comportamento confuso per un
  filtro). Default del filtro data lasciato su "Tutto" invece di "Questa
  settimana" come nello screenshot: nascondere lavori futuri al primo
  caricamento avrebbe fatto sembrare la lista vuota senza motivo, rischio
  di usabilità non esplicitamente richiesto dal testo dell'utente. Il
  controllo "Ordina per" di `ListControls` è stato rimosso per questa sola
  lista (non presente nello screenshot): ordinamento fisso per data di
  intervento (prossima prima), stesso comportamento di prima come default.
- **Card collassata di default** (`AcceptedJobCard`, stato locale
  `isOpen`, click sull'intestazione per aprire/chiudere) — filetto laterale
  colorato per stato (riuso dei 3 colori già usati per il testo di stato
  prima di questo redesign: `brand.verificato` CONFIRMED, `brand.grafite70`
  COMPLETED, `brand.urgenza` CANCELED — nessun colore nuovo introdotto, a
  differenza della rifinitura di §41 sopra dove l'utente aveva chiesto
  esplicitamente hex arbitrari). Intestazione: pallino+data/ora colorati,
  pillola di stato ("Confermato"/"Completato"/"Annullata..."), prezzo
  stimato (`quotePriceTotals(booking.items)` + `formatServicePriceRange`,
  già esistenti — riusati, non un nuovo calcolo), titolo (categoria),
  nuovo badge "A domicilio"/"Online" (`ServiceModeBadge`, da
  `booking.serviceMode`), nome cliente con icona, indirizzo con icona,
  chevron. **Nessun indirizzo/contatto esposto quando la card è
  collassata** (diverso dalla versione precedente, che mostrava
  telefono/WhatsApp/email sempre): tutti i dettagli (Descrizione lavoro,
  Preventivo con voci+totale, Contatti — ora bottoni pieni "WhatsApp"/
  "Chiama" affiancati invece di link icona+testo, Videochiamata, Note
  personali) più le azioni (Lavoro terminato/Annulla intervento/
  Recensisci il cliente/Contatta-Cronologia) si spostano nella sola vista
  espansa, dentro riquadri etichettati (`DetailSection`, nuovo componente
  locale: icona+testo mono maiuscolo piccolo sopra, box chiaro
  `brand.gesso` sotto) — stesso principio del riferimento fornito
  dall'utente. Nessuna logica di business nuova in questi riquadri: stessi
  handler (`handleComplete`/`handleCancel`/`handleSaveNote`/
  `handleSaveMeetingLink`) e stessi tre popup
  (`CompleteJobModal`/`CancelBookingModal`/`ReviewModal`) già esistenti,
  solo riorganizzazione visiva dei campi già esposti da
  `ProfessionalBooking`.

**Bug reale critico trovato e corretto con la verifica Playwright**
(non un problema di stile — un crash totale): il nuovo `useMemo` per
calcolare le zone del filtro (`bookingZones`) era stato inserito **dopo**
i quattro `return` anticipati di `DashboardContent` (`isLoading`/utente non
loggato/ruolo non professionista/profilo mancante) — violazione delle
Rules of Hooks invisibile a typecheck e build (nessuno dei due esegue
davvero il componente), che TypeScript/ESLint non hanno segnalato. Un
professionista autenticato con profilo completo salta tutti quei rami di
`return` al secondo render rispetto al primo render (in cui `isLoading` è
ancora vero), risultando in un numero di hook diverso tra i due render —
React lancia `"Rendered more hooks than during the previous render"` e
smonta l'intero albero, pagina bianca per **qualunque** professionista con
profilo completo (non solo un caso limite). Trovato da un agente di
verifica Playwright end-to-end con account reali (non da lettura di
codice), corretto spostando l'hook prima di ogni `return` anticipato,
subito dopo l'`useEffect` che carica i dati — stessa lezione già
implicita altrove in questo file: build/typecheck verdi non sono una prova
che una pagina React funzioni davvero, serve eseguirla.

**Verificato** (due giri, il secondo dopo il fix sopra): script di seed
via API dirette (professionista+cliente di test, due prenotazioni portate
rispettivamente a `CONFIRMED` e `COMPLETED`) — `GET
/professionals/me/bookings` conferma `categoryLabel`/`serviceMode`/`city`
tutti presenti e corretti. Prima verifica: crash riprodotto in modo
deterministico (pagina bianca, `pageerror` con "Rendered more hooks").
Dopo il fix: nessun crash su 4 caricamenti/ricarichi consecutivi, le tre
pillole con conteggi corretti ("In agenda" attivo di default mostra solo
la prenotazione `CONFIRMED`, "Tutti" mostra entrambe), ricerca per nome
cliente che filtra correttamente, card che si espande al click rivelando
tutti i riquadri e i bottoni attesi, "Lavoro terminato" che apre
`CompleteJobModal` senza errori. Zero `pageerror` in entrambi i giri di
verifica del secondo passaggio; l'unico `console.error` osservato è un
warning cosmetico preesistente (`accessibilityState` non riconosciuto su
un `div`, da `HomeHero`/`Chip`, già documentato altrove in questo file,
non causato da questo redesign). Typecheck pulito su tutti i package
(`shared`, `api`, `web`), build di produzione `apps/web` verde
(25 route).

---

## 43. "Contatta/Cronologia" sempre visibile + pallini di notifica, poi revisione UX del flusso preventivi (dedup dashboard/dashboard-richieste)

Due giri di lavoro nella stessa sessione, entrambi su richiesta esplicita
dell'utente.

**Primo giro — "Contatta/Cronologia" mancante + pallini di notifica per
singola card**: segnalazioni puntuali dell'utente — "nelle mie richieste
del cliente, non compare il pulsante contatta/cronologia"; "quando si
riceve un nuovo messaggio... aggiungere un pallino rosso di fianco al
pulsante contatta/cronologia con un numero"; "quando il cliente riceve la
modifica della data ora da parte del professionista deve essere visibile
chiaramente"; "i pallini rossi delle notifiche devono comparire sia in
richieste ricevute oppure lavori accettati, sia vicino la richiesta che
effettivamente ha avuto un aggiornamento".
- **`apps/web/src/components/UnreadDot.tsx`** (nuovo): pallino rosso con
  numero ("9+" oltre 9), `null` se il conteggio è 0/assente — riusato
  ovunque serva un contatore per-elemento, non solo un booleano "Nuovo".
- **`notificationSections.ts`** esteso con varianti "conteggio" (non solo
  presenza) delle mappe già esistenti — `unreadGuidedRequestCounts`/
  `unreadBookingCounts`/`unreadQuoteCounts` (`Map<id, count>`) — più
  `unreadThreadCounts`, chiave composita `guidedRequestId:
  professionalProfileId`: serve per il pallino sulla sezione "Inviata a"
  di una richiesta guidata (`/le-mie-richieste`), dove — prima di questo
  giro — non esisteva **alcun** modo di contattare/vedere la cronologia
  con un professionista finché non arrivava un suo preventivo (bug reale,
  non solo mancanza del pallino): `GuidedRequestCard` ora apre
  `TimelineModal` per singolo professionista anche in quello stadio.
- Pallino cablato ovunque compare "Contatta/Cronologia": `LeadCard`/
  `AcceptedJobCard` (`/dashboard`), `QuoteCard`/`BookingRow`/riga "Inviata
  a" (`/le-mie-richieste`).
- **Banner data modificata dal professionista, reso evidente quanto quello
  già esistente lato professionista**: il banner client-side per
  `quote.professionalCounterNote` (mostrato quando il professionista usa
  "Modifica" sulla trattativa) aveva padding/font più piccoli del
  corrispondente "Il cliente ha proposto un'altra data" mostrato al
  professionista — allineato alla stessa resa (padding `$3`, font `$3`) e
  reso esplicito ("Il professionista ha risposto proponendo: <data/ora>")
  invece del generico "ti ha risposto:".
- Verificato con l'API locale e un agente Playwright end-to-end (non solo
  typecheck): timeline con notifica prima di ogni preventivo, pallini
  numerati corretti su tutte e cinque le posizioni, banner data ingrandito
  e con la data esplicita. Zero errori console reali.

**Secondo giro — revisione UX del flusso preventivi**: l'utente aveva
affidato un giro di revisione visiva a un'altra sessione (un modello
diverso, "Kimi"), interrotta per limite di utilizzo a metà lavoro. Le
modifiche di quella sessione **non erano mai arrivate in questo
repository** — girava su un ambiente/checkout completamente separato e
mai collegato a questo — e i tentativi di recuperarne i file reali
(diversi allegati caricati dall'utente) hanno restituito solo copie
statiche/non modificate di file di configurazione già presenti qui, mai
il lavoro vero. Confermato esplicitamente con l'utente prima di procedere
(`AskUserQuestion`): reimplementato da zero in questo repository,
partendo dal testo dettagliato della revisione scritta da quella sessione
(non dal suo codice, mai recuperato), pacchetto "alta + media priorità"
come quella sessione stessa aveva già deciso di fare.

- **Foto rotte** (`MediaPreview.tsx`): un URL Cloudinary scaduto/rotto
  mostrava l'icona nativa di rottura del browser ("dà un'impressione di
  sito non finito"). `onError` su `<img>`/`<video>` mostra ora un riquadro
  neutro (`brand.gesso`) con icona `camera` — un solo `useState` locale,
  nessuna dipendenza dal contesto del chiamante (categoria, ecc.), per
  restare un drop-in valido nei 13 punti del sito che lo usano.
- **Contatori poco chiari** (`/le-mie-richieste`): "Contattati 2 · Risposto
  1 · In attesa 2" sostituito da una frase sola ("1 preventivo ricevuto su
  2 professionisti contattati.", con le forme singolare/plurale corrette e
  un caso dedicato per zero risposte).
- **Pillola "IN ATTESA" ambigua** (`/dashboard/richieste`): resa esplicita
  in "In attesa del cliente" sulla singola card — il tab della riga a
  scorrimento resta "In attesa" per lo spazio ridotto, stesso significato.
- **"Totale minimo"/"Totale massimo" su due righe** (`/le-mie-richieste`,
  `QuoteCard`): unificati in un unico "Totale indicativo: X–Y €" in
  evidenza, riusando `formatServicePriceRange` già esistente invece di
  duplicarne la logica di formattazione.
- **Riorganizzazione della card preventivo** (`/le-mie-richieste`): note
  del professionista in un box a parte etichettato "Messaggio del
  professionista" (prima un rigo di testo isolato); gerarchia bottoni
  rivista — "Accetta preventivo" (primario) e "Modifica data/orario"
  (rinominato da solo "Modifica", secondario) sulla stessa riga, "Rifiuta
  preventivo" spostato su una riga propria sotto e reso discreto (testo
  grigio sottolineato, non più rosso in grassetto affiancato al
  primario) — il rosso resta riservato alla sola conferma effettiva del
  rifiuto.
- **Item "stepper con date ripetute sugli step futuri"**: non riprodotto
  in questo repository — né `RequestStepper` (`/le-mie-richieste`) né
  `MiniTimeline` (`/dashboard/richieste`) mostrano date sui singoli step,
  quindi non c'è nulla da correggere lì; probabilmente specifico
  dell'ambiente/build della sessione interrotta, mai esistito nel codice
  reale di questo repository.
- **Deduplicazione `/dashboard` vs `/dashboard/richieste`**: la stessa
  card completa (voci preventivo, form di invio, cronologia inline)
  appariva identica in due punti del sito — `/dashboard/richieste` (la
  pipeline a card espandibili di §41, con feature complete: invio/modifica
  preventivo, conferma/rifiuto/controproposta data, rifiuto/ritiro/
  eliminazione, agenda, lavoro terminato) era inoltre **una pagina
  orfana**, raggiungibile solo per URL diretto, mai linkata da alcun menu.
  Corretto senza perdere funzionalità, non semplicemente cancellando la
  duplicazione:
  1. `accountMenuItems.ts`: nuova voce "Richieste ricevute" →
     `/dashboard/richieste` per i professionisti, accanto a "Dashboard".
  2. `/dashboard`, tab "Richieste ricevute": la card completa (`LeadCard`,
     ~850 righe) è stata rimossa e sostituita da un riepilogo compatto —
     una frase con il conteggio in attesa di risposta, le 5 richieste più
     recentemente aggiornate come righe compatte (nome/categoria/città +
     etichetta di stato breve, riusata da `LEAD_STATUS_OPTIONS` già
     esistente + un nuovo `leadSummaryLabel`), e un bottone "Apri tutte le
     richieste ricevute" verso l'inbox completa. Filtri/ordinamento/
     paginazione di questa lista (prima duplicati anche loro) restano solo
     su `/dashboard/richieste`, unica fonte di verità per l'elenco intero.
     Rimossi con `LeadCard` anche i suoi stati/helper esclusivi
     (`availableSlots`, `formatDateTimeRange`/`formatSentAt`/
     `describeDateChangeKind`, filtri/ordinamento/pagina leads) — `/dashboard`
     è passato da 10,7 kB a 7,9 kB di bundle.
  3. Il pallino di notifica non letta (dal primo giro sopra) è stato
     esteso a `/dashboard/richieste`, che prima non calcolava affatto le
     notifiche non lette (nessun `markNotificationsRead`/conteggio
     preesistente lì) — ora lo fa allo stesso modo delle altre pagine,
     sui due bottoni "Contatta" della pipeline.
- Verificato con l'API locale (non solo typecheck/build) e un agente
  Playwright end-to-end: tutti i 6 punti sopra confermati funzionanti a
  schermo (screenshot before/after su foto rotta, frase contatori, pillola
  "In attesa del cliente", "Totale indicativo", riga "Rifiuta preventivo"
  che si trasforma in conferma senza navigare via, menu account con la
  nuova voce, riepilogo compatto in `/dashboard` con click che porta
  all'inbox completa, pallino di notifica su entrambe le superfici).
  Un solo comportamento anomalo osservato dall'agente (pallino di
  notifica assente su un caricamento) è stato investigato e ricondotto a
  un artefatto esclusivo di React Strict Mode in sviluppo (doppia
  invocazione dell'effetto in `next dev`, mai in produzione — `next
  build`/`next start` non raddoppiano gli effetti) combinato con il
  pattern di navigazione sintetico usato dall'agente stesso
  (goto→inject-token→reload, due mount reali in rapida sequenza, ciascuno
  poi raddoppiato da Strict Mode) — lo stesso identico pattern
  `unreadNotifications().then(...).finally(markNotificationsRead)` è già
  in uso identico da tempo in `/dashboard` e `/le-mie-richieste`
  (`markNotificationsRead` ha dipendenze stabili, `useCallback(..., [])`,
  quindi l'effetto guardato da `[token, markNotificationsRead]` corre una
  sola volta per token in ogni caso reale di navigazione utente); non
  modificato per non introdurre un guard asimmetrico solo nel file nuovo.
  Typecheck pulito su tutti i package, build di produzione `apps/web`
  verde (28 route). Zero errori console reali in tutti i flussi
  (`ERR_TUNNEL_CONNECTION_FAILED` è la stessa limitazione di rete
  dell'ambiente di sviluppo già documentata altrove in questo file).

---

## 44. Scadenza del Lead visibile in `/dashboard/richieste` ("Rispondi entro...")

Ultima finitura rimasta in coda dalla revisione UX di §43 (item "🟢
finiture (dopo il resto)" della sessione interrotta di Kimi): "nella card
pro, evidenziare quanto manca alla scadenza della richiesta ('rispondi
entro domani') spinge a quotare in fretta" — richiesta esplicita
dell'utente di procedere solo con questa (l'altra finitura, tinte più
distintive per gli stati, tenuta in sospeso: i colori in `STAGE_STYLE`
sono già distinti nel codice reale di questo repository, non "quasi tutto
rosa/salmone" come descritto — stesso disallineamento già osservato più
volte in §43 tra quanto Kimi riportava e quanto esiste davvero qui,
verifica rimandata a un confronto diretto con l'utente sul sito live).

- **Campo mai esposto prima d'ora**: `Lead.expiresAt` esiste già nello
  schema fin da CLAUDE.md §14 (fan-out intelligente: 20 minuti per un
  Lead urgente, 4 ore per uno standard, passata la scadenza il job
  schedulato lo marca `EXPIRED` e pesca il prossimo candidato dalla coda
  di riserva) ma non veniva mai restituito da `GET /professionals/me/leads`
  — nessuna migrazione necessaria, solo un campo aggiunto alla proiezione
  in `ProfessionalsService.getMyLeads` e al tipo `ProfessionalLead`
  (`packages/shared/src/dashboard.ts`).
- **`formatLeadDeadline`** (`apps/web/src/app/dashboard/richieste/page.tsx`):
  funzione pura, minuti se sotto l'ora altrimenti ore (gli orizzonti reali
  sono sempre brevi — 20 minuti o 4 ore, mai giorni — quindi niente
  formato "entro domani", diversamente da quanto ipotizzato in una
  risposta esplorativa precedente a questo giro), `null` se la scadenza è
  già passata (evita un conto alla rovescia negativo: il job la marcherà
  `EXPIRED` a breve) o non nota (Lead precedenti a questa funzionalità).
- **`DeadlinePill`**: nuova pillola nella stessa riga di `ServiceBadge`/
  `StagePill` sull'intestazione della card, mostrata **solo** per lo
  stage `da_quotare` (prima che esista un preventivo — dopo, la scadenza
  del Lead non è più l'informazione rilevante). Ambra di default
  (`#B8860B` su `#FFF3D6`, stessa coppia già in uso per la pillola
  `da_quotare` di `STAGE_STYLE`), rossa (`brand.urgenza` su `#FBEAEA`)
  sotto i 30 minuti residui — soglia fissa indipendente dal tipo di
  richiesta (urgente/standard), un margine stretto resta stretto a
  prescindere da quanto tempo aveva a disposizione all'inizio.
- Verificato con l'API locale (non solo typecheck/build) e un agente
  Playwright end-to-end: due richieste dirette allo stesso professionista
  (una standard, una urgente) → `expiresAt` esposto su entrambi i Lead,
  rispettivamente ~240 e ~20 minuti da subito, coerente con le costanti
  già esistenti (§14). UI: pillola ambra "Rispondi entro 4 ore" sulla
  richiesta standard, pillola rossa "Rispondi entro 20 minuti" su quella
  urgente (colori misurati via `getComputedStyle`, effettivamente distinti
  dall'ambra), badge "Urgente" preesistente ancora presente e distinto
  accanto alla nuova pillola sulla card urgente (stesso tono di rosso per
  entrambi, scelta consistente con la regola di progetto "rosso solo su
  urgenza", non una svista — segnalato dall'agente di verifica come
  possibile miglioramento estetico futuro, non un bug). Pillola scadenza
  verificata sparire correttamente dopo l'invio di un preventivo (stage
  non più `da_quotare`), sostituita dalla pillola di stato "In attesa del
  cliente". Zero errori console. Typecheck pulito su tutti i package
  (`shared`, `api`, `web`), build di produzione `apps/web` verde
  (28 route).

---

## 45. Nomi reali in chat, foto professionista nelle recensioni, suggerimenti bio, lavoro esterno in agenda, sidebar account rimossa, lista d'attesa in admin, privacy contatti cliente ribaltata di nuovo

Sei richieste esplicite dell'utente, stesso giro di lavoro.

**Nomi reali al posto di "Cliente"/"Professionista" in `TimelineModal`** —
richiesta esplicita dell'utente: la chat della cronologia (§21) mostrava
l'etichetta generica del ruolo (`ACTOR_LABEL`) invece del nome vero di chi
ha scritto ogni messaggio. `TimelineModal` guadagna una prop opzionale
`otherPartyName` (nome+cognome del cliente se `viewerRole="PROFESSIONAL"`,
nome attività del professionista se `viewerRole="CLIENT"`) — ogni punto di
montaggio la passa già con un dato che aveva a disposizione, nessuna nuova
chiamata API: `RequestCard`/`LeadSummaryRow`
(`/dashboard`/`/dashboard/richieste`, `lead.guidedRequest.clientName`),
`BookingDetailPanel` (agenda, `booking.clientName`),
`GuidedRequestCard`/`QuoteCard`/`BookingRow`
(`/le-mie-richieste`, rispettivamente il nome dell'attività trovato in
`sentTo`/`quote.businessName`/`booking.businessName`). Il proprio nome (per
le nuvolette del lato "mio") si ricava da `useAuth()` — `businessName` per
un professionista (stesso fallback su `name` già in uso in `AccountMenu`),
nome+cognome per un cliente. `null`/assente ricade sull'etichetta generica
di prima (account eliminato, o dato non ancora noto) — mai un'etichetta
vuota.

**Foto del professionista nelle "Recensioni verificate" in homepage** —
richiesta esplicita dell'utente: "deve essere grande quanto tutto il
riquadro sulla sinistra... senza aumentare le dimensioni del riquadro".
`GET /reviews/recent` (`ReviewsService.getRecentPublic`) espone ora anche
`categorySlug`/`imageUrl` del professionista recensito (mancavano,
serviva solo `categoryLabel`/`city` prima). `RecentReviews.tsx` riscritta
da singola colonna a `XStack` a due colonne dentro la stessa `Surface`
(`padding={0} overflow="hidden"`): colonna sinistra a larghezza fissa
132px che si allunga da sola all'altezza della card (`alignItems:
"stretch"` di default, mai impostato esplicitamente) con `<img
style="objectFit:cover">` se il professionista ha un'immagine profilo,
altrimenti la stessa icona colorata di categoria già in uso altrove
(`CategoryIconBadge`/`CATEGORY_ACCENT`) ma a piena altezza invece che nel
cerchio piccolo — mai un placeholder generico, stesso principio già
seguito per `Avatar.tsx`. Colonna destra invariata nel contenuto
(stelle+badge, commento, nome/categoria/città), solo ristretta nello
spazio residuo. **Bug reale trovato da un agente di verifica Playwright e
corretto nello stesso giro**: a larghezza massima della card (360px), la
riga stelle+badge "Lavoro confermato" (`XStack justifyContent="space-
between"`, nessun `flexWrap`) sforava il bordo destro di ~14px — la nuova
colonna foto aveva ridotto lo spazio disponibile alla colonna testo sotto
la soglia in cui i due elementi stavano affiancati senza spezzarsi, stesso
identico bug già documentato più volte in questo file (CSS/Tamagui:
un elemento flex non si restringe sotto la dimensione del contenuto senza
`flexWrap` esplicito). Corretto aggiungendo `flexWrap="wrap"` alla riga:
il badge va a capo sotto le stelle quando lo spazio non basta, invece di
sforare.

**Suggerimenti per scrivere la bio del profilo professionista** — richiesta
esplicita dell'utente: "dai dei suggerimenti in modo che sia più
professionale". `/dashboard/profilo`: il campo Bio ha ora, sopra la
`<textarea>`, un riquadro (`brand.gesso`, icona a stella) con 6 consigli
pratici in elenco puntato (es. "Menziona da quanti anni lavori nel
settore", "Evita frasi generiche come 'faccio del mio meglio'") più, solo
quando il campo è ancora vuoto, un link cliccabile "Usa un esempio come
punto di partenza" che precompila la textarea con un paragrafo di esempio
generico (`BIO_EXAMPLE`) — resta comunque modificabile, non un testo
finto salvato senza controllo: il professionista deve comunque premere
"Salva profilo" per confermarlo, stesso flusso di sempre.

**Lavoro preso al di fuori della piattaforma, in agenda** — richiesta
esplicita dell'utente: "dai la possibilità di inserire un lavoro preso al
di fuori della piattaforma, dove poter inserire tutti i dati utili per
effettuare l'intervento". Nuovo modello Prisma `ExternalJob`
(`clientName`, `clientPhone`, `address`, `description`, `scheduledAt`/
`scheduledEndAt`, `priceEurCents`, `notes`, `status`
`SCHEDULED`/`COMPLETED`/`CANCELED`), **modello separato da `Booking`**
invece di rendere `Booking.clientId` opzionale: un `Booking` porta con sé
garanzie che presuppongono sempre un vero account cliente (recensioni
"doppio cieco", notifiche, visibilità in `/le-mie-richieste`, cronologia
condivisa) che qui non hanno senso — nessun cliente reale, solo un
promemoria strutturato per il professionista stesso, stesso principio
architetturale già seguito per `AvailabilityException` come modello a
parte da `AvailabilitySlot`. Nuovo modulo `apps/api/src/external-jobs/`
(`POST /external-jobs`, `GET /external-jobs/me`, `PATCH
/external-jobs/:id`, `PATCH /external-jobs/:id/status`, `DELETE
/external-jobs/:id`, tutti JWT-guarded, guardia di titolarità sul proprio
`professionalProfileId` prima di ogni update/delete). **Bug reale trovato
e corretto durante lo sviluppo, non da typecheck**: `ExternalJobsModule`
creato inizialmente senza `imports: [AuthModule]` — `JwtAuthGuard` (usata
su ogni rotta del controller) dipende da `JwtService`, registrato solo
dentro `AuthModule` ed esportato da lì; senza quell'import il bootstrap di
Nest andava in crash-loop ("Nest can't resolve dependencies of the
JwtAuthGuard"), non un errore di singolo endpoint ma un blocco totale
dell'API — non intercettato da `tsc --noEmit` (pulito su entrambi i lati),
scoperto solo da un agente di verifica end-to-end che ha urtato contro il
server locale condiviso mentre girava per un'altra funzionalità. Stesso
identico problema già documentato altrove in questo file per
`@nestjs/throttler`/`@nestjs/schedule` — ormai un sospetto di prima battuta
per qualunque nuovo modulo con un guard, non solo per pacchetti esterni.
`ExternalJobModal.tsx` (nuovo, `apps/web/src/components`): stesso pattern
overlay DOM grezzo di `CompleteJobModal`/`BookingDetailPanel`
(`role="dialog"`, `alignItems:"flex-start"` per lo stesso motivo già
documentato in CLAUDE.md §35), un solo componente sia per creare che per
modificare (`job` assente = creazione). Wired in
`/dashboard/agenda`, tab "Prenotazioni": nuovo bottone "Lavoro esterno"
sopra il calendario, i lavori esterni compaiono nello stesso
`renderBookingDayColumn`/`renderBookingMonthCell` delle Booking reali ma
con bordo tratteggiato (stesso principio visivo già in uso per le fasce
generiche dell'agenda) ed etichetta "· Esterno" per restare distinguibili
a colpo d'occhio da un impegno nato da un preventivo accettato — click
apre lo stesso modale in modifica, con azioni di stato
(Completato/Annullato/Riapri) ed eliminazione a doppia conferma.

**Sidebar "Il tuo account" rimossa dalle pagine menu** — richiesta
esplicita dell'utente: "non far vedere quel menu il tuo account sempre lì
fisso, così da avere a schermo intero solo il menu aperto... sia lato
cliente che professionista". `AccountSidebar.tsx` **eliminato** (verificato
con una ricerca che nessun file lo importasse più dopo le modifiche): la
navigazione tra le voci resta comunque disponibile dal menu a tendina
dell'header (`AccountMenu`), che le elenca già tutte — nessuna funzionalità
persa, solo il duplicato fisso rimosso. Tre pagine coinvolte: `/account`
(maxWidth 900→640, la colonna sidebar tolta lasciava il contenuto stretto
sproporzionato rispetto a prima, ridotto per restare centrato invece di
allargarsi a vuoto), `/le-mie-richieste` e `/professionisti-salvati`
(entrambe 900→760).

**Lista d'attesa "Arriviamo presto nella tua zona" visibile da admin** —
richiesta esplicita dell'utente: "salva le email... in un elenco
visualizzabile dai profili admin". Le email erano già scritte su
`WaitlistSignup` (`WaitlistService.signup`, CLAUDE.md §19) ma mai lette da
nessun endpoint. Nuovo `GET /admin/waitlist` (`AdminService.listWaitlist`,
stesso controller/guard già protetto da `JwtAuthGuard`+`AdminGuard`),
nuova sezione in `/admin` (`apps/web/src/app/admin/page.tsx`) sotto le tre
liste utenti esistenti: email + data di iscrizione, stesso stile a righe
zebrate già in uso per `UserGroup`.

**Privacy dati di contatto del cliente — ribaltata di nuovo verso
"visibili solo ad accettazione"** — richiesta esplicita dell'utente, terzo
ribaltamento sullo stesso punto in questo file (prima "solo dopo
l'accettazione" → poi "già dalla prima richiesta", CLAUDE.md §12 → ora di
nuovo "solo dopo l'accettazione"): *"non devono già comparire il numero di
telefono e il contatto email né l'indirizzo, ma solo la città... tutte le
info relative al cliente gli verranno visualizzate solo ad accettazione
del lavoro"*. In aggiunta, cliccando il nome del cliente si deve poter
vedere nome cognome, data di nascita e immagine del profilo (identità, non
contatto) — e le recensioni ricevute dal cliente restano visibili subito,
non essendo un dato di contatto personale e già pubbliche solo a "doppio
cieco" sbloccato per costruzione (CLAUDE.md §40).

- **`ProfessionalsService.getMyLeads`**: la proiezione `guidedRequest` non
  espone più `clientPhone`/`clientEmail`/`address` (rimossi dal tipo
  `ProfessionalLead.guidedRequest`, non solo azzerati — un professionista
  aggiornato al nuovo frontend non li riceve proprio nella risposta JSON,
  verificato esplicitamente con un controllo di assenza della chiave, non
  solo `null`). Nuovo campo `clientBirthDate` (solo data, `YYYY-MM-DD`, da
  `client.birthDate`) per la scheda identità. `city` resta l'unico
  riferimento geografico pre-accettazione, come già era per il resto del
  prodotto (profilo pubblico, ricerca).
- **`ClientProfileModal.tsx`**: props `phone`/`email` rimosse, sostituite
  da `birthDate` (formattata in italiano, "15 maggio 1990") — la scheda
  aperta cliccando il nome mostra ora solo identità (nome, data di
  nascita, avatar) + recensioni ricevute, mai un contatto. Un testo fisso
  in fondo ("Telefono, email e indirizzo saranno visibili qui e in agenda
  non appena il preventivo verrà accettato") sostituisce il vecchio blocco
  telefono/email/WhatsApp — stesso messaggio, quasi verbatim, già usato
  nella primissima versione di questo componente prima del ribaltamento
  precedente (§12), riproposto qui perché torna ad essere vero.
- **`RequestCard`** (`/dashboard/richieste`, l'unico consumatore reale di
  `ClientProfileModal` — l'import in `dashboard/page.tsx` non era mai
  stato usato, rimosso nello stesso giro): tre variabili derivate
  (`revealedPhone`/`revealedEmail`/`revealedAddress`) sostituiscono i
  riferimenti diretti a `gr.clientPhone`/`clientEmail`/`address` —
  valorizzate solo quando la prop `booking` (già passata al componente,
  presente solo per gli stadi `accettata`/`completata`) esiste, lette da
  lì (`booking.recipientPhone ?? booking.clientPhone`,
  `booking.clientEmail`, `formatBookingAddress(booking)` — la stessa
  fonte già in uso da tempo su `AcceptedJobCard`/`/dashboard`, mai
  duplicata qui prima d'ora). Pre-accettazione: solo `gr.city` mostrata
  (sia nell'intestazione collassata sia nel pannello espanso), un testo
  "Telefono, email e indirizzo saranno visibili qui ad accettazione del
  preventivo" al posto dei vecchi campi, il tasto "Chat" (cronologia
  interna) resta comunque disponibile — non è un dato di contatto
  personale del cliente, è il canale di messaggistica della piattaforma
  stessa. Il filtro di ricerca della lista (`search`) non filtra più su
  `guidedRequest.address` (campo non più disponibile a questo livello) ma
  su `city`, oltre al nome cliente già esistente.
- Verificato end-to-end con l'API locale (non solo typecheck/build) e un
  agente Playwright: richiesta guidata inviata direttamente a un
  professionista di test → prima di ogni preventivo, `GET
  /professionals/me/leads` non contiene le chiavi `clientPhone`/
  `clientEmail`/`address` sul `guidedRequest` (assenza confermata, non
  solo `null`), contiene `clientBirthDate` corretto; UI: nessun testo con
  il vero numero di telefono/email/indirizzo del cliente ovunque nel DOM
  della card prima dell'accettazione, click sul nome apre la scheda con
  nome+data di nascita formattata+avatar, nessun telefono/email nella
  scheda; preventivo inviato e accettato → `GET
  /professionals/me/bookings` torna ad esporre `clientPhone`/`clientEmail`
  (via `Booking`, invariato) → UI: telefono/email/indirizzo pieno
  visibili nella stessa card, ora nello stadio "accettata", con
  bottoni WhatsApp/Chiama funzionanti. Typecheck pulito su tutti i package
  (`shared`, `database`, `api-client`, `api`, `web`, `mobile`), build di
  produzione `apps/web` verde (28 route).

---

## 46. Chat in tempo reale, pallini "live" per singola richiesta, data/ora manuale nel preventivo con anteprima "in attesa" in agenda, inbox "Chat"

Quattro richieste esplicite dell'utente, stesso giro di lavoro.

**Chat in tempo reale in `TimelineModal`** — richiesta esplicita
dell'utente: "la chat deve aggiornarsi real time, in modo da poter avere
una conversazione fluida". Prima la cronologia veniva caricata una sola
volta all'apertura del popup, mai più finché non lo si richiudeva e
riapriva. `TimelineModal.tsx`: nuovo poll ogni 4 secondi (`TIMELINE_POLL_MS`)
mentre il popup resta aperto — refetch completo della cronologia (nessun
endpoint "solo i nuovi" introdotto apposta, la cronologia di una singola
richiesta resta piccola, coerente con la scala di lancio §7), confrontato
solo per id dell'ultimo evento per evitare un re-render ad ogni tick senza
novità. Scroll automatico in fondo quando arriva un evento nuovo, **ma
solo se chi guarda era già vicino al fondo** (soglia 140px,
`isNearBottomRef`/`onScroll` sul backdrop, che è la regione scorrevole
intera — stesso motivo già documentato in CLAUDE.md §35): chi ha scrollato
in su per rileggere la cronologia non viene strappato via da un messaggio
in arrivo. Invio di un proprio messaggio forza sempre lo scroll in fondo,
indipendentemente dalla posizione corrente.

**Pallini "Contatta/Cronologia" aggiornati dal vivo, per singola
richiesta/preventivo/prenotazione** — richiesta esplicita dell'utente: "al
professionista ancora non si capisce che è arrivato un nuovo messaggio da
quella particolare richiesta; controlla anche lato cliente". I pallini per
singolo elemento (introdotti in CLAUDE.md §43) venivano calcolati una sola
volta all'apertura di `/dashboard`, `/dashboard/richieste` e
`/le-mie-richieste` — un messaggio arrivato mentre si resta sulla pagina
non compariva mai finché non si ricaricava. Ora ogni pagina ripete lo
stesso fetch (`GET /notifications/unread`) ogni 15 secondi
(`UNREAD_BADGE_POLL_MS`) finché resta aperta: ogni tick trova solo le
notifiche arrivate dopo il `markNotificationsRead()` del tick precedente
(mai le stesse due volte, stessa garanzia anti-race-condition già
documentata in CLAUDE.md §43), quindi i conteggi si **sommano**
(`mergeCounts`/`mergeIds`, nuovi helper in `notificationSections.ts`)
invece di sostituire lo stato — altrimenti un pallino già mostrato
sparirebbe al tick successivo pur non essendo stato letto.
- **Il pallino deve sparire aprendo la conversazione, ma non per
  sempre** — nuovo hook `useDismissableUnreadCount`
  (`apps/web/src/lib/useDismissableUnreadCount.ts`): ricorda "a quale
  totale ero quando ho aperto l'ultima volta" e mostra solo la
  differenza, così un nuovo messaggio arrivato dopo la chiusura del
  popup fa ricomparire il pallino con il conteggio corretto invece di
  restare azzerato per sempre o rimostrare l'intero storico. Cablato in
  ogni punto che apre direttamente un `TimelineModal`:
  `AcceptedJobCard` (`/dashboard`), `RequestCard` (`/dashboard/richieste`
  — un solo hook per l'intera card, condiviso da tutti i bottoni che
  aprono la stessa cronologia in stadi diversi: Chat/Contatta/Cronologia),
  `QuoteCard`/`BookingRow` (`/le-mie-richieste`). Un caso non copribile
  dall'hook (un componente per elemento, non chiamabile dentro un
  `.map()`): la riga "Inviata a" per professionista in `GuidedRequestCard`
  — più professionisti condividono lo stesso componente, quindi la stessa
  logica differenziale vive in una `Map<string, number>`
  "conteggio al momento dell'apertura" per chiave composita invece che in
  uno `useState` per elemento.
- `LeadSummaryRow` (`/dashboard`, riepilogo compatto) non apre un
  `TimelineModal` direttamente — resta un link a `/dashboard/richieste` —
  quindi il suo pallino resta "informativo" (aggiornato dal poll, ma non
  dismissabile lì: si azzera aprendo l'inbox completa, dove vive la vera
  conversazione).

**Data/orario manuale nell'invio preventivo, "In attesa" sull'agenda** —
richiesta esplicita dell'utente: "nella selezione della data orario in
base all'agenda con la tendina, dai la possibilità di inserire una data
orario manualmente, che verrà poi aggiunta all'agenda in maniera
indipendente dagli slot aggiunti dal professionista, con la dicitura in
attesa se il cliente non ha ancora accettato un preventivo".
- **Form "Invia preventivo"** (`RequestCard`, `/dashboard/richieste`):
  prima, con fasce configurate per la modalità della richiesta, l'unica
  scelta era la tendina; senza fasce, un semplice `<input type="date">`
  di ripiego (nessun orario). Ora un link "Inserisci data e orario
  manualmente" (sempre visibile insieme alla tendina, non solo come
  ripiego) rivela data+ora inizio+ora fine, con "Usa un orario dalla mia
  agenda" per tornare alla tendina. **Nessuna validazione lato server
  contro `AvailabilitySlot` per questo campo** (non c'era già:
  `QuotesService.createOrUpdate` accetta da sempre qualunque
  `estimatedStartDate`/`estimatedEndDate`, solo la UI obbligava a
  scegliere da una fascia reale) — a differenza della contro-proposta
  (`counterProposeDate`, che rivalida sempre contro l'agenda reale via
  `resolveFreeExactSlot`), volutamente non toccata in questo giro: il
  backend lì richiede davvero una fascia esistente, estendere la stessa
  libertà avrebbe richiesto cambiare la logica di validazione stessa, non
  richiesto dall'utente ("quando il professionista manda i preventivi" —
  scoped al primo invio).
- **Anteprima "In attesa" in agenda** (`/dashboard/agenda`, tab
  "Prenotazioni"): nuovo fetch di `GET /professionals/me/leads` (già
  esistente, riusato) — ogni preventivo `SENT`/`MODIFICATION_REQUESTED`
  ancora senza una `Booking` (`quote.bookingStatus === null`, campo già
  esposto da CLAUDE.md §38) compare sul calendario come chip tratteggiata
  color ottone "HH:MM–HH:MM · In attesa" (giorno/settimana) o un pallino
  vuoto bordato in vista mese — stesso trattamento visivo già introdotto
  per i "lavori esterni" (§45), colore distinto per non confondere le tre
  categorie (Booking reale: bordo pieno; lavoro esterno: tratteggiato
  grafite "· Esterno"; preventivo in attesa: tratteggiato ottone "· In
  attesa"). Vale per **qualunque** preventivo in attesa, non solo quelli
  con data inserita a mano — richiesta esplicita dell'utente formulata in
  termini generali ("con la dicitura in attesa se il cliente non ha
  ancora accettato"), e comunque coerente: prima di questa funzionalità
  nessun preventivo (nemmeno quello scelto dalla tendina) aveva un modo di
  comparire sull'agenda finché non veniva accettato. Click sulla chip
  naviga a `/dashboard/richieste` (`router.push`, nuovo `useRouter` in
  questo file) — nessun popup di dettaglio dedicato, la vera pipeline
  resta quella pagina. Nessun impatto su capienza/`AvailabilitySlot`: una
  `Quote` non ha mai consumato capacità, solo una `Booking` lo fa
  (invariato) — puramente un promemoria visivo.

**Inbox "Chat"** — richiesta esplicita dell'utente: "aggiungi un menu
Chat, dove saranno presenti tutte le chat di tutti i preventivi, dove
appena clicchi sul menu ci sarà solo il nome del cliente o professionista
con l'ultimo messaggio ricevuto/inviato; e poi cliccando apparirà la chat
completa con tutti i messaggi e aggiornamenti" — con successiva precisazione
"nell'anteprima deve esserci indicato anche il gruppo data orario
dell'ultimo messaggio ricevuto/inviato" (già previsto nel design, non un
cambio successivo).
- **`TimelineService.listThreadsForUser(userId)`** (nuovo,
  `apps/api/src/timeline/timeline.service.ts`): un thread è la stessa
  coppia (richiesta guidata, professionista) già usata da
  `TimelineModal`/`ConversationEvent` — una singola query su tutti i
  `ConversationEvent` dove l'utente compare come cliente
  (`guidedRequest.clientId`) O come professionista
  (`professionalProfile.userId`), ordinata per `createdAt desc`, raggruppata
  in memoria tenendo solo il **primo** evento incontrato per coppia (già
  il più recente, l'ordine di scoperta ordina naturalmente anche l'elenco
  finale di thread senza un secondo sort). Nessuna paginazione — stessa
  scala di lancio già documentata ovunque nel progetto (§7). Nuovo tipo
  `ChatThreadSummary` (`packages/shared/src/dashboard.ts`):
  `otherPartyName`/`otherPartyImageUrl` (nome+cognome/avatar del cliente o
  `businessName`/immagine del professionista, a seconda di chi guarda —
  cliente eliminato → "Account eliminato", stesso trattamento già in uso
  altrove), `categoryLabel`, `lastMessage`, `lastMessageHasMedia`,
  `lastMessageAt`, `lastMessageIsMine`. Nuovo `GET
  /guided-requests/chat-threads` (JWT), route letterale — nessun conflitto
  con le rotte `:id/...` esistenti nello stesso controller, verificato che
  non esista già una `GET /guided-requests/:id` bare.
- **`/chat`** (nuova pagina, `apps/web/src/app/chat/page.tsx`): elenco a
  righe zebrate (stesso pattern già in uso in `/admin`), avatar+nome+
  categoria+anteprima ultimo messaggio (prefisso "Tu: " se l'ultimo
  messaggio è dell'utente stesso, "Foto/video allegati" se l'ultimo evento
  aveva solo allegati) + data/ora dell'ultimo messaggio (solo orario se
  oggi, altrimenti giorno+mese+orario) + pallino non letto per thread
  (stesso `unreadThreadCounts`/poll da 15s/`useDismissableUnreadCount` già
  in uso altrove in questo giro). Click apre lo stesso `TimelineModal` già
  esistente (real-time via poll, Feature 1) — nessuna cronologia
  duplicata, la pagina mostra solo l'anteprima. Stato vuoto
  (`EmptyState`), guardia di login (stesso pattern di
  `/professionisti-salvati`), esclusa da `robots.ts` (pagina dietro login,
  stesso trattamento già riservato a `/account`/`/le-mie-richieste`/ecc.).
- **Voce di menu "Chat"** (`accountMenuItems.ts`, entrambi i ruoli) con
  pallino proprio: `accountMenuUnreadCounts` (`notificationSections.ts`)
  guadagna una chiave `/chat` che conta solo
  `TIMELINE_MESSAGE_FROM_CLIENT`/`TIMELINE_MESSAGE_FROM_PROFESSIONAL` (un
  sottoinsieme di "richieste", mai entrambi i tipi insieme per lo stesso
  utente essendo ciascuno destinato a un solo lato del thread).

Typecheck pulito su tutti i package (`shared`, `database`, `api-client`,
`api`, `web`, `mobile`), build di produzione `apps/web` verde (29 route,
`/chat` nuova). Verificato end-to-end con un agente Playwright contro
l'API locale reale (non solo typecheck/build) — Feature 1 (chat in tempo
reale), Feature 3 (data manuale + chip "In attesa") e Feature 4 (inbox
`/chat`) tutte confermate PASS con evidenza concreta (tempi di consegna
messaggio in tempo reale misurati a 1,19s/1,59s tra le due direzioni,
`GET /professionals/me/leads` con `estimatedStartDate`/`estimatedEndDate`
identici a quanto digitato a mano, chip "In attesa" sostituita
correttamente da una prenotazione reale dopo l'accettazione, righe
`/chat` verificate contro `GET /guided-requests/:id/timeline` come
riferimento). Zero errori console/pageerror, zero overflow orizzontale a
1280px/390px in tutti i flussi.

**Tre bug reali trovati dall'agente sui pallini "Contatta/Cronologia" e
corretti nello stesso giro** (Feature 2, "pallini live"):
1. `RequestCard` (`/dashboard/richieste`) non mostrava mai `<UnreadDot>`
   negli stadi `da_quotare`/`modifica_richiesta` — il dato
   (`leadUnreadCounts`) era già corretto, mancava solo il render in due
   dei quattro stadi (il bottone "Chat" nella sezione "Dettagli cliente" e
   i due bottoni "Rispondi"). Aggiunto `<UnreadDot count=
   {effectiveUnreadCount} />` in tutti e tre i punti mancanti.
2. **`AcceptedJobCard`** (`/dashboard`) **e `BookingRow`**
   (`/le-mie-richieste`) non si accendevano mai per un nuovo messaggio di
   chat su un lavoro già accettato — erano cablati solo su
   `bookingUnreadCounts`/`unreadBookingCounts` (chiave `bookingId`), ma le
   notifiche `TIMELINE_MESSAGE_FROM_CLIENT`/`FROM_PROFESSIONAL` portano
   nel payload solo `guidedRequestId`+`professionalProfileId`, mai
   `bookingId`.
3. **`QuoteCard`** (`/le-mie-richieste`) stesso problema, con
   `quoteUnreadCounts`/`unreadQuoteCounts` (chiave `quoteId`) al posto di
   `bookingUnreadCounts`.
   
   Corretti tutti e tre con lo stesso principio: una nuova mappa
   `threadUnreadCounts` (chiave composita `guidedRequestId:
   professionalProfileId`, dallo helper già esistente `unreadThreadCounts`
   — usato finora solo per la sezione "Inviata a") sommata al conteggio
   già esistente tramite un nuovo helper `combineUnreadCounts`
   (`apps/web/src/lib/notificationSections.ts`) — sicuro contro il doppio
   conteggio perché nessun tipo di notifica porta contemporaneamente
   `bookingId`/`quoteId` **e** la coppia `guidedRequestId`+
   `professionalProfileId` (verificato su tutti i punti di `notify()`
   esistenti in `apps/api/src`: solo `LEAD_DECLINED` e i due
   `TIMELINE_MESSAGE_*` portano quella coppia, nessuno dei due porta anche
   `bookingId`/`quoteId`). Per `AcceptedJobCard` la chiave usa
   `myProfileId` (il professionista guarda sempre e solo il proprio
   thread); per `BookingRow`/`QuoteCard` usa `booking.professionalProfileId`/
   `quote.professionalProfileId`, già esposti su `ClientBooking`/
   `ClientGuidedRequest.quotes[]`.

**Bug incidentale trovato dall'agente fuori scope, corretto nello stesso
giro perché reale e a basso rischio**: `AuthContext.loadUser`
(`apps/web/src/lib/AuthContext.tsx`) trattava qualunque errore di
`apiClient.me()` — inclusi un fallimento di rete (`TypeError`) o una
richiesta interrotta dalla navigazione (`AbortError`, es. un utente che
clicca un link subito dopo il caricamento della pagina, prima che
`/auth/me` risponda) — esattamente come un token non valido, cancellando
il JWT salvato e disconnettendo silenziosamente una sessione perfettamente
valida solo per sfortuna di tempistica (riprodotto in modo affidabile
dall'agente con navigazioni ravvicinate). Corretto distinguendo l'errore:
solo un `Error` "vero" (una risposta HTTP non-2xx effettivamente ricevuta
dall'API, l'unico caso in cui `packages/api-client`'s `request()` lancia
un errore che non sia `TypeError`/`DOMException`) disconnette l'utente —
un fallimento di rete/richiesta interrotta lascia lo stato invariato,
il prossimo tentativo (poll, ricarica, navigazione) riprova da solo.

Tutti e quattro i fix (tre pallini + AuthContext) riverificati con un
secondo giro di agente Playwright end-to-end mirato contro l'API locale
reale, tutti confermati **PASS**: `AcceptedJobCard` accende il pallino
entro pochi secondi da un messaggio del cliente su un lavoro già accettato
(prima non si accendeva mai) e lo azzera aprendo/chiudendo la cronologia;
`RequestCard` mostra ora il pallino sia sul bottone "Chat" sia su
"Rispondi" negli stadi `da_quotare`/`modifica_richiesta` (prima assente in
entrambi); `QuoteCard`/`BookingRow` lato cliente si accendono
correttamente per un messaggio del professionista, sia su un preventivo
non ancora accettato sia su un lavoro già accettato. Per `AuthContext`:
verificato che il percorso di logout "vero" resta intatto (un token
corrotto/non valido viene comunque rimosso al prossimo giro), e — con
`page.route()` che forza l'abort della richiesta `/auth/me` al primo
caricamento — che il token NON viene più cancellato da un fallimento di
rete/richiesta interrotta (il codice precedente lo avrebbe cancellato), con
recupero automatico della sessione al tentativo successivo andato a buon
fine. Zero regressioni trovate.

---

## 47. Deep link chat→richiesta, chat che non torna più in cima, bottoni "vai alla richiesta completa", cliente cliccabile in agenda, data manuale anche nella modifica/controproposta

Sei richieste esplicite dell'utente, stesso giro di lavoro successivo al
§46 (chat in tempo reale, pallini live, data manuale nel primo preventivo,
inbox "Chat").

**Deep link da `/chat` alla richiesta/preventivo** — richiesta esplicita
dell'utente: "nella pagina chat dai la possibilità di andare alla pagina
del preventivo/informazioni di quella determinata chat". Ogni riga di
`/chat` (`apps/web/src/app/chat/page.tsx`) ha ora, oltre al click che apre
`TimelineModal`, un piccolo bottone icona quadrato a destra (`file-text`,
`stopPropagation` per non aprire anche il popup — stesso pattern già in
uso in `ProfessionalCard.tsx`) che naviga a
`/dashboard/richieste?open=<guidedRequestId>` (professionista) o
`/le-mie-richieste?open=<guidedRequestId>` (cliente), tramite un nuovo
helper `requestDestination(thread)` basato su `viewerRole`. Entrambe le
pagine di destinazione hanno guadagnato supporto al deep-link
(`?open=<id>`): un nuovo `useEffect` (avvolto in `<Suspense>` per
`useSearchParams`, gotcha ricorrente già documentato altrove in questo
file) trova la card corrispondente, la espande, seleziona la tab/pagina di
paginazione giusta e scorre fino a lì (`scrollIntoView`). In
`le-mie-richieste/page.tsx` l'effetto è stato posizionato **prima** dei
`return` anticipati di `isLoading`/`!user` (violazione delle Rules of
Hooks altrimenti — gli stessi `sortedRequests`/`visibleRequests` usati
altrove sono calcolati dopo quei guard, quindi l'effetto ricalcola
filtro/ordinamento a mano con l'helper già esistente `sortListItems`
invece di dipendere da quei valori memoizzati).

**Bug reale: la chat torna in cima da sola durante una conversazione
lunga** — segnalato dall'utente: "quando si tiene aperta la chat ed è
lunga e viene visualizzata la parte inferiore della chat ritorna
automaticamente alla parte superiore". Causa reale in
`TimelineModal.tsx`: il confronto "niente di nuovo, non fare nulla" nel
poll (§46) era `freshLastId === lastEventIdRef.current && fresh.length ===
(events?.length ?? 0)` — la seconda metà confrontava contro `events`, uno
stato letto dentro la closure del `setInterval` creato dall'effetto, mai
incluso nel suo array di dipendenze: quel valore restava **permanentemente
a `0`/`null`** per tutta la vita del componente (closure stale), quindi
ogni singolo tick da 4s (§46) chiamava comunque `setEvents(fresh)` — non
per una modifica reale, solo per il confronto rotto — ri-innescando ad
ogni giro l'effetto di auto-scroll, che riportava sempre la vista in cima
prima che l'utente riuscisse a leggere in fondo. Corretto rimuovendo del
tutto il secondo confronto: `if (freshLastId === lastEventIdRef.current)
return;` — un `ref` non è mai stale, e i messaggi in questa app non
vengono mai modificati/cancellati, quindi il solo confronto sull'ultimo id
è sufficiente e corretto.

**`TimelineModal` reso più fruibile mobile+desktop** — richiesta
immediatamente successiva dell'utente ("rendendola più fruibile sia da
mobile che desktop"), risolta insieme al bug sopra riscrivendo la
struttura: il backdrop non è più `overflow-y:"auto"` con contenuto
potenzialmente più alto del viewport (causa strutturale del bug §35 già
corretto altrove, qui prevenuta anziché rincorsa); la card ha ora
`maxHeight="85vh"` + `overflow="hidden"`, divisa in tre blocchi con
`flexShrink={0}` su header e footer e un nuovo `<div>` centrale
`flex:1 overflowY:"auto" minHeight:0` (il classico reset necessario perché
un figlio flex rispetti `overflow` senza quello, altrimenti ignorato) che
contiene solo i messaggi — header (titolo+chiudi) e footer (form di invio)
restano sempre visibili a schermo, mai scorrono via, indipendentemente da
quanto è lunga la conversazione.

**Bottone "Vai alla richiesta completa" nel dettaglio prenotazione
dell'agenda** — richiesta esplicita dell'utente: "quando nell'agenda si
clicca su una prenotazione... dai la possibilità tramite pulsante di
portarlo sulla richiesta completa". `BookingDetailPanel.tsx` guadagna una
nuova prop opzionale `onOpenFullRequest` (distinta da `onOpenTimeline`,
già esistente per "Contatta/Cronologia" — un bottone porta alla chat, l'altro
alla pagina intera della richiesta), resa come bottone aggiuntivo
("Vai alla richiesta completa", icona `chevron-right`) nella stessa riga
del bottone cronologia quando presente. `/dashboard/agenda/page.tsx` la
passa solo quando la prenotazione ha un `guidedRequestId`
(`router.push(\`/dashboard/richieste?open=${...}\`)`, riusa lo stesso
deep-link introdotto sopra per `/chat`).

**Nome cliente visibilmente cliccabile** — richiesta esplicita dell'utente:
"il cliente deve avere ben visibile che è cliccabile il nome del cliente
per visualizzare le informazioni come il rating" — riferito al nome del
professionista mostrato al cliente nelle proprie richieste/preventivi (il
professionista, non il cliente, ha un profilo pubblico con rating —
coerente col resto del prodotto). Il testo semplice è sostituito da uno
stile esplicito da link (`brand.cianografia`, sottolineato, icona
`chevron-right`, `accessibilityRole="button"`) nella sezione "Dettagli
cliente"/intestazione del preventivo su `/dashboard/richieste`.

**Data manuale anche nella "modifica"/controproposta del professionista**
— richiesta esplicita dell'utente, in due messaggi consecutivi: "ogni
volta che il professionista clicca su proponi un'altra data gli si deve
dare la possibilità di inserire un gruppo data orario che non è presente
in agenda, che poi verrà sempre inserita come detto in precedenza" +
"quindi visualizzabile in agenda come in attesa" — estende ai flussi di
trattativa (`counterProposeDate`, usato quando il professionista risponde
a una data proposta dal cliente con "Modifica") lo stesso principio già
introdotto per il primo invio del preventivo (§46), che lì non richiedeva
alcun cambiamento server-side (`createOrUpdate` non ha mai validato contro
l'agenda). Qui invece serviva un cambiamento reale: sia `proposeDate`
(cliente) sia `counterProposeDate` (professionista) chiamano
`resolveFreeExactSlot`, che **rifiuta sempre** un orario senza un
`AvailabilitySlot` corrispondente (`BadRequestException`).
- **Bypass mirato per la ri-affermazione della propria proposta
  (`proposeDate`, lato cliente)** — scoperto investigando l'item
  "picker del cliente": un cliente che voleva ri-selezionare esattamente
  la stessa data manuale già proposta dal professionista (per aggiungere
  solo una nota, es.) avrebbe sempre fallito, perché quella data non è
  mai stata backed da uno slot. Nuovo controllo `isSameAsCurrentProposal`
  (confronto diretto su `quote.estimatedStartDate`/`EndDate`): se il
  cliente ripropone esattamente il valore attuale, si salta del tutto
  `resolveFreeExactSlot` e si riusano i valori esistenti — nessun nuovo
  controllo di capienza necessario (l'orario non viene "riprenotato", solo
  riaffermato). `startChoosingDate()` (`le-mie-richieste/page.tsx`,
  `QuoteCard`) inietta ora anche la proposta corrente nell'elenco delle
  opzioni selezionabili se non coincide già con una fascia reale
  dell'agenda pubblica, etichettata "(proposta attuale)".
- **Libertà piena per `counterProposeDate` (lato professionista)** — a
  differenza del cliente (che sceglie sempre tra fasce reali o riafferma
  quella esistente), qui l'utente ha chiesto la stessa libertà di inserimento
  manuale già data al primo invio: nuovo campo opzionale
  `isManual` su `proposeQuoteDateSchema`/`ProposeQuoteDateInput`
  (`packages/shared`, condiviso con `counterProposeQuoteDateSchema` per
  definizione, ma **onorato solo da `counterProposeDate`** — `proposeDate`
  lo ignora, il cliente resta vincolato alle fasce reali o alla propria
  riaffermazione). `QuotesService.counterProposeDate`: se `input.isManual`
  è vero, salta `resolveFreeExactSlot` e costruisce
  `estimatedStartDate`/`estimatedEndDate` direttamente da
  `input.date`/`startTime`/`endTime` (stessa convenzione "wall clock UTC"
  già in uso in `resolveFreeExactSlot` stesso — `new Date(...)` +
  `setUTCHours`). Form "Modifica" in `RequestCard`
  (`dashboard/richieste/page.tsx`, `showCounterForm`): stesso pattern
  toggle "Inserisci data e orario manualmente"/"Usa un orario dalla mia
  agenda" già costruito per l'invio iniziale (§46) — quando l'agenda non
  ha fasce libere per la modalità richiesta, la modalità manuale è ora il
  default automatico invece di un vicolo cieco ("Nessuna fascia libera
  nella tua agenda", che prima non offriva alcuna via d'uscita). Testo
  esplicativo sotto i campi manuali: "Comparirà in agenda come 'In attesa'
  finché il cliente non accetta." — **nessun cambiamento necessario**
  al meccanismo che già mostra questa chip su `/dashboard/agenda`
  (`pendingQuotesOnDate`, §46): filtra genericamente su
  `quote.status === "SENT" || "MODIFICATION_REQUESTED"` +
  `estimatedStartDate`, quindi una data controproposta manualmente
  (che riporta lo stato a `SENT` con la nuova data) vi compare
  automaticamente, verificato e confermato dall'agente di verifica, non
  solo assunto.

Verificato in due giri distinti con agenti Playwright end-to-end contro
l'API locale reale (non solo typecheck/build):
- **Giro 1** (deep link + fix scroll chat): entrambe le feature **PASS**
  (27/27 controlli ciascuna). Deep link professionista→
  `/dashboard/richieste?open=...` e cliente→`/le-mie-richieste?open=...`
  verificati (card giusta espansa, scrollata in vista, anche con
  paginazione multi-pagina), click sulla riga (non sull'icona) apre ancora
  `TimelineModal` normalmente (nessuna regressione). Scroll: aperto già in
  fondo, resta pinnato per 10s di poll senza nuovi messaggi (prima
  saltava), un nuovo messaggio mentre si è in fondo fa scrollare in fondo,
  un nuovo messaggio mentre si è scrollati in su NON strappa via la
  posizione. Header/footer restano a posizione fissa su desktop e mobile
  (390px), l'intero popup entra nel viewport in altezza. Zero errori
  console reali, zero overflow orizzontale.
- **Giro 2** (data manuale in propose/counter-propose + bottoni g/h):
  entrambe le feature **PASS**, nessun bug reale trovato. Feature A
  (picker cliente): opzione "(proposta attuale)" iniettata correttamente
  per una data manuale del professionista senza fascia agenda
  corrispondente, riproposta con successo (`POST /quotes/:id/propose-date`
  → 201, prima avrebbe dato 400), confermata dal professionista → Booking
  creata con `scheduledAt` esatto. Feature B (controproposta manuale):
  form "Modifica" del professionista con zero fasce in agenda va dritto
  all'inserimento manuale (0 `<select>`, testo esplicativo presente),
  invio cattura `isManual: true` nel payload di rete → 201, quote tornata
  `SENT` con la nuova data, chip tratteggiata ottone "In attesa" verificata
  sul calendario "Prenotazioni" alla data corretta, click naviga a
  `/dashboard/richieste`; regressione con una fascia reale in agenda
  confermata invariata (dropdown di default, nessun `isManual` nel
  payload). Zero errori console reali, zero overflow orizzontale
  su desktop (1280px) e mobile (390px) su tutte le pagine coinvolte.

Typecheck pulito su tutti i package (`shared`, `database`, `api-client`,
`api`, `web`, `mobile`), build di produzione `apps/web` verde (29 route).

---

## 48. Verbale di Conformità — piano d'azione legale/privacy implementato

Richiesta esplicita dell'utente, con un ruolo assegnato ("considerando che
sei un avvocato specializzato in diritto dell'internet, del web;
consulente privacy/dpo; webmaster e sviluppatore"): un resoconto completo
degli obblighi legali applicabili al sito (GDPR, cookie law, D.Lgs.
70/2003 sul commercio elettronico, Digital Services Act, Codice del
Consumo per le recensioni, accessibilità) e l'operato da seguire —
prodotto come Artifact ("Verbale di Conformità": stato attuale, checklist
delle lacune con severità, piano d'azione con responsabile e tempistica).
Alla richiesta successiva ("implementiamo il sito seguendo il verbale di
conformità"), confermato con `AskUserQuestion` che i dati societari reali
(ragione sociale, P.IVA, sede legale, email privacy) non erano ancora
disponibili — l'utente ha scelto esplicitamente di procedere con tutti i
punti implementabili senza quei dati, lasciando gli altri due segnalati
come "da fare prima del lancio" (vedi in fondo a questa sezione, istruzione
esplicita dell'utente).

**Punti implementati:**

1. **User-Agent Nominatim con contatto configurabile** — l'header
   `User-Agent` inviato dal servizio di geocodifica
   (`apps/api/src/geocoding/geocoding.service.ts`, già in uso per il
   posizionamento preciso dei professionisti, CLAUDE.md §2) portava
   un'email personale hardcoded, richiesta dalla Usage Policy di Nominatim
   per identificare chi genera le richieste — non deve essere un dato
   personale scelto a caso nel codice. Ora legge
   `NOMINATIM_CONTACT_EMAIL` da variabile d'ambiente, con un fallback
   neutro (`non-configurato@example.invalid`) se assente — mai un crash.
2. **Consenso esplicito a Termini/Privacy in registrazione** — prima la
   registrazione (email+password o Google) non raccoglieva alcun consenso
   esplicito, solo implicito nell'atto di registrarsi. Nuovo
   `LEGAL_CONSENT_VERSION` (`packages/shared`, oggi `"2026-09-02"`,
   allineato alla data di ultimo aggiornamento di `/privacy`/`/termini`) —
   unica fonte di verità di "quale versione è stata accettata", da
   aggiornare ad ogni modifica sostanziale di quelle pagine. Due nuovi
   campi `User.legalConsentAt`/`legalConsentVersion` (Prisma), valorizzati
   sia da `AuthService.register()` sia da `verifyGoogleToken()` (nuovo
   parametro opzionale `legalConsent`, obbligatorio solo alla creazione di
   un account nuovo — un login su un account esistente non richiede di
   riaccettare nulla). `/registrati`: due checkbox distinte ("Accetto
   Termini di Servizio e Privacy Policy" con link `target="_blank"`,
   "Dichiaro di avere almeno 18 anni") bloccano l'invio del form (email o
   Google) finché non sono entrambe spuntate.
3. **Caricamento di Google Identity gated al consenso cookie** — lo script
   `accounts.google.com/gsi/client` (necessario per "Accedi con Google")
   veniva caricato incondizionatamente ad ogni visita della pagina di
   login/registrazione, prima ancora che l'utente avesse accettato o
   rifiutato i cookie — un problema di sequenza rispetto alla Cookie Law
   (consenso prima del caricamento di script di terze parti non
   strettamente necessari). `GoogleSignInButton.tsx` ora attende l'evento
   `cookie-consent-accepted` (emesso da `CookieBanner.tsx` al click su
   "Accetta") prima di iniettare lo script; se il consenso è già stato
   dato in una visita precedente (`hasCookieConsent()`, legge lo stesso
   flag già salvato da `CookieBanner`), lo script si carica subito. Il
   bottone resta visivamente disabilitato finché lo script non è pronto.
4. **Badge "In evidenza" sui profili con boost attivo** — la Verbale
   segnalava un problema di trasparenza pubblicitaria (DSA art. 26,
   Codice del Consumo): un professionista che paga per comparire più in
   alto in ricerca (`VisibilityBoost`, CLAUDE.md §1) non era in alcun modo
   distinguibile da uno che si trova lì per merito. Nuovo prop `boosted`
   su `ProfessionalCard` (`packages/ui`): badge "In evidenza" (icona
   `zap`, `brand.ottone`/nuovo token `brand.ottoneVelo` — stesso principio
   "ottone solo su pagamento" già stabilito nel redesign, CLAUDE.md §10)
   accanto al badge "Verificato" già esistente, propagato da
   `ResultsListWithMap.tsx` e `/professionisti-salvati`.
5. **Esportazione dati personali** (diritto di portabilità, art. 20 GDPR)
   — `GET /auth/me/export` (`AuthService.exportMyData`, JWT-guarded)
   restituisce un JSON strutturato con tutti i dati dell'account
   (profilo, richieste/prenotazioni proprie, recensioni scritte/ricevute).
   **Attenzione privacy applicata in fase di progettazione**: l'export
   delle prenotazioni di un cliente usa una `select` Prisma esplicita che
   esclude `professionalNote` (nota privata del professionista, mai
   vista dal cliente in nessun altro punto del prodotto — includerla
   nell'export sarebbe stata una fuga di dati non previste altrove).
   Bottone "Esporta i miei dati" in `/account`, scarica un file `.json`.
6. **Canale di segnalazione contenuti** (notice-and-action, Reg. (UE)
   2022/2065 art. 16) — nuovo modello Prisma `ContentReport`
   (`targetType` PROFESSIONAL_PROFILE/REVIEW/CLIENT_REVIEW, `reporterId`
   obbligatorio: il canale richiede login, semplificazione consapevole
   rispetto all'ideale DSA di un canale aperto a chiunque, documentata nel
   codice). Nuovo modulo `apps/api/src/content-reports/`
   (`POST /reports`, JWT-guarded, throttled 10/min). `ReportContentModal.tsx`
   (nuovo, `apps/web/src/components`): un solo componente condiviso per i
   tre tipi di contenuto segnalabile, montato in tre punti — bottone
   "Segnala" accanto a "Condividi il profilo" sul profilo pubblico
   (`ProfessionalDetailContent.tsx`, per l'intero profilo), un piccolo
   "Segnala" per singola recensione nello stesso file, e per singola
   recensione-sul-cliente in `ClientProfileModal.tsx` (nuova prop `token`,
   prima componente puramente di visualizzazione). Vista di risoluzione in
   `/admin` (`AdminService.listContentReports`/`resolveContentReport`,
   nuovo `GET /admin/reports`/`PATCH /admin/reports/:id`): `targetLabel`
   risolto "best effort" (nome attività o nome cliente) per non mostrare
   solo un ID grezzo agli amministratori, sezione "Segnalazioni contenuti"
   con bottoni Risolvi/Ignora.
7. **Pagina pubblica `/accessibilita`** — dichiarazione di accessibilità
   che documenta l'audit reale già svolto durante il redesign (CLAUDE.md
   §10 Fase 6: Lighthouse 100/100 su pagine chiave, skip link, ruoli ARIA,
   correzione WCAG 2.5.3), i limiti noti dichiarati onestamente (agenda e
   mappa, componenti "su misura" non ancora verificati con lo stesso
   dettaglio), e un canale di segnalazione (email segnaposto, vedi "da
   fare prima del lancio" sotto). Stesso componente condiviso `LegalPage`
   già in uso per `/privacy`/`/termini`/`/cookie`. Link aggiunto alla riga
   legale del footer.
8. **Registro delle attività di trattamento** (art. 30 GDPR) —
   `docs/registro-trattamenti.md` (nuovo, documento interno non collegato
   da nessuna pagina pubblica): un'attività di trattamento per ogni
   funzione reale del prodotto (registrazione, profilo pubblico,
   richiesta guidata, prenotazione, recensioni bilaterali, notifiche,
   waitlist, segnalazione contenuti, amministrazione), con finalità, base
   giuridica, categorie di dati/interessati, destinatari e conservazione
   — più una tabella dei responsabili del trattamento esterni reali
   (Cloudinary, Google, Render, Vercel, Nominatim) e di quelli non ancora
   attivi (Stripe, Resend, Twilio).

**Correzioni richieste dall'utente nello stesso giro** (bug reali
segnalati testando dal vivo, non pianificati nel Verbale):

- **Nota privata del professionista unificata** — "le note personali del
  professionista devono essere le stesse sia quando si apre il riquadro
  dall'agenda sia quelle inserite tramite richieste ricevute". Prima
  erano due campi Prisma indipendenti: `Booking.professionalNote`
  (agenda/`BookingDetailPanel`/`AcceptedJobCard`, esiste solo dopo una
  prenotazione) e `Lead.professionalNote` (`/dashboard/richieste`, esiste
  già dalla ricezione del lead, prima ancora di un preventivo) — lo
  stesso testo poteva divergere a seconda di dove veniva modificato.
  `Lead.professionalNote` resta l'unica fonte di verità (il Lead esiste
  da prima): `BookingsService.updateProfessionalNote` ora scrive lì
  (trovato tramite `booking.quote.guidedRequestId` +
  `professionalProfileId`, verificato che ogni Booking nata da un
  preventivo abbia sempre un Lead corrispondente — un `Quote` può essere
  creata solo se il professionista ha già ricevuto il lead) invece che
  sulla colonna `Booking.professionalNote`, che resta scritta solo per le
  prenotazioni dirette da agenda pubblica senza `GuidedRequest`
  (`bookAgendaSlot`, dormiente da CLAUDE.md §20).
  `ProfessionalsService.getMyBookings` risolve simmetricamente
  `professionalNote` dal Lead corrispondente (query batch, mai una per
  prenotazione) quando disponibile.
- **Bug reale: "Lavoro terminato" restava ricliccabile** —
  `/dashboard/richieste`: dopo aver completato un lavoro (che porta
  `booking.status` a `COMPLETED`), il bottone "Lavoro terminato"
  ricompariva finché non si ricaricava manualmente la pagina.
  `reloadLeads()` (chiamata da `onChanged` dopo ogni azione) ricaricava
  solo l'elenco `leads`, mai `bookings` — il `booking` passato a
  `RequestCard` (risolto da `bookingByRequestId`, derivato dallo stato
  `bookings`) restava quindi lo stesso oggetto stale, con `status`
  ancora `CONFIRMED`. Corretto ricaricando entrambe le liste insieme.
- **"Anche dalla parte del cliente deve poter cliccare su lavoro
  terminato come il professionista"** — l'azione esisteva già
  (`ClientCompleteModal` in `/le-mie-richieste`, gated su
  `booking.status === "COMPLETED"`, CLAUDE.md §40), ma il cliente non
  vedeva mai comparire il bottone senza un ricaricamento manuale: sia
  `/le-mie-richieste` che `/dashboard`/`/dashboard/richieste` ricaricavano
  le liste leads/bookings solo al primo montaggio, mai durante il poll
  periodico delle notifiche (ogni 15s) già esistente per i pallini "nuove
  notifiche" — un evento generato dall'altra parte (professionista che
  completa un lavoro, cliente che accetta/propone una data, ecc.) mentre
  la pagina restava aperta non si rifletteva mai in tempo reale.
  Corretto facendo ricaricare le liste (`reloadLeads()`/`reload()`) allo
  stesso poll che già aggiorna i pallini, su tutte e tre le pagine.
- **Tab filtro "Completate"** — nuova pillola in `/dashboard/richieste`
  (tra "Accettate" e "Scadute"), filtra sullo stadio `completata` (già
  esistente in `classifyLeadStage`, prima raggiungibile solo dal tab
  "Tutte") — nessuna modifica al calcolo di conteggio/filtro, entrambi già
  generici per stadio.

**Verificato end-to-end con l'API locale reale** (non solo typecheck) e un
agente Playwright dedicato, sei aree distinte tutte confermate **PASS**:
nota privata sincronizzata scrivendo da un lato e rileggendo dall'altro
(sia agenda→richieste che richieste→agenda); "Lavoro terminato" verificato
non più ricliccabile subito dopo la conferma, senza reload; aggiornamento
"live" osservato per davvero (pagina `/le-mie-richieste` lasciata aperta
mentre il professionista completava un lavoro via API, bottone "Lavoro
terminato" comparso da solo dopo ~14s di poll reale, nessuna azione
utente); tab "Completate" con conteggio e filtro corretti (3 card
completate isolate correttamente da una non completata); canale
segnalazione verificato su tutti e tre i tipi di target (profilo,
recensione, recensione-sul-cliente) più il ciclo admin completo
(segnalazione reale → visibile `OPEN` in `/admin` → risolta → sparisce dal
filtro `OPEN`, sia via API sia in UI con bottoni Risolvi/Ignora
funzionanti); `/accessibilita` raggiungibile con tutte le sezioni attese e
link presente nel footer. Zero bug applicativi reali trovati in questo
giro di verifica. Typecheck pulito su tutti i package (`shared`,
`database`, `api-client`, `ui`, `api`, `web`, `mobile`), build di
produzione `apps/web` verde (29 route, incluse le due nuove
`/accessibilita` e, indirettamente, il conteggio route invariato per le
altre modifiche essendo tutte su pagine già esistenti).

**Da fare prima del lancio** (istruzione esplicita dell'utente: "i punti
non implementati inseriscili nell'elenco da fare prima del lancio") —
punti del Verbale di Conformità non implementabili in questo giro perché
richiedono dati reali non disponibili in questa sessione, non un problema
di codice:
1. **Dati reali del titolare del trattamento** su `/privacy` (ragione
   sociale, sede legale, P.IVA, email privacy) — oggi segnaposto
   `[DA COMPILARE]`, già segnalato in CLAUDE.md al momento della prima
   stesura della pagina.
2. **Dati reali del prestatore** (D.Lgs. 70/2003 art. 7: ragione sociale,
   P.IVA, sede legale, PEC) nella riga legale del footer — volutamente
   omessa fin dal redesign "Vicinato" (CLAUDE.md §10, Fase 4) per lo
   stesso motivo, non ancora aggiunta.
3. **Email di contatto per l'accessibilità** — `/accessibilita` ha oggi
   lo stesso segnaposto `[DA COMPILARE]` per il canale di segnalazione,
   da sostituire con un indirizzo reale (può coincidere con l'email
   privacy del punto 1).
4. **`NOMINATIM_CONTACT_EMAIL`** — variabile d'ambiente da impostare su
   Render con l'email di contatto reale richiesta dalla Usage Policy di
   Nominatim (oggi assente, l'header ricade sul fallback neutro
   `non-configurato@example.invalid`, funzionante ma non conforme alla
   policy per un uso in produzione).
5. **Verifica delle condizioni contrattuali B2B/B2C quando Stripe verrà
   attivato** (già segnalato come rimandato in CLAUDE.md §9: mancano le
   chiavi reali) — in particolare diritto di recesso per gli abbonamenti
   SaaS venduti a professionisti (spesso ditte individuali, quindi
   potenzialmente consumatori ai fini del Codice del Consumo) e requisiti
   di fatturazione elettronica, da verificare con un commercialista/legale
   prima di abilitare i pagamenti reali — non affrontabile ora perché
   dipende da come sarà strutturata l'offerta commerciale reale, non dal
   solo codice.
6. **Rimuovere il blocco "Presto disponibile" dalla homepage**
   (`WaitlistBlock`, `ProfessionalsShowcase.tsx`, mostrato quando ci sono
   meno di `MIN_PROFESSIONALS_TO_SHOWCASE` (12) professionisti reali) —
   richiesta esplicita dell'utente (§50): non ancora rimosso, resta
   visibile finché l'offerta reale di professionisti non è sufficiente a
   sostituirlo con la vetrina vera (`RealShowcase`).

---

## 49. Ordine libero "Lavoro terminato", data manuale nella proposta cliente, homepage recensioni cliccabili + "Nuovi profili", agenda: vista annuale e ricerca full-text

Sei richieste esplicite dell'utente, stesso giro di lavoro.

**Il cliente può segnalare "Lavoro terminato" indipendentemente
dall'ordine** — richiesta esplicita dell'utente, ripetuta due volte per
essere sicuri di coprire entrambi i sintomi: prima `BookingsService.
clientConfirmComplete` (CLAUDE.md §40, doppio cieco lavoro terminato)
richiedeva `booking.status === "COMPLETED"`, cioè il cliente poteva
confermare solo **dopo** che il professionista aveva già cliccato "Lavoro
terminato" — un cliente che voleva segnalare la fine del lavoro per primo
restava bloccato. Guardia allentata ad accettare sia `CONFIRMED` sia
`COMPLETED`, messaggio d'errore aggiornato ("Puoi segnalare come
terminato solo un lavoro confermato."). **Non toccato deliberatamente**:
`ReviewsService.create` continua a richiedere `booking.status ===
"COMPLETED"` per scrivere una recensione — il cliente può confermare
prima, ma recensire resta subordinato anche alla conferma del
professionista (o al timeout di 3 giorni che sblocca comunque il "doppio
cieco", invariato).

**Picker "Altro" nella proposta di data del cliente** — richiesta
esplicita dell'utente: "quando il cliente risponde ad una proposta
preventivo nel menu a tendina della data orario, dai la possibilità di
selezionare 'Altro'". Stesso principio già introdotto per il
professionista (`counterProposeDate`, CLAUDE.md §47) esteso qui al lato
cliente (`QuotesService.proposeDate`): se `input.isManual` è vero, la
fascia non viene più cercata nell'agenda reale del professionista
(`resolveFreeExactSlot`, che avrebbe sempre rifiutato un orario libero
inventato) — costruita direttamente da `date`/`startTime`/`endTime` con lo
stesso principio "wall clock UTC" già in uso in tutto il modulo agenda.
La logica di riaffermazione della propria proposta attuale
(`isSameAsCurrentProposal`, introdotta in un giro precedente) resta
prioritaria e indipendente: prova prima quella, poi eventualmente
`isManual`, infine la ricerca in agenda. `QuoteCard` (`/le-mie-richieste`)
aggiunge una voce "Altro (data e orario personalizzati)" nel `<select>`
esistente, con tre campi (data/ora inizio/ora fine) mostrati solo quando
selezionata.

**Homepage — "Ultime recensioni" cliccabili + "Nuovi profili" carosello**
— richiesta esplicita dell'utente: "in home page, ultime recensioni,
devono essere cliccabili e portare alla recensione in questione, dove
saranno visualizzate le ultime 5 recensioni inserite; al di sotto
inserire oggetti nuovo: Nuovi profili su *nome pagina*..." (con screenshot
di riferimento miodottore.it: card con foto tonda in alto a sinistra, nome
in grassetto, specialità+città sotto, link "Mostra profilo", frecce
prev/next).
- `ReviewsService.getRecentPublic` (`GET /reviews/recent`): limite da 6 a
  **5**, e ora espone anche `professional.id` (mancava del tutto — senza
  quello non si può costruire un link verso il profilo).
- `RecentReviews.tsx`: ogni card avvolta in `next/link` verso
  `/professionista/{id}#recensione-{reviewId}` — stesso pattern "intera
  card cliccabile via Link con le prop flex spostate sul Link stesso"
  già in uso altrove nel sito (es. `/le-mie-richieste`). Nuovo ancoraggio
  in `ProfessionalDetailContent.tsx`: `<div id={"recensione-"+review.id}
  style={{scrollMarginTop:96}} />` prima di ogni card recensione (stesso
  principio già in uso per `#agenda` nello stesso file) — click sulla
  card in home naviga al profilo e scrolla fino alla recensione esatta.
- **`NewProfilesCarousel.tsx`** (nuovo, `apps/web/src/components`):
  riusa la stessa prop `professionals` già scaricata una volta per
  l'intera home (nessuna nuova chiamata API), riordinata localmente per
  `createdAt` discendente (stesso principio già in uso per
  `ProfessionalsShowcase`/`RealShowcase` — l'ordinamento di ricerca vero,
  boost→rating→recensioni, resta invariato ovunque altrove), primi 21.
  Nessuna soglia minima come `ProfessionalsShowcase` (quella esiste per
  non far sembrare vuota una "vetrina in evidenza" — questo è
  semplicemente l'elenco dei più recenti, corretto anche con pochi
  profili): la sezione è assente solo se `professionals.length === 0`.
  Card: avatar 64px (foto vera o iniziali, mai il fallback stock
  temporaneo di `ProfessionalsShowcase` — quell'eccezione era scoped
  esplicitamente a quel solo componente) + nome grassetto, categoria,
  città, "Mostra profilo →" — intera card un `next/link` verso
  `/professionista/{id}`. Layout responsivo (1 card visibile da
  cellulare, 3 da desktop) non esprimibile solo con prop Tamagui: `<style
  jsx>` con card a `width:100%` sotto 700px e `calc((100% - 32px)/3)`
  sopra, dentro un track `overflow-x:auto` con `scroll-snap-type: x
  mandatory`. Le freccette riusano la stessa classe globale
  `.category-carousel-arrow` (`globals.css`, già nascosta su dispositivi
  touch-only via `@media (hover:none)`) — evita di duplicare quella
  regola. Montato in `HomeContent.tsx` subito dopo `<RecentReviews />` e
  prima di `<HomeFaq />`.
  **Falso positivo in una prima verifica**: un agente Playwright aveva
  segnalato la sezione rotta su desktop (card impilate verticalmente,
  frecce senza effetto, click senza navigazione) — causa reale isolata e
  confermata: non un bug del componente, ma corruzione residua del
  dev-server locale dopo che una `next build` di produzione era stata
  lanciata per errore mentre `next dev` era ancora in esecuzione sulla
  stessa cartella `.next` (le due build condividono la cartella, un
  `next build` concorrente corrompe gli asset statici del dev server in
  corso). Un primo riavvio (kill soft + `rm -rf .next`) non era bastato a
  ripulire del tutto lo stato; un secondo riavvio più aggressivo (kill
  esplicito dei PID + `rm -rf .next` + riavvio pulito) ha risolto: verificato
  con un controllo diretto (`document.styleSheets`/computed style) che le
  regole `<style jsx>` di `NewProfilesCarousel`/`MegaMenu` mancavano del
  tutto nel CSSOM prima del secondo riavvio e sono tornate presenti dopo —
  poi riverificato l'intero Feature 2 (3 card visibili a 1280px, freccia
  che avanza `scrollLeft`, click sull'intera card che naviga a
  `/professionista/{id}`, 1 card a 390px con zero overflow) tutti PASS.
  **Lezione per il futuro**: mai lanciare `next build` mentre `next dev`
  gira sulla stessa cartella dell'app durante una sessione di sviluppo
  locale — usare una working copy separata o fermare il dev server prima.

**Agenda professionista — calendario "Prenotazioni": vista "Anno" +
ricerca full-text** — due richieste esplicite dell'utente nello stesso
messaggio: "in agenda, inserisci anche la possibilità di avere una lista
annuale" e "sempre in agenda inserisci un riquadro dove l'utente può
effettuare una ricerca e nei risultati ci sarà non solo la ricerca per
nome utente o città o via ma qualsiasi prenotazione dove in qualsiasi
campo c'è la parola o parte della parola che si vuole ricercare".
- **`CalendarShell.tsx`**: nuovo `CalendarView` `"year"` + prop opzionale
  `renderYearList?: () => ReactNode` — **puramente opt-in**: il pulsante
  "Anno" compare nella riga Giorno/Settimana/Mese solo quando la prop è
  passata. Il calendario "Disponibilità" (che non la passa) resta
  invariato, zero rischio di regressione lì — verificato esplicitamente
  che lì compaiono solo 3 pulsanti, 4 su "Prenotazioni". Navigazione
  ±1 anno (`addYearsUtc`, nuovo helper in `calendarDates.ts`), swipe
  orizzontale disattivato in "Anno" come già in "Mese" (una lista
  scorrevole verticalmente, lo swipe orizzontale confliggerebbe).
- **`buildAgendaListItems()`** (`apps/web/src/app/dashboard/agenda/
  page.tsx`): unifica Booking reali, lavori esterni e preventivi "in
  attesa" (stessa logica già usata da `bookingsOnDate`/
  `externalJobsOnDate`/`pendingQuotesOnDate` per la griglia, qui senza
  filtro di data) in `AgendaListItem[]`, ciascuno con un `searchText`
  precalcolato — concatenazione minuscola di **ogni** campo pertinente
  (nome cliente, telefono, email, indirizzo strutturato completo,
  categoria, descrizione, nota privata del professionista, nota di
  annullamento, nome delle voci del preventivo/importo finale, e
  l'etichetta italiana dello stato stesso — cercare "confermata" trova le
  prenotazioni confermate, non solo un nome) — richiesta letterale
  dell'utente "qualsiasi campo" presa alla lettera.
- **Vista "Anno"** (`renderBookingYearList`): filtra gli eventi
  sull'anno di `bookingCurrentDate`, raggruppati per mese (solo i mesi
  con almeno un evento compaiono, stesso principio "niente sezioni
  vuote" già seguito altrove), tramite il nuovo componente condiviso
  `AgendaEventsList`/`AgendaEventRow`.
- **Ricerca** (`agendaSearchQuery`): un `<input>` con icona `search` e
  tasto "x" per svuotare, accanto al bottone "Lavoro esterno" esistente.
  Filtro client-side dal vivo (nessuna chiamata di rete, stessi dati già
  scaricati — coerente con la scala di lancio, §7): quando valorizzata,
  sostituisce **l'intero** `CalendarShell` (a prescindere da quale vista
  Giorno/Settimana/Mese/Anno fosse attiva) con lo stesso
  `AgendaEventsList` in modalità piatta (non raggruppata per mese — un
  filtro non ha una struttura mensile naturale), o il messaggio "Nessuna
  prenotazione corrisponde alla ricerca." se non c'è nulla. Filtrare una
  griglia lasciando celle vuote sparse non avrebbe avuto senso: un
  filtro produce sempre un **elenco di risultati**, non una griglia
  parziale — da qui la scelta di riusare lo stesso componente lista
  della vista Anno invece di provare a nascondere celle nella griglia.

Verificato end-to-end con l'API locale reale (non solo typecheck/build) e
due agenti Playwright dedicati, entrambi PASS su tutti i controlli:
- **Lavoro terminato/data manuale**: nessun bug trovato durante
  l'implementazione stessa (verificato con lo stesso rigore delle altre
  funzionalità di questo giro, typecheck pulito ad ogni passo).
- **Homepage**: `GET /reviews/recent` mai oltre 5 risultati, ogni
  elemento con `professional.id` reale; ciclo completo
  richiesta→preventivo→accettazione→completamento→conferma→doppia
  recensione creato via API per un professionista di test, card cliccata
  in home naviga esattamente a `/professionista/{id}#recensione-{id}`
  con la recensione visibile in viewport dopo lo scroll. "Nuovi profili":
  vedi nota sul falso positivo sopra — dopo il riavvio pulito del dev
  server, 3 card visibili a 1280px, freccia che avanza lo scroll, click
  sull'intera card che naviga al profilo corretto, 1 card a 390px con
  zero overflow orizzontale, zero `pageerror`.
- **Agenda**: seminati 4 lavori esterni per un professionista di test
  distribuiti su 4 mesi diversi dell'anno corrente, uno completato.
  Vista "Anno": solo i 4 mesi con eventi compaiono come intestazione
  (mesi vuoti assenti), range anno naviga di esattamente ±1 con le
  frecce, click su una riga apre `ExternalJobModal` con i dati corretti.
  Ricerca: sottostringa sul nome cliente isola la riga corretta;
  sottostringa presente **solo** nell'indirizzo isola comunque il
  risultato giusto (prova che la ricerca è davvero su ogni campo, non
  solo sul nome); sottostringa sullo stato ("programmato"/"completato")
  filtra correttamente per stato; testo senza corrispondenze mostra il
  messaggio vuoto corretto; tasto "x" ripristina il calendario normale.
  Il pulsante "Anno" compare solo su "Prenotazioni", assente su
  "Disponibilità" (verificato esplicitamente, 3 vs 4 pulsanti). Zero
  `pageerror`, zero overflow orizzontale a 1280px/390px.

Typecheck pulito su tutti i package (`shared`, `database`, `api-client`,
`api`, `ui`, `web`, `mobile`), build di produzione `apps/web` verde
(29 route).

---

## 50. Footer — "Contatti" al posto dell'elenco "Servizi", pagina FAQ dedicata

Due richieste esplicite dell'utente, stesso giro.

**Pagina `/faq` dedicata**: la sezione "Cosa succede se..." (§34) non deve
più comparire direttamente in homepage. Nuova pagina `/faq`
(`apps/web/src/app/faq/`, con `FaqContent.tsx` client-side separato — un
Server Component che renderizza Tamagui direttamente fallisce in build,
stesso gotcha già documentato altrove in questo file per
`/password-dimenticata`) monta sia `HomeFaq` (le due domande generali già
mostrate in home, invariate) sia `WhatIfSection` (spostata qui per
intero, nessun testo duplicato) — raggiungibile dal nuovo link "Domande
frequenti" in fondo alla colonna "Per i clienti" del footer. Aggiunta a
`sitemap.ts`.

**Footer — colonna "Servizi" sostituita da "Contatti"**: richiesta
esplicita dell'utente con uno screenshot di riferimento (pagina "Contatti"
di MioDottore: form ruolo/email/messaggio + dati azienda, mostrata sopra
il footer vero). Chiarito con `AskUserQuestion` prima di procedere (tre
opzioni: form reale funzionante, soli link di contatto, o pagina dedicata)
— l'utente ha scelto il form reale funzionante.
- **`ContactMessage`** (nuovo modello Prisma): `role`
  (`ContactMessageRole`: CLIENT/PROFESSIONAL/OTHER), `email`, `content`,
  `resolved` (default `false`). Nessun account richiesto per inviarlo,
  stesso principio già seguito per `WaitlistSignup`.
- **`apps/api/src/contact/`** (nuovo modulo, stesso pattern di
  `waitlist/`): `POST /contact` pubblico, throttled (5/min, stesso limite
  di `/waitlist`), honeypot anti-spam identico (`contactMessageSchema.website`,
  campo nascosto in UI — se valorizzato il controller finge un successo
  senza salvare nulla).
- **`AdminService.listContactMessages`/`resolveContactMessage`** (nuovi,
  `apps/api/src/admin/`): `GET /admin/contact-messages` (solo i non
  risolti, stesso principio già seguito per le segnalazioni contenuti
  aperte), `PATCH /admin/contact-messages/:id` (segna risolto). Nuova
  sezione "Messaggi di contatto" in `/admin` (`ContactMessageRow`, stesso
  layout a righe zebrate + bottone di risoluzione già in uso per
  `ReportRow`).
- **Nessun invio email reale** (Resend/Twilio restano rimandati, CLAUDE.md
  §9): il messaggio viene comunque salvato per davvero e reso visibile in
  /admin — un canale funzionante, non un form che non fa nulla, coerente
  con la regola di progetto "mai un'azione automatica/UI che non fa
  nulla".
- **`ContactFormFooter.tsx`** (nuovo, `apps/web/src/components`): form
  compatto (select ruolo, email, textarea messaggio, bottone "Invia"),
  dimensionato per stare in una colonna del footer (`minWidth={220}
  maxWidth={280}`) — stesso stato idle/loading/done/error già in uso in
  `WaitlistBlock` (`ProfessionalsShowcase.tsx`).

**Nota sull'esitazione "Presto disponibile"**: durante lo stesso giro,
un primo tentativo aveva anche rimosso il blocco "Presto disponibile"
(`WaitlistBlock`, mostrato in homepage quando ci sono meno di
`MIN_PROFESSIONALS_TO_SHOWCASE` professionisti reali) su una richiesta
iniziale dell'utente — poi corretta esplicitamente nello stesso turno
("lascia in homepage 'presto disponibile', da eliminare prima del
lancio"): quel blocco resta quindi invariato in questo giro, la sua
rimozione è rimandata esplicitamente a prima del lancio (nuovo promemoria
in coda alla lista "Da fare prima del lancio", §9/§48).

Verificato end-to-end con Postgres locale (non solo typecheck/build):
`POST /contact` con payload valido → riga salvata; stesso payload con
honeypot valorizzato → risposta di successo identica ma nessuna riga
scritta (confermato via query diretta); email non valida → 400 con
messaggio esplicito. Ciclo admin completo: utente promosso ADMIN via SQL
diretto (ambiente locale, nessun `ADMIN_BOOTSTRAP_SECRET` configurato in
questa sessione) → `GET /admin/contact-messages` mostra il messaggio →
`PATCH /admin/contact-messages/:id` lo risolve → sparisce dalla lista (che
mostra solo i non risolti). UI con Playwright contro il build di
produzione reale (web+API locali): submit del form dal footer reale →
messaggio salvato in DB (verificato via query diretta, non solo assunto
dal messaggio di successo a schermo) → visibile nella sezione "Messaggi di
contatto" di `/admin` con token JWT reale iniettato in `localStorage` →
bottone "Segna come gestito" lo rimuove dalla lista. Colonna "Servizi"
(elenco categorie) confermata assente dal footer (l'unica occorrenza
residua di "Servizi" nel DOM è il menu di navigazione dell'header,
`MegaMenu`, invariato e fuori scope). Zero errori console in tutti i
flussi. Typecheck pulito su tutti i package (`shared`, `database`,
`api-client`, `api`, `ui`, `web`), build di produzione `apps/web` verde
(30 route, `/faq` nuova).

**Correzione, stessa sessione — "Contatti" torna un link dentro "Servizi",
non più un form inline**: richiesta esplicita dell'utente, arrivata dopo
aver visto il risultato sopra: la colonna "Servizi" (elenco categorie) deve
restare **invariata** (non sostituita), con "Contatti" aggiunto come voce
cliccabile al suo interno — non più un form compresso nel footer, ma un
link verso una **pagina dedicata** in stile MioDottore (l'opzione "Pagina
/contatti dedicata", scartata nella scelta iniziale via `AskUserQuestion` a
favore del form inline, poi ripresa qui). `SiteFooter.tsx`: `ContactFormFooter`
rimosso dal footer e il file eliminato (nessun altro chiamante); la colonna
"Servizi" torna a mostrare `MAIN_CATEGORIES` (comportamento pre-§50) più un
nuovo `FooterLink` "Contatti" → `/contatti` in fondo alla lista.
- **`/contatti`** (nuova pagina, `apps/web/src/app/contatti/`, stesso
  pattern page.tsx server + `ContattiContent.tsx` client separato di
  `/faq`): due riquadri affiancati (`Surface`, impilati su mobile) — "Invia
  un messaggio" (stessi tre campi ruolo/email/messaggio, stesso backend
  `POST /contact` già costruito sopra, nessuna modifica lato API) e "Dati
  dell'azienda" (segnaposto `[DA COMPILARE: ...]`, stessa convenzione già
  in uso in `/privacy` per i dati societari non ancora disponibili) —
  ispirati alla struttura a due pannelli dello screenshot fornito
  dall'utente, senza replicare i link specifici di dominio sanitario del
  riferimento (es. "Area professionisti sanitari", non pertinenti qui).
  Aggiunta a `sitemap.ts`.
Verificato end-to-end con Postgres locale (non solo typecheck/build) e
Playwright contro il build di produzione reale: colonna "Servizi" con le
categorie di nuovo presente nel footer (confermato "Idraulico" nel testo),
link "Contatti" al suo interno naviga a `/contatti`; submit reale del form
dalla nuova pagina → messaggio salvato in DB (verificato via query
diretta) → messaggio di successo mostrato; zero overflow orizzontale
mobile (390px), zero errori console. Typecheck pulito su tutti i package,
build di produzione `apps/web` verde (31 route, `/contatti` nuova).

---

## 51. Bug reale: popup "Recensisci il cliente"/"Lascia una recensione" si chiudeva subito dopo l'apertura

Segnalato dall'utente: *"quando si clicca su lavoro terminato c'è un bug
dove esce ma si chiude subito il popup per mettere le recensioni,
correggi"*. Presente in tutti e tre i punti del prodotto dove "Lavoro
terminato" apre subito dopo un popup di recensione (doppio cieco,
CLAUDE.md §40): `AcceptedJobCard` (`/dashboard`), `RequestCard`
(`/dashboard/richieste`, §41) e `BookingRow`/`ClientCompleteModal`
(`/le-mie-richieste`, lato cliente).

**Causa reale**: in tutti e tre i file, l'handler che segnala il lavoro
terminato (`handleComplete`/`handleClientConfirmComplete`) apriva il
popup di recensione (`setShowClientReviewModal(true)`/
`setShowReviewModal(true)`) e **subito dopo**, nella stessa funzione,
chiamava già il callback di ricarica della lista fornito dal genitore
(`onUpdated()`/`onChanged()`/`onReviewed()`). Quel callback rilegge e
rifiltra la lista in base al nuovo stato della prenotazione — che il
completamento ha appena cambiato (`CONFIRMED`→`COMPLETED`) — e nel tab di
default "In agenda" (`/dashboard`, §42: `bookingMatchesStatus` filtra su
`status === "CONFIRMED"`) la card appena completata **sparisce
immediatamente** dalla lista filtrata: il componente che ospita il popup
(`AcceptedJobCard`) viene smontato da React insieme al proprio stato
locale, incluso il popup appena aperto — che quindi si chiude un istante
dopo essere comparso, prima che l'utente possa interagirci. Stesso
principio, innescato più raramente (solo se l'utente aveva già scelto un
filtro di stato specifico) nelle altre due pagine — `/dashboard/richieste`
di default mostra "Tutte" le fasi (bug non innescato lì a meno di un
filtro attivo), `/le-mie-richieste` di default mostra "Tutti" gli stati
(stesso discorso).

**Fix**: stesso principio minimale applicato identicamente ai tre file —
il ricaricamento della lista viene rimandato dal momento "apro il popup"
al momento "il popup si chiude" (sia per invio riuscito, che già lo
chiamava, sia per chiusura esplicita senza recensire, che prima non lo
chiamava affatto): nuova funzione `closeClientReviewModal`/
`closeReviewModal` passata alla prop `onClose` del popup, che chiude lo
stato locale **e poi** chiama il reload — mai più mentre il popup deve
restare aperto. La lista resta quindi stabile (e il componente che ospita
il popup resta montato) per tutta la durata in cui il popup è visibile,
mantenendo comunque la garanzia di aggiornamento della lista alla chiusura
(o tramite il poll periodico ~15s già esistente se si cambia tab senza
chiudere il popup).

Verificato end-to-end con l'API locale reale (non solo lettura di codice)
e uno script Playwright dedicato: richiesta diretta a un professionista di
test → preventivo → accettazione → conferma (`CONFIRMED`) → click su
"Lavoro terminato" nel tab di default "In agenda" di `/dashboard`
(il caso di innesco più affidabile, essendo il filtro attivo di default) →
popup "Recensisci il cliente" verificato **ancora presente e interagibile**
sia subito dopo il submit sia dopo un'attesa aggiuntiva di 3 secondi (prima
del fix sarebbe sparito nello stesso istante del submit); chiusura del
popup senza recensire → riapertura successiva tramite il nuovo bottone
"Recensisci il cliente" (già esistente, CLAUDE.md §40) → invio riuscito,
popup chiuso correttamente e lista aggiornata. Zero errori console reali
(l'unico osservato, `ERR_TUNNEL_CONNECTION_FAILED`, è la stessa
limitazione di rete dell'ambiente di sviluppo già documentata altrove in
questo file). Typecheck pulito su tutti i package (`shared`, `api-client`,
`web`), build di produzione `apps/web` verde.

---

## 52. `/contatti` — proporzioni più vicine al riferimento MioDottore, spazio vuoto sopra il titolo corretto

Richiesta esplicita dell'utente, con screenshot di riferimento
(MioDottore): *""contatti" deve essere sistemato meglio, seguendo come
esempio la foto in allegato, con le stesse proporzioni dei caratteri e
anche della grandezza delle finestre"*, seguita subito da una seconda
segnalazione con lo stesso testo più un dettaglio aggiuntivo: *"vedo che
c'è una specie di spazio vuoto fra il titolo Contatti e la parte
superiore della pagina, correggi"*.

**Causa dello spazio vuoto**: `ContattiContent.tsx` usava `Section`
(`packages/ui`), lo stesso wrapper condiviso da quasi tutte le altre
pagine del sito — 64px di padding verticale (96px da `$gtSm` in su).
Quel padding è pensato per pagine con più sezioni in sequenza (dove il
ritmo verticale uniforme è il punto), ma su `/contatti` — un solo blocco
corto — si leggeva come uno spazio vuoto ingiustificato tra header e
titolo, esattamente come segnalato. Non toccato `Section` stesso (usato
ovunque nel sito, comportamento corretto lì): la pagina è stata riscritta
con un wrapper su misura, `paddingTop` molto più contenuto (40px, 56px da
`$gtSm`) invece dei 64/96px originali.

**Proporzioni avvicinate al riferimento** (senza poter fare un confronto
pixel-per-pixel — lo screenshot allegato dall'utente non è recuperabile
in questa sessione, il contenuto delle immagini non sopravvive alla
compattazione della conversazione): titolo "Contatti" ingrandito a
34px/44px (era una `H2` generica di `Section`), campi del form
("finestre", nel linguaggio dell'utente) ingranditi — padding 16×18px
(era 12×14px), font 16px (era 15px), radius 14px — bottone "Invia"
ingrandito (17×32px di padding, font 17px, era 14×20px/15px). Pannello
"Dati dell'azienda" riscritto da tre righe di testo grigio isolate a righe
con icona colorata (`file-text`/`map-pin`, stesso registro icone
condiviso) + etichetta + valore, per bilanciare visivamente il pannello
rispetto al form (che ha molto più contenuto) invece di lasciarlo
sproporzionatamente vuoto — nessun dato reale aggiunto ai segnaposto
`[DA COMPILARE: ...]` già esistenti, solo la resa.

**Bug reale trovato e corretto durante la verifica visiva** (non solo
lettura di codice): il primo tentativo di layout a due colonne (`XStack
flexWrap="wrap"` con `flex={2}`/`flex={1}` sui due pannelli) si impilava
verticalmente anche a 1280px di larghezza, dove ci sarebbe stato spazio
a sufficienza per stare affiancati — stesso identico bug già documentato
più volte in questo file (CSS/Tamagui: un elemento flex senza
`flexBasis={0}` esplicito si dimensiona sulla larghezza "a contenuto
pieno" invece di rispettare la propria frazione flex, facendo scattare il
wrap del genitore prima del necessario). Corretto aggiungendo
`flexBasis={0}` a entrambi i pannelli. Corretto anche uno scarto di
coerenza con il resto del sito: i campi input avevano inizialmente
uno sfondo `brand.gesso` (lo stesso colore dello sfondo pagina, effetto
"buco" nella card bianca) invece di `brand.calce` (bianco) già usato da
`Field.tsx` per ogni altro form del prodotto — corretto per restare
coerente.

Verificato con l'API locale/build di produzione reale (non solo lettura
di codice) e Playwright: zero overflow orizzontale su desktop (1280px) e
mobile (390px), zero errori console; titolo "Contatti" a `y=120`
(desktop)/`y=104` (mobile) subito sotto l'header, contro il gap
precedente ben più ampio; due pannelli correttamente affiancati a 1280px
dopo il fix `flexBasis`, impilati correttamente sotto la soglia mobile.
Typecheck pulito su `apps/web`, build di produzione verde (30 route).

---

## 53. `/faq` — le due sezioni unite in un'unica lista, senza il titolo "Cosa succede se..."

Richiesta esplicita dell'utente: *"nelle domande frequenti, unisci le due
sezioni presenti quindi eliminando il titolo 'cosa succede se'"*. La
pagina `/faq` (§50) montava due blocchi distinti — `HomeFaq` (le due
domande generiche, senza intestazione propria) e `WhatIfSection` (le
quattro domande "Cosa succede se...", con una propria eyebrow "Cosa
succede se..." sopra) — ciascuno nel proprio `<Section>`, quindi visibili
come due gruppi separati con un secondo titolo tra loro.

- `HomeFaq.tsx`: `FAQ_ITEMS` reso `export` (il componente `HomeFaq`
  stesso resta invariato e continua a essere montato da solo in homepage,
  CLAUDE.md §24 — usa `FAQ_ITEMS` internamente, nessuna regressione lì).
- `WhatIfSection.tsx`: il componente che renderizzava `<Section
  eyebrow="Cosa succede se...">` è stato rimosso (nessun altro punto del
  prodotto lo montava, verificato con una ricerca su tutto `apps/web`) —
  il file espone ora solo `WHAT_IF_ITEMS`, l'array di domande/risposte,
  come unica fonte di dati.
- `FaqContent.tsx`: concatena `FAQ_ITEMS` e `WHAT_IF_ITEMS` in un unico
  array e li rende come un solo accordion (stesso markup/CSS già in uso
  in `HomeFaq.tsx`, portato qui) dentro l'unico `<Section title="Domande
  frequenti">` già esistente — nessuna seconda eyebrow, nessun secondo
  blocco visivo: le 6 domande scorrono come un'unica lista continua.

Verificato con Postgres locale/build di produzione reale (non solo
lettura di codice) e Playwright: `/faq` mostra esattamente 6 voci
accordion in sequenza, testo "Cosa succede se..." (l'eyebrow, non le
singole domande che lo contengono nel testo) assente dalla pagina, zero
errori console. Typecheck pulito su `apps/web`, build di produzione verde
(30 route, nessuna nuova).

---

## 54. `/admin` — pulsanti "Segnalazioni contenuti" uniformi + link al contenuto + archivio azioni

Richiesta esplicita dell'utente: *"in segnalazioni contenuti all'interno
di /admin, sistema i pulsanti già presenti che devono essere uniformi
nelle dimensioni e nell'aspetto, il colore può essere differente, e
aggiungi un pulsante dove ti porta alla segnalazione in questione"* —
seguita, mid-turn, da un secondo requisito: *"quando si prende un'azione
per le segnalazioni, devono essere sì eliminate dall'elenco, ma andranno a
formare un elenco visualizzabile con tutte le segnalazioni e l'azione
intrapresa in modo da avere un archivio delle azioni intraprese"*.

**Causa della disuniformità**: "Risolvi" era un `Button` senza `variant`
(eredita lo stile di default del componente condiviso — sfondo
`$blue10` Tamagui stock, altezza dettata da `size="$2"`), "Ignora" era
`variant="ghost"` (trasparente, altezza fissa 48px imposta dal variant) —
due bottoni con riempimento e altezza diversi affiancati nella stessa
riga. Corretto introducendo `ReportActionButton` (`apps/web/src/app/
admin/page.tsx`), uno stile condiviso (`REPORT_ACTION_STYLE`: 34px
altezza, padding 16px, radius 999, font 13/700) applicato identicamente a
tutti i bottoni della riga — mai i quattro `variant` di `Button`
(pensati per CTA a pagina intera, non per un'azione compatta di riga
tabella): solo il colore cambia per bottone (`brand.verificato` verde per
"Risolvi", `brand.filetto` neutro per "Ignora", `brand.cianografia` per
"Vai alla segnalazione") — esattamente "colore diverso, aspetto/misura
uguali" come richiesto.

**Link al contenuto segnalato** — `reportTargetHref(report)`: per un
profilo professionista, `/professionista/{targetId}` (il `targetId` è già
il profilo stesso); per una recensione, `/professionista/{profiloId}
#recensione-{reviewId}` (stesso ancoraggio già introdotto per le
recensioni cliccabili in homepage, CLAUDE.md §49) — richiede però di
sapere su quale profilo vive la recensione, dato non ancora esposto da
`AdminService.listContentReports`. Nuovo campo
`linkedProfessionalProfileId` (backend, `admin.service.ts`): per
`PROFESSIONAL_PROFILE` è il target stesso, per `REVIEW` è il
`professionalProfile.id` del booking collegato (una query in più già
presente per risolvere `businessName`, solo `select` esteso), per
`CLIENT_REVIEW` resta sempre `null` — **nessun link mostrato** in quel
caso: una recensione sul cliente non ha una pagina pubblica raggiungibile
in questo marketplace (nessun profilo pubblico del cliente, CLAUDE.md
§40/§45), un bottone verso il nulla non sarebbe stato onesto. Nuovo campo
propagato in `AdminContentReport` (`packages/api-client`).

**Archivio segnalazioni** — richiesta esplicita di non far sparire una
segnalazione gestita, solo spostarla. `AdminService.listContentReports`
non riceve più un filtro `status` dalla pagina admin (il parametro
opzionale resta supportato dall'endpoint, solo non più usato da questo
chiamante): la pagina scarica **tutte** le segnalazioni in un colpo solo e
le divide client-side in `openReports` (`status === "OPEN"`, sezione
"Segnalazioni contenuti" invariata, con i tre bottoni azione) e
`archivedReports` (le altre, ordinate per `resolvedAt` decrescente —
l'azione più recente in cima — nuova sezione "Archivio segnalazioni").
Nuovo componente `ArchivedReportRow`: stessi dati della riga aperta
(target, motivo, dettagli, autore, data), più la data di gestione
("Gestita il ..."), stesso bottone "Vai alla segnalazione" quando
disponibile, ma **nessun controllo interattivo** al posto di
Risolvi/Ignora — una pillola di sola lettura, stessa dimensione dei
bottoni (`REPORT_ACTION_STYLE`) con l'etichetta dell'azione già presa
("Risolta" verde, "Ignorata" neutra) invece di un'azione ancora da
prendere.

Verificato end-to-end con Postgres locale (non solo lettura di codice) e
uno script Playwright dedicato: tre segnalazioni di test seminate (una
per ciascun `targetType`, con una `Review`/`ClientReview`/`Booking` reali
create ad hoc per popolare `linkedProfessionalProfileId`) — bounding box
di tutti i bottoni "Risolvi"/"Ignora"/"Vai alla segnalazione" misurati a
34px di altezza uniforme su ogni riga; bottone "Vai alla segnalazione"
correttamente assente sulla sola riga `CLIENT_REVIEW`, presente e con
`href` corretto su `PROFESSIONAL_PROFILE`/`REVIEW` (confermato anche via
`GET /admin/reports` diretto: `linkedProfessionalProfileId` valorizzato
solo nei due casi attesi). Click su "Risolvi"/"Ignora" → riga sparita da
"Segnalazioni contenuti", ricomparsa in "Archivio segnalazioni" con
l'etichetta "Risolta"/"Ignorata" corretta e la data di gestione.
Typecheck pulito su tutti i package (`shared`, `database`, `api-client`,
`api`, `web`), build di produzione `apps/web` verde (30 route, nessuna
nuova).

**Nota — richiesta separata ricevuta a metà turno, non ancora
implementata**: l'utente ha segnalato una duplicazione di contenuto tra
`/dashboard` (tab "Lavori accettati", `AcceptedJobCard`, redesign §42) e
`/dashboard/richieste` (le stesse prenotazioni negli stadi `accettata`/
`completata`, `RequestCard`), chiedendo lo stesso trattamento già
applicato al tab "Richieste ricevute" in §43 (card completa sostituita da
un riepilogo compatto + CTA verso l'inbox). Piano proposto e discusso con
l'utente (`AskUserQuestion`): sostituire `AcceptedJobCard` con righe
compatte (cliente/categoria/data/stato) + conteggi + un CTA verso
`/dashboard/richieste` filtrato sugli stadi `accettata`/`completata`,
rimuovendo la resa a dettaglio completo da `/dashboard` (che resterebbe
solo su `/dashboard/richieste`). L'utente ha scelto esplicitamente **solo
pianificare per ora**, nessuna modifica al codice in questo giro — da
riprendere quando confermato.

**Correzione, stesso giro — l'archivio torna dentro "Segnalazioni
contenuti", dietro un menu**: richiesta esplicita dell'utente: *"l'archivio
segnalazioni deve essere inserito all'interno delle segnalazioni
contenuti, tramite un pulsante all'estrema destra tipo le 3 barre che
premendo questo pulsante si aprono le azioni che possono essere
intraprese, e lì dentro inserire 'archivio segnalazioni'"*. La sezione
"Archivio segnalazioni" del giro precedente sopra (un secondo `<H2>` a sé
stante, sempre visibile) è stata sostituita da una vista nascosta dentro
la stessa sezione "Segnalazioni contenuti", rivelata da un bottone "☰" in
alto a destra dell'intestazione.
- Nuova icona condivisa `menu` (`packages/ui/src/icons.tsx`/`icons.web.tsx`,
  lucide `Menu` — le classiche 3 barre orizzontali).
- `ReportsSectionMenu` (`apps/web/src/app/admin/page.tsx`): stesso pattern
  click-to-open/chiusura al click esterno già in uso in `AccountMenu.tsx`
  (nessun componente condiviso nuovo in `packages/ui`, resta locale a
  questa pagina — un solo punto di consumo). Un'unica voce per ora
  ("Archivio segnalazioni"/"Nascondi archivio segnalazioni" a seconda
  dello stato, icona `archive` già nel registro), pensato per ospitare
  altre azioni in futuro senza reintrodurre un menu ad hoc.
- `showArchivedReports` (stato booleano in `AdminPage`, non più derivato
  implicitamente dal semplice fatto di scaricare tutte le segnalazioni):
  quando vero, la lista archiviata compare **sotto** le segnalazioni
  aperte, ancora dentro lo stesso `<YStack>` della sezione — non più un
  secondo `<H2>` di pari livello, solo un'etichetta più piccola
  ("Archivio segnalazioni", `fontWeight="700"`) sopra le righe di sola
  lettura già esistenti (`ArchivedReportRow`, invariata).
Verificato con Postgres locale reale (non solo lettura di codice) e
Playwright: testo "Archivio segnalazioni" assente dalla pagina finché il
menu non viene aperto e la voce cliccata; bottone "☰" presente e
funzionante, dropdown con la sola voce attesa; click la rivela subito
sotto le righe aperte, nello stesso riquadro sezione, zero errori console.
Typecheck pulito su `packages/ui`/`apps/web`, build di produzione verde
(30 route).

---

## 55. Esempio "Descrivi il lavoro" specifico per categoria

Richiesta esplicita dell'utente: *"quando si richiede un preventivo, in
base alla categoria che si seleziona, nella sezione descrivi il lavoro,
l'esempio deve essere inerente alla categoria selezionata ed essere molto
piu dettagliata sempre inerente alla categoria"*. Prima di questo giro
`GuidedRequestForm` (`/preventivo`, `/urgente`) mostrava un solo esempio
fisso nel placeholder della textarea "Descrivi il lavoro" — a tema
idraulico, indipendentemente dalla categoria realmente scelta e dalla
modalità normale/urgente (`descriptionPlaceholder`, prop statica passata
da `PreventivoContent.tsx`/`UrgenteContent.tsx`).

- **`packages/shared/src/categories.ts`**: due nuove costanti,
  `CATEGORY_DESCRIPTION_EXAMPLES`/`CATEGORY_URGENT_DESCRIPTION_EXAMPLES`
  (`Record<ProfessionalCategorySlug, string>`, stesso pattern già in uso
  per `POPULAR_SERVICES` nello stesso file) — un esempio dettagliato (2-3
  frasi, un contesto realistico) per ciascuna delle 13 categorie, in due
  varianti: una per una richiesta programmabile (`/preventivo`) e una per
  un'emergenza reale (`/urgente`, coerente con l'urgenza di quella
  categoria — es. "chiuso fuori casa" per il fabbro, "blackout con odore
  di bruciato" per l'elettricista — invece di un generico "serve
  urgentemente").
- **`GuidedRequestForm.tsx`**: nuovo `resolvedDescriptionPlaceholder`,
  derivato da `categorySlug` (già tracciato dal form) e `isUrgent` (prop
  già esistente) — quando una categoria è selezionata, sceglie l'esempio
  giusto da una delle due mappe; **prima** che una categoria sia scelta,
  ricade sul `descriptionPlaceholder` generico già passato dal chiamante
  (mai un esempio inventato per una categoria non ancora nota — stesso
  principio di onestà già seguito altrove in questo file). I due
  chiamanti (`PreventivoContent.tsx`/`UrgenteContent.tsx`) restano
  invariati, la loro prop resta il solo fallback pre-selezione.
- Verificato con l'API locale reale (non solo typecheck/build) e
  Playwright: nessuna categoria → placeholder generico invariato;
  selezionando Idraulico/Fabbro/Badanti su `/preventivo` → placeholder
  cambia al testo dettagliato specifico di ciascuna categoria (non solo
  più lungo, anche diverso nel contenuto); stesso controllo su `/urgente`
  con Idraulico/Fabbro → placeholder d'emergenza specifico della
  categoria, distinto dalla variante `/preventivo`. Zero errori console.
  Typecheck pulito su tutti i package (`shared`, `api-client`, `ui`,
  `api`, `web`, `mobile`), build di produzione `apps/web` verde
  (31 route).

---

## 56. "Lavori accettati" (dashboard professionista) ridotta a riepilogo compatto

Completamento della richiesta di deduplicazione notata in coda a §54:
*"il contesto duplicato è un errore da risolvere, come pensi sia la
risoluzione più funzionale e giusta e bella"*. Stesso trattamento già
applicato al tab "Richieste ricevute" in §43 (`LeadCard` → riepilogo
compatto + CTA verso `/dashboard/richieste`), applicato ora anche al tab
"Lavori accettati": la card completa (`AcceptedJobCard`, redesign §42 —
filtri/ricerca, Descrizione/Preventivo/Contatti/Videochiamata/Note
personali, bottoni Lavoro terminato/Annulla/Recensisci) appariva identica
in due punti del sito, `/dashboard` e `/dashboard/richieste` (stadi
`accettata`/`completata` di `RequestCard`).

- **`AcceptedJobCard` rimossa per intero** da `/dashboard` (~530 righe,
  con `DetailSection`/`ServiceModeBadge`, usate solo lì) — il dettaglio
  completo resta **solo** su `/dashboard/richieste`, unica fonte di
  verità. Rimossi con la card anche filtri/ricerca/paginazione
  esclusivi del tab (`BookingStatusFilter`/`BOOKING_TABS`/
  `BookingDateFilter`/`ZONE_ALL`/`bookingZones` e le relative select) —
  stessa scelta già fatta per "Richieste ricevute" in §43.
- **`BookingSummaryRow`** (nuovo, mirror di `LeadSummaryRow`): riga
  compatta cliente/categoria/città + data/ora/stato, con lo stesso
  pallino di notifica non letta (`combineUnreadCounts`, già in uso). Il
  link naviga a `/dashboard/richieste?open=<guidedRequestId>` (deep-link
  già introdotto per `/chat`, CLAUDE.md §47) quando disponibile —
  apre e scrolla direttamente alla card giusta nella pipeline, non solo
  all'inbox generica — con fallback a `/dashboard/richieste` per le
  prenotazioni dirette da agenda pubblica (`guidedRequestId` assente,
  dormiente da CLAUDE.md §20).
- Frase di riepilogo ("N lavori in agenda, su M accettati in totale.")
  identica nello stile a quella già in uso per "Richieste ricevute";
  elenco delle 5 prenotazioni più recentemente aggiornate
  (`sortListItems` su `updatedAt`, stesso helper già in uso); CTA
  "Apri tutti i lavori accettati" verso `/dashboard/richieste?
  stage=accettata` (nuovo query param opzionale in `RichiesteContent`,
  stesso principio del già esistente `?open=` — preseleziona il tab
  `TABS` corrispondente al mount) più "Apri il calendario completo"
  (invariato, verso `/dashboard/agenda`).

Verificato end-to-end con l'API locale reale (non solo typecheck/build):
professionista+cliente di test creati via inserimento diretto in Postgres
+ JWT firmati a mano con lo stesso `JWT_SECRET` (bypassa il rate limit
5/min di `/auth/register`, urtato più volte in questa sessione — stesso
problema noto già documentato altrove in questo file), richiesta diretta
al professionista → preventivo → accettazione → prenotazione con
`categoryLabel`/`serviceMode`/`city` tutti presenti (nuova proiezione
Prisma). UI: tab "Lavori accettati" mostra il riepilogo compatto corretto
(cliente, categoria, città, stato "Confermato"), **assenza** confermata di
ogni testo della vecchia card di dettaglio ("Descrizione lavoro", bottone
"Lavoro terminato"); click sulla riga naviga a
`/dashboard/richieste?open=<id>` con la card espansa e visibile (voce
preventivo "Manodopera" presente). Zero `pageerror`. Typecheck pulito su
`apps/web`, build di produzione verde — `/dashboard` passato da 4,69 kB
(dopo la sola rimozione richieste in §43) a bundle ulteriormente ridotto
con la rimozione di `AcceptedJobCard`.

## 57. `/admin` — menu laterale desktop + tabelle in formato colonna, badge modalità intervento nel dettaglio prenotazione

Due richieste esplicite dell'utente nello stesso giro.

**`/admin` — menu laterale + tabelle**: *"nella pagina /admin, deve essere
piu funzionale allo scopo, da desktop ci deve essere un menu laterale che
non va a modificare l'attuale posizione dell'elenco centrale, dove in
questo menu ci saranno cliccabili: utenti registrati, segnalazioni,
messaggi, lista d'attesa"* + *"e dovranno essere in formato colonna in
modo da poter copiare ad esempio solo le e-mail"*.

- **Menu laterale** (`AdminSidebar`, `apps/web/src/app/admin/page.tsx`):
  quattro link (`#utenti-registrati`/`#segnalazioni`/`#messaggi`/
  `#lista-attesa`) verso altrettante `<div id="..." style={{scrollMarginTop:
  96}} />` inserite subito prima di ciascuna sezione — stesso pattern di
  ancoraggio già in uso altrove nel sito (`#agenda`, `#recensione-{id}`).
  Reso in CSS grezzo (`.admin-sidebar`, `apps/web/src/app/globals.css`,
  non `<style jsx>`: stessa convenzione già seguita per classi riusate da
  più file) con `position: fixed` — **deliberatamente fuori dal flusso di
  layout**: è l'unico modo di garantire "non deve modificare l'attuale
  posizione dell'elenco centrale" in senso letterale (un `flex`/`grid`
  affiancato avrebbe comunque spostato la colonna centrale di quanto
  larga è la sidebar). Visibile solo da `min-width: 1300px` (soglia scelta
  per lasciare margine sufficiente a sinistra della colonna centrale,
  `maxWidth={800}` centrata, senza sovrapporla) — sotto quella soglia
  `display: none`, nessun impatto su tablet/mobile.
- **Tabelle a colonne**: `UserGroup` (elenco "Utenti registrati") e la
  sezione "Lista d'attesa" riscritte da righe `XStack` con testo
  concatenato a vere `<table>` HTML (`.admin-table`, stesso file CSS) —
  un `<td>` per campo (Email, Nome, Attività se professionista/Registrato
  il) rende ogni cella selezionabile/copiabile in isolamento: un
  triplo-click su un indirizzo email non trascina più il nome affiancato,
  cosa che un flex con testo concatenato non garantisce. `ReportRow`/
  `ArchivedReportRow`/`ContactMessageRow` (Segnalazioni contenuti/Messaggi
  di contatto) **lasciate invariate** nella resa a righe: contenuto più
  ricco (testo libero, bottoni azione), meno naturale in una tabella a
  colonne strette — solo le due liste "pure dati" (utenti, waitlist) sono
  state convertite. Nessuna `textTransform="uppercase"` introdotta (regola
  di progetto §19): le intestazioni `<th>` usano `font-weight` per
  distinguersi, mai il maiuscolo.
- Verificato con Postgres locale reale (non solo lettura di codice) e
  Playwright, tre controlli mirati sui due requisiti letterali dell'utente:
  posizione X dell'intestazione centrale identica prima/dopo un click sul
  menu (320px in entrambi i casi — "non modifica la posizione"), scroll
  verso la sezione "Lista d'attesa" corretto (`scrollY` >0, intestazione
  vicina alla cima dopo lo scroll), testo di una cella email letto in
  isolamento via `innerText` su quel solo `<td>` (nessun campo vicino
  incluso). Sidebar assente sotto 1300px (1100px/390px, zero overflow
  orizzontale su entrambi). Typecheck pulito su `apps/web`, build di
  produzione verde (31 route, nessuna nuova).

**Modalità intervento (online/domicilio) nel dettaglio prenotazione
dell'agenda** — richiesta esplicita dell'utente: *"nell'agenda
professionista quando clicco su un appuntamento, inserisci la scritta se
si tratta di un appuntamento online o a domicilio, (come visualizzato
nelle richieste ricevute)"*. `Booking.serviceMode` (copiato dalla
`GuidedRequest` di origine, CLAUDE.md §23) era già esposto da
`ProfessionalsService.getMyBookings`/`ProfessionalBooking` ma non ancora
mostrato in `BookingDetailPanel.tsx` (il pop-up aperto cliccando un
evento nel calendario "Prenotazioni") — solo `RequestCard`
(`/dashboard/richieste`, `ServiceBadge`) lo mostrava. Aggiunta una riga
con icona (`video`/`house`) + etichetta ("Consulenza online"/"A
domicilio") subito sotto data/ora, stesso lessico già in uso altrove nel
prodotto — assente per le prenotazioni precedenti a questa funzionalità
(`serviceMode` nullable) o dirette da agenda pubblica senza
`GuidedRequest` collegata (`bookAgendaSlot`, dormiente da CLAUDE.md §20).
Verificato end-to-end con l'API locale reale (non solo typecheck/build):
richiesta guidata `ONLINE` diretta a un professionista specifico →
preventivo con data manuale → accettazione → `GET
/professionals/me/bookings` conferma `serviceMode: "ONLINE"` → click sulla
prenotazione in `/dashboard/agenda` (ricerca full-text per nome cliente,
§ precedente) apre il pop-up con "Consulenza online" visibile subito sotto
l'orario. Typecheck pulito su tutti i package (`shared`, `api`, `web`),
build di produzione `apps/web` verde (31 route).

## 58. Puntini sovrapposti sulla mappa risultati — sfalsamento automatico

Richiesta esplicita dell'utente: *"se ci sono più professionisti che sono
visualizzati sulla mappa sullo stesso punto (di solito avviene quando
inseriscono solo la città), sfalsali in modo da poterli cliccare con piu
facilità sulla mappa"*. Più professionisti nella stessa città senza
indirizzo preciso condividono letteralmente le stesse coordinate (il
centroide del comune ricavato da `findComuneByName`, CLAUDE.md §2/§13):
prima di questa correzione i loro puntini `Marker` (Leaflet) si
sovrapponevano esattamente in `ResultsMap.tsx`, e solo l'ultimo
renderizzato nel DOM restava effettivamente cliccabile.

- **`offsetOverlappingPositions`** (nuova funzione pura,
  `apps/web/src/components/ResultsMap.tsx`): raggruppa i professionisti
  con coordinate per chiave `lat.toFixed(5),lon.toFixed(5)` (~1m di
  precisione — cattura anche eventuali differenze di arrotondamento in
  virgola mobile, non solo un'uguaglianza esatta bit-per-bit). Un gruppo
  con un solo elemento non viene toccato; un gruppo con 2+ elementi viene
  disposto in un piccolo cerchio (`CLUSTER_OFFSET_DEG = 0.0009`, ~90-100m
  a queste latitudini — abbastanza per separare visivamente i puntini
  senza spostarli fuori dal quartiere/comune reale) attorno al punto
  condiviso, un angolo per elemento (`2π·i/N`). Nessuna modifica alle
  coordinate salvate su `ProfessionalProfile` — solo la posizione del
  `Marker` sulla mappa è sfalsata, il dato geografico reale (usato anche
  dal raggio di ingaggio/fan-out, §13) resta invariato.
- **`FitBounds`/inquadratura iniziale coerente**: `initialPoints` (usati
  per centrare/zoomare la mappa all'apertura) sono derivati dalla stessa
  mappa di posizioni sfalsate (`markerPositions.get(p.id)`), non dalle
  coordinate originali — la mappa zooma su dove i puntini vengono
  davvero disegnati, non su un punto (ormai) diverso da quello sovrapposto
  originale.
- Verificato end-to-end con l'API locale reale (non solo lettura di
  codice) e due script Playwright dedicati: 3 professionisti di test
  seminati con coordinate identiche esatte (`41.5000000, 12.5000000`) —
  sulla pagina risultati (`/cerca/idraulico`), zero coppie di marker con
  posizione a schermo identica su tutti i puntini visibili (inclusi due
  gruppi di dati demo preesistenti nel DB locale con le stesse
  coordinate, coinvolti per caso nella stessa verifica); i 3 marker del
  gruppo di test risultano disposti a triangolo attorno al punto comune
  (coerente con la formula angolare per N=3); click su ciascuno dei 3
  marker singolarmente apre un banner con il nome dell'attività corretto
  e distinto per ciascuno (nessun click che finisce "sotto" a un altro
  marker). Typecheck pulito su `apps/web`, build di produzione verde
  (31 route, nessuna nuova).

## 59. `/dashboard/richieste` — voci di ordinamento sostituite

Richiesta esplicita dell'utente: *"dai filtri in richieste ricevute, dove
c'è scritto 'ordina: piu recenti', modifica tutto e inserisci le seguenti
voci: Data di ricezione piu recente, data di ricezione più vecchie, ultimo
aggiornamento"*. Il `<select>` "Ordina" di `RequestCard`
(`apps/web/src/app/dashboard/richieste/page.tsx`) aveva tre opzioni
(Più recenti/Più vecchie/Prezzo crescente, quest'ultima un ordinamento per
`quotePriceTotals`) — sostituite integralmente dalle tre richieste
letteralmente dall'utente: "Data di ricezione più recente" (default,
invariato nel comportamento — ordina per `createdAt` discendente, solo
l'etichetta è cambiata), "Data di ricezione più vecchie" (`createdAt`
ascendente, invariato), "Ultimo aggiornamento" (nuovo: `ProfessionalLead.
updatedAt` discendente — campo già esposto dal backend, riflette il più
recente tra un evento sul Lead stesso e uno sul preventivo collegato, già
documentato in `packages/shared/src/dashboard.ts`). L'ordinamento "Prezzo
crescente" è stato rimosso (non richiesto), `quotePriceTotals` resta
importato/usato altrove nello stesso file (mostra il range del preventivo
in ogni card).

Verificato con l'API locale reale (non solo typecheck/build) e Playwright:
`<select>` con le tre opzioni esatte richieste, nell'ordine indicato
dall'utente. Typecheck pulito su `apps/web`, build di produzione verde
(31 route, nessuna nuova).

## 60. Bug reale: click su una richiesta specifica in `/dashboard` non apriva quella richiesta + rifinitura etichetta ordinamento

Due richieste esplicite dell'utente, stesso giro.

**Bug reale**: *"sulla dashboard cliccando su uno specifico
richiesta/lavoro si dovra aprire quella determinata richiesta/lavoro"*.
`BookingSummaryRow` (§56, riepilogo compatto "Lavori accettati" in
`/dashboard`) già collegava a `/dashboard/richieste?open=<guidedRequestId>`
per aprire/scrollare alla card giusta — ma `LeadSummaryRow` (stesso
riepilogo per "Richieste ricevute") linkava sempre al generico
`/dashboard/richieste`, senza `?open=`: cliccare una riga specifica portava
sempre all'inbox intera, mai alla richiesta cliccata. Corretto passando
`lead.guidedRequest.id` come parametro `?open=`, stesso `useEffect` già
esistente in `/dashboard/richieste` (letto in CLAUDE.md §47/§56) che
espande la card e scrolla fino a lì.

**Rifinitura**: *"devi eliminare la scritta 'Ordina', presente in 'ordina:
data di ricezione piu recente'"* — l'opzione di default del `<select>`
ordinamento (§59) aveva ancora il prefisso "Ordina: " lasciato dalla
vecchia etichetta, le altre due opzioni no. Rimosso per coerenza con le
altre due voci.

Verificato end-to-end con l'API locale reale (non solo lettura di codice)
e Playwright: click sulla riga di una richiesta specifica in `/dashboard`
naviga a `/dashboard/richieste?open=<id>` (href verificato prima del
click), la pagina di destinazione scrolla (`scrollY > 0`) e mostra la
sezione espansa "Dettagli cliente" della card corrispondente — non più
l'inbox generica in cima. `<select>` ordinamento verificato con le tre
opzioni senza alcun prefisso "Ordina:". Typecheck pulito su `apps/web`,
build di produzione verde (31 route, nessuna nuova).

## 62. `/dashboard/richieste` — orario di ricezione visibile, non solo la data

Richiesta esplicita dell'utente: *"nella dashboard in richieste ricevute,
rendi visibile anche la data e l'orario di ricezione di quella
richiesta"*. L'intestazione di `RequestCard` mostrava già "Ricevuta
{data}" (es. "Ricevuta 8 set 2026") ma tramite `formatDate`, che scarta
l'orario — mentre nello stesso file esisteva già `formatDateTime`
(data+ora, stesso formato già usato altrove nella pagina), mai applicato a
questa riga. Sostituito `formatDate(lead.createdAt)` con
`formatDateTime(lead.createdAt)`; `formatDate` era usato solo lì, rimossa
la funzione ormai morta invece di lasciarla inutilizzata.

Verificato con l'API locale reale (non solo lettura di codice) e
Playwright: `Lead` seminato con `createdAt` noto (`2026-09-08 15:37:00`)
→ intestazione della card mostra "Ricevuta 8 set · 15:37" (data e orario
entrambi presenti, formato coerente col resto della pagina). Zero errori
console. Typecheck pulito su `apps/web`, build di produzione verde
(31 route, nessuna nuova).

## 61. `/dashboard/richieste` — ordine badge invertito + palette stati rivista, testo "dati nascosti" semplificato in `/preventivo`

Due richieste esplicite dell'utente, stesso giro.

**Ordine badge invertito + colori di stato rivisti** — richiesta esplicita
dell'utente: *"nelle schede delle richieste ricevute, inverti la scritta:
'a domicilio/online' con lo stato della richiesta (scaduta, completata da
quotare, ecc..), e cambia il colore del riempimento del riquadro e quindi:
in turchese se è completata, blu se è da quotare, giallo in attesa e
giallo più scuro modifiche, verde accettate, rosso annullate, rosso
scadute, rosso firebrick se annullate"* — continuazione della stessa
eccezione già documentata in questo file (§41, "Rifinitura": `STAGE_STYLE`
in `apps/web/src/app/dashboard/richieste/page.tsx` è un'eccezione
deliberata e circoscritta alla regola "solo token `brand.*`", concessa
perché l'utente ha chiesto colori arbitrari per nome).
- **Ordine invertito**: nell'intestazione di `RequestCard`, `<StagePill
  stage={stage} />` ora precede `<ServiceBadge online={isOnline} />`
  (prima l'ordine era opposto).
- **Colori aggiornati in `STAGE_STYLE`**: `da_quotare` da arancione a blu
  (`#0D6EFD`), `in_attesa` da blu a giallo (`#FFC107`/`#FFF3CD`),
  `modifica_richiesta` a un giallo più scuro/ambra (`#B8860B`/`#FFE8A3`),
  `completata` da grigio a turchese (`#20B2AA`/`#DFF7F5`), `accettata`
  invariata (già verde). **`annullata`/`scaduta`, l'unico punto ambiguo
  del messaggio dell'utente** (menzionato due volte con due rossi
  diversi — "rosso annullate" poi "rosso firebrick se annullate"):
  risolto distinguendo i due stati già esistenti in `RequestStage`
  (`annullata` = prenotazione `CANCELED` dopo l'accettazione, `scaduta` =
  Lead scaduto, §41) non solo nell'icona (come già erano) ma anche nel
  colore — `scaduta` resta il rosso standard già esistente (`#DC3545`),
  `annullata` passa al rosso firebrick (`#B22222`/`#F8D7DA`), più cupo e
  distinguibile a colpo d'occhio. `chiusa` (rifiuto/ritiro, raggruppata
  sotto "Scadute") non era tra gli stati nominati esplicitamente: resta
  grigio neutro, invariata.
- Verificato con l'API locale reale (non solo lettura di codice) — 8
  `GuidedRequest`/`Lead`/`Quote`/`Booking` seminati via SQL diretto per
  coprire tutti gli 8 stadi di `RequestStage` sullo stesso profilo di
  test, professionista autenticato via JWT — screenshot Playwright su
  `/dashboard/richieste?tutte` conferma tutti e 7 i colori richiesti
  esatti (bg misurato via `getComputedStyle`, corrispondenza pixel-per-
  pixel con gli hex attesi) e l'ordine badge invertito su ogni card
  (StagePill sempre a sinistra di ServiceBadge, stessa riga). Zero
  errori console. Typecheck pulito su `apps/web`, build di produzione
  verde (31 route, nessuna nuova).

**Testo "dati nascosti al professionista" semplificato in una riga sola**
— richiesta esplicita dell'utente: *"quando si effettua una richiesta di
preventivo, dove c'è scritto: chi riceverà il professionista, e anche
quello sotto cioè: Questi dati restano nascosti al professionista finché
non accetterai un preventivo...; modificalo con solo: I dati di seguito
rimarranno nascosti al professionista finché non accetterai un
preventivo."* Nel blocco "Chi riceverà il professionista" di
`GuidedRequestForm.tsx` (`/preventivo`, `/urgente`, visibile solo in
modalità "A domicilio" — CLAUDE.md §25), il titolo (`FieldLabel`) e il
sottotesto separato ("Questi dati restano nascosti al professionista...
pre-compilati dal tuo account...") sono sostituiti da un'unica riga:
"I dati di seguito rimarranno nascosti al professionista finché non
accetterai un preventivo." — nessun riferimento al pre-compilamento
dall'account, richiesto letteralmente "solo" quel testo. Verificato con
l'API locale reale e Playwright (login cliente via JWT, non solo lettura
di codice): vecchio titolo/sottotesto assenti dal DOM di `/preventivo`
dopo aver selezionato "A domicilio", nuova riga unica presente col testo
esatto. Zero errori console. Typecheck pulito su `apps/web`, build di
produzione verde (31 route, nessuna nuova).

## 63. `/dashboard/richieste` — bottone "Rispondi" rinominato "Chat" + "Lavoro terminato" in turchese

Due richieste esplicite dell'utente, stesso giro.

**"Rispondi" → "Chat"**: *"nelle richieste ricevute modifica il nome del
pulsante "rispondi" con "Chat""*. `RequestCard`
(`apps/web/src/app/dashboard/richieste/page.tsx`) apre lo stesso
`TimelineModal` (§21/§46) da due punti diversi a seconda dello stadio
della richiesta — un `Button variant="ghost"` (stadi `da_quotare`/
`modifica_richiesta`) e un `Button variant="primary"` (stadio `in_attesa`)
— entrambi con la stessa etichetta "Rispondi". Sostituita in entrambi i
punti con "Chat", senza toccare nessun'altra prop/struttura né la stringa
`formatLeadDeadline` ("Rispondi entro N minuti/ore", il testo della
`DeadlinePill` sulla scadenza del Lead — un concetto testuale distinto, non
un bottone, invariato).

**"Lavoro terminato" in turchese**: *"in richieste ricevute colora il
pulsante "lavoro terminato" in turchese"*. Il bottone (stadio `accettata`,
`variant="secondary"`, `onPress={() => setShowCompleteModal(true)}`) aveva
sfondo trasparente con bordo grafite (stile di default di `variant=
"secondary"`, `packages/ui/src/Button.tsx`) — non toccata la variante
condivisa (usata altrove nel sito con quel significato neutro), solo
questo singolo bottone: override diretto delle prop
`backgroundColor`/`borderColor`/`color` con lo stesso hex già in uso per lo
stato "Completata" in `STAGE_STYLE` (`#20B2AA`, §61) — coerenza cromatica
tra il bottone che porta a quello stato e lo stato stesso — più
`hoverStyle`/`pressStyle` in una tonalità più scura dello stesso turchese.

Verificato con l'API locale reale (non solo lettura di codice) e
Playwright: richiesta diretta a un professionista di test in stadio
`da_quotare` → bottone "Chat" presente, zero bottoni con testo "Rispondi"
nel DOM, testo "Rispondi entro 4 ore" (`DeadlinePill`, invariato) ancora
presente e distinto; seconda richiesta portata a preventivo inviato e
accettato (stadio `accettata`, `Booking` `CONFIRMED`) → bottone "Lavoro
terminato" trovato con `backgroundColor: rgb(32, 178, 170)` (= `#20B2AA`)
e testo bianco, colore misurato via `getComputedStyle`. Zero errori
console. Typecheck pulito su `apps/web`, build di produzione verde
(31 route, nessuna nuova).

## 64. Bug reale: "Vedi in agenda" (richieste ricevute) non mostrava la prenotazione

Segnalato dall'utente: *"nelle richieste ricevute da un account
professionista in un preventivo accettato, se clicco su vedi in agenda,
non lo visualizzo in agenda, correggi"*. Causa reale (riprodotta, non solo
ipotizzata): il bottone "Vedi in agenda" (`RequestCard`, stadi
`accettata`/`completata`/`annullata`) era un semplice `<Link
href="/dashboard/agenda">` senza alcun parametro — `/dashboard/agenda`
apre di default sul calendario "Prenotazioni" (già corretto, giro
precedente in questo file) ma sempre sulla **data odierna**
(`bookingCurrentDate` inizializzata a `todayUtc()`, nessun supporto a
deep-link). Una prenotazione con `scheduledAt` anche solo di qualche
settimana nel futuro/passato esisteva perfettamente in agenda ma non
compariva mai nella vista mostrata al primo caricamento — sembrava
"mancante" perché occorreva già sapere di dover navigare manualmente fino
alla data giusta.

- **`apps/web/src/app/dashboard/richieste/page.tsx`**: il link diventa
  `/dashboard/agenda?booking={booking.id}` quando `booking` è disponibile
  (sempre vero per questi tre stadi), invariato altrimenti.
- **`apps/web/src/app/dashboard/agenda/page.tsx`**: nuovo `useSearchParams`
  (richiede di avvolgere il componente in `<Suspense>`, stesso gotcha già
  documentato altrove in questo file per `/le-mie-richieste`/
  `/password-dimenticata` — la pagina esportava prima un unico componente
  `DashboardAgendaPage` senza wrapper, ora `DashboardAgendaPage` è solo il
  guscio `<Suspense>`, `DashboardAgendaContent` porta tutta la logica
  esistente invariata). Un nuovo `useEffect`, eseguito una sola volta non
  appena `bookings` è caricato (`consumedBookingDeepLinkRef`, evita di
  ripetere il salto se `bookings` si ricarica mentre l'utente ha già
  navigato altrove): se `?booking=` corrisponde a una prenotazione reale,
  porta `activeTab` su "prenotazioni", `bookingView` su "Giorno" (sempre
  visibile a prescindere da come cade nella settimana/mese), naviga
  `bookingCurrentDate` alla data esatta (`startOfDayUtc(new
  Date(match.scheduledAt))`, stesso helper già in uso in
  `apps/web/src/lib/calendarDates.ts`) e apre subito
  `BookingDetailPanel` (`setSelectedBooking(match)`) — non basta arrivare
  sulla data giusta, l'utente deve vedere concretamente la prenotazione
  aperta, non doverla ancora cercare/cliccare tra le altre di quel giorno.
  Nessun parametro → nessun comportamento nuovo (stesso stato iniziale di
  prima).

Verificato end-to-end con l'API locale reale (non solo lettura di codice)
e Playwright: professionista+cliente di test, richiesta diretta →
preventivo con data 19 ottobre 2026 (oltre un mese da "oggi", 8 settembre
2026 in questo ambiente) → accettata dal cliente → `Booking` `CONFIRMED`
con quella data. Click su "Vedi in agenda" da `/dashboard/richieste`
(card espansa, stadio "accettata") → naviga a
`/dashboard/agenda?booking=<id>` → pannello di dettaglio aperto
automaticamente con "lunedì 19 ottobre 2026 · 09:00–11:00", nome cliente,
contatti, indirizzo e preventivo tutti corretti — prima del fix la stessa
navigazione sarebbe atterrata sulla data odierna, senza alcuna
prenotazione visibile in quel giorno. Nessuna regressione: aprendo
`/dashboard/agenda` senza `?booking=` nessun pannello si apre da solo
(l'unico `role="dialog"` presente in quel caso è il banner cookie,
componente distinto e pre-esistente). Zero errori console. Typecheck
pulito su `apps/web`, build di produzione verde (31 route, nessuna
nuova).

## 65. "Annulla prenotazione" spostato in un menu hamburger, lato cliente

Richiesta esplicita dell'utente: *"lato cliente, in lavori accettati, in
le mie richieste, crea un menu hamburger e all'interno inserisci 'annulla
prenotazione' che ora si trova esternamente sulla richiesta ed
eliminalo"*. Il bottone "Annulla prenotazione" in `BookingRow`
(`/le-mie-richieste`, tab "Lavori accettati", stati `PENDING`/
`CONFIRMED`) era una riga a sé nel corpo della card — ora sostituito da
un'icona menu (`menu`) nell'intestazione, accanto alla pillola di stato.

`BookingActionsMenu` (nuovo componente locale al file, stesso pattern
click-to-open/chiusura al click esterno già in uso in `ReportsSectionMenu`
(`/admin`, CLAUDE.md §54) — nessun componente condiviso in `packages/ui`,
un solo punto di consumo qui): oggi porta una sola voce ("Annulla
prenotazione", icona `x` rossa), ma è già una struttura a menu — un
click apre `CancelBookingModal` esattamente come prima (stesso `onCancel`,
nessuna logica toccata), solo il punto di accesso è cambiato. Menu
mostrato solo quando l'azione è disponibile (`booking.status ===
"PENDING" || "CONFIRMED"`), stesso gate già in uso per il vecchio bottone.

Verificato end-to-end con l'API locale reale (non solo lettura di codice)
e Playwright: richiesta diretta a un professionista di test → preventivo
→ accettazione (`Booking` `CONFIRMED`) → nessun bottone "Annulla
prenotazione" visibile nella card prima di aprire il menu; click
sull'icona hamburger → voce "Annulla prenotazione" rivelata; click sulla
voce → `CancelBookingModal` aperto con il testo corretto ("Il
professionista verrà avvisato dell'annullamento."). Zero errori console.
Typecheck pulito su `apps/web`, build di produzione verde (31 route,
nessuna nuova).

## 66. Verifica negoziazione data/orario (nessun bug trovato) + dettagli cliente/data intervento/importo finale nell'anteprima non espansa

Segnalazione dell'utente indagata a fondo, nessuna modifica di codice
risultata necessaria: *"lato professionista, quando si modifica un
preventivo ad esempio si modifica la data o l'orario penso che quando poi
si accetta la nuova data/orario non venga correttamente salvata in
agenda, sia se modifica la data/orario il professionista sia se la
richiesta di modifica proviene dal cliente"*. Verificati tutti e tre i
percorsi di negoziazione reali (`QuotesService.proposeDate`/
`confirmProposedDate`, `counterProposeDate`, `createOrUpdate`) con
quattro test end-to-end indipendenti contro l'API/DB locali — tre via
chiamate dirette e uno **interamente tramite interazione reale col
browser** (form "Modifica data/orario" → opzione "Altro (data e orario
personalizzati)" → invio → conferma professionista via bottone "Accetta
nuova data"): in ogni caso `Booking.scheduledAt`/`scheduledEndAt`
riflette esattamente la data/ora accettata per ultima, e la fascia
compare correttamente sul calendario "Prenotazioni" di `/dashboard/agenda`
alla data giusta (confermato con uno screenshot su ottobre 2026). Nessun
bug riprodotto: il codice di negoziazione/salvataggio in agenda era già
corretto prima di questo giro.

Nello stesso turno, due richieste esplicite dell'utente sull'anteprima
non espansa delle card di `/dashboard/richieste` (`RequestCard`):

1. *"nelle richieste ricevute in dettagli cliente deve essere visualizzato
   anche il nome e cognome inseriti nel preventivo, e nell'anteprima delle
   richieste ricevute quando ancora non si espande la finestra deve essere
   visualizzata già la data e ora dell'intervento o la richiesta di quella
   specifica data/intervento cosi che sia subito visibile"*:
   - **"Dettagli cliente"** (sezione espansa): nuova riga "Riceverà il
     professionista: {nome} {cognome}" da `booking.recipientName`/
     `recipientSurname` (chi riceve materialmente il professionista sul
     lavoro, non necessariamente l'intestatario dell'account — CLAUDE.md
     §16/§45) — visibile solo quando esiste una `Booking` (stesso cancello
     di privacy già in vigore per telefono/email/indirizzo, §45: questi
     dati restano nascosti finché il preventivo non è accettato).
   - **Anteprima non espansa**: nuova riga con icona `calendar`, priorità
     a tre livelli — `booking.scheduledAt` ("Intervento: ...", una
     prenotazione reale esiste), altrimenti `lead.quote.estimatedStartDate`
     ("Preventivo per: ...", un preventivo è stato inviato ma non ancora
     accettato/confermato), altrimenti `guidedRequest.preferredDate`/
     `preferredTimeSlot` ("Richiesta per: ...", la fascia richiesta dal
     cliente fin dall'invio quando nata da una fascia generica dell'agenda
     pubblica — stesso campo già mostrato in `/le-mie-richieste`, mai
     prima qui). Nessuna riga quando nessuno dei tre è disponibile.
2. *"e sempre nella finestre non ancora espanse, dove ora è visualizzato
   l'importo del preventivo, per le richieste completate inserisci
   l'importo finale"*: nell'angolo in alto a destra della card (dove già
   compariva il range preventivato), per lo stadio `completata` con
   `booking.finalAmountEurCents` valorizzato (importo esatto da "Lavoro
   terminato", CLAUDE.md §40) sostituisce il range — per ogni altro stadio
   il range preventivato resta invariato.

Verificato end-to-end con l'API locale reale (non solo typecheck/build) e
Playwright: preventivo negoziato fino ad accettazione (2026-10-05
11:00–12:00) → completato con importo finale 95,00€ → card "Completata"
mostra "95.00 €" (non il range preventivato) e "Intervento: lunedì 5
ottobre · 11:00–12:00" già nell'anteprima non espansa, "Riceverà il
professionista: Luca Bianchi" visibile aprendo "Dettagli cliente"; una
seconda richiesta di test (stadio `da_quotare`, nata da una fascia
generica con `preferredDate`/`preferredTimeSlot` valorizzati, nessun
preventivo ancora inviato) mostra "Richiesta per: martedì 10 novembre ·
15:00–16:00" nella stessa anteprima non espansa. Zero overflow orizzontale
su mobile (390px, iPhone 13), zero errori console. Typecheck pulito su
`apps/web`, build di produzione verde (31 route, nessuna nuova).

## 67. Dettagli cliente più leggibili, toast persistenti, popup "salva dati account", menu hamburger "Elimina richiesta" lato cliente, Modifica/Rifiuta affiancati nel preventivo ricevuto

Cinque richieste esplicite dell'utente, stesso giro.

**"Dettagli cliente" con sfondo colorato + contatti tutti cliccabili** —
richiesta esplicita: *"lato professionista, nelle richieste ricevute fai
visualizzare meglio la sezione dettagli cliente magari colorando lo
sfondo di quella sezione, e poi i tasti whatsapp e chiama mettili di
fianco al numero, e rendi cliccabile sia il numero, sia l'email, sia
l'indirizzo"*. `RequestCard` (`/dashboard/richieste`): la sezione
"Dettagli cliente" (visibile solo quando i dati sono rivelati, dopo
l'accettazione del preventivo — CLAUDE.md §45) è ora avvolta in un
riquadro colorato (`brand.gesso` + bordo `brand.filetto`, stesso token
già in uso per il riquadro "Orario richiesto" nello stesso file) invece
di un semplice blocco di testo su sfondo trasparente. I bottoni
"WhatsApp"/"Chiama" (già esistenti, `buildWhatsAppLink`) si spostano
dalla propria riga a fianco del numero di telefono, entrambi come link
`<a>` cliccabili (`tel:`/`wa.me`) invece di pillole non collegate al
testo del numero — il numero stesso diventa un link `tel:` cliccabile
(prima era solo testo). Email resa cliccabile (`mailto:`); indirizzo
reso cliccabile con un link verso Google Maps
(`https://www.google.com/maps/search/?api=1&query=...`) — nessuna nuova
integrazione mappe, solo un link esterno standard.

**Toast di notifica persistenti fino alla chiusura esplicita** —
richiesta esplicita: *"quando esce una notifica push, non è ben
comprensibile, rendila visualizzabile fino a che non si visualizza e
apre effettivamente quell'aggiornamento"*. `ToastStack.tsx` (§ "Popup
'toast' per nuove notifiche", introdotto in precedenza) auto-chiudeva
ogni popup dopo 6 secondi — troppo poco per leggere ed eventualmente
cliccare sul contenuto. Rimosso l'auto-dismiss (`AUTO_DISMISS_MS`/
`setTimeout`); ogni toast resta visibile finché non viene chiuso
esplicitamente — click sul corpo del toast (naviga alla pagina/tab
pertinente, comportamento già esistente) oppure sul nuovo bottone "x"
dedicato (icona `x`, `stopPropagation` per non attivare anche la
navigazione).

**Popup "salva questi dati come predefiniti" anche per un campo
modificato, non solo per dati mancanti** — richiesta esplicita: *"se il
cliente quando compila la richiesta di preventivo, dal campo 'nome',
'cognome' ecc.., se viene cambiato qualche campo rispetto a quelli
salvati e precompilati, chiedi se si vogliono salvare i nuovi dati"* +
*"quando si clicca su invia richiesta fai uscire il popup che chiede"*.
Il popup esisteva già (§16) ma scattava solo quando l'account non aveva
ancora ALCUN dato salvato (`accountMissingFields`) — un cliente che
modificava un singolo campo già precompilato (es. cambia telefono per
questa specifica richiesta) non veniva mai interpellato.
`GuidedRequestForm.tsx`: `accountMissingFields` rinominato
`accountDataDiffers`, nuovo `accountSnapshotRef` (istantanea dei valori
REALI dell'account al momento del prefill, non dei valori del form —
che può ricadere su valori arrivati da `?data=`/altri query param).
All'invio riuscito (solo in modalità `HOME`, coerente con §25: in
modalità `ONLINE` questi campi non esistono nel form), confronto
campo-per-campo tra lo snapshot e i valori appena inviati — se anche uno
solo differisce (dato mancante compreso, stesso comportamento di prima
in quel caso), il popup compare.

**Menu hamburger "Elimina richiesta" lato cliente** — richiesta
esplicita: *"lato cliente, nelle mie richieste e nelle mie richieste
successivamente, inserisci il pulsante hamburger come presente nel
lavori accettati, dove all'interno inserisci 'elimina richiesta', ed
eliminala ora dove e presente esternamente con il tasto 'elimina'"*.
`BookingActionsMenu` (già esistente per "Annulla prenotazione" su
`BookingRow`, §65) generalizzato in `ActionsMenu` (props
`accessibilityLabel`/`items: {icon, text, color, onPress}[]`) — stesso
componente riusato ora da entrambi i punti. `GuidedRequestCard`: il
vecchio link testuale esterno "Elimina" (visibile quando `canDelete`)
sostituito da `<ActionsMenu items={[{ icon: "trash-2", text: "Elimina
richiesta", ... }]} />` nell'intestazione della card, accanto alla
pillola di stato — click apre lo stesso flusso di doppia conferma già
esistente (`confirmingDelete`), invariato nella logica.

**Nel preventivo ricevuto: "Modifica"/"Rifiuta" affiancati come
bottoni** — richiesta esplicita: *"lato cliente, in richieste ricevute
e successivamente richieste ricevute, la scritta cliccabile 'rifiuta
preventivo' mettila di lato a destra a 'modifica data/orario', e
rendilo piu come un pulsante; e modifica il pulsante 'modifica
data/orario' in 'modifica'"* — applicata a `QuoteCard`
(`/le-mie-richieste`, unico punto dove i due controlli coesistono nello
stesso preventivo ricevuto: "Modifica data/orario"→"Modifica" e
"Rifiuta preventivo" erano rispettivamente un `Button variant=
"secondary"` e un link di testo sottolineato rosso su una riga separata
sotto). "Rifiuta" ora un `Button variant="ghost"` (stesso pattern già in
uso per "Rifiuta" lato professionista in `/dashboard/richieste`, testo
rosso in grassetto dentro un vero elemento bottone) nella stessa riga di
"Accetta preventivo"/"Modifica", a destra.

Verificato end-to-end con l'API locale reale (non solo typecheck/build)
e Playwright, quattro script dedicati:
- **Dettagli cliente**: sfondo colorato confermato non-trasparente,
  numero/email/indirizzo tutti confermati come `<a href="tel:...">`/
  `<a href="mailto:...">`/link Google Maps cliccabili, WhatsApp/Chiama
  confermati sulla stessa riga del numero (bounding box Y entro 15px).
- **Toast persistente**: creata una nuova richiesta diretta mentre il
  professionista restava sulla home (non `/dashboard`, che marca subito
  le notifiche come lette — `markNotificationsRead()` al mount
  vanificherebbe il test) — toast comparso a **45s** (poll periodico
  confermato via log di rete), ancora presente **53s** dopo l'invio
  (ben oltre i vecchi 6s di auto-dismiss), chiuso correttamente al click
  sul nuovo bottone "x" (`[aria-label="Chiudi la notifica"]`).
- **Popup salva dati account**: due casi — dati account invariati
  (nessuna modifica ai campi precompilati) → popup assente; un campo
  modificato (telefono) → popup presente con il testo "Vuoi salvare
  questi dati (nome, telefono, indirizzo) come predefiniti..."; click su
  "Sì, salva" → nuovo telefono persistito correttamente sull'account
  (confermato via query diretta al DB).
- **Menu hamburger "Elimina richiesta"**: testo esterno "Elimina" assente
  dopo la modifica, icona hamburger presente e funzionante, voce
  "Elimina richiesta" rivelata al click, conferma "Eliminare questa
  richiesta?" mostrata correttamente al click sulla voce di menu.
- **QuoteCard Modifica/Rifiuta**: bottone "Modifica" (senza "data/orario")
  e bottone "Rifiuta" (non più testo sottolineato) entrambi confermati
  come elementi con `role="button"`, sulla stessa riga (Y entro 10px),
  "Rifiuta" a destra di "Modifica".

Zero errori console in tutti i flussi. Typecheck pulito su tutti i
package (`shared`, `api-client`, `web`), build di produzione `apps/web`
verde (31 route, nessuna nuova).

## 68. `/dashboard` — riepiloghi limitati a 10 righe con paginazione + data/ora di ricezione in "Richieste ricevute"

Due richieste esplicite dell'utente, stesso giro.

**Paginazione dei riepiloghi compatti** — *"in dashboard fai visualizzare
un massimo di 10 sia in richieste ricevute che lavori accettati, il resto
mettile in altre pagine cliccabili"*. I riepiloghi compatti introdotti in
CLAUDE.md §43/§56 (sostituti delle card complete, deduplicate rispetto a
`/dashboard/richieste`) mostravano sempre e solo le 5 righe più
recentemente aggiornate, con un link all'inbox completa per vedere il
resto — non c'era modo di raggiungere la sesta richiesta/lavoro senza
lasciare `/dashboard`. Sostituito con paginazione vera, stesso componente
`Pagination` già in uso su `/le-mie-richieste`/`/dashboard/richieste`
(importato ma mai collegato in questo file finora) — nuova costante
condivisa `DASHBOARD_LIST_PAGE_SIZE = 10`, stato `leadsPage`/
`bookingsPage` (indipendente per tab, non si azzera cambiando scheda),
`goToLeadsPage`/`goToBookingsPage` che aggiornano la pagina **e**
scrollano in cima alla lista (`listTopRef`, stesso principio già in uso
altrove: senza, si resta scrollati sul controllo appena cliccato mentre
la nuova pagina parte fuori dallo schermo). `Pagination` compare sia sopra
che sotto ciascuna lista, stessa convenzione già stabilita per le altre
liste paginate del sito. Filtri/ordinamento (`ListControls`) restano
**solo** su `/dashboard/richieste`, unica fonte di verità per quelli — qui
resta solo l'ordinamento fisso per ultimo aggiornamento già esistente, più
la paginazione. Il bottone "Apri tutte le richieste ricevute"/"Apri tutti
i lavori accettati" resta comunque disponibile per chi vuole i filtri
completi dell'inbox dedicata.

**Data/ora di ricezione in "Richieste ricevute"** — *"in dashboard
inserisci anche la data e l'orario nelle richieste ricevute"*.
`LeadSummaryRow` mostrava solo l'etichetta di stato (`leadSummaryLabel`,
es. "In attesa di preventivo"), mai quando la richiesta fosse arrivata —
a differenza di `BookingSummaryRow` nello stesso file, che mostra già
data+ora (`scheduledAt`) accanto allo stato. Aggiunta la stessa resa
(`toLocaleDateString`/`toLocaleTimeString` "it-IT", weekday abbreviato +
giorno+mese · orario) usando `lead.createdAt` (data/ora di ricezione del
lead, stesso campo già mostrato per esteso in `RequestCard` su
`/dashboard/richieste`, CLAUDE.md §62) — la riga diventa "mar 8 set ·
22:57 · In attesa di preventivo" invece del solo stato.

Verificato end-to-end con l'API locale reale (non solo typecheck/build) e
Playwright: professionista di test con 12 richieste dirette (10 create via
API, 2 seminate via SQL diretto dopo aver urtato il rate limit 5/min di
`/guided-requests`) — pagina 1 mostra esattamente 10 righe (non 12), 2
bottoni "Pagina 2" (sopra e sotto la lista), click su "Pagina 2" mostra le
2 righe restanti, click su "Pagina 1" torna alle 10 originali; ogni riga
mostra ora "gg mmm · HH:MM · stato" (pattern verificato via regex sul
testo della pagina). Tab "Lavori accettati" con un solo lavoro accettato
(preventivo inviato e accettato via API) → 1 riga visibile, nessun
bottone "Pagina 2" (comportamento corretto di `Pagination`, che ritorna
`null` con una sola pagina). Zero overflow orizzontale su mobile (390px,
iPhone 13). Zero errori console in tutti i flussi. Typecheck pulito su
`apps/web`, build di produzione verde (31 route, nessuna nuova).

## 69. "Dettagli cliente" riordinata + Chat in fondo, note personali espandibili su mobile, media stelle nella scheda cliente

Tre richieste esplicite dell'utente, stesso giro.

**"Dettagli cliente" (`/dashboard/richieste`, `RequestCard`) riordinata**
— *"In richieste ricevute il pulsante chat mettilo in fondo alla scheda
del dettaglio cliente, e poi ordina meglio in questo ordine: elimina la
dicitura 'riceverà il professionista' e lascia solo il nome, subito sotto
l'indirizzo, sotto il numero, sotto l'e-mail"*. La sezione (visibile solo
dopo l'accettazione del preventivo, CLAUDE.md §45) aveva un ordine
diverso — nome (con prefisso "Riceverà il professionista:") → numero
(WhatsApp/Chiama) → email → tasto Chat, poi **fuori** dal blocco
condizionale l'indirizzo e la riga "Intervento". Riordinata a: nome
destinatario (solo `{[booking.recipientName, booking.recipientSurname]
.filter(Boolean).join(" ")}`, prefisso rimosso, reso in grassetto come
prima riga di dato) → indirizzo (spostato qui da fuori al blocco, stessa
resa cliccabile Google Maps) → numero → email → riga "Intervento" →
tasto Chat, ora l'ultimo elemento della scheda. Effetto collaterale
accettato consapevolmente: indirizzo/riga "Intervento", che prima
comparivano anche per un account cliente eliminato (erano fuori dal
ramo `gr.clientAccountDeleted ? ... : ...`), ora seguono lo stesso ramo
del resto dei dati cliente e quindi non compaiono più in quel caso — più
coerente (tutti i dettagli del cliente nascosti insieme quando l'account
non esiste più) di prima, dove solo nome/telefono/email sparivano.
2. **Media delle stelle nella scheda cliente** (`ClientProfileModal.tsx`,
   aperta cliccando il nome del cliente) — richiesta esplicita
   dell'utente: *"oltre alle recensioni ricevute, metti la media delle
   stelle ricevute"*. Nuovo `avgRating` (media
   aritmetica di `reviews[].rating`, calcolata client-side dalle stesse
   recensioni già scaricate, nessuna nuova chiamata) mostrata accanto
   all'intestazione "Recensioni ricevute (N)": 5 stelle (piene fino a
   `Math.round(avgRating)`, stesso principio di arrotondamento già seguito
   da `Rating.tsx` in `packages/ui` per restare semplice, CLAUDE.md §10
   Fase 3) + il valore numerico a una cifra decimale (es. "4.0").
3. **Testo aggiornato**: *"modificala la dicitura 'Telefono, email e
   indirizzo saranno visibili qui e in agenda non appena il preventivo
   verrà accettato.' con 'Telefono, email e indirizzo saranno visibili
   all'accettazione del preventivo'"* — sostituito verbatim in
   `ClientProfileModal.tsx` (il testo quasi identico ma più corto già
   presente in `RequestCard`, "...saranno visibili qui ad accettazione
   del preventivo.", non era quello citato dall'utente e resta invariato).

**Note personali non espandibili su mobile** — *"nella visualizzazione
cellulare le note personali non si riescono ad espandere così come
succede sulla versione desktop"*. Le due textarea "Note personali (solo
per te)" (`RequestCard`/`/dashboard/richieste` e
`BookingDetailPanel`/agenda "Prenotazioni") usavano `resize: "vertical"`
— l'unico modo di ingrandirle era trascinare l'angolo in basso a destra,
un gesto che i browser touch (iOS/Android) non supportano affatto per il
CSS `resize`: il campo restava bloccato all'altezza iniziale su
cellulare, identico su desktop dov'era invece trascinabile. Corretto con
un auto-grow via JS, identico sulle due piattaforme: un `ref` sulla
textarea + un `useEffect` che imposta `el.style.height = "auto"` poi
`el.style.height = `${el.scrollHeight}px`` ad ogni cambio di `noteDraft`
— cresce da sola mentre si scrive, mai bisogno di trascinare nulla.
`resize` passato a `"none"` (il ridimensionamento manuale non ha più
senso, l'altezza segue sempre il contenuto) + `overflow: "hidden"` (evita
un lampo di scrollbar interna tra un render e l'altro).

Verificato end-to-end con l'API locale reale (non solo typecheck/build) e
Playwright: professionista+cliente di test con due lavori portati a
`COMPLETED` (con conferma reciproca "doppio cieco" completata su
entrambi — richiesto rating 3 e 5 sullo stesso cliente da parti diverse
per un caso di media non banale) — box "Dettagli cliente" con ordine
verificato via indici di stringa (nome < indirizzo < numero < email <
Chat, tutti presenti), testo "Riceverà il professionista" assente,
"Luca Bianchi" (nome completo) presente come prima riga di dato; scheda
cliente aperta dal nome mostra "4.0" (media di 3 e 5) e "Recensioni
ricevute (2)", nuovo testo "...visibili all'accettazione del
preventivo" presente, vecchio testo assente. Textarea "Note personali":
altezza iniziale 50px (RequestCard)/71px (BookingDetailPanel) → 128px/
122px dopo un testo lungo, su viewport `devices["iPhone 13"]" (390px),
altezza sempre coincidente con `scrollHeight` (nessun overflow interno
residuo), zero overflow orizzontale di pagina. Zero errori console in
tutti i flussi. Typecheck pulito su tutti i package (`shared`,
`api-client`, `web`), build di produzione `apps/web` verde (31 route,
nessuna nuova).

**Bug reale, correzione della correzione sopra: il riquadro "Note
personali" in `/dashboard/richieste` non si allargava più affatto** —
segnalato dall'utente: "il riquadro delle note personali non ha più la
possibilità di allargarsi". Causa reale, specifica a `RequestCard`
(non presente in `BookingDetailPanel`, che non ne soffriva): l'auto-grow
introdotto sopra dipendeva da un `useEffect(() => {...}, [noteDraft])` —
ma la sezione "Note personali" vive dentro il corpo espandibile della
card (`{isOpen ? (...) : null}`), un sottoalbero JSX condizionale
all'interno dello **stesso** componente sempre montato (non un
componente separato smontato/rimontato come `BookingDetailPanel`, che
riceve `key={selectedBooking.id}` e quindi rimonta per intero ad ogni
apertura, facendo scattare l'effetto "al mount" indipendentemente dalle
dipendenze). Aprendo la card, la `<textarea>` viene creata per la prima
volta nel DOM ma `noteDraft` non cambia in quell'istante (era già
impostato al montaggio del componente) — l'effetto quindi non si
riattiva mai e l'altezza resta bloccata ai 2 righi di default
(`rows={2}`, ~50px) finché non si digita almeno un carattere: una nota
già lunga restava visibilmente tagliata al primo apertura, e senza più
la maniglia di trascinamento manuale (`resize:none`, rimosso nella
correzione precedente) non c'era alcun modo di vederla per intero prima
di scrivere qualcosa. Corretto estraendo la logica di ridimensionamento
in `autoGrowNote(el)` (funzione, non solo effetto) e richiamandola anche
da una **ref callback** sulla `<textarea>` (`ref={(el) => {
noteTextareaRef.current = el; autoGrowNote(el); }}`): ora l'altezza
corretta viene applicata nell'istante stesso in cui il nodo DOM viene
creato — al primo montaggio della sezione (apertura della card) così
come a ogni digitazione successiva (via l'`useEffect` esistente,
invariato) — senza dipendere dal timing dei re-render del componente
padre. Verificato end-to-end con l'API locale reale (non solo lettura di
codice): nota di ~400 caratteri impostata su un lead di test via
`PATCH /professionals/me/leads/:id/note`, altezza della textarea
misurata subito dopo l'apertura della card **prima** di questa
correzione (50px, contenuto tagliato — riprodotto con `git stash`) e
**dopo** (64px, testo interamente visibile senza aver digitato nulla);
digitare altro testo la fa crescere ulteriormente (112px desktop/192px
mobile), zero overflow orizzontale di pagina su desktop (1280px) e
mobile (`devices["iPhone 13"]`, 390px). Typecheck pulito su `apps/web`,
build di produzione verde (31 route, nessuna nuova).

---

## 70. Correzioni dal "Verbale Cognitivo" (audit UX/cyberpsicologia)

Richiesta esplicita dell'utente: correggere una selezione di rilievi
dall'audit UX/cyberpsicologia pubblicato in precedenza come Artifact
("Verbale Cognitivo", `https://claude.ai/code/artifact/12626204-38f4-45d0
-9507-9dcf5b393398`), scelti dall'utente per numero (F1.1, F1.3, F1.4,
F2.1, F2.2, F2.4, F3.1, F4.1, F4.3, F5.1, F6.1, F6.3, F7.2, F8.1) più due
richieste aggiuntive nate durante lo stesso giro (riordino di
`/dashboard/profilo`, F5.2 assorbita nello stesso intervento).

**F2.2 — gate di autenticazione spostato al momento dell'invio (priorità
più alta del verbale)**: prima, sia `/preventivo` che `/urgente`
sostituivano l'intero modulo con una schermata "Un ultimo passo: accedi o
crea l'account gratuito" per un visitatore anonimo — zero campi
compilabili prima del login, proprio nel flusso a più alta intenzione
(un'emergenza reale). Corretto con un gate **in-page**, mai una
navigazione fuori dal modulo (che avrebbe perso testo già scritto e foto
già selezionate):
- **`apps/web/src/components/InlineAuthGate.tsx`** (nuovo): login e
  registrazione (email+password o Google) dentro un overlay
  (`role="dialog"`, chiudibile), stessa logica/copy già in uso su
  `/accedi`/`/registrati` (inclusi i due consensi obbligatori
  `acceptedLegalTerms`/`declaredAdult` in registrazione, CLAUDE.md §48) ma
  senza mai lasciare la pagina. Ruolo sempre `CLIENT` (questo gate compare
  solo nel flusso "richiedi un preventivo"). Su `verifyGoogle` in modalità
  login, `createIfMissing: false` passa automaticamente a "Registrati" se
  l'email non corrisponde a nessun account, stesso comportamento già
  in uso su `/accedi` (CLAUDE.md §20).
- **`GuidedRequestForm.tsx`**: rimosso il vecchio blocco a schermo intero
  con `if (!user || !token) return <...>`; `handleSubmit` valida ora tutti
  i campi come prima e, solo alla fine, se manca un token, apre
  `InlineAuthGate` (`showAuthGate`) invece di fallire. Un `pendingSubmit`
  + `useEffect([pendingSubmit, token])` riprende l'invio vero e proprio
  (`doSubmit(token)`) non appena il token diventa disponibile nel
  contesto — mai il vecchio `token` nullo catturato dalla chiusura di
  `handleSubmit` (classico bug di stale closure, evitato leggendo il
  token dalla dipendenza dell'effetto, non dalla chiusura originale).
- **Foto/video selezionabili anche da anonimo**: `handlePhotoChange`
  carica subito su Cloudinary solo se `token` è già presente; altrimenti
  tiene il file localmente (`URL.createObjectURL`, mai caricato) e lo
  invia solo dentro `doSubmit`, una volta garantito un token valido (dopo
  il gate). `MediaPreview.tsx` guadagna una prop `forceVideo` per
  distinguere foto/video negli URL `blob:` locali (nessuna estensione
  riconoscibile dall'euristica esistente basata sull'URL).
  Verificato end-to-end con l'API locale reale e Playwright (non solo
  lettura di codice): modulo compilato per intero da anonimo (categoria,
  descrizione, indirizzo, foto), invio → gate aperto → registrazione
  inline → richiesta creata con successo, foto caricata correttamente
  (intercettato `POST /guided-requests/photos` per il solo limite
  ambientale "Cloudinary non configurato in locale", stesso principio già
  documentato altrove in questo file), zero errori console.

**F2.1 — categoria non più scelta due volte nello stesso istante**:
il `<select>` "Seleziona una categoria..." e l'intera griglia di pillole
comparivano entrambi, sempre, sotto e sopra i 700px. Ora il `<select>`
resta visibile solo sotto 700px (`@media (min-width: 700px) { display:
none }`, `<style jsx>` scoped sul solo wrapper del select) — sopra quella
soglia solo la griglia, mai entrambi insieme sulla stessa viewport.

**F2.4 — "A domicilio" preselezionato**: `initialServiceMode` (già
derivato da `?modalita=` in URL) ricade ora su `"HOME"` invece di `null`
quando l'URL non impone nulla — il toggle non parte più senza alcuna
opzione evidenziata.

**F1.1 — banner cookie: da overlay centrale a barra sottile ancorata in
basso**: `CookieBanner.tsx` copriva la barra di ricerca/i bottoni "Filtri"
su mobile (card centrata, 16px di margine). Riscritto come barra a piena
larghezza ancorata al vero bordo inferiore (`bottom:0, left:0, right:0`,
niente margini laterali), `maxHeight: "15vh"` di garanzia, padding/font
ridotti. Verificato: altezza reale ~100px su un viewport 390×664 (~15%),
zero sovrapposizione con "Filtri" nella pagina risultati.

**F1.3/F1.4 — etichetta di ordinamento + striscia di fiducia nei
risultati**: in `ResultsListWithMap.tsx`, sopra il bottone "Filtri",
aggiunta una riga "Ordinato per pertinenza" (**senza** selettore, come
richiesto esplicitamente dall'utente — l'ordinamento resta boost→
rating→recensioni, invariato) e una striscia con gli stessi tre badge di
fiducia già presenti nel footer ("Profili verificati", "Recensioni solo
da lavori confermati", "Gratis per chi cerca") — prima visibili solo in
fondo a ogni pagina, ora anche vicino al primo elenco di risultati.

**F3.1 — badge "Nuovo profilo"**: richiesta esplicita dell'utente,
sostituisce l'alternativa generica del verbale ("posticipare la comparsa
in ricerca") con un badge letterale, visibile per **30 giorni dalla
creazione del profilo a prescindere da quanto è già stato compilato**
(chiarimento esplicito successivo dell'utente: non sparisce al primo
campo riempito). `computeIsNewProfile(createdAt)` (nuovo,
`apps/api/src/common/new-profile.util.ts`), calcolato nei tre soli punti
che già costruiscono un `ProfessionalSearchResult`
(`ProfessionalsService.search`/`getById`,
`SavedProfessionalsService.listForUser`) — nuovo campo `isNewProfile`
propagato a `ProfessionalCard` (pillola verde con icona `sparkles`,
accanto a "Verificato"/"In evidenza") e al profilo pubblico (`Badge
variant="nuovo"`).

**F4.1 — spinta a completare l'agenda appena dopo l'iscrizione + agenda
autosalvante**: due parti, entrambe richieste esplicite dell'utente.
1. `/dashboard/profilo`: nuovo `isFirstProfileSave` (vero solo se, al
   primo caricamento della pagina, non esisteva ancora alcun profilo) —
   solo in quel caso, dopo "Salva profilo", invece del redirect automatico
   a `/dashboard` compare un overlay "Profilo salvato! Vuoi impostare già
   ora i giorni e le fasce orarie in cui sei disponibile?" con due bottoni
   ("Sì, imposta la disponibilità" → `/dashboard/agenda`, "Più tardi" →
   `/dashboard`, comportamento di prima). Un professionista che modifica
   un profilo già esistente non vede mai questo prompt.
2. `/dashboard/agenda`: **rimosso il bottone "Salva agenda"** — ogni
   operazione (impostare/modificare una fascia dal pop-up, propagare una
   modifica a tutte le occorrenze del mese, eliminazione singola o in
   blocco) salva già da sola sul server, subito. `handleSubmit` diventato
   `persistSlots(nextSlots)`, ora invocato con l'array esplicito appena
   calcolato da ciascuno dei quattro punti che prima si limitavano a
   `setSlots(...)` (creazione/propagazione fascia in `commitSlotEdit`,
   `deleteSlot`, `deleteSelectedSlots`) — mai una closure stale sullo
   stato `slots`. Resta solo un indicatore passivo ("Salvataggio..."/
   "Agenda salvata!"), non un'azione da compiere.
   Verificato end-to-end con l'API locale reale e Playwright: primo
   salvataggio profilo → overlay mostrato → click "Sì" → naviga
   correttamente a `/dashboard/agenda`; bottone "Salva agenda" assente;
   `GET /professionals/me/availability` confermato via API dopo
   un'operazione in UI, senza alcun click su un salvataggio a livello di
   pagina.

**F4.3 — pillole di filtro scorrevoli con frecce in "Richieste
ricevute"**: le 8 pillole (Tutte/Da quotare/.../Scadute) eccedevano la
larghezza di un laptop comune (1280px) senza alcun indizio visivo
("Scadute" appariva tagliata). Riusato `CategoryCarousel.tsx` (stesso
componente già in uso per i caroselli della home) al posto del semplice
`overflow-x:auto` — frecce prev/next più scroll touch nativo, nessun
codice duplicato.

**F5.1 — slider "Raggio di ingaggio" colorati + bloccati dietro
"Modifica"**: erano gli unici due controlli del sito ancora sul blu
nativo del browser. `EngagementRadiusSection.tsx`: `accentColor:
brand.verificato`/`brand.ottone` sui due slider (stesso colore già usato
per il pallino "Richieste standard"/"Richieste urgenti" accanto).
Combinato con una richiesta esplicita dell'utente arrivata a metà dello
stesso lavoro: gli slider non sono più modificabili direttamente — un
bottone "Modifica" li sblocca (`isEditing`), poi "Salva"/"Annulla"
confermano o ripristinano i valori originali — riduce il rischio di
trascinare per sbaglio uno slider decisivo per il fan-out dei lead durante
un normale scroll della pagina.

**Riordino `/dashboard/profilo` + F5.2 (sezioni percepibili)**: tre
richieste esplicite dell'utente sullo stesso file, assorbendo anche
F5.2 ("una pagina lunghissima senza sezioni percepibili, due bottoni
Salva scollegati"): Bio (etichetta "Bio", non più "Bio (opzionale)")
spostata subito sotto la scelta della categoria; Città/Indirizzo spostati
subito sotto il nome attività; "Raggio di ingaggio" spostato sopra il
bottone "Salva profilo" del form principale (restando comunque un
salvataggio indipendente, ora reso esplicito dal flusso Modifica/Salva
sopra). L'intera pagina è stata inoltre suddivisa in blocchi `Surface`
con un proprio titolo di sezione ("Identità", "Categoria e
presentazione", "Prestazioni offerte", "Lingue parlate", "Portfolio") —
chunking alla Miller, invece dell'unico scroll continuo di soli
`FieldLabel` di prima.

**F6.1 — meccanismo "doppio cieco" spiegato nel modulo recensione**:
`ReviewModal.tsx` guadagna un micro-testo ("La tua recensione sarà
visibile appena anche l'altra parte avrà lasciato la sua — o comunque
entro qualche giorno.") — prima il meccanismo (CLAUDE.md §40, sblocco
automatico dopo 3 giorni) non era spiegato da nessuna parte nel momento
in cui serve, rischiando di sembrare un bug a chi scrive una recensione e
non la vede comparire.

**F6.3 — principio scritto sulla visibilità dei contatti del cliente**:
la stessa policy era stata invertita tre volte nella cronologia del
prodotto senza mai un principio esplicito a fermare l'oscillazione.
Aggiunta una nuova regola vincolante in §5 ("Regole di sviluppo",
punto 9): i dati di contatto del cliente sono visibili al professionista
solo dopo un impegno reciproco confermato, mai prima — non invertire
senza discuterne esplicitamente con l'utente.

**F7.2 — notifiche multiple ravvicinate raggruppate in un solo toast**:
non trattato come "nessuna azione" nonostante il verbale lo classificasse
"da monitorare" — l'utente ha chiesto la correzione subito, dato che il
rischio era già raggiungibile con un volume ordinario (i toast non
scompaiono più da soli da una correzione precedente, quindi 2+ eventi
nello stesso giro di poll da 45s impilano più popup, ognuno da chiudere
singolarmente). `AuthContext.checkForNewNotifications`: con una sola
notifica nuova nel giro, comportamento invariato (messaggio specifico di
`notificationCopy`); con più di una, un solo toast aggregato ("Hai N
nuovi aggiornamenti.") invece di N — il click naviga alla
pagina/tab del primo evento del gruppo. I tre livelli passivi (badge
header/menu/card, mai interruttivi) restano invariati, non facevano
parte del rischio reale descritto dal rilievo.

**F8.1 — regola "zero emoji" abrogata**: decisione esplicita dell'utente
(il rilievo la elogiava così com'era, "nessuna azione"). Aggiunta come
punto 10 in §5: non più vincolante per lo sviluppo futuro, buon senso
resta comunque la guida. Nessun codice esistente toccato da questo solo
cambio di regola.

Verificato in blocco con l'API locale reale (non solo typecheck/build) e
tre script Playwright dedicati: F2.2 end-to-end completo (anonimo →
compilazione → gate → registrazione inline → invio riuscito, foto
inclusa), F2.1/F2.4 (select nascosto sopra 700px, "A domicilio"
preselezionato), F1.1 (banner ancorato in basso, altezza ~15vh, nessuna
sovrapposizione con "Filtri"), F1.3/F1.4 (etichetta e striscia di fiducia
presenti), F27/F5.2 (ordine sezioni corretto, "Bio" senza "(opzionale)"),
F4.1 (prompt dopo il primo salvataggio, navigazione a `/dashboard/agenda`,
bottone "Salva agenda" assente), F5.1 (slider disabilitati/abilitati
correttamente dietro "Modifica", `accent-color` di brand), F3.1 (badge
"Nuovo profilo" visibile sia sul profilo pubblico sia via
`GET /professionals/search`, `isNewProfile: true`). Zero errori console
in tutti i flussi. Typecheck pulito su tutti i package (`shared`, `api`,
`api-client`, `ui`, `web`, `mobile`), build di produzione `apps/web`
verde (31 route, nessuna nuova).

---

## 71. Campanella cronologia notifiche, riepilogo /account a sezioni, "Le mie richieste" per i professionisti, rifiniture

Cinque richieste esplicite dell'utente, stesso giro di lavoro.

**Pulsante a campanella con cronologia notifiche** — richiesta esplicita
dell'utente: "di fianco al nome in alto a destra, crea una specie di
pulsantino con una campanella dove conterrà la cronologia delle
notifiche, e cliccando su una di quella notifiche ti portera all oggetto
in questione" (posizione poi corretta: "alla sinistra del nome"). Prima
d'ora esistevano solo `GET /notifications/unread-count` (solo il numero)
e `GET /notifications/unread` (le sole non lette, per il popup "toast") —
nessun endpoint restituiva la cronologia completa (lette comprese).
- **`NotificationsService.history`** (nuovo, `GET /notifications/history`,
  JWT-guarded): tutte le notifiche dell'utente (lette+non lette),
  `createdAt desc`, limite 30 — stessa scala di lancio già seguita
  ovunque nel progetto (§7), nessuna paginazione. Nessuna migrazione
  Prisma: il modello `Notification` aveva già `readAt` (distingue
  letta/non letta).
- **`apps/web/src/components/NotificationBell.tsx`** (nuovo): pulsante
  icona (`bell-ring`, già nel registro condiviso — introdotto in un giro
  precedente ma mai usato prima d'ora) con lo stesso pallino rosso
  numerico già in uso su `AccountMenu`. Click apre un dropdown (stesso
  pattern click-to-open/chiusura-su-click-esterno di `AccountMenu`/
  `ReportsSectionMenu`) che scarica la cronologia al volo — un elemento
  per notifica, icona+testo da `notificationCopy(type)` (stessa mappa già
  in uso per i toast), tempo relativo ("5 min fa"/"2 ore fa"/"3 giorni
  fa"/data), sfondo `brand.gesso` + pallino cianografia per le non lette.
  Click su un elemento con una destinazione nota (`notificationDestination
  (type)`, stessa funzione già riusata da `ToastStack`) naviga a
  `${page}?tab=${tab}` e chiude il dropdown; un evento senza destinazione
  nota resta comunque leggibile ma non cliccabile. Aprire il dropdown
  segna subito tutte le notifiche come lette (`markNotificationsRead()`,
  stesso principio "visualizzare = confermare" già seguito ovunque nel
  prodotto) — azzera anche il pallino già esistente su `AccountMenu`,
  stesso stato condiviso.
- **`SiteHeader.tsx`**: montato a sinistra del nome, dentro una nuova
  `XStack` che avvolge `NotificationBell`+`AccountMenu` — non più
  `AccountMenu` da sola nello slot destro dell'header.
- **Bug reale scoperto durante la verifica: overflow orizzontale su
  mobile per un cliente autenticato** (non solo lettura di codice — la
  prima verifica Playwright su viewport 390px lo ha trovato con 35px di
  overflow su `/`, `/account` e `/le-mie-richieste`): la nuova campanella
  (36px + gap) spingeva la riga header (altezza fissa 64px, nessun
  `flexWrap` possibile senza spezzare il layout) oltre la larghezza dello
  schermo — il bottone "Richiedi preventivo" (visibile solo per un
  cliente, mai per un professionista) finiva parzialmente fuori
  viewport. Corretto **solo per un cliente già autenticato** (l'unico
  caso con la campanella presente — un visitatore anonimo non ha
  overflow, il suo bottone resta invariato su ogni larghezza): sotto
  `$xs` l'etichetta si accorcia da "Richiedi preventivo" a "Preventivo"
  (due `Text` con `display`/`$gtXs` opposti, stesso pattern già in uso
  per `Logo` full/mark) — verificato che l'overflow scenda a 0px su
  tutte e tre le pagine dopo il fix, nessuna regressione per un
  visitatore anonimo (etichetta invariata).

**`/account` riorganizzata in sezioni `Surface`** — richiesta esplicita
dell'utente ("migliora la pagina impostazioni dell'account"): la pagina
era un unico form piatto senza alcuna sezione percepibile (lo stesso
problema già risolto altrove per `/dashboard/profilo`, "Verbale
Cognitivo" F5.2, mai applicato qui). Spezzata in blocchi `Surface` con
titolo — "Profilo" (immagine solo cliente, nome/cognome/data di nascita),
"Contatti" (email/telefono), "Indirizzo predefinito" (invariato nel
contenuto/nota esplicativa), "Accesso e sicurezza" (password) — più una
sezione "Dati e account" distinta in fondo per esportazione dati/
cancellazione account (prima appese come semplice riga di link sotto il
form principale): ogni azione ora ha una riga propria con una breve
descrizione, l'eliminazione mantiene lo stesso avviso/conferma a doppio
passaggio invariato. Nessuna logica toccata (stessi handler/validazioni),
solo la resa visiva.

**Voce di menu "Le mie richieste" anche per i professionisti** — richiesta
esplicita dell'utente ("nel profilo professionista rendi visibile il menu
'le mie richieste'"): `getAccountMenuItems` (`accountMenuItems.ts`) non
la includeva per un professionista, pur non essendoci alcun blocco
lato backend (`GuidedRequestsService.create` non ha alcun controllo di
ruolo) — un professionista può già avere bisogno di un altro servizio
(un idraulico che cerca un elettricista, ecc.), mancava solo il
collegamento nel menu. Aggiunta tra "Agenda" e "Impostazioni
dell'account".

**Pillole filtro `/dashboard/richieste` ridotte + badge non più tagliato
in alto** — segnalato dall'utente ("diminuisci un po la dimensione...
poichè non ben visibili che sforano la parte superiore"): le pillole
"Tutte"/"Da quotare"/ecc. (§41) erano grandi (padding 14, font 17) e il
pallino di conteggio (`top={-6}`) veniva tagliato dal contenitore
scorrevole (`CategoryCarousel`, `overflow-x:auto` che forza implicitamente
anche `overflow-y` a `auto`, clippando qualunque contenuto sporga sopra
il bordo). Corretto riducendo pillole (padding 9, font 13.5) e pallino
(18px invece di 24px, `top={-5}`), più `paddingTop: 8` sulla riga
scorrevole di `CategoryCarousel.tsx` (il padding resta dentro l'area non
clippata, a differenza del contenuto che sporge oltre) — corregge lo
stesso identico problema per qualunque altro consumatore futuro del
componente, non solo questa pagina.

**"Elimina richiesta" → conferma spostata sotto il pulsante hamburger,
testo aggiornato** — richiesta esplicita dell'utente, poi precisata
("non modificare il pulsante successivo altrimenti si crea una
incomprensione del tasto da premere"): in `/le-mie-richieste`
(`GuidedRequestCard`), il popup di conferma a due passaggi (§67) era in
fondo alla card, lontano dal menu hamburger che lo apriva — spostato a
comparire **subito sotto il pulsante hamburger stesso**, come un vero
menu a due stati (elenco → conferma, stesso dropdown, mai un secondo
popup separato): stato locale `isDeleteMenuOpen` sostituisce il generico
`ActionsMenu` per questo solo caso (serviva un "secondo passo" di
contenuto che il componente condiviso non esponeva — `ActionsMenu` resta
invariato e in uso per "Annulla prenotazione", CLAUDE.md §65). Voce del
menu rinominata da "Elimina richiesta" a "Annulla richiesta" (coerente
con la semantica reale, §14: `GuidedRequestsService.remove` è già un
soft-close, non una cancellazione fisica) — **il pulsante di conferma
successivo resta invariato** ("Conferma"/"Annulla", mai rinominato:
l'utente ha esplicitamente chiesto di non farlo, per non creare
ambiguità su quale pulsante premere). Il vecchio blocco di conferma in
fondo alla card è stato rimosso, resta solo "Modifica"/"Non
modificabile".

Verificato end-to-end con l'API locale reale (non solo typecheck/build) e
due agenti Playwright dedicati (desktop 1280px + mobile 390px, sia contro
un primo build sia — dopo aver scoperto e corretto l'overflow — contro un
secondo build pulito, compreso un riavvio completo del server di
produzione per escludere artefatti di build/processo residui): campanella
visibile a sinistra del nome, dropdown con cronologia e testo
`notificationCopy`, click che naviga a `/dashboard?tab=richieste`;
`/account` con tutte e 5 le sezioni; voce "Le mie richieste" visibile e
funzionante nel menu di un professionista, nessun muro di login; pillole
filtro più piccole con badge non più tagliato; menu hamburger "Annulla
richiesta" con conferma "Eliminare questa richiesta?"/"Conferma"/
"Annulla" ancorata subito sotto il pulsante. Zero overflow orizzontale
mobile (0px su tre pagine, dopo il fix), zero errori console reali (un
errore di idratazione React osservato in un primo giro di verifica è
stato isolato e ricondotto a un riavvio incompleto del server di
produzione tra una build e l'altra — non riprodotto su un server appena
ricompilato e riavviato pulito, né in `next dev`). Typecheck pulito su
tutti i package (`shared`, `database`, `api-client`, `ui`, `api`, `web`,
`mobile`), build di produzione `apps/web` verde (31 route, nessuna
nuova).

---

## 72. Campanella: apertura a sinistra, eliminazione notifiche, deep-link alla richiesta specifica, "Elimina tutte"; ricerca spostata nella barra fissa; homepage recensioni a carosello + riordino; risultati mobile: riga Filtri+Mappa, popup "Ordinato per pertinenza"; mappa desktop davvero sticky

Sei richieste esplicite dell'utente, stesso giro di lavoro (arrivate in più
messaggi consecutivi mentre le precedenti erano ancora in corso).

**Campanella (`NotificationBell.tsx`) — apertura a sinistra + eliminazione
per singola notifica**: *"il pulsante delle notifiche falle aprire a
sinistra poiché aprendole a destra sforerà lo schermo e dai la possibilità
di eliminare quelle notifiche da quel menù sia tramite slide sulla
notifica che con un piccolo pulsante in alto a destra per ogni
notifica"*. La campanella siede vicino al bordo destro dell'header — un
dropdown ancorato a sinistra (`left={0}`, come nel giro precedente §71) si
estendeva verso destra e usciva dal viewport. Corretto ancorandolo a
destra (`right={0}`): il pannello si estende ora verso sinistra dal
bottone, restando sempre dentro lo schermo.
- **Backend**: nuovo `NotificationsService.delete(userId, notificationId)`
  (verifica di proprietà, `ForbiddenException`/`NotFoundException` — stesso
  pattern già in uso per `ProfessionalsService.deleteLead`/
  `BookingsService.deleteForClient`) + `DELETE /notifications/:id`.
  Nessuna doppia conferma (a differenza della maggior parte delle azioni
  distruttive nel prodotto): una notifica è un record di stato di lettura
  effimero, non un dato di business da proteggere.
- **`apiClient.deleteNotification`** (nuovo). `NotificationBell.tsx`:
  ogni riga (`NotificationRow`, nuovo componente interno) è ora eliminabile
  in due modi, entrambi richiesti esplicitamente:
  - **Pulsante "x"** in alto a destra della riga (`position:"absolute"`,
    `stopPropagation` per non aprire anche la notifica).
  - **Swipe orizzontale**: gli handler touch (`onTouchStart`/`onTouchMove`/
    `onTouchEnd`) vivono su un `<div>` grezzo che avvolge la riga — stesso
    principio già documentato altrove in questo file (§11, agenda: "gli
    eventi touch nativi restano più affidabili su un nodo DOM diretto
    piuttosto che passati attraverso il layer react-native-web di
    Tamagui") — non su un componente Tamagui direttamente. Soglia
    `SWIPE_DELETE_THRESHOLD_PX = 70`, dominanza dell'asse orizzontale
    (`|dx| > 10 && |dx| > |dy|×1.5`, stessa formula già in uso in
    `CalendarShell.tsx`), feedback visivo di trascinamento
    (`transform: translateX(...)`) durante il gesto, mai
    `preventDefault` (lo scroll verticale della lista resta intatto).
    **Verificato con eventi touch a livello CDP** (`Input.dispatchTouchEvent`
    via `page.context().newCDPSession(page)`), non con `dispatchEvent`
    JS grezzo: un primo tentativo con `new TouchEvent(...)` +
    `element.dispatchEvent(...)` non attivava gli handler React (eventi
    non "trusted", verificato che arrivassero comunque a un listener
    nativo su `document` ma non al gestore React delegato) — bug noto di
    fedeltà degli eventi sintetici in ambienti headless, non un difetto
    del componente: con `Input.dispatchTouchEvent` (eventi realmente
    "trusted", stessa pipeline usata da un tocco reale) lo swipe ha
    eliminato correttamente la notifica sia in UI sia sul server.

**"Elimina tutte le notifiche in un colpo"** — richiesta esplicita
dell'utente, arrivata subito dopo la precedente. Nuovo
`NotificationsService.deleteAll(userId)` (`deleteMany`) +
`DELETE /notifications` (rotta radice, distinta da `DELETE
/notifications/:id` per forma del path, nessuna ambiguità di routing) +
`apiClient.deleteAllNotifications`. Link testuale "Elimina tutte" nell'
intestazione del dropdown, visibile solo quando la cronologia ha almeno
una voce.

**Click su una notifica (toast o campanella) porta alla richiesta
specifica in "Richieste ricevute", non alla `/dashboard` generica** —
richiesta esplicita dell'utente: *"quando clicchi sulle notifiche che sia
quella popup o quella del pulsante della campanella deve portare alla
richiesta specifica in richieste ricevute non in dashboard"*. Prima
entrambi i punti di click (`ToastStack`/`NotificationBell`) usavano
`notificationDestination(type)` → `${page}?tab=${tab}` (generico,
`/dashboard?tab=richieste`). Nuova funzione
`notificationDeepLink(type, payload)` (`notificationSections.ts`):
per le notifiche lato professionista (l'unica metà nominata
esplicitamente dall'utente, "richieste ricevute" contrapposto a
"dashboard") costruisce sempre `/dashboard/richieste?open=<guidedRequestId>`
(la pipeline completa, §41, dove `RequestCard` espande e scrolla alla
card giusta — stesso deep-link già usato da `/chat`, §47/§56/§60), non
più `/dashboard`. Lato cliente resta il comportamento generico
(`/le-mie-richieste?tab=...`, non toccato): il suo `?open=` naviga solo
tra le "Le mie richieste", non tra "Lavori accettati" — un deep-link lì
avrebbe rischiato di atterrare sul tab sbagliato per le notifiche di
lavoro, mentre `/dashboard/richieste` ospita già entrambe le sezioni nello
stesso posto.
- **Arricchimento payload lato backend**: alcuni tipi di notifica
  professionista portavano solo `bookingId` (mai `guidedRequestId`) —
  `JOB_COMPLETED`, `BOOKING_CANCELED_BY_PROFESSIONAL`,
  `BOOKING_NO_SHOW_REPORTED`, `BOOKING_REOPENED_BY_CLIENT`/
  `BY_PROFESSIONAL` — impossibile costruire il deep-link per questi senza
  un secondo giro di rete. Aggiunto `guidedRequestId:
  booking.quote?.guidedRequestId` a tutti e cinque i punti `notify(...)`
  in `bookings.service.ts` (`booking.quote` era già incluso nella query in
  ognuno di questi metodi, nessuna query aggiuntiva necessaria).
- **`ToastStack.tsx`**: il toast (`NotificationToast`, `AuthContext.tsx`)
  ora porta anche `payload` (già disponibile in `UnreadNotification` al
  momento della creazione del toast, prima solo scartato) —
  `openNotification(type, payload)` usa `notificationDeepLink`.

**Ricerca spostata nella barra fissa in alto (desktop), Servizi/Come
funziona/Prezzi nascosti** — richiesta esplicita dell'utente: *"una volta
effettuata la ricerca sposta le due stringhe di ricerca 'cosa cerchi' e
'città' con il tasto 'cerca' sopra sulla barra fissa in alto, nascondendo
i tasti 'servizi' 'come funziona' 'prezzi'"*.
- **`SearchBar.tsx`** (`packages/ui`) guadagna un `compact?: boolean`: resa
  condensata a riga singola (tab modalità solo icona 28×28, campi
  `size="$3"` a 150px fissi, bottone "Cerca" 36px) — stesso stato/logica
  di ricerca del componente esistente (`searchOnModeChange`), nessuna
  duplicazione.
- **`HeaderSearchBar.tsx`** (nuovo, `apps/web`): legge
  `usePathname()`/`useSearchParams()` per calcolare categoria (dal segmento
  URL `/cerca/[categoria]`), città (`?citta=`) e modalità (`?online=`) —
  stesso `handleSearch` (`buildSearchDestination` + `router.push` +
  `router.refresh()`) già in uso in `SearchHeader.tsx`. Una `key` sul
  `<SearchBar>` derivata da `pathname+city+online+query` forza il remount
  quando si naviga verso un'altra categoria: `SearchBar` tiene
  query/città/modalità in uno stato locale inizializzato solo al mount, e
  `HeaderSearchBar` è montato una sola volta nel layout globale (dentro
  `SiteHeader`) — senza la key sarebbe rimasto fermo ai valori della prima
  visita.
- **`SiteHeader.tsx`**: `usePathname()` calcola `isSearchResultsPage`
  (`/cerca` o `/cerca/[categoria]`). Solo in quel caso, da `$gtMd` in su, il
  gruppo "Servizi" (MegaMenu, trigger desktop + drawer mobile) +
  "Come funziona"/"Prezzi" è sostituito da
  `<Suspense fallback={null}><HeaderSearchBar /></Suspense>` (necessario:
  `useSearchParams` richiede un boundary Suspense, stesso gotcha già
  documentato più volte in questo file). Sotto `$gtMd` (mobile/tablet)
  MegaMenu resta invariato — cramire categoria+città+bottone in
  un'intestazione già stretta (bell+account menu, §71) avrebbe rischiato
  overflow, e il banner completo nel corpo pagina resta l'unico punto di
  ricerca lì.
- **`SearchHeader.tsx`** (il banner completo nel corpo di `/cerca`/
  `/cerca/[categoria]`): nascosto da `$gtMd` in su (`$gtMd={{display:
  "none"}}`) — "spostato", non duplicato: su desktop la ricerca vive ora
  solo nell'header fisso, su schermi stretti resta l'unico banner di
  ricerca (mode toggle incluso, invariato).
- Verificato con l'API locale reale e Playwright (17 controlli, tutti
  PASS): su `/` (non una pagina di ricerca) "Come funziona"/"Prezzi"/
  "Servizi" restano visibili in alto; su `/cerca/idraulico` (desktop)
  spariscono dall'header (il testo "Come funziona"/"Servizi" del footer,
  distinto per posizione Y, resta intatto — nessun secondo punto del sito
  toccato), il campo "Cosa cerchi?" condensato è precompilato con
  "Idraulico", digitare una città e cliccare "Cerca" naviga correttamente
  a `?citta=Milano`, il banner completo nel corpo non è più visibile;
  navigando via `goto` verso `/cerca/elettricista` il campo condensato si
  aggiorna da solo a "Elettricista" (conferma della `key` di remount); da
  mobile (390px) il banner completo resta visibile e il campo condensato
  nell'header è assente. Zero overflow orizzontale in tutti i casi.

**Homepage — "Recensioni verificate" a carosello in stile messaggio,
firma cliccabile verso il profilo, riordino sezioni** — richiesta
esplicita dell'utente: *"modifica 'recensioni verificate' in stile
carosello su un'unica riga e visualizzate stile messaggio quindi con uno
sfondo tipo messaggio per il testo scritto con scritto il nome di chi ha
scritto il commento stile firma in piccolo in basso a destra del
commento. e se si clicca sul nome del professionista deve portare alla
pagina del professionista e non alla recensione. poi sposta sempre in
homepage 'recensioni verificate' e 'nuovi profili' appena sotto le
categorie"*.
- **`RecentReviews.tsx`** riscritta: la griglia `flexWrap` di card intere
  cliccabili (introdotta in §49, ognuna un `<Link>` verso
  `#recensione-{id}`) diventa una riga a scorrimento orizzontale — riusa
  `CategoryCarousel.tsx` (stesso componente già in uso per le categorie e
  per "Nuovi profili", §49, invece di duplicare frecce/scroll). Ogni
  recensione è ora una "nuvoletta" di chat: sfondo pieno `brand.gesso`
  (mai bianco, per distinguersi dalla `Surface` bianca usata ovunque nel
  resto del sito), angoli arrotondati (`radiusDoc`), coda triangolare in
  basso a sinistra (bordo CSS, stesso principio "CSS puro per un dettaglio
  che Tamagui non rende bene" già seguito altrove nel prodotto). La firma
  ("— {businessName}") è l'**unico elemento cliccabile** della card
  (prima l'intera card lo era, verso l'ancora della recensione): un
  `next/link` verso `/professionista/{id}` **senza** `#recensione-{id}` —
  richiesta esplicita "e non alla recensione". Le stelle/badge
  "Lavoro confermato" restano sopra la nuvoletta, categoria+città sotto,
  invariati nel contenuto.
- **`HomeContent.tsx`**: `RecentReviews`/`NewProfilesCarousel` spostate
  subito dopo la sezione "Categorie" (prima erano più in basso, dopo
  "Come funziona"/`WhyWeExist`) — nessun'altra sezione toccata, solo
  l'ordine di montaggio delle due `FadeInSection`.
- Verificato con l'API locale reale (non solo lettura di codice) — script
  dedicato con un ciclo completo richiesta→preventivo→accettazione→
  completamento→conferma→doppia recensione per generare una recensione
  reale pubblica (`GET /reviews/recent`) — e Playwright: "Recensioni
  verificate" compare subito dopo "Categorie" (Y crescente,
  "Nuovi profili" ancora più sotto); il testo della recensione siede su
  uno sfondo colorato non trasparente (bolla confermata via
  `getComputedStyle`); il link firma esiste, non contiene `#`, e cliccarlo
  naviga a `/professionista/{id}` puro. Zero `pageerror`. Account di test
  ripuliti a fine verifica (`DELETE /auth/me`).

**Risultati di ricerca da mobile — "Filtri" e "Mappa" sulla stessa riga,
etichetta rinominata, "Ordinato per pertinenza" cliccabile** — richiesta
esplicita dell'utente: *"da cellulare, quando effettui una ricerca metti
sulla stessa riga prima il tasto 'filtri' e poi 'mostra mappa', modifica
la scritta da 'mostra mappa' a 'mappa', e rendi la scritta ordinato per
pertinenza cliccabile dove esce un popup che spiega"*.
- **`ResultsListWithMap.tsx`**: il bottone mappa (`mobileMapOpen`), prima
  una riga a sé stante `width:100%` renderizzata PRIMA della colonna
  mappa (fuori da `.results-list-col`), è stato spostato dentro la stessa
  `XStack` di "Filtri", subito dopo — entrambi condividono ora la classe
  `.filters-toggle` (base CSS cambiata da `width:100%` a `width:auto`,
  pillola compatta anche da mobile, non solo da `$gtMd` come prima) più
  `.mobile-map-toggle` sul bottone mappa (solo per `display:none` da
  desktop, invariato). Etichetta da chiuso rinominata "Mostra mappa" →
  "Mappa" (richiesta letterale); "Nascondi mappa" da aperto **non**
  toccato, non nominato dall'utente.
- **"Ordinato per pertinenza"** (Verbale Cognitivo F1.3, §70) passa da
  `<Text>` passivo a `<button className="sort-info-trigger">`: click apre
  un popup centrato (stesso pattern overlay `role="dialog"` già in uso per
  il pannello Filtri nello stesso file — chiusura su Escape o click sul
  backdrop) che spiega il criterio reale ("prima i professionisti in
  evidenza [boost pagato, sempre segnalato dal badge], poi valutazione,
  poi numero di recensioni — nessuno può comprare una posizione più alta
  della valutazione reale") — stesso ordinamento di sempre, solo reso
  comprensibile invece di restare un'etichetta muta.
- Verificato con l'API locale reale e Playwright, viewport `iPhone 13`:
  "Filtri" e "Mappa" sulla stessa riga (Y quasi identica), "Filtri" a
  sinistra di "Mappa"; vecchio testo "Mostra mappa" assente dal DOM; click
  su "Ordinato per pertinenza" apre il popup col testo atteso, Escape lo
  chiude; il bottone mappa resta funzionante (apre/chiude, cambia in
  "Nascondi mappa"); zero overflow orizzontale prima e dopo le
  interazioni.

**Mappa desktop davvero fissa durante lo scroll della lista** — richiesta
esplicita dell'utente: *"da desktop quando effettui una ricerca rendi
fissa la mappa sulla destra in modo che anche se scrollo fra i vari
profili, la mappa rimane sempre visibile sulla destra"*. La mappa aveva
già `position: sticky` (introdotto in una fase precedente del redesign,
mai rimosso) ma restava "incollata" solo per una manciata di pixel di
scroll prima di scomparire — bug reale, non solo percepito: `.results-layout`
usava `align-items: flex-start` nel layout a righe desktop, che fa
dimensionare ogni colonna flex sulla sola altezza del proprio contenuto.
`.results-map-col` (il contenitore/"blocco di scorrimento" dello sticky)
si dimensionava quindi sulla sola altezza della mappa stessa
(`calc(100vh - 140px)`, ~760px) invece che su quella, ben maggiore, della
colonna lista accanto (spesso 1500-2000px+ con molti risultati) — uno
sticky element ha margine di "aggancio" solo per la porzione di
contenitore che eccede la propria altezza: con contenitore ≈ altezza
propria, quel margine era quasi zero, e la mappa si staccava/scompariva
dopo pochissimo scroll. Corretto cambiando `align-items` da `flex-start` a
`stretch` (il default flessibile per l'asse trasversale, mai impostato
esplicitamente prima): `.results-map-col` si allunga ora fino all'altezza
di `.results-list-col` (le due colonne diventano pari), dando allo sticky
tutto lo spazio verticale necessario per restare visibilmente agganciato
per l'intera durata dello scroll attraverso i risultati — si stacca solo,
correttamente, una volta superata la fine reale della lista (comportamento
CSS `position:sticky` intrinseco e atteso, coerente col riferimento
miodottore.it citato altrove in questo file per lo stesso componente: più
risultati ci sono, più a lungo la mappa resta agganciata).
Verificato con l'API locale reale e Playwright (non solo lettura di
codice): `.results-map-col` e `.results-list-col` hanno ora la stessa
altezza (`getBoundingClientRect().height` identica, confermato); scrollando
progressivamente (400/800/1200px) la mappa resta esattamente al proprio
`top: 24px` finché il contenitore lo consente, poi si stacca in modo
prevedibile e proporzionale solo in prossimità della fine della lista —
comportamento riprodotto e confermato coerente con la matematica di CSS
sticky (non un bug residuo). Zero overflow orizzontale introdotto dal
cambio.

Verificato in blocco per l'intero giro: typecheck pulito su tutti i
package (`shared`, `database`, `api-client`, `ui`, `api`, `web`, `mobile`),
build di produzione `apps/web` verde (31 route, nessuna nuova). Sessione
locale end-to-end (Postgres+API+web) riavviata da zero a metà lavoro
(container riciclato per limite di sessione, working tree sopravvissuto)
— tutti i test end-to-end sopra rieseguiti con successo sull'ambiente
ripristinato.

---

## 73. Bug reale: pannello della campanella notifiche ancora fuori schermo su mobile

Segnalato dall'utente dopo il giro precedente (§72, "aprendole a destra
sforerà lo schermo"): *"Ridimensiona meglio la finestra della campanella,
da mobile esce fuori lo schermo"* — il fix precedente (ancorare il
pannello a destra con `right={0}`) non bastava: restava comunque fuori
viewport su un telefono reale.

**Causa reale**: `right={0}` era relativo al contenitore posizionato
(`position:"relative"`) che avvolge **solo il pulsante campanella**
(36×36px) — non al vero bordo destro del viewport. La campanella non è
l'ultimo elemento dell'header: a destra c'è ancora `AccountMenu` (nome +
avatar, CLAUDE.md §71), quindi il bordo destro della campanella si trova
ben più a sinistra del bordo reale dello schermo. Un pannello largo 340px
che si estende a sinistra da quel punto (non dal vero bordo destro)
poteva quindi sforare abbondantemente il bordo **sinistro** dello schermo
su un telefono stretto — `maxWidth="90vw"` non risolveva nulla perché
vincola solo la larghezza del pannello, non la posizione del suo punto di
ancoraggio.

**Fix**: il pannello (`NotificationBell.tsx`) è ora avvolto in un `<div
className="notification-bell-panel">` grezzo invece che in una `YStack`
Tamagui con `position="absolute"`/`right={0}` — stesso principio "CSS
puro per un posizionamento che Tamagui/react-native-web non rende bene"
già seguito altrove nel prodotto (header sticky, `.admin-sidebar`,
`ToastStack`). La classe (`globals.css`) resta `position:absolute,
top:100%, right:0` (comportamento invariato da desktop, dove funziona
correttamente) ma sotto **480px** passa a `position:fixed` con `left:16px`
e `right:16px` entrambi impostati (mai un `width` esplicito in quel
ramo): il pannello si allarga sempre a piena larghezza del viewport meno
32px totali, ancorato al vero bordo dello schermo — indipendente da dove
si trova la campanella nell'header, corretto a prescindere da quanto è
largo `AccountMenu` accanto.

Verificato con l'API locale reale (non solo lettura di codice) e uno
script Playwright dedicato su **cinque larghezze mobile** (320/360/375/
390/430px, non solo 390px come nel giro precedente che aveva dato un
falso "zero overflow" — il bug esisteva comunque, il controllo precedente
non era abbastanza specifico): bounding box del pannello misurato ad ogni
larghezza — mai un pixel oltre il bordo sinistro o destro dello schermo
su nessuna delle cinque (es. a 320px: `x:16, width:288, right:304`, ben
dentro i 320px disponibili). Un residuo di 3px di overflow di pagina
osservato a 320px è stato isolato e confermato **non correlato**
(elemento vuoto di un carosello della homepage, legittimamente fuori
schermo dentro il proprio contenitore `overflow-x:auto`, stesso principio
già documentato altrove in questo file per `ProfessionalsShowcase`/
`CategoryCarousel` — non il pannello della campanella, verificato
esplicitamente `isPanel:false`/`isPanelChild:false`). Comportamento
desktop invariato (nessuna regressione: sopra 480px la regola CSS non si
applica, resta `position:absolute, right:0`). Typecheck pulito su
`apps/web`, build di produzione verde (31 route, nessuna nuova). Account
di test ripulito a fine verifica (`DELETE /auth/me`).

---

## 74. Homepage — foto del professionista nelle "Recensioni verificate"

Richiesta esplicita dell'utente: *"Nella homepage nelle recensioni
inserisci anche la foto del professionista a cui è stata fatta la
recensione"*. La riscrittura a carosello stile chat del §72 aveva perso
la foto del professionista che il §45 aveva già introdotto (allora in un
layout a due colonne, sostituito interamente dal nuovo design a
nuvolette) — la firma in fondo a ogni nuvoletta mostrava solo il nome
dell'attività, mai una foto.

`RecentReviews.tsx`: la firma ("— {businessName}", unico elemento
cliccabile della nuvoletta verso il profilo pubblico, mai verso la
recensione — invariato dal §72) ora affianca un `Avatar` (`packages/ui`,
24px, foto vera se `review.professional.imageUrl` è presente altrimenti
iniziali — stesso componente già in uso ovunque nel prodotto per questo
esatto principio, "foto vera o iniziali, mai un placeholder generico")
prima del testo, entrambi dentro lo stesso `next/link`. Nessuna modifica
al backend: `GET /reviews/recent` esponeva già `professional.imageUrl`
dal giro del §45, mai consumato dal componente riscritto in §72.

Verificato end-to-end con l'API locale reale (non solo lettura di
codice): ciclo completo richiesta diretta→preventivo→accettazione→
completamento→conferma→doppia recensione per un professionista di test,
`imageUrl` impostato direttamente via SQL (Cloudinary non configurato in
locale, stesso limite già documentato altrove in questo file) a
un'immagine reale — `GET /reviews/recent` conferma `imageUrl` esposto
correttamente. UI con Playwright: la firma nella nuvoletta contiene un
`<img>` 24×24 con lo `src` esatto della foto impostata, dentro lo stesso
link verso `/professionista/{id}` (nessuna regressione sul comportamento
"solo la firma è cliccabile, mai verso la recensione"). Account di test
ripuliti a fine verifica (`DELETE /auth/me`). Typecheck pulito su tutti i
package (`shared`, `api-client`, `ui`, `web`), build di produzione
`apps/web` verde (31 route, nessuna nuova).

---

## 75. `/dashboard/richieste` — richiudi scheda dal fondo, ricerca in ogni campo, filtri raggruppati in un pop-up + toggle esterno

Tre richieste esplicite dell'utente, stesso giro di lavoro.

**Freccetta per richiudere la scheda anche dal fondo** — richiesta
esplicita: *"dai la possibilità di richiudere la scheda aperta tramite
una freccette uguale a quella per aprirla, mettendola anche in fondo alla
scheda quando è aperta"*. Prima l'unico modo di richiudere una `RequestCard`
espansa era ricliccare l'intestazione in alto — scomodo su una scheda
lunga (voci preventivo, dettagli cliente, cronologia). Aggiunta una
seconda `<Icon name="chevron-up">` cliccabile (`onPress={onToggle}`,
stesso handler già in uso per l'intestazione, nessuna logica duplicata)
in fondo al corpo espanso della card, subito prima della sua chiusura.

**Ricerca in ogni campo della richiesta, non solo nome/indirizzo** —
richiesta esplicita: *"al posto di fare la ricerca solo nel nome e
indirizzo fai la ricerca in qualsiasi campo"*, mantenendo invariato il
filtro per tab già esistente (Tutte/Da quotare/ecc.). Nuovo helper
`leadSearchText(lead, stage, booking)` — stesso principio "concatena ogni
campo pertinente in una stringa minuscola" già stabilito in
`apps/web/src/app/dashboard/agenda/page.tsx` (`buildAgendaListItems`,
CLAUDE.md §49) — include: nome cliente, categoria, descrizione, città,
"consulenza online"/"a domicilio", "urgente" se pertinente, l'etichetta
italiana dello stato (`STAGE_STYLE[stage].label`, così cercare "accettate"
trova le richieste in quello stato), nota di rifiuto, nota privata del
professionista, note/voci del preventivo, e — quando disponibile (dopo
l'accettazione) — nome completo del destinatario, telefono, email,
indirizzo strutturato, descrizione/nota di annullamento della
prenotazione. Il filtro (`visibleLeads`) confronta ora
`leadSearchText(...).includes(q)` invece del solo controllo su
`clientName`/`city`.

**Filtri raggruppati in un pop-up "Filtri" + toggle esterno
domicilio/online** — richiesta esplicita: *"i filtri presenti...
raggruppale in un pulsante 'filtri', e aggiungi un toggle esternamente per
selezionare 'domicilio/online'"*. La vecchia barra inline (campo ricerca +
due `<select>` ordina/zona sempre visibili) è sostituita da:
- Un pulsante "Filtri" (icona `sliders-horizontal`, nuova voce nel
  registro icone condiviso `packages/ui/src/icons.tsx`/`icons.web.tsx` —
  `SlidersHorizontal` di lucide, stesso pattern di ogni altra icona
  registrata) con un conteggio tra parentesi (`filtersActiveCount`: ricerca
  non vuota + zona diversa da "tutte" + ordinamento diverso dal default,
  il toggle esterno non contribuisce) — apre un pop-up (stesso pattern
  overlay `role="dialog"` già in uso altrove nel prodotto) con ricerca,
  ordinamento e zona, più "Reimposta filtri" (visibile solo con almeno un
  filtro attivo) e un bottone "Mostra N richieste" che chiude il pop-up.
- Un toggle a pillola **esterno** al pop-up, sempre visibile (Tutte/A
  domicilio/Online), nuovo stato `serviceModeFilter` che filtra
  `guidedRequest.serviceMode` indipendentemente dagli altri filtri.

Verificato end-to-end con l'API locale reale (non solo typecheck/build) e
Playwright: due richieste dirette a un professionista di test (una "A
domicilio" con una parola unica nella descrizione, "ZIBALDONE", mai nel
nome/indirizzo — una "Online"). Ricerca di "ZIBALDONE" nel pop-up Filtri
→ badge "Filtri (1)" corretto, "Mostra 1 richiesta", solo la card
pertinente resta visibile (trovata tramite la descrizione, non
nome/città — conferma della ricerca su ogni campo); "Reimposta filtri" →
badge sparisce. Toggle esterno "Online" → solo la descrizione della
richiesta online resta visibile, quella "A domicilio" nascosta, e
viceversa con "A domicilio" selezionato — "Tutte" mostra di nuovo
entrambe. Freccetta di chiusura in fondo alla scheda espansa: presente
dopo l'apertura, la scheda si richiude correttamente al click (la
freccetta stessa sparisce insieme al corpo collassato). Zero overflow
orizzontale, zero errori console reali (l'unico osservato,
`ERR_TUNNEL_CONNECTION_FAILED`, è la stessa limitazione di rete
dell'ambiente di sviluppo già documentata altrove in questo file).
Typecheck pulito su tutti i package (`shared`, `api-client`, `ui`, `web`,
`mobile`), build di produzione `apps/web` verde (31 route, nessuna
nuova).

---

## 76. Campanella notifiche in stile "ultima generazione", registrazione senza campo Nome, /account riorganizzato, ricerca esterna al pop-up Filtri

Cinque richieste esplicite dell'utente, stesso giro di lavoro.

**Campanella notifiche ridisegnata** — richiesta esplicita: *"il campo
notifiche con la campanella e la finestra che si apre rendilo più
innovativo come i siti di ultima generazione"*. `NotificationBell.tsx`:
- Pannello a "vetro smerigliato" (`backdrop-filter: blur(14px)
  saturate(160%)` + sfondo bianco translucido `rgba(255,255,255,0.86)`,
  nuova classe `.notification-bell-panel-inner` in `globals.css` — stesso
  principio "CSS puro per un dettaglio che Tamagui non rende bene" già
  seguito altrove) invece del bianco pieno di prima, con un ingresso
  animato (scala+dissolvenza, `@keyframes notification-panel-in`) invece
  di comparire di scatto — angoli più morbidi (`radiusDocLg`, 32px) e ombra
  più profonda/diffusa.
- Anello pulsante (`@keyframes notification-ping`, stesso principio di un
  "ping" da notifica push moderna) attorno al pallino rosso quando ci sono
  notifiche non lette.
- Ogni riga (`NotificationRow`) mostra ora l'icona in un chip circolare
  colorato (tinta `cianografiaVelo` se non letta) invece del solo emoji
  isolato, più un accento verticale a sinistra sulle righe non lette
  (oltre allo sfondo tinto già esistente) — più riconoscibile a colpo
  d'occhio in una lista scorrevole.
- Intestazione del pannello con un piccolo chip icona accanto al titolo
  "Notifiche"; stato vuoto arricchito con un'icona campana + testo
  centrato invece del solo testo grigio isolato.
`prefers-reduced-motion` resta gestito dalla regola globale già esistente
in `globals.css` (le durate collassano a istantanee), nessun guard
aggiuntivo necessario per le nuove animazioni.

**Campo "Nome" rimosso dalla registrazione** — richiesta esplicita
dell'utente ("Quando si crea un account elimina la stringa 'nome'"),
chiarita con `AskUserQuestion` (tre punti del codice avevano quel testo,
con etichette leggermente diverse: `/registrati` aveva "Nome (opzionale)",
`InlineAuthGate` aveva "Nome" senza suffisso) — l'utente ha scelto di
**rimuovere del tutto il campo dalla registrazione**, non solo
l'etichetta. `registerSchema.name` era già opzionale a livello di schema
(nessuna migrazione/modifica backend necessaria): rimossi lo stato
`name`/`setName` e il `<Field>` corrispondente sia da
`apps/web/src/app/registrati/page.tsx` sia da
`apps/web/src/components/InlineAuthGate.tsx` (il gate di login inline
introdotto in CLAUDE.md §70/F2.2) — in entrambi i casi il payload inviato
a `registerSchema.safeParse`/`apiClient.register` non passa più `name`
(sempre `undefined` per un account appena creato), il nome resta
aggiungibile in un secondo momento da "Impostazioni dell'account". Sul
prelievo dati automatico da Google, seconda parte della stessa richiesta,
l'utente ha scelto di **non** aggiungere permessi extra: l'app continua a
prelevare solo nome/cognome/email/foto (già disponibili oggi dal login
base di Google) — telefono/data di nascita/indirizzo restano da inserire
manualmente, nessun nuovo scope OAuth richiesto (avrebbe comportato un
consenso Google aggiuntivo e un fallback comunque necessario, dato che
Google non garantisce quei dati anche col permesso).

**`/account` — password attuale→nuova→ripeti, Salva/Annulla in fondo alla
pagina** — due richieste esplicite dell'utente. (1) *"Quando si vuole
impostare una nuova password, fai inserire prima la vecchia password poi
la nuova e poi ripeti password"*: l'ordine "attuale→nuova" era già
corretto, mancava il terzo campo di conferma — aggiunto
`confirmNewPassword` (nuovo stato), validato in `handleChangePassword`
("Le password non coincidono." se non combacia, stesso pattern già in uso
in `/registrati`), azzerato insieme agli altri due campi sia al
salvataggio riuscito sia su "Annulla". (2) *"I pulsanti 'salva' e
'annulla' mettili in fondo la pagina"*: il blocco Salva/Annulla del form
principale (Profilo/Contatti/Indirizzo predefinito) è stato spostato dalla
posizione precedente — a metà pagina, prima delle sezioni "Accesso e
sicurezza"/"Dati e account" — alla fine della pagina, dopo `Zona
pericolosa`/"Dati e account". Password e cancellazione account
mantengono le proprie azioni indipendenti, non toccate da questo
spostamento.

**Ricerca esterna al pop-up "Filtri" in `/dashboard/richieste`** —
correzione immediata alla scelta di design del giro precedente (§75):
*"il campo di ricerca in richieste ricevute lascialo esternamente non
all'interno del pulsante filtri"*. Il campo di ricerca torna ad essere
sempre visibile sopra la riga "Filtri"/toggle domicilio-online (non più
dentro il pop-up) — `filtersActiveCount` ora conta solo ordinamento/zona
(la ricerca ha il proprio campo visibile, il testo digitato è già la sua
indicazione di stato), e "Reimposta filtri" nel pop-up resetta solo
ordinamento/zona, non la ricerca (che resta comunque sempre modificabile
direttamente dal campo esterno).

Verificato end-to-end con l'API locale reale (non solo typecheck/build) e
Playwright: registrazione client senza campo `name` riuscita (`POST
/auth/register` senza quella chiave, account creato correttamente);
`/registrati` e la relativa UI confermano zero occorrenze di "Nome"/"Nome
(opzionale)" nel form, Email resta il primo campo; popup "Ordinato per
pertinenza" verificato senza la frase sul badge "In evidenza"; pannello
notifiche aperto con `backdrop-filter: blur(14px) saturate(1.6)`,
`border-radius: 32px`, sfondo translucido confermati via
`getComputedStyle`, stato vuoto visibile; `/account` con i tre campi
password nell'ordine esatto "Password attuale"/"Nuova password (almeno 8
caratteri)"/"Ripeti la nuova password" (via `placeholder` di ciascun
input), bottone "Salva" del form principale confermato posizionato sotto
la sezione "Dati e account" (coordinata Y maggiore). Zero errori console
reali in tutti i flussi (l'unico osservato, `ERR_TUNNEL_CONNECTION_FAILED`,
è la stessa limitazione di rete dell'ambiente di sviluppo già documentata
altrove in questo file). Account di test ripuliti a fine verifica
(`DELETE /auth/me`). Typecheck pulito su tutti i package (`shared`,
`api-client`, `ui`, `api`, `web`, `mobile`), build di produzione
`apps/web` verde (31 route, nessuna nuova).

---

## 77. Profilo pubblico professionista migliorato + emoji campana rimossa dallo stato vuoto

Due richieste esplicite dell'utente, stesso giro di lavoro.

**Profilo pubblico — visualizzazione migliorata** — richiesta esplicita
("migliora la visualizzazione di un profilo pubblico di un
professionista"), affrontata come un pass di polish visivo mirato,
seguito da uno screenshot di verifica reale (non solo lettura di codice)
prima di decidere cosa correggere:
- **Scheda identità unificata** — nome/badge/rating/"ha completato N
  interventi"/condividi/segnala/sottotag/bio galleggiavano prima
  direttamente sullo sfondo pesca della pagina, senza alcun trattamento a
  card, mentre ogni sezione sotto (Prestazioni/Agenda/Recensioni) era già
  avvolta in una `Surface` — incoerenza mai risolta prima d'ora. Ora tutto
  il blocco identità è in un'unica `Surface`, coerente con il resto della
  pagina.
- **Bug reale corretto: lingue parlate mai mostrate** —
  `ProfessionalDetail.spokenLanguages` (già raccolto dal professionista in
  `/dashboard/profilo`, già usato dal pannello filtri di ricerca, CLAUDE.md
  §23) non veniva mai renderizzato sul profilo pubblico. Aggiunta una riga
  "Parla Italiano, Inglese, ..." (icona `message-circle`) nella scheda
  identità.
- **Icone nei titoli di sezione** (`Prestazioni`/`Lavori svolti`/`Agenda`/
  `Recensioni`) — stessa tinta `cianografia` dei link/CTA del sito, per
  dare un po' di ritmo visivo a una pagina che prima era solo testo
  in grassetto uno via l'altro.
- **Recensioni — segnalatore di fiducia + data relativa** — ogni card
  recensione mostra ora "✓ Lavoro confermato" (stessa etichetta/icona
  `badge-check` già usata per le recensioni in homepage, `RecentReviews.tsx`,
  CLAUDE.md §49 — qui era assente, ora coerente su entrambe le superfici:
  il vincolo di prodotto — solo da prenotazione confermata — è invariato,
  mancava solo di dichiararlo) più la data relativa (nuovo helper
  `reviewTimeAgo`, granularità a giorni — "oggi"/"ieri"/"N giorni fa"/"N
  mesi fa"/mese+anno oltre l'anno — usa `review.createdAt`, già esposto dal
  tipo ma mai mostrato).
- `maxWidth` della pagina aumentato da 780 a 860px per un filo più di
  respiro, nessuna ristrutturazione a due colonne (valutata ma scartata
  per il rischio/tempo di verifica su un file da 660+ righe con molta
  logica di stato — agenda con offset di finestra, tab modalità — non
  toccata in questo giro).

**Icona campana rimossa dallo stato vuoto della campanella notifiche** —
segnalazione immediata dell'utente dopo aver visto il redesign del giro
precedente (§76): l'emoji 🔔 nello stato "Nessuna notifica per ora."
rendeva colorata/"vecchio stile" (resa gialla dal font emoji del sistema,
in contrasto con la palette Vicinato del resto del pannello). Sostituita
con la stessa icona lineare `bell-ring` già in uso nell'header del
pannello, in un chip circolare neutro (`brand.gesso`) — coerente con il
registro icone del resto del sito, nessun colore fuori palette.

Verificato end-to-end con l'API locale reale (non solo lettura di codice)
e Playwright: professionista di test con bio/sottotag/3 lingue parlate/4
prestazioni/2 recensioni reali (ciclo completo richiesta→preventivo→
accettazione→completamento→conferma→doppia recensione) — screenshot
desktop (1280px) e mobile (`devices["iPhone 13"]`) confermano la scheda
identità come unico blocco card, "Parla Italiano, Inglese, Rumeno"
visibile, icone sui quattro titoli di sezione, "✓ Lavoro confermato ·
oggi" su entrambe le recensioni. Un overflow orizzontale di 20px osservato
su mobile è stato isolato: proviene dal bottone "Richiedi un preventivo a
{nome lunghissimo di test}" (nome di test scelto apposta lungo,
"Ferrari Idraulica Showcase"), un elemento non toccato da questo giro —
stesso tipo di artefatto da nome di test già documentato più volte in
questo file (es. CLAUDE.md §12/§21), non una regressione introdotta qui.
Bell: emoji assente dal DOM dopo la correzione, stato vuoto ancora
funzionante e leggibile. Zero errori console reali in entrambi i flussi.
Account di test ripuliti a fine verifica (`DELETE /auth/me`). Typecheck
pulito su tutti i package (`shared`, `api-client`, `ui`, `web`), build di
produzione `apps/web` verde (31 route, nessuna nuova).

---

## 78. Indirizzo/telefono sempre visibili in "Lavori accettati" (dashboard compatta) + icone sul toggle domicilio/online in "Richieste ricevute"

Due richieste esplicite dell'utente, stesso giro.

**Indirizzo e telefono nel riepilogo compatto di `/dashboard`** — l'utente ha
segnalato: "una volta confermato il preventivo, lascia sempre
visualizzabili l'indirizzo e numero di telefono, ad esempio anche nelle
richieste completate (ora non si vede)". Verificato prima con un ciclo
end-to-end reale (richiesta→preventivo→accettazione→completamento) che
`/dashboard/richieste` (la pipeline completa, §41) già mostra
correttamente indirizzo/telefono/email per una richiesta `COMPLETATA` —
nessun cancello per stadio su quei campi, solo sulla presenza di una
`Booking` (screenshot confermato). Chiesto quindi all'utente dove
esattamente mancassero: **"in lavori completati"** — il riepilogo
compatto "Lavori accettati" di `/dashboard` (`BookingSummaryRow`,
introdotto in §56 per deduplicare la card completa già presente su
`/dashboard/richieste`), che non mostrava alcun dato di contatto, solo
nome/categoria/data/stato, con un click-through verso la pipeline per i
dettagli.
- `BookingSummaryRow` (`apps/web/src/app/dashboard/page.tsx`): nuova riga
  con icona `map-pin`/`phone` (indirizzo — `formatBookingAddress(booking)`
  con lo stesso fallback a `booking.address` già in uso in `RequestCard`
  — e `booking.recipientPhone ?? booking.clientPhone`), mostrata solo se
  almeno uno dei due è presente. Testo semplice, non un link `tel:`/Google
  Maps (quelli restano un click di distanza su `/dashboard/richieste`,
  dove il resto dei contatti — WhatsApp/Chiama/email — vive già): qui
  serve solo *visibilità* immediata, non un secondo set di azioni
  duplicate nel riepilogo compatto.
- Verificato end-to-end con l'API locale reale (non solo lettura di
  codice): stesso ciclo di test (richiesta diretta → preventivo →
  accettazione → completamento) → riga "Via Test 12 12 — 40100 Bologna
  (BO)" + "3331234567" visibile subito sotto data/ora/stato nel riepilogo
  "Lavori accettati" di `/dashboard`, desktop e mobile (390px, zero
  overflow orizzontale in entrambi i casi). Account di test ripuliti a
  fine verifica (`DELETE /auth/me`).

**Icone sul toggle "Tutte/A domicilio/Online" in `/dashboard/richieste`**
— richiesta esplicita dell'utente: "nel filtro a domicilio/online
inserisci le icone relative come quelle presenti nelle richieste". Le
pillole del toggle (introdotto in §75) avevano solo testo; `ServiceBadge`
(usato sulle singole card per la stessa distinzione) usa già le icone
`house`/`video` — aggiunte identiche alle due pillole "A domicilio"/
"Online" del toggle (nessuna icona sulla pillola "Tutte", che non
rappresenta una modalità specifica), colore bianco quando la pillola è
attiva. Verificato con Playwright: icone presenti e visibili su entrambe
le pillole.

Typecheck pulito su tutti i package (`shared`, `api-client`, `ui`,
`web`), build di produzione `apps/web` verde (31 route, nessuna nuova).

---

## 79. Pagina `/registrati` più "innovativa", campanella notifiche con scroll+evidenzia, occhio password in /account, elenco lingue selezionabile in /dashboard/profilo, testo capienza agenda rimosso

Sei richieste esplicite dell'utente, stesso giro di lavoro.

**`/registrati` resa più "innovativa"** — richiesta esplicita dell'utente
("rendi più innovativa questa pagina"), stesso principio già seguito per
`NotificationBell.tsx` (CLAUDE.md §76: vetro smerigliato, ingresso animato)
ma qui applicato a una pagina intera, non un pannello. Nuovo
`AuthPageBackground` (condiviso da `RoleChoiceScreen`/`RegistratiForm`): due
forme sfumate decorative (`brand.cianografia`/`brand.ottone`, `filter:
blur`) in un contenitore assoluto con `overflow:hidden` dedicato — mai
sull'intera colonna scrollabile, stesso bug già documentato altrove in
questo file (§20) evitato fin dalla prima stesura. Contenuto avvolto in
`<Surface floating>` (radius `radiusDocLg`, ombra soffice già esistente
per le superfici "flottanti", CLAUDE.md §19) con ingresso animato
(`.auth-card-in`, scala+dissolvenza) invece di comparire di scatto. Nuovo
`AuthIconBadge` (cerchio a gradiente cianografia→cianografiaScuro,
icona `sparkles`/`search`/`hard-hat` a seconda del contesto) in cima ad
ogni card. Le due card di scelta ruolo guadagnano un lieve sollevamento
solo all'hover (`.auth-role-card`, transform+ombra — mai un default,
coerente con "nessuna ombra di default" del resto del sito). Nuovo
indicatore di percorso ("Passo 1 di 2"/"Passo 2 di 2") al posto delle
eyebrow generiche precedenti — informazione reale sul flusso, non solo
decorazione. Nuove `TrustChips` (due pillole "I tuoi dati sono
protetti"/"Gratis, nessuna carta richiesta") sotto il bottone "Registrati".
Nessuna logica toccata (stessi handler `handleRegister`/
`handleGoogleCredential`/`chooseRole`), solo la resa visiva.

**Campanella notifiche — click che scrolla ed evidenzia l'esatto
aggiornamento** — richiesta esplicita dell'utente: "quando clicco su una
notifica dal pulsante della campanella, non deve solo portarmi alla
pagina esatta ma anche all'altezza di dove è presente quella determinata
variazione, magari evidenziandola leggermente per qualche secondo con
transizione della luce". Il deep-link professionista (`/dashboard/richieste
?open=<guidedRequestId>`) già scrollava alla card giusta (CLAUDE.md §47);
il lato cliente (`notificationDeepLink`) invece cambiava solo tab
(`?tab=richieste|lavori`), senza mai portare a un elemento preciso.
- **`notificationDeepLink`** (`notificationSections.ts`): ora aggiunge
  `&open=<guidedRequestId>` anche ai destinatari cliente (il
  `guidedRequestId` è già presente nel payload di ogni tipo di notifica
  cliente pertinente — arricchito lato backend in un giro precedente per
  gli eventi "lavori", JOB_COMPLETED/BOOKING_CANCELED_BY_PROFESSIONAL/
  BOOKING_REOPENED_BY_PROFESSIONAL, verificato con una ricerca su
  `bookings.service.ts`).
- **`/le-mie-richieste`**: l'effetto deep-link esistente (tab "richieste")
  ora ignora `?open=` quando `tab=lavori` è esplicito in URL (altrimenti i
  due effetti competerebbero: un `guidedRequestId` di una prenotazione è
  sempre anche l'id di una richiesta valida, essendo la stessa entità di
  origine). Nuovo secondo effetto per la tab "Lavori accettati": trova la
  `Booking` con `guidedRequestId` corrispondente, seleziona la tab,
  azzera il filtro se necessario, calcola la pagina corretta e scrolla —
  stesso pattern esatto del primo effetto. Nuovo `id={`booking-${booking.id}`}`
  sul wrapper di ogni `BookingRow` (mancava, a differenza di
  `GuidedRequestCard`, che già aveva `id={`request-${request.id}`}`).
- **Evidenziazione** — nuovo `apps/web/src/lib/deepLinkHighlight.ts`
  (`highlightDeepLinkTarget(elementId)`): manipola `classList` del nodo
  DOM direttamente (nessuno stato React per elemento), aggiunge
  `.deep-link-highlight` (nuova classe, `globals.css` — dissolvenza di
  sfondo+bagliore verde smeraldo via `@keyframes`, 2,5s, mai un
  bordo/riquadro fisso) e la rimuove dopo 2,6s. Richiamata dopo ogni
  `scrollIntoView` sui tre punti di deep-link (`/dashboard/richieste`,
  `/le-mie-richieste` tab "richieste" e tab "lavori" — quest'ultima nuova).
  Un `void el.offsetWidth` forza un reflow prima di riaggiungere la
  classe: senza, un secondo click sullo stesso elemento entro la finestra
  di evidenziazione non farebbe ripartire l'animazione CSS (la classe
  sarebbe già presente). Beneficio automatico anche per il click sui
  popup "toast" (CLAUDE.md §72, stessa `notificationDeepLink`, stesso
  `router.push`): nessuna modifica necessaria a `ToastStack.tsx`.

**Occhio mostra/nascondi su tutti e tre i campi password in `/account`** —
richiesta esplicita dell'utente (l'ordine attuale→nuova→ripeti era già
corretto). I tre `<input type="password">` grezzi (mai `Field` di
`@professionisti/ui`, a differenza di `/registrati`/`/accedi`, che
avevano già l'occhio) non ne avevano uno. Nuovo `PasswordField` (locale al
file): wrapper `position:relative` con un `<button>` icona (`Eye`/`EyeOff`
di `lucide-react`, già importato direttamente nel file — web-only,
CLAUDE.md §10 Fase 2) che alterna `type="password"`/`type="text"`. Tre
nuovi stati (`showCurrentPassword`/`showNewPassword`/
`showConfirmNewPassword`), azzerati anche al click su "Annulla".

**Elenco lingue selezionabile in `/dashboard/profilo`, ordinato per uso
reale** — due richieste esplicite dell'utente sullo stesso campo: "mostra
già un elenco delle lingue e si deve selezionare una di quelle" + "fra i
primi 10 risultati non saranno in ordine alfabetico ma in ordine delle
più inserite già". Prima il campo era un semplice `<input>` libero (Invio
o "+ Aggiungi" per aggiungere qualunque testo).
- **Backend** — nuovo `ProfessionalsService.getLanguagePopularity()`
  (stesso pattern di `getServicePriceIndex`, CLAUDE.md §26: dato reale,
  mai un ordine inventato): scarica i soli `spokenLanguages` di ogni
  profilo non-demo/non-eliminato e conta le occorrenze in memoria (Prisma
  non aggrega elementi di un array lato query), ordina per conteggio
  discendente poi alfabetico. Nuovo `GET /professionals/languages/popular`
  (pubblico, nessun dato sensibile, stesso trattamento di
  `services/price-index` — prima di `:id` nell'ordine delle rotte) +
  `apiClient.getLanguagePopularity()`.
- **Frontend** — nuova costante `CANDIDATE_LANGUAGES` (~30 lingue reali,
  mercato italiano + principali lingue mondiali: solo l'elenco dei nomi,
  mai l'ordine, è statico). Il campo (ora "Cerca una lingua...") mostra un
  dropdown alla messa a fuoco (stesso pattern click-fuori/blur-ritardato
  già in uso in `Autocomplete.tsx`, qui reimplementato localmente per
  poter applicare un ordinamento diverso da quello fisso alfabetico del
  componente condiviso — non toccato, usato altrove per città/categorie):
  candidati = elenco curato + ogni lingua reale già in uso ma non presente
  lì (mai perdere un dato reale), filtrati per sottostringa se si digita,
  ordinati per conteggio reale (`languagePopularity`, scaricato una sola
  volta al mount) poi alfabetico, primi 10. Click su una voce aggiunge la
  lingua; l'input libero + "+ Aggiungi" restano come ripiego per una
  lingua rara non nell'elenco curato, comportamento invariato.

**Testo esplicativo capienza rimosso dal pop-up fascia agenda** — richiesta
esplicita dell'utente: "elimina questa dicitura: 'Numero massimo di
prenotazioni per ciascuna modalità. 1 = fascia esatta. Più di 1 = fascia
generica, sempre a richiesta di preventivo.'" — rimossa dal pop-up
`SlotEditorModal` (`/dashboard/agenda`), nessuna modifica alla logica
sottostante (i due campi capienza domicilio/online restano identici).

Verificato end-to-end con l'API locale reale (non solo typecheck/build) e
uno script Playwright dedicato (27/27 controlli PASS) più due script
mirati aggiuntivi: `/registrati` (entrambe le schermate, desktop+mobile,
zero overflow orizzontale, zero pageerror); `/account` (3 campi password
con occhio funzionante, verificato che il click passa `type="password"`
a `type="text"`); `/dashboard/profilo` (dropdown lingue verificato con
precisione — non un match generico sul testo "Inglese" già presente
altrove nella pagina come esempio, ma un elemento `role="button"`
cliccabile la cui selezione produce davvero un chip rimovibile
verificato via `aria-label="Rimuovi Rumeno"`; ordinamento per popolarità
reale confermato aggiungendo temporaneamente "Filippino" a 3 profili reali
via SQL — `GET /professionals/languages/popular` conferma `count: 3`, e
il dropdown per un quarto professionista mostra "Filippino" davanti a
ogni lingua alfabeticamente precedente con conteggio zero, poi ripristinato
allo stato originale); agenda (testo esplicativo assente dal DOM dopo
apertura del pop-up fascia). Campanella: creato un ciclo reale
richiesta→preventivo→accettazione→completamento tra un professionista e
un cliente di test (diretto al profilo specifico, evita la selezione dei
lead per rating) — click su NEW_LEAD (professionista) naviga a
`/dashboard/richieste?open=<id>`, scrolla alla card esatta e la evidenzia
(classe applicata subito, rimossa dopo ~2,6s, verificato con un'attesa di
3s); click su JOB_COMPLETED (cliente) naviga a `?tab=lavori&open=<id>`,
scrolla ed evidenzia la prenotazione esatta; click su NEW_QUOTE (cliente)
naviga a `?tab=richieste&open=<id>` sulla card corretta — nessuna
interferenza tra i due nuovi effetti. Zero errori console in tutti i
flussi. Account di test ripuliti a fine verifica (`DELETE /auth/me`).
Typecheck pulito su tutti i package (`shared`, `database`, `api-client`,
`ui`, `api`, `web`, `mobile`), build di produzione `apps/web` verde
(31 route, nessuna nuova).

---

## 80. Chat: graffetta con menu Fotocamera/Foto e video/File (documenti) + data intervento riposizionata in "Richieste ricevute"

Due richieste esplicite dell'utente, stesso giro.

**Allegati in chat — graffetta con tre opzioni, documenti inclusi** —
richiesta esplicita: "nelle chat, al posto del file più, metti il simbolo
di una graffetta per allegare, e fai selezionare: fotocamera, foto/video,
File. in modo che puo essere caricata anche la fattura o ricevuta"
(chiarito subito dopo: "intendevo il tasto +", il vecchio pulsante "+" di
`TimelineModal.tsx` già in uso ovunque nel prodotto per aprire la
cronologia condivisa cliente↔professionista — CLAUDE.md §21/§46/§47).

- **Tre input invece di uno**: `mediaInputRef` unico (accept
  "image/*,video/*", nessun `capture`, CLAUDE.md §12) sostituito da tre
  ref/`<input type="file">` nascosti — `cameraInputRef` (accept "image/*"
  `capture="environment"`, apre direttamente la fotocamera), `galleryInputRef`
  (stesso accept di prima, nessun `capture`, apre la libreria foto/video) e
  `documentInputRef` (accept ".pdf,.doc,.docx,.xls,.xlsx", nessun
  `capture`). Stesso `handleMediaChange` per tutti e tre, il backend
  convalida comunque il tipo reale caricato.
- **Menu a comparsa** (`isAttachMenuOpen`, stesso pattern click-to-open/
  chiusura-al-click-esterno già in uso per `ActionsMenu`/
  `ReportsSectionMenu`, qui aperto **verso l'alto** — `bottom="100%"` — dato
  che il composer vive in fondo al popup): click sulla graffetta (icona
  `paperclip`, già registrata nel set di icone condivise ma mai usata prima
  d'ora) rivela tre voci — Fotocamera/Foto o video/File — ciascuna apre il
  proprio input.
- **Backend — nuovo tipo di allegato oltre a immagine/video, solo per
  questo endpoint**: `POST /guided-requests/timeline-photos`
  (`apps/api/src/guided-requests/guided-requests.controller.ts`) accetta
  ora anche `ALLOWED_TIMELINE_DOCUMENT_MIME_TYPES` (PDF, Word, Excel — set
  chiuso, non un generico "qualunque file": nessuna richiesta di supportare
  eseguibili o altro, solo "fattura o ricevuta") oltre a `image/*`/`video/*`
  — **non** esteso agli altri endpoint upload del prodotto (`photos`,
  `portfolio-photos`, ecc.), resta un'eccezione scoped alla sola chat.
- **`CloudinaryService.uploadMedia`**: terzo `resource_type` ("raw") per un
  file che non è né immagine né video — nessuna trasformazione (ridimensionare/
  comprimere un documento non ha senso). Estensione del file (`.pdf`,
  ecc.) ricavata da `file.originalname` (sempre presente su un Multer
  upload) e passata come opzione `format` a Cloudinary: senza, un upload
  "raw" via stream/buffer (nessun nome file trasmesso a Cloudinary di
  default) tornerebbe un URL senza estensione riconoscibile, e
  `isDocumentUrl` lato web (basato sull'estensione dell'URL, stesso
  principio già in uso per `isVideoUrl`) non lo riconoscerebbe mai come
  documento.
- **`apps/web/src/lib/media.ts`**: nuovi `isDocumentUrl`/`documentTypeLabel`
  (estensione dell'URL, stesso pattern di `isVideoUrl`).
  **`MediaPreview.tsx`**: nuovo ramo di rendering per un documento — icona
  `file-text` + etichetta estensione (es. "PDF") su sfondo neutro, invece di
  tentare (e fallire) un `<img>` su un URL non-immagine; nuova prop
  `forceDocument` (stesso principio di `forceVideo`, per un URL `blob:`
  locale prima dell'upload — non ancora usata da nessun chiamante in questo
  giro, aggiunta per coerenza dell'interfaccia).
- **Click su un documento nella chat**: un documento non è "ingrandibile"
  in `PhotoLightbox` (pensato per immagini/video) — `TimelineModal.
  openMediaAt` lo apre direttamente in una nuova scheda (`window.open`)
  invece di aprire il lightbox; le sole foto/video dello stesso evento
  restano navigabili nel lightbox (indice ricalcolato sul solo
  sottoinsieme visualizzabile, un documento nello stesso evento non entra
  mai nel carosello).

Verificato end-to-end con l'API locale reale (non solo typecheck/build) e
due script Playwright dedicati: upload diretto via `curl` conferma che un
PDF ora supera il filtro tipo-file dell'endpoint (arriva fino all'errore
"non è ancora configurato", stesso esito di un'immagine — prima sarebbe
stato rifiutato con "deve essere un'immagine o un video"), mentre un file
`.txt` resta correttamente rifiutato con il nuovo messaggio combinato. UI:
vecchio pulsante "+" assente, graffetta presente, le tre voci del menu
visibili e cliccabili, i tre input nascosti con `accept`/`capture` corretti
verificati via DOM; selezionare un PDF tramite "File" raggiunge davvero
l'endpoint reale (stesso errore "Cloudinary non configurato" già
documentato altrove in questo file per ogni altro upload in locale,
non un rifiuto di tipo). Con l'upload intercettato (`page.route`) per
simulare una risposta Cloudinary reale: l'anteprima nel composer e la
miniatura nel messaggio inviato mostrano entrambe la tessera "PDF" (non
un'icona di immagine rotta), click sulla tessera apre una nuova scheda del
browser (mai `PhotoLightbox`). Zero errori console reali. Account di test
ripuliti a fine verifica (`DELETE /auth/me`). Typecheck pulito su tutti i
package (`shared`, `api-client`, `ui`, `api`, `web`, `mobile`), build di
produzione `apps/web` verde (31 route, nessuna nuova).

**Data dell'intervento riposizionata in "Richieste ricevute"** — richiesta
esplicita dell'utente, con screenshot annotato (cerchi rossi sulla
posizione attuale, striscia rossa sulla posizione desiderata): in
`RequestCard` (`/dashboard/richieste`), la riga "Intervento:
{data}"/"Preventivo per: ..."/"Richiesta per: ..." (CLAUDE.md §66) viveva
in due punti — nell'anteprima non espansa, in fondo (subito sopra la
freccetta di apertura/chiusura), e dentro il riquadro "Dettagli cliente",
anch'essa in fondo (subito sopra il tasto Chat). Entrambe spostate subito
**sotto il nome** del proprio riquadro: nell'anteprima, subito dopo il
nome cliente (prima della riga categoria/città); dentro "Dettagli
cliente", subito dopo il nome cliccabile (prima di nome/cognome
destinatario, indirizzo, telefono, email). Nessuna logica toccata, solo
l'ordine di rendering dei blocchi già esistenti.

Verificato end-to-end con l'API locale reale (non solo lettura di codice)
e Playwright (bounding box dei blocchi confrontati in ordine y): nell'anteprima
non espansa, "Intervento: ..." risulta correttamente tra il nome cliente e
la riga categoria/città; dentro "Dettagli cliente", risulta subito dopo il
nome cliccabile e ben distante (non più adiacente) dal tasto Chat.
Screenshot di conferma. Typecheck pulito, build di produzione verde.

---

## 81. Agenda — caselle appuntamento colorate come le schede di "Richieste ricevute"

Richiesta esplicita dell'utente: *"in agenda colora le caselle degli
appuntamento in base ai colori che sono stati usati per le schede in
richieste ricevute"*. Il calendario "Prenotazioni" (`/dashboard/agenda`)
coloriva finora ogni `Booking` per `BookingStatus` (CLAUDE.md §11) sui soli
token `brand.*` — `PENDING` ottone, `CONFIRMED` verde, `COMPLETED` grigio,
`CANCELED`/`NO_SHOW` rosso — una palette diversa da quella, più ricca e
distintiva per stato, già usata per le pillole di `RequestStage` in
`/dashboard/richieste` (`STAGE_STYLE`, §41 "Rifinitura"/§61: eccezione
deliberata alla regola "solo token `brand.*`", colori arbitrari scelti
esplicitamente dall'utente per nome).

- **`REQUEST_STAGE_STYLE`** (nuovo export, `apps/web/src/lib/
  requestStage.ts` — prima ospitava solo `classifyLeadStage`/
  `describeClosedReason`): la palette a 8 voci, spostata qui da
  `dashboard/richieste/page.tsx` (che ora la importa con un alias locale
  `const STAGE_STYLE = REQUEST_STAGE_STYLE;`, zero altri riferimenti
  toccati nel file) — un'unica fonte di verità condivisa tra le due
  pagine, invece di duplicare gli stessi hex in due punti.
- **Mappatura da `BookingStatus` (unico dato disponibile su una
  `Booking` reale) al colore dello stadio con lo stesso significato
  pratico** — nessuno degli 8 `RequestStage` corrisponde 1:1 a un
  `BookingStatus`, serve un giudizio di equivalenza semantica:
  - `CONFIRMED` → `accettata` (verde `#28A745`) — un preventivo accettato
    non ancora concluso, stesso stadio "in corso" di `RequestStage`.
  - `COMPLETED` → `completata` (turchese `#20B2AA`) — stesso significato
    letterale.
  - `CANCELED` → `annullata` (rosso firebrick `#B22222`) — stesso
    significato letterale, stesso colore già usato in "richieste
    ricevute" per una prenotazione annullata dopo l'accettazione.
  - `PENDING` (prenotazione creata ma non ancora confermata dal
    professionista — solo dal flusso di prenotazione diretta da agenda
    pubblica, dormiente da CLAUDE.md §20, l'unico percorso che crea ancora
    questo stato) → `in_attesa` (giallo `#FFC107`) — nessuno stadio
    "prenotazione da confermare" esiste in `RequestStage` (lì "in attesa"
    significa "il preventivo aspetta una risposta del cliente"), ma
    condivide lo stesso significato astratto "in attesa di un'azione di
    qualcuno", il giallo resta il colore più coerente.
  - `NO_SHOW` → riusa lo stesso `annullata` (firebrick): non ha alcun
    analogo in `RequestStage` (che non distingue "annullato" da "cliente
    non presentato"), stesso principio "il lavoro non si è svolto" già
    condiviso con `CANCELED`.
- **`BookingDetailPanel.tsx`** (il pop-up aperto cliccando una casella):
  aveva una propria copia indipendente della stessa vecchia mappatura
  (`STATUS_COLOR`, usata per colorare l'etichetta di stato nel pannello,
  es. "Confermata" in verde) — allineata alla stessa `REQUEST_STAGE_STYLE`,
  stesso principio "un solo posto scrive i colori, chi li consuma importa".
- **Deliberatamente non toccati**: `EXTERNAL_JOB_STATUS_COLOR` (lavori
  esterni, bordo tratteggiato grafite/verde/rosso) e `PENDING_QUOTE_COLOR`
  (preventivi non ancora accettati, bordo tratteggiato ottone) — due
  categorie visivamente e semanticamente distinte dalle vere `Booking`
  (§45/§46, "per non confondere le tre categorie"), non sono "caselle
  degli appuntamento" nel senso letterale della richiesta ma promemoria di
  natura diversa già colorati apposta in modo differente (tratteggio, non
  solo colore) per restare riconoscibili a colpo d'occhio.
- Verificato end-to-end con l'API locale reale (non solo lettura di
  codice) e Playwright: professionista di test con 4 `Booking` seminate
  direttamente via SQL, una per stato (CONFIRMED/COMPLETED/CANCELED/
  PENDING) — vista Settimana: bordo sinistro delle tre caselle visibili
  (CONFIRMED/COMPLETED/CANCELED) misurato via `getComputedStyle` esatto
  su `rgb(40, 167, 69)`/`rgb(32, 178, 170)`/`rgb(178, 34, 34)`, coincidenti
  bit per bit con gli hex `#28A745`/`#20B2AA`/`#B22222` di
  `REQUEST_STAGE_STYLE`; click sulla casella CONFIRMED apre
  `BookingDetailPanel` con l'etichetta "Confermata" nello stesso identico
  verde. Vista Mese: i 4 pallini di conteggio giorno (incluso quello della
  prenotazione PENDING, in una settimana successiva) confermano tutti e 4
  i colori attesi, incluso il giallo `#FFC107` per PENDING. Zero errori
  console. Account di test ripuliti a fine verifica (`DELETE /auth/me`).
  Typecheck pulito su `apps/web`, build di produzione verde (31 route,
  nessuna nuova).

## 82. Bug reale: la mappa dei risultati si spostava durante lo scroll + ricerca centrata nell'header fisso

Due richieste esplicite dell'utente, stesso giro.

**Mappa risultati mai più in movimento** — segnalato dall'utente: "quando
effetto una ricerca, scorrendo verso il basso la mappa va leggermente in
basso, correggi facendo in modo che la mappa non si sposti per niente
anche scrollando fra i vari professionisti". Causa reale, riprodotta con
Playwright (misurando `getBoundingClientRect()` della mappa a più
posizioni di scroll, non solo ipotizzata): il fix precedente per la
stessa mappa (§72, "mappa desktop davvero sticky") usava `align-items:
stretch` su `.results-layout` per allungare `.results-map-col` fino
all'altezza di `.results-list-col`, dando allo `position: sticky` interno
lo spazio ("slack") necessario per restare davvero agganciato durante lo
scroll — funziona quando la lista è più alta della mappa (il caso
comune, molti risultati), ma **fallisce del tutto quando la lista è più
corta della mappa stessa** (es. 1-3 risultati, tutt'altro che raro nella
combinazione categoria+città più stretta): `align-items: stretch`
allunga OGNI colonna del layout all'altezza della PIÙ ALTA delle due, ma
se la mappa (che contiene solo sé stessa, `calc(100vh - 140px)` ≈ 760px)
è già la più alta, stretch non aggiunge nulla alla sua colonna — lo
sticky si ritrova con zero slack (altezza contenitore = altezza
elemento) e si comporta come un elemento normale, scorrendo via con la
pagina invece di restare fermo. Riprodotto empiricamente: su una
categoria+città con un solo risultato, la mappa scendeva da `top:96px` a
`top:-382px` scorrendo la pagina di 600px.

Corretto sostituendo `align-items: stretch` con una sincronizzazione
esplicita via JS (`ResizeObserver` su `.results-list-col`, nuovo
`useEffect` in `ResultsListWithMap.tsx`): l'altezza reale della colonna
mappa viene impostata a quella della colonna lista, **qualunque sia la
più alta delle due** — non più "il massimo dei due" di flexbox. Quando la
lista è più corta della mappa, la colonna mappa diventa esplicitamente
più bassa del proprio stesso contenuto (l'elemento sticky, con
`overflow` di default "visible", eccede visivamente il proprio
contenitore) — un contenitore sticky più basso dell'elemento sticky
stesso fa sì che lo sticky resti ancorato a `top: 24px` per l'intera
durata in cui quel contenitore (per quanto corto) è ancora nei paraggi
dello scroll, lo stesso comportamento di `position: fixed` in
quell'intervallo, senza alcuna logica di scroll manuale in JS — e poiché
la pagina non ha più un'altezza artificialmente gonfiata dalla sola
colonna mappa, in questo caso lo scroll stesso è quasi inesistente (la
mappa "non si sposta" perché letteralmente non c'è quasi nulla da
scorrere). Quando la lista è più alta (caso comune), il comportamento
resta identico a prima (sincronizzazione via JS invece che via CSS
stretch, stesso risultato: `mapColHeight === listColHeight`, ampio slack
per lo sticky). La custom property CSS `--map-col-height` (non
`style.height` diretto sull'elemento, che avrebbe una specificità più
alta di qualunque regola CSS e si applicherebbe anche da mobile) è
consumata **solo** dentro la media query desktop (`@media (min-width:
700px) { .results-map-col { height: var(--map-col-height, auto); } }`)
— da mobile (`.results-map-col.mobile-open`, fuori da quella media
query) il layout non viene toccato, la mappa resta fissa a 320px come
prima, verificato per evitare un vuoto enorme sotto la mappa quando la
lista è lunga.

Verificato con l'API locale reale (non solo lettura di codice) e
Playwright, seminando scenari reali sul DB: categoria+città con un solo
risultato (`idraulico`/Firenze) → `top` della mappa costante a 96px per
tutta la finestra di scroll testata (0→1500px, prima -382px a metà
corsa); stessa categoria senza filtro città (15 risultati, lista
~2457px) → sticky invariato, agganciato a `top:24px` per l'intera durata
testata, nessuna regressione. Bottone "Mappa" da mobile (viewport
390px): colonna mappa resta a 320px anche con una lista lunga (nessun
vuoto introdotto dalla sincronizzazione desktop). Bottone "Espandi
mappa" da desktop: la colonna si allarga correttamente e l'altezza resta
sincronizzata dopo l'espansione. Zero errori console nuovi.

**Ricerca centrata nella barra fissa in alto** — richiesta esplicita
dell'utente: "quando effettuo una ricerca, la barra di ricerca che si
sposta in sopra, posizionala centralmente" — riferito a
`HeaderSearchBar` (§72, la versione condensata della `SearchBar` che
prende il posto di "Servizi"/"Come funziona"/"Prezzi" nell'header fisso
quando si è su `/cerca`/`/cerca/[categoria]`), prima ancorata a sinistra
subito dopo il logo. `SiteHeader.tsx`: la riga header principale è ora
avvolta in un `<div style={{position:"relative", width:"100%"}}>`
(wrapper grezzo, stesso principio "CSS puro dove Tamagui non copre il
caso" già in uso per lo sticky dell'header stesso), e
`HeaderSearchBar` è stata spostata **fuori** dal gruppo sinistro (logo +
nav) in un secondo blocco posizionato `position:"absolute", left:"50%",
transform:"translateX(-50%)"` relativo a quel wrapper — centrato
orizzontalmente nell'intera barra, indipendentemente dalla larghezza
reale di logo/campanella/account-menu ai due lati (che restano diversi a
seconda che l'utente sia loggato o meno, quindi un centraggio "a
metà tra i due gruppi" via flexbox non sarebbe stato affidabile).
`pointerEvents:"none"` sul wrapper esterno evita di bloccare i click su
logo/account-menu quando il blocco centrato li sfiora a larghezze
borderline; `pointerEvents:"auto"` sulla `XStack` interna con la
`SearchBar` vera e propria ripristina la cliccabilità. Stessa soglia
`$gtMd` di prima per la visibilità (da mobile resta solo il banner
completo `SearchHeader.tsx` nel corpo pagina, invariato).

Verificato con Playwright (non solo lettura di codice): su
`/cerca/idraulico` a 1280px, il wrapper centrato risulta esattamente a
`centerX: 640` (il centro esatto del viewport), non si sovrappone né al
logo né al link "Accedi"/bottone CTA a destra; su `/` (non una pagina di
ricerca) il blocco centrato è del tutto assente dal DOM e
"Come funziona"/"Servizi" restano visibili come prima; da mobile (390px)
zero overflow orizzontale introdotto. Typecheck pulito su `apps/web`,
build di produzione verde (31 route, nessuna nuova).

## 83. Fotocamera desktop nella chat, download vero dei documenti allegati, indicatore di caricamento "pallini" ovunque, bug reale: deep-link dalle notifiche che "impallava" i filtri

Quattro richieste/segnalazioni esplicite dell'utente, stesso giro.

**Fotocamera vera anche da computer** — richiesta esplicita: "quando si
clicca fotocamera, devi aprire la fotocamera del telefono o del computer".
Il pulsante "Fotocamera" del menu allegati in chat (`TimelineModal.tsx`,
CLAUDE.md §80) già apriva la vera app fotocamera su un telefono
(`<input capture="environment">`, comportamento nativo del browser
mobile) ma su un computer quello stesso attributo non ha alcun effetto
garantito — nessun browser desktop apre un'app fotocamera di sistema
equivalente. Nuovo overlay `CameraCaptureOverlay` (stesso pattern DOM
grezzo `role="dialog"` già in uso ovunque nel prodotto): rilevato un
dispositivo non mobile (`/Mobi|Android|iPhone|iPad/i.test(navigator.
userAgent)` più `navigator.maxTouchPoints`), il click su "Fotocamera"
chiama `navigator.mediaDevices.getUserMedia({video:true})` invece di
aprire il selettore file — anteprima video live + bottone "Scatta foto"
che disegna il fotogramma corrente su un `<canvas>` offscreen, lo
converte in `Blob`/`File` (JPEG) e lo carica con la stessa pipeline di
upload già esistente (`uploadFile`, estratta da `handleMediaChange` per
essere riusata da entrambe le sorgenti). Permesso negato, nessuna webcam
o browser senza questa API → ripiego silenzioso sul selettore file
nativo, mai un vicolo cieco. Stream della webcam fermato esplicitamente
(`getTracks().forEach(t => t.stop())`) alla chiusura/cattura/unmount,
mai lasciata accesa in background.

**Bug reale scoperto durante la verifica: cliccare "Scatta foto"
richiudeva anche l'intera chat sottostante** — non ipotizzato, riprodotto
con Playwright (webcam finta via `--use-fake-device-for-media-stream`,
permesso concesso in automatico): il backdrop dell'overlay fotocamera
vive annidato dentro il `<div role="dialog" onClick={onClose}>` di
`TimelineModal` stesso, che chiude su **qualunque** click che gli arrivi
(non solo sul proprio sfondo — nessun controllo `target===currentTarget`
lì). Senza fermare la propagazione, ogni click dentro l'overlay
fotocamera (incluso il bottone "Scatta foto") risaliva fino al backdrop
di `TimelineModal` e lo chiudeva per intero. Corretto con
`e.stopPropagation()` incondizionato sul click del backdrop
dell'overlay fotocamera (non solo quando il target coincide col
backdrop, come nel resto del prodotto — qui serve anche per i click che
avvengono più in profondità, sui bottoni). Verificato: cattura foto ora
lascia `TimelineModal` aperto, errore di upload ("Cloudinary non
configurato", ambiente locale) visibile correttamente sotto — prima del
fix l'intero popup spariva senza errore, un fallimento silenzioso.

**"File" scaricabile davvero dal destinatario** — richiesta esplicita:
"quando clicca su file si deve dare la possibilità di mandare un file in
modo che l'altro successivamente possa scaricare quel file". Un
documento (PDF/Word/Excel) allegato in chat si apriva prima in una nuova
scheda del browser (`window.open`), che per un PDF lo mostra nel
visualizzatore integrato senza un vero salvataggio esplicito. Nuovo
`cloudinaryDownloadUrl` (`apps/web/src/lib/media.ts`): inserisce il flag
`fl_attachment` nell'URL di delivery Cloudinary (`Content-Disposition:
attachment` nella risposta) — il solo attributo HTML `download` su un
`<a>` non è garantito cross-origine (Cloudinary è un'origine diversa dal
sito, alcuni browser lo ignorano per URL esterni e navigano semplicemente
alla risorsa). `TimelineModal.openMediaAt`: per un documento, crea un
`<a href={cloudinaryDownloadUrl(url)} download>` al volo e lo clicca
programmaticamente invece di `window.open` — forza il download in ogni
browser.

**Indicatore di caricamento "a pallini" ovunque nel sito** — richiesta
esplicita: "quando si aggiunge un qualsiasi file in qualsiasi campo come
le foto/video sulla richiesta preventivo o in chat, quando si carica
qualcosa dai un segnale all'utente che stai caricando, ad esempio con
un'animazione dei pallini". Il solo "…" statico (o "Caricamento...") era
usato in 8 punti diversi del prodotto con un upload in corso —
sostituito ovunque da un nuovo componente condiviso
`apps/web/src/components/UploadingDots.tsx`: tre pallini che rimbalzano
in sequenza (`@keyframes uploading-dot-bounce`, `globals.css`,
`animation-delay` sfalsato per pallino), rispetta `prefers-reduced-
motion` tramite la regola globale già esistente in quel file. Applicato
al riquadro "+" delle gallerie foto/video (`GuidedRequestForm.tsx`,
`ReviewModal.tsx`, `CompleteJobModal.tsx`, `ClientCompleteModal.tsx`,
`le-mie-richieste/page.tsx`, portfolio in `dashboard/profilo/page.tsx`),
all'icona graffetta della chat (`TimelineModal.tsx`) e ai due bottoni
"Carica immagine"/"Cambia immagine" (`account/page.tsx`,
`dashboard/profilo/page.tsx`, dove sostituisce il testo "Caricamento...").

**Bug reale: cliccare una notifica poi cambiare un filtro "impallava" la
pagina** — segnalato dall'utente: "ho cliccato su una notifica (ricezione
di un preventivo lato cliente) dopodiché ho provato a cambiare i filtri
in le mie richieste, e ho visto il bug". Causa reale, riprodotta con
Playwright (non solo ipotizzata): il deep-link `?open=<id>` (CLAUDE.md
§79, apre/scrolla/evidenzia la card giusta arrivando da una notifica) non
veniva mai ripulito dall'URL dopo il primo utilizzo — e gli `useEffect`
che lo consumano hanno `requestsStatusFilter`/`requestsSort`/
`requestsPageSize` tra le proprie dipendenze (necessario per il loro
stesso flusso in due passaggi: azzerare il filtro a "Tutte" per non
nascondere la card target, aspettare il re-render, solo allora
calcolare pagina e scrollare). Senza un modo di sapere "questo target è
già stato raggiunto", **ogni** cambio di filtro/ordinamento/quantità
successivo da parte dell'utente riattivava l'intero effetto: azzerava di
nuovo il filtro appena scelto, ricalcolava la pagina e ri-scrollava/
ri-evidenziava la stessa card di prima, sovrascrivendo silenziosamente
ogni interazione dell'utente con un loop percepito come "la pagina
resta bloccata". Stesso identico bug trovato anche lato professionista
(`/dashboard/richieste`), lì ancora più subdolo: l'effetto dipende da
`leads`, il cui riferimento cambia ad ogni poll da 15s (§46/§47) — la
stessa forzatura scattava quindi periodicamente **da sola**, anche senza
alcuna interazione dell'utente.

Corretto in entrambi i file con un ref "già consumato" (stesso principio
già stabilito in `/dashboard/agenda`, `consumedBookingDeepLinkRef`,
CLAUDE.md §64): `consumedRequestOpenRef`/`consumedBookingOpenRef` (lato
cliente, `le-mie-richieste/page.tsx`) e `consumedRequestOpenRef` (lato
professionista, `dashboard/richieste/page.tsx`) memorizzano l'id
dell'ultimo target effettivamente raggiunto — un controllo in cima
all'effetto (`if (consumedRequestOpenRef.current === targetId) return;`)
lo rende un'azione compiuta una sola volta per ciascun deep-link, non
più un vincolo persistente che si riafferma ad ogni cambio di stato o
poll successivo. Il ref si aggiorna al valore del nuovo target solo
quando arriva un `?open=` diverso (es. click su una seconda notifica),
quindi un deep-link successivo funziona ancora normalmente.

Verificato end-to-end con l'API locale reale (non solo lettura di
codice) e Playwright: fotocamera desktop aperta con una webcam finta
(anteprima video attiva, `videoWidth > 0`), cattura riuscita senza più
chiudere il popup sottostante, errore di upload chiaro visibile
correttamente; deep-link verso una richiesta specifica in
`/le-mie-richieste` (scroll iniziale confermato, `scrollY: 300`), due
cambi successivi del filtro di stato confermati **senza** alcun
ri-scroll forzato (`scrollY` resta a 0 dopo ogni cambio, prima sarebbe
tornato a scattare verso la card). Zero errori console reali in tutti i
flussi. Typecheck pulito su `apps/web`, build di produzione verde
(31 route, nessuna nuova).

## 84. Correzione al fix §82: la mappa dei risultati si rimpiccioliva con pochi risultati

Segnalazione immediata dell'utente dopo aver visto il fix precedente in
produzione: "c'è un bug, quando ad esempio effettuando la ricerca c'è un
solo risultato, la mappa di lato si ridimensiona da sola, diventando più
piccola, correggi". Il fix del §82 (sincronizzare via JS l'altezza esatta
di `.results-map-col` a quella, eventualmente più corta, di
`.results-list-col`) risolveva davvero lo scorrimento della mappa ma
introduceva un secondo bug reale: con un solo risultato, l'area mappa
renderizzata si rimpiccioliva visibilmente invece di restare alla sua
dimensione normale (~760px, `calc(100vh - 140px)`).

**Causa: i due requisiti ("mai spostarsi durante lo scroll" e "mai
rimpicciolirsi") sono in tensione reale sotto `position: sticky` puro**,
non conciliabili contemporaneamente con un semplice "sincronizza
l'altezza del contenitore a quella della lista": lo slack di uno sticky è
sempre `altezza contenitore - altezza elemento` — l'unico modo di avere
margine di manovra (slack > 0) senza mai ridurre l'altezza della mappa è
dare al contenitore un'altezza **maggiore** di quella naturale della
mappa, mai minore o uguale (uguale = zero slack = comportamento
"normale", non sticky, esattamente il bug originale del §82).

**Fix**: tornato ad `align-items: stretch` su `.results-layout` (il
meccanismo originale pre-sessione, mai la causa del rimpicciolimento —
allunga sempre ENTRAMBE le colonne all'altezza della più alta delle due,
non riduce mai nulla), rimosso del tutto l'ResizeObserver/la custom
property `--map-col-height`. Aggiunto un margine minimo di sicurezza
puramente in CSS: `.results-map-col { min-height: calc(100vh - 140px +
280px); }` — sempre **almeno** ~280px di slack reale in più oltre
all'altezza naturale della mappa (mai `height` secca, solo `min-height`:
non riduce mai nulla sotto il contenuto naturale, cresce solo quando
serve). Per una lista più lunga della mappa (caso comune), il
comportamento resta identico a prima (stretch allunga già la colonna
mappa a un'altezza superiore a 760px, il margine minimo aggiunto non ha
alcun effetto essendo già superato). Nessuna soluzione CSS pura elimina
la deriva in modo matematicamente assoluto per un elenco arbitrariamente
corto (richiederebbe un margine infinito) — 280px è un compromesso
pragmatico, coerente con lo stesso pattern già visibile su siti di
riferimento come miodottore.it (pannello mappa con un'altezza minima
comoda indipendente dal numero di risultati, non un adattamento esatto).

Verificato con l'API locale reale (non solo lettura di codice) e
Playwright: categoria+città con un solo risultato (`idraulico`/Firenze) —
altezza renderizzata della mappa (`.results-map-sticky`) confermata
**costante a 760px su ogni posizione di scroll testata** (0→1500px,
mai una volta diversa — rimpicciolimento eliminato del tutto);
`mapColHeight: 1040` (= 760 + 280, il margine applicato correttamente);
la mappa resta agganciata (`top: 24`) per un tratto di scroll reale
(100→300px, contro lo zero assoluto di prima del fix del §82) prima di
staccarsi gradualmente fino a `top: -382` — range di scroll realmente
disponibile su quella pagina risultati misurato a soli 758px totali,
quindi la mappa resta effettivamente ferma per la quasi totalità dello
scroll utile. Screenshot di controllo a inizio e fine scroll: la mappa
mantiene sempre la sua dimensione piena, nessuna sovrapposizione né vuoto
anomalo prima del footer. Nessuna regressione sul caso lista lunga
(15 risultati, `top: 24` costante per l'intera finestra testata, come
già verificato nel §82), sul bottone "Mostra mappa"/"Mappa" da mobile
(colonna sempre 320px, invariata) né su "Espandi mappa" da desktop
(larghezza cresce correttamente, altezza resta sostanziale dopo
l'espansione). Zero errori console. Typecheck pulito su `apps/web`,
build di produzione verde (31 route, nessuna nuova).

## 85. Riepilogo compatto di `/dashboard` colorato come `/dashboard/richieste`

Richiesta esplicita dell'utente: "la dashboard del professionista rendila
più colorata e omogenea alle richieste ricevute, quindi rendile colorate
come le richieste ricevute, quindi sfondo bianco per ogni richiesta e il
colore in base allo stato della richiesta, e puoi colorare anche la
scritta dello stato della richiesta (completata, in attesa, ecc..)". Il
riepilogo compatto di `/dashboard` (`LeadSummaryRow`/`BookingSummaryRow`,
CLAUDE.md §43/§56) usava uno sfondo uniforme `brand.gesso` (pesca chiaro,
lo stesso sfondo della pagina) senza alcun accento cromatico legato allo
stato — a differenza della pipeline completa `/dashboard/richieste`, dove
ogni card ha già da tempo un bordo colorato per stadio
(`REQUEST_STAGE_STYLE`, CLAUDE.md §41/§61).

- **`bookingStageStyle`** (nuovo, `apps/web/src/lib/requestStage.ts`):
  mappa `ProfessionalBooking["status"]` allo stesso stile `{label, icon,
  fg, bg, border}` già usato per gli stadi di `ProfessionalLead` — stessa
  mappatura status→stadio già introdotta per colorare le caselle
  dell'agenda (§81, `BookingDetailPanel.tsx`/`dashboard/agenda/page.tsx`),
  qui centralizzata in un solo punto di verità invece di una terza copia
  duplicata degli stessi hex.
- **`LeadSummaryRow`**: sfondo passato da `brand.gesso` a `brand.calce`
  (bianco, il vero "bianco" del sito), bordo sinistro colorato
  (`borderLeftWidth={3} borderLeftColor={style.border}`, `style` da
  `REQUEST_STAGE_STYLE[classifyLeadStage(lead)]`) e la sola porzione di
  testo con lo stato (`leadSummaryLabel(lead)`, invariata come testo —
  solo il colore cambia) resa con `style.fg` in grassetto, separata dal
  resto della riga data/ora (che resta grigio neutro).
- **`BookingSummaryRow`**: stesso trattamento, `style` da
  `bookingStageStyle(booking.status)`.

Verificato end-to-end con l'API locale reale (non solo lettura di codice)
e Playwright: professionista di test con 3 richieste ricevute (due
"Scadute", bordo/testo rosso; una "Preventivo inviato", bordo/testo verde)
e 1 lavoro "Confermato" (bordo/testo verde) — screenshot di entrambe le
tab confermano sfondo bianco per ogni card, bordo sinistro colorato
coerente con lo stato, ed etichetta di stato nello stesso colore. Zero
errori console. Typecheck pulito su `apps/web`, build di produzione verde
(31 route, nessuna nuova).
