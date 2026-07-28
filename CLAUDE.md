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
| Hosting | Web → **Vercel** (`applicazione-web.vercel.app`); Mobile build → EAS (Expo); API/DB → **Railway** (deciso, deployato) | Scelta pragmatica per iterare velocemente in fase iniziale |
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
  testati sul sito reale): backend su `professionistiapi-production.up.railway.app`,
  Postgres su Railway (senza estensione PostGIS — vedi nota schema sotto),
  variabili impostate: `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`,
  `FRONTEND_URL`, `PORT=3001`. Due problemi risolti durante il primo
  deploy, entrambi corretti nel codice (non solo in configurazione, per
  non doverli rifare ad ogni nuovo ambiente):
  1. `app.listen(port)` senza host esplicito si lega solo a IPv6 su
     Railway → il proxy pubblico (IPv4) non raggiunge il processo pur
     essendo partito correttamente nei log ("Application failed to
     respond"). Fix: `app.listen(port, "0.0.0.0")` in `apps/api/src/main.ts`.
  2. Railway inietta un proprio `PORT` (es. 8080) diverso dalla porta
     dichiarata manualmente in "Generate Domain" durante il setup —
     serve impostare `PORT` esplicitamente nelle Variables coerente con
     quella porta, altrimenti il proxy pubblico punta a una porta su cui
     nessuno ascolta.
  Sul frontend Vercel vanno impostate anche `NEXT_PUBLIC_API_URL` (verso
  l'URL Railway) e `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (esisteva solo in
  `.env.local` locale, mai propagata a Vercel finché non serviva in
  produzione) — più l'origine `https://applicazione-web.vercel.app`
  aggiunta manualmente tra le "Authorized JavaScript origins" del Client
  ID OAuth su Google Cloud Console (altrimenti `Error 400: origin_mismatch`).
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
- [x] Agenda settimanale del professionista — nuovo modello Prisma `AvailabilitySlot` (fasce orarie ricorrenti: `dayOfWeek` + `startTime`/`endTime`, `dayOfWeek` segue la convenzione `Date.getUTCDay()` — 0=domenica...6=sabato — apposta per confrontare senza conversioni la disponibilità con `Booking.scheduledAt`). Editabile in `/dashboard/agenda` (nuova voce "Agenda" nel menu account professionista, `accountMenuItems.ts`): un editor per giorno della settimana (Lunedì...Domenica) con più fasce orarie aggiungibili/rimovibili, lista sostituita per intero ad ogni salvataggio (stesso pattern delle prestazioni). `GET /professionals/:id/agenda` proietta la disponibilità ricorrente sui prossimi 14 giorni di calendario e barra le fasce che coincidono con una prenotazione reale (`Booking` con status `PENDING`/`CONFIRMED`/`COMPLETED` il cui `scheduledAt` cade dentro quella fascia) — confronto su data/ora UTC dirette, nessuna libreria di timezone introdotta. Mostrata nel profilo pubblico (`ProfessionalDetailContent`, sezione "Agenda" tra Prestazioni e il bottone preventivo, visibile solo se il professionista ha impostato almeno una fascia): elenco giorno per giorno, pillola verde per le fasce libere, grigia con barrato per quelle prenotate. Prenotazione diretta opzionale: `ProfessionalProfile.bookableAgenda` (checkbox in `/dashboard/agenda`, "Permetti ai clienti di prenotare direttamente da questi orari" — default `false`, altrimenti l'agenda resta solo informativa come sopra). Se attiva, le fasce libere nel profilo pubblico diventano cliccabili per un cliente loggato: `POST /professionals/:id/agenda/book` rivalida tutto lato server (mai fidarsi del client) — 403 se `bookableAgenda` è spenta, 404 se la fascia non fa parte della disponibilità ricorrente del professionista, 409 se già prenotata — altrimenti crea direttamente un `Booking` (`PENDING`, nessuna `Quote`) e la fascia si aggiorna subito in UI.

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

Fasi successive (pagine interne restanti — dashboard, account,
autenticazione —, SEO/accessibilità/performance) non ancora iniziate. Riga
legale del footer da completare quando disponibili i dati societari reali
(vedi Fase 4).
