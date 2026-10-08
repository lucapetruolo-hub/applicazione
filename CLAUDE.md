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
| Push in tempo reale (chat, notifiche in-app) | **Server-Sent Events** (`@Sse()` di NestJS lato server, `EventSource` nativo del browser lato client) — non Socket.io né WebSocket grezzo | Un solo servizio Render (nessuno scaling orizzontale, l'argomento Socket.io/adapter Redis non si applica), l'invio passa già per REST (serve solo un push server→client, mai bidirezionale), zero dipendenze nuove (`EventSource` è nativo, nessuna libreria client), riconnessione automatica alla caduta della connessione (Render free tier va in sleep/si riavvia). Limite noto e accettato: `EventSource` non può impostare header custom, il JWT passa come query string (`?token=...`, rischio minore ma reale di finire in log/cronologia). Stato in memoria (`RealtimeService`, `Map<userId, Subject>`) esplicitamente scoped a singola istanza — se il progetto scalasse orizzontalmente, va sostituito con un pub/sub condiviso (es. Redis, già nello stack per BullMQ) solo internamente a quel servizio, l'interfaccia pubblica non cambia. Dettagli in `docs/CHANGELOG.md` §115. Il polling esistente resta come rete di sicurezza, solo allungato dove SSE copre ormai il caso comune |
| Anti-bot registrazione | **Cloudflare Turnstile** (`apps/web/src/components/TurnstileWidget.tsx`, `apps/api/src/auth/turnstile.ts`) | Deciso dall'utente il 06/10/2026, implementato in docs/CHANGELOG.md §199: sulla registrazione con email e password (`/registrati` e `InlineAuthGate`), su "Password dimenticata" e sul modulo `/contatti`; Google Sign-In escluso. Gratuito, senza cookie di profilazione (nessun consenso nel banner), citato nell'informativa privacy. Spento senza chiavi (`NEXT_PUBLIC_TURNSTILE_SITE_KEY` su Vercel, `TURNSTILE_SECRET_KEY` su Render). Se Cloudflare non risponde la registrazione passa (resta il limite di 5/min per IP). Nessun proxy/WAF Cloudflare davanti a Vercel |
| Code/cache | **Redis** (BullMQ) | Job asincroni: invio reminder, sync ranking di visibilità |
| Monorepo | **Turborepo** + **pnpm workspaces** | Build cache e task orchestration tra app/pacchetti condivisi |
| Error tracking e statistiche | **Sentry** (solo `apps/api`, `SENTRY_DSN`) + **Vercel Web Analytics** (`apps/web`, senza cookie) | Decisi con l'utente (consiglio CEO, docs/CHANGELOG.md §132): prima un 500, un cron fallito o un'email non inviata non li vedeva nessuno, e non esisteva nessuna misura delle visite. Piani gratuiti, nessuna carta. Uptime: `.github/workflows/uptime.yml` |
| Hosting | Web → **Vercel** (`applicazione-web.vercel.app`); Mobile build → EAS (Expo); API/DB → **Render** (deciso, deployato; in precedenza Railway, abbandonato per scadenza piano free) | Scelta pragmatica per iterare velocemente in fase iniziale |
| Mappa risultati ricerca | **Google Maps** (`@vis.gl/react-google-maps`, `apps/web` only, mai in `packages/ui`) | Decisione esplicita dell'utente prima del lancio (docs/CHANGELOG.md §133), che **ribalta** la scelta iniziale di Leaflet + OpenStreetMap (presa allora per non collegare una carta di pagamento a Google Cloud): mappa più familiare agli utenti e indirizzi trovati meglio. Unico ingresso: `GoogleMapGate` (`apps/web/src/components/GoogleMapGate.tsx`) — lo script Google si carica solo con `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` impostata **e** dopo il consenso ai servizi Google del banner cookie (stesso principio di Google Sign-In, consenso centralizzato in `apps/web/src/lib/cookieConsent.ts`); senza consenso un riquadro con "Mostra la mappa", senza chiave "Mappa non disponibile". Mappa dei risultati con **segnaposto avanzati** (`AdvancedMarker` con la foto/icona del professionista, scelti dall'utente dopo il confronto, docs/CHANGELOG.md §140): richiede un Map ID (`NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`, fallback `DEMO_MAP_ID` di prova). Mappa del raggio in dashboard con `Marker` classico (icona SVG del brand). API in versione `quarterly`. Gli errori interni di Google visti in §135-§137 erano causati dalla chiave senza Maps JavaScript API (§138), non dai marker avanzati. Se Google rifiuta la chiave (`gm_authFailure`) la mappa viene smontata e compare un messaggio con l'indirizzo del sito. Solo web: su mobile andrà valutato `react-native-maps`, non nello scope attuale |
| Storage immagini profilo | **Cloudinary** | Upload dell'immagine profilo dei professionisti (`apps/api/src/cloudinary/`). Deciso esplicitamente con l'utente al posto di Vercel Blob o di salvare il file nel database: piano gratuito senza carta di pagamento, CDN + resize automatico (800×800 max) incluso lato upload |
| Geocodifica indirizzo preciso | **Google Places Autocomplete (New)** nel browser + **Google Geocoding API** lato server | Nel profilo in dashboard, e nei campi "Via/piazza" del cliente (richiesta di preventivo, modifica richiesta, impostazioni account, dove la scelta compila anche civico/CAP/città/provincia), il campo indirizzo propone indirizzi reali mentre si scrive (`apps/web/src/components/AddressAutocompleteInput.tsx`, docs/CHANGELOG.md §141: solo vie/civici in Italia, favoriti quelli vicini alla città del profilo, stesso consenso cookie della mappa, senza consenso o chiave resta un campo di testo); scegliendo un suggerimento le coordinate esatte vengono inviate col salvataggio e il server non geocodifica. Per un indirizzo scritto a mano resta `apps/api/src/geocoding/geocoding.service.ts`, che geocodifica l'indirizzo preciso (opzionale) inserito dal professionista in `/dashboard/profilo` per posizionarlo esatto sulla mappa dei risultati, invece che al centro del comune. Sostituisce Nominatim (docs/CHANGELOG.md §133, stessa decisione della mappa). Chiave server `GOOGLE_MAPS_API_KEY` su Render, distinta da quella del browser. Usata solo al salvataggio del profilo (poche richieste al giorno), mai in un percorso di ricerca. Se la chiave manca, la geocodifica non trova nulla o Google non risponde entro 5s, si ricade silenziosamente sul centro del comune (dataset ISTAT) — non deve mai bloccare il salvataggio del profilo |

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
- Lo script `build` di `apps/api` compila prima `@professionisti/database` e
  `@professionisti/shared` (altrimenti TypeScript non trova quei moduli): non toglierlo.
- **Migrazioni DB**: mai `prisma db push` in produzione. Lo `start` di
  `apps/api` esegue `packages/database/scripts/migrate-deploy.mjs`
  (`prisma migrate deploy`, con baseline automatica solo sull'errore `P3005`).
  `20260921212750_baseline` deve restare lo schema realmente presente in
  produzione al passaggio (commit `034f1a5`), mai lo schema corrente: ogni
  modifica allo schema va in una nuova migrazione (`prisma migrate dev --name
  <nome>` in locale), **mai modificare una migrazione già committata**. Le
  categorie si sincronizzano a ogni avvio via `CategoriesSeedService`.
- L'API ascolta su `app.listen(port, "0.0.0.0")` e legge sempre
  `process.env.PORT` (fallback 3001): senza host esplicito il proxy IPv4 della
  piattaforma non la raggiunge; non hardcodare la porta.
- Deploy su Render/Vercel, variabili d'ambiente, limiti del free tier e "il
  sito non si aggiorna" (build Vercel saltate di proposito o non innescate):
  skill `deploy-ops` (`.claude/skills/deploy-ops/SKILL.md`).
- **Sito privato finché il lancio non è ufficiale** (docs/CHANGELOG.md
  §132, richiesta esplicita dell'utente): `noindex` su tutto il sito (header
  `X-Robots-Tag` + meta robots), sitemap vuota, raggiungibile solo da chi
  ha il link. Si apre ai motori di ricerca solo con
  `NEXT_PUBLIC_SITE_INDEXABLE=true` su Vercel + nuovo deploy — non
  toglierlo prima del lancio ufficiale.
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

## 3. Architettura (principi)

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
11. **Filtri obbligatori nei nuovi punti pubblici**: ogni punto che mostra
    profili o recensioni filtra `deletedAt`/`suspendedAt`/`hiddenAt`; ogni
    punto che mostra professionisti o assegna richieste filtra anche
    `pausedAt` e `requestsBlockedUntil`.
12. **Ogni nuova rotta admin dichiara `@RequireAdminScope`**
    (`apps/api/src/admin/admin.guard.ts`): senza decoratore è aperta a
    qualunque admin.
13. **Notifiche**: ogni nuovo tipo va assegnato a un argomento in
    `packages/shared/src/notifications.ts` e ogni nuovo invio email/SMS
    controlla `notificationChannelEnabled`; "Account e sicurezza" non si
    spegne (DSA art. 17).
14. **Il boost a pagamento non entra nello smistamento delle richieste**
    (decisione dell'utente): non cambiarlo senza discuterne.
15. Le voci di menu dell'area account stanno solo in
    `apps/web/src/lib/accountMenuItems.ts`.

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

### Monetizzazione professionista — abbonamento unico a livelli

**Decisione dell'utente del 28/09/2026 (docs/CHANGELOG.md §160), sostituisce
i piani Free/Pro/Business per funzioni** (implementata in §161:
`packages/shared/src/plans.ts`, `apps/api/src/subscriptions/`,
`/dashboard/abbonamento`): un solo abbonamento con **tutte
le funzionalità per tutti**, a livelli che si distinguono solo per il
numero di **lavori accettati** al mese (Booking creato quando il cliente
accetta il preventivo, mai i "completati", che segna il professionista).

| Livello | Prezzo indicativo | Lavori accettati al mese |
|---|---|---|
| **Base** | ~€19/mese | 5 |
| **Plus** | ~€39/mese | 15 |
| **Pro** | ~€69/mese | senza limite |

- **Primo mese gratis per tutti.**
- **Mese regalato a sorpresa:** a chi non ha avuto nessun preventivo
  accettato si regala un altro mese, comunicato solo in prossimità della
  scadenza del primo mese (gratis o pagato), non all'iscrizione.
- **Il mese gratuito vale come Base** (5 lavori). Sulla pagina prezzi Base
  mostra "€19" barrato e "Gratuito", con la condizione in piccolo ("il
  primo mese, poi €19/mese"): il mese gratis non si annuncia altrove.
- **Account in pausa** (`ProfessionalProfile.pausedAt`/`pausedReason`,
  docs/CHANGELOG.md §162): a fine mese gratuito senza livello, ad
  abbonamento concluso e ai lavori del mese esauriti il profilo esce dalla
  ricerca e dallo smistamento, non accetta richieste dirette né prenotazioni
  (resta visibile dal link); banner fisso in Home e in Abbonamento. Ogni
  nuovo punto che mostra professionisti o assegna richieste deve filtrare
  anche `pausedAt` e `invitePendingAt` (profilo creato da un operatore e
  non ancora confermato, docs/CHANGELOG.md §170). **Nessuna pausa finché
  i pagamenti non sono attivi** (`STRIPE_SECRET_KEY` assente) **e prima
  di `LAUNCH_DATE`**: senza Stripe nessuno potrebbe scegliere un livello e
  a fine prova la ricerca resterebbe vuota.
- **Il mese gratuito parte dal lancio** (`LAUNCH_DATE` su Render,
  AAAA-MM-GG, docs/CHANGELOG.md §170): chi si iscrive prima ha la prova
  fino a lancio + 30 giorni. Senza la variabile la prova parte
  dall'iscrizione.
- **Al limite:** si continua pagando solo la differenza verso il livello
  superiore (nel mese gratuito la differenza piena verso Base, con un
  abbonamento pagato la differenza per i giorni che mancano al rinnovo),
  altrimenti si riparte il 1° del mese.
- **Rinnovo automatico** mensile con avviso 3 giorni prima (sito + email);
  annullabile da `/dashboard/abbonamento`, resta attivo fino alla scadenza.
  Passare a un livello inferiore non è ancora previsto.
- Prezzi e limiti da rivedere sui dati dei primi mesi.
- Si incassa solo con P.IVA/società e parere del commercialista (checklist
  §10). **Pagamento dei lavori** (decisioni dell'utente, docs/CHANGELOG.md
  §168): accettando il preventivo il cliente sceglie **online con Stripe**
  (acconto del 20% del massimo, saldo a lavoro chiuso, soldi in custodia
  fino alla conferma o per 7 giorni, poi al professionista meno costo Stripe
  e commissione del 5%; assistenza e rimborso sulle segnalazioni accolte)
  oppure **diretto** (nessun rimborso né decisione nostra: le segnalazioni
  restano tra le parti, il cliente può comunque recensire). Il pagamento
  diretto non paga commissione.

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
   *Superato il 28/09/2026: l'utente ha scelto l'abbonamento unico a livelli
   con primo mese gratis (vedi §6), niente lead a pagamento.*
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

Una riga per voce; dettaglio completo (endpoint, file, bug corretti) in
`docs/STATO.md`, storia in `docs/CHANGELOG.md`.

- [x] Architettura e decisioni di prodotto approvate
- [x] Monorepo (Turborepo/pnpm), `apps/api`, `apps/web`, `apps/mobile`, design system `packages/ui`
- [x] Autenticazione email+password + Google Sign-In, JWT da `apps/api` (in produzione)
- [x] Ricerca per categoria/città (SSR, ranking boost→rating→recensioni; filtro per città, non ancora raggio PostGIS), comuni ISTAT con coordinate
- [x] Mappa risultati (Google Maps) responsive, autocomplete categorie/comuni, modalità "A domicilio"/"Online", pagina `/cerca`
- [x] Ricerca sempre aggiornata: `force-dynamic` + `cache: "no-store"`, niente ISR (un profilo eliminato non deve restare visibile)
- [x] Richiesta guidata + fan-out lead, richiesta urgente (`/urgente`), foto su Cloudinary
- [x] Preventivo strutturato a voci (`QuoteItem`) → l'accettazione crea la `Booking`
- [x] Recensioni solo da prenotazione `COMPLETED`, con foto
- [x] Dashboard professionista: profilo, immagine, prestazioni con range di prezzo, agenda settimanale con prenotazione diretta opzionale
- [x] Promemoria anti no-show via email (cron `@nestjs/schedule`, non BullMQ); SMS rimandato
- [x] Email del sito con modello unico (benvenuto, preventivi, lavori, pagamenti, recupero password): testi in `apps/api/src/email/templates/`, marchio in `email-brand.ts`; partono davvero solo con Resend configurato
- [x] Abbonamenti Stripe e boost di visibilità (codice pronto, servono le chiavi reali: skill `checklist-lancio`)
- [x] Area account cliente, professionisti salvati, cancellazione account
- [x] Area professionista e cliente a sezioni (`AccountShell`), preferenze di notifica
- [x] Area admin: moderazione segnalazioni, ruoli admin, registro azioni, chat in sola lettura, bootstrap del primo admin
- [x] Smistamento delle richieste (`apps/api/src/guided-requests/lead-routing.ts`)
- [x] Segnalazioni di problemi sul lavoro e controversie (modello A-Z)
- [x] Pagamento online dei lavori con Stripe (serve Stripe Connect per andare live)
- [x] Profilo creato da un operatore al telefono (`/admin/professionisti` → link `/completa-profilo`; fuori dalla ricerca finché non è confermato, `invitePendingAt`)

---


## 10. Storia dettagliata delle modifiche

Lo storico narrativo di ogni singola modifica fatta al prodotto (redesign
visivo, agenda, chat, MANOVIA, homepage, ecc. — quelle che qui erano le
sezioni §10-§113 fino a settembre 2026) è stato spostato in
**`docs/CHANGELOG.md`**, non cancellato: stesso contenuto, stessa
numerazione di sezione, stesso livello di dettaglio (richiesta → decisione →
motivo → verifica). La ragione del trasferimento è puramente di costo: questo
file (`CLAUDE.md`) viene reiniettato per intero a ogni turno di ogni
conversazione su questo progetto — con lo storico completo era arrivato a
~900KB, decine di migliaia di token spesi automaticamente anche per una
domanda banale. `docs/CHANGELOG.md` invece si legge solo su richiesta (Read o
Grep mirato), quando serve davvero.

**Quando leggerlo**: prima di ritoccare un'area con un bug già corretto in
passato (per non reintrodurlo — es. i pattern flex/wrap che si sono ripetuti
più volte, o gli scoping bug di `styled-jsx`), per capire il perché di una
scelta implementativa non ovvia dal solo codice, o per ricostruire il
contesto di una decisione di prodotto già presa. Non va letto per intero:
`Grep` sul numero di sezione (es. "## 88\.") o su parole chiave dell'area
d'interesse basta quasi sempre.

**Regola per le prossime modifiche**: una nuova voce di lavoro (bug fix,
nuova funzionalità, giro di correzioni) va scritta in `docs/CHANGELOG.md`,
mai qui — segui lo stesso formato già in uso lì (numero di sezione
progressivo, richiesta esplicita dell'utente, decisione presa, motivo,
verifica). `CLAUDE.md` si aggiorna solo quando cambia davvero un fatto vivo
delle sezioni 1-9 sopra: lo stack, l'architettura, una regola di sviluppo
vincolante, o lo stato di una funzionalità (`[x]`/`[ ]` in §9, dettaglio in
`docs/STATO.md`). La checklist pre-lancio si aggiorna nella skill
`checklist-lancio`. Se una voce del changelog introduce un principio da NON
invertire senza discuterne esplicitamente con l'utente (es. §5 punto 9, sulla
visibilità dei contatti cliente — invertita tre volte in passato prima che
esistesse questa regola), quel principio va comunque riportato in forma
sintetica in §5 qui sopra, non solo nel changelog.

### Checklist — da fare prima del lancio

Vive nella skill `checklist-lancio` (`.claude/skills/checklist-lancio/SKILL.md`):
aggiornala lì. Due punti da non dimenticare anche senza aprirla: il sito resta
`noindex` finché al lancio non si imposta `NEXT_PUBLIC_SITE_INDEXABLE=true`, e
il claim "Profili verificati" non corrisponde a nessuna verifica reale —
decisione dell'utente: non riformulare il testo, costruire davvero la
verifica prima del lancio (o correggerlo, ma mai lasciarlo falso dal vivo).
