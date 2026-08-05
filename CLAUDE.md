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
