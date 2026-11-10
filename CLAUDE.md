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
- Serve un sistema di **notifiche/promemoria automatici** (push, email, WhatsApp)
  come feature core, non accessoria.

---

## 2. Stack tecnologico

Una riga per scelta. Il testo completo con i motivi, le date delle decisioni e
i dettagli (ex tabella di questa sezione, parola per parola) è in
**`docs/architettura/stack.md`**: leggerlo prima di toccare uno di questi
servizi. Le note tecniche per cartella stanno nei `CLAUDE.md` di `apps/web`,
`apps/api`, `apps/mobile`, `packages/ui`, `packages/shared` e
`packages/database`, che Claude Code carica da solo quando lavora lì.

| Livello | Scelta (file e variabili principali) |
|---|---|
| Web | **Next.js 16** (App Router, TypeScript, Turbopack), pagine SEO in SSR/SSG |
| App mobile | **Expo 58 / React Native 0.88**: si rifà solo a sito finito |
| UI condivisa | **Tamagui 3** in `packages/ui` (regole in `docs/architettura/interfaccia.md`) |
| Backend API | **NestJS 11** (Express 5), un solo backend per web e mobile |
| Database e ORM | **PostgreSQL** + PostGIS, **Prisma 6** (`packages/database`) |
| Ricerca avanzata (fase 2) | Meilisearch o Typesense, non ancora introdotto |
| Autenticazione | Email+password + Google Sign-In (OpenID Connect, finestra Google, nessuno script Google sul sito), JWT emesso da `apps/api` con bcrypt e `@nestjs/jwt`; niente Auth.js/Clerk né Apple |
| Pagamenti | **Stripe** (Subscriptions, Checkout, Connect Express) |
| Notifiche | Expo Push, **Resend** (email), **WhatsApp Meta Cloud API** (`apps/api/src/whatsapp/`, spento senza `WHATSAPP_ACCESS_TOKEN`); niente Twilio né SMS |
| Tempo reale | **Server-Sent Events** (`RealtimeService`, biglietto monouso `POST /realtime/ticket`), niente Socket.io/WebSocket |
| Anti-bot | **Cloudflare Turnstile** su registrazione, password dimenticata e contatti |
| Codice fiscale e P.IVA | VIES poi **Openapi** (`apps/api/src/tax-id-check/`, dietro `TaxIdProvider`) |
| Verifica identità | **Didit** (`apps/api/src/identity-verification/`, dietro `IdentityProvider`) |
| Fatture allo SdI | **Openapi** (`apps/api/src/accounting/sdi-provider.ts`), PDF con **pdfkit** |
| Code e attività a orario | Redis/BullMQ nominale; in pratica `@ScheduledJob` (`apps/api/src/common/scheduled-job.ts`) |
| Monorepo | **Turborepo** + **pnpm workspaces** |
| Errori, statistiche, uptime | **Sentry** (solo API), **Vercel Web Analytics**, `uptime.yml` + **UptimeRobot** |
| Hosting | Sito **Vercel** (`fra1`), API e Postgres **Render** Francoforte, mobile EAS |
| Mappa | **Google Maps** solo in `apps/web`, unico ingresso `GoogleMapGate` (consenso cookie, immagine fissa `GET /maps/static` senza consenso) |
| Dal problema ai mestieri | Dizionario `packages/shared/src/problemMatch.ts` + **Claude Haiku** nei dubbi (`apps/api/src/problem-match/`), OpenRouter fino al lancio |
| Agenda | **Open-Meteo**, **Google Routes API**, feed iCalendar (`apps/api/src/agenda/`) |
| Immagini | **Cloudinary** (`apps/api/src/cloudinary/`) |
| Indirizzi | **Google Places API (New)** e **Geocoding API** dal nostro server (`GOOGLE_MAPS_API_KEY`); mai bloccare il salvataggio del profilo |

Non introdurre framework o servizi alternativi a questa tabella senza
prima discuterne e aggiornare questo file (e `docs/architettura/stack.md`).

**Regole tecniche che valgono in tutto il monorepo** (dettaglio nei file citati):
- **Tamagui**: in `apps/web` e `apps/mobile` mai importare primitive da
  `"tamagui"`, sempre da `"@professionisti/ui"` (altrimenti `Can't find
  Tamagui configuration`). Regole complete in `docs/architettura/interfaccia.md`.
- **Migrazioni**: mai `prisma db push` in produzione, mai modificare una
  migrazione già unita, solo additive (`packages/database/CLAUDE.md`).
- `.npmrc` usa `node-linker=hoisted`: richiesto da Expo/Metro in monorepo
  pnpm (risolve problemi di risoluzione dei moduli nested). Non rimuoverlo.
- `packages/shared`, `packages/api-client` e `packages/database` hanno un build
  reale (tsc → `dist/`): l'API esegue `node dist/main.js`; `turbo dev` dipende
  da `^build`. Il sito invece usa i sorgenti di `packages/shared`.
- **Node.js**: una sola fonte, `.nvmrc` (oggi 24.22.1); `engines.node` è
  `24.x`; controllo giornaliero `.github/workflows/node.yml`. Il passaggio a una
  nuova versione principale si fa in un thread dedicato.
- **Dipendenze**: Dependabot una PR al mese con gli aggiornamenti piccoli;
  quelli grandi, React, React Native ed Expo si aggiornano a mano in un thread
  dedicato con il confronto delle pagine (`.github/workflows/aggiornamenti.yml`).
- Deploy su Render/Vercel, variabili d'ambiente, limiti del free tier e "il
  sito non si aggiorna" (build Vercel saltate di proposito o non innescate):
  skill `deploy-ops` (`.claude/skills/deploy-ops/SKILL.md`).
- **Sito privato finché il lancio non è ufficiale** (docs/CHANGELOG.md
  §132, richiesta esplicita dell'utente): `noindex` su tutto il sito (header
  `X-Robots-Tag` + meta robots), sitemap vuota, raggiungibile solo da chi
  ha il link. Si apre ai motori di ricerca solo con
  `NEXT_PUBLIC_SITE_INDEXABLE=true` su Vercel + nuovo deploy — non
  toglierlo prima del lancio ufficiale.

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

```
apps/web/            sito Next.js (src/app = pagine, src/components, src/lib, src/proxy.ts)
apps/api/            API NestJS, un modulo per dominio in src/ (auth, quotes, billing, ...)
apps/mobile/         app Expo (ferma finché il sito non è finito)
packages/shared/     tipi, schemi zod, costanti (categorie, piani, notifiche)
packages/ui/         design system Tamagui (varianti .web.tsx per il sito)
packages/database/   schema Prisma e migrazioni
packages/api-client/ client HTTP dell'API usato da web e mobile
packages/config/     configurazioni condivise
e2e/                 prove Playwright (tests/, lighthouse/, carta/)
scripts/             controlli usati dalla CI (versioni di Node, aggiornamenti, Vercel)
docs/                documentazione: indice in docs/README.md
.claude/skills/      skill del progetto (deploy-ops, checklist-lancio, ...)
```

Dove cercare: il "perché" di una scelta in `docs/architettura/stack.md` o
`docs/prodotto.md`; la storia di una funzione in `docs/indice-changelog.md`
(archivio §10-§403) o con `ls docs/changelog/` (voci dal 28/10/2026); lo stato
delle funzioni in `docs/STATO.md`; le operazioni in `docs/ops/`.

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
   segnale che va posta la domanda invece di cambiare il codice. Stessa
   regola in chat (decisione di Luca del 02/11/2026): prima
   dell'accettazione un messaggio con telefono, email, link o "WhatsApp" non
   parte, per nessuno dei due (controllo sul server,
   docs/changelog/2026-11-02-admin-protezioni.md).
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
    `pausedAt` e `requestsBlockedUntil`, e i dati fiscali compilati
    (`publicVisibilityWhere()`/`publicVisibilityMissing` in
    `apps/api/src/professional-fiscal/public-visibility.ts`, decisione
    dell'utente, docs/CHANGELOG.md §241: profilo pubblico con tipo e dati
    DAC7 compilati; la verifica KYC/KYB di Stripe serve solo per l'acconto
    online e il bollino "Pagamenti online", `stripeVerified`, prima "Identità verificata da Stripe"); in più un codice fiscale o una partita IVA che Openapi
    dice non validi tolgono il profilo dalla ricerca (§253).
12. **Ogni nuova rotta admin dichiara `@RequireAdminScope`**
    (`apps/api/src/admin/admin.guard.ts`): senza decoratore è aperta a
    qualunque admin.
13. **Notifiche**: ogni nuovo tipo va assegnato a un argomento in
    `packages/shared/src/notifications.ts` e ogni nuovo invio email
    controlla `notificationChannelEnabled`; "Account e sicurezza" non si
    spegne (DSA art. 17). **Su WhatsApp pochissimi messaggi e mai nulla
    di promozionale** (decisione di Luca, docs/changelog/2026-10-28-promemoria-whatsapp.md):
    un tipo nuovo in `WHATSAPP_MESSAGE_TYPES` vuol dire un modello da far
    approvare a Meta e un costo a ogni invio, va discusso prima con Luca.
14. **Il boost a pagamento non entra nello smistamento delle richieste**
    né nei risultati partiti dalla descrizione del problema (`merito=1`,
    docs/CHANGELOG.md §392) (decisioni dell'utente): non cambiarlo senza
    discuterne.
15. Le voci di menu dell'area account stanno solo in
    `apps/web/src/lib/accountMenuItems.ts`.
16. **Segnalazioni dei contenuti** (decisione dell'utente, DSA artt. 16-17,
    docs/CHANGELOG.md §319): chi segnala riceve solo la presa in carico e,
    per un contenuto illegale, l'esito in una riga, mai la motivazione né
    una pagina con le sue segnalazioni; chi è colpito riceve per email
    misura, legge o regola violata, motivazione e come contestare. Nessuna
    voce "Segnalazioni e decisioni" nel menu.
17. **Numeri e statistiche dal lancio** (decisione di Luca,
    docs/CHANGELOG.md §395): ogni nuovo numero di attività (richieste,
    ricerche, visite, preventivi) conta da `LAUNCH_DATE` (`sinceLaunch`/
    `daySinceLaunch` in `apps/api/src/site-counts/counted.ts`) e mai gli
    account di prova (`COUNTED_USER`, `User.testAccountAt`); nessun dato si
    cancella al lancio.
18. **Il sito resta un intermediario** (decisione di Luca del 03/11/2026,
    docs/changelog/2026-11-03-piattaforma-di-intermediazione.md): è una
    piattaforma di intermediazione online con gli strumenti per i
    professionisti inclusi nell'abbonamento, mai "software" da solo nei testi
    legali e nelle fatture. Il prezzo lo fa sempre il professionista, i
    lavori non si assegnano d'ufficio, non si dice come eseguirli e mai "i
    nostri professionisti" o "garantiamo il lavoro": altrimenti si rischia di
    diventare il fornitore del lavoro (Corte UE, Uber C-434/15) e una
    piattaforma di lavoro digitale (direttiva UE 2024/2831). Una funzione che
    va in quella direzione si discute prima con Luca. Le frasi le ferma
    `pnpm lint` (`apps/web/scripts/controlla-frasi-intermediario.mjs`).

---

## 6. Decisioni di prodotto

Testo completo (categorie, abbonamento, mesi gratis, pausa, lavori esauriti,
link personale, pagamento dei lavori, tetto online, documenti contabili,
pacchetti di visibilità) in **`docs/prodotto.md`**, parola per parola: leggerlo
prima di toccare abbonamenti, pagamenti, fatture o categorie. In breve:

- **Categorie**: fonte unica `packages/shared/src/categories.ts`
  (`PROFESSIONAL_CATEGORIES`), icone in
  `apps/web/src/components/icons/CategoryIcons.tsx`; da 1 a 3 per
  professionista; sincronizzate a ogni avvio da `CategoriesSeedService`.
- **Abbonamento unico a livelli** (`packages/shared/src/plans.ts`): tutte le
  funzioni per tutti, cambia solo il numero di lavori accettati per periodo.
  Base 19 € (3 lavori), Plus 59 € (10), Pro 99 € (senza limite), + IVA al
  mese; annuale = dieci mensilità. I lavori ripartono al rinnovo.
- **Mesi gratis** decisi dall'offerta in Admin (`SubscriptionOffer`, di
  partenza 3 mesi Base), dal `LAUNCH_DATE`, carta obbligatoria, poi Base
  mensile in automatico. Nessuna pausa senza Stripe attivo o prima del lancio.
- **Al limite** il profilo resta nella ricerca ma non manda preventivi nuovi
  (`jobLimitReachedAt`); passaggio di livello con `upgradeFeeEurCents`. I
  clienti dal link personale `/p/<codice>` non contano nei lavori.
- **Pagamento dei lavori**: diretto oppure online con Stripe (acconto e
  saldo sul conto del professionista, trattenuta unica 7% + IVA, tetto
  2.000 € per i nuovi, `packages/shared/src/onlineLimit.ts`).
- **Documenti**: fatture nostre `COM` (trattenute del mese) e `ABB`
  (abbonamento), mai nulla all'Agenzia delle Entrate per conto del
  professionista; per il lavoro occasionale solo un modello di ricevuta.

---

## 7. Strategia go-to-market

In `docs/prodotto.md` (§7): lancio concentrato con poche categorie ad alta
frequenza (idraulico, elettricista, pulizie, falegname), professionisti
reclutati uno per uno, retention dal gestionale e non dal boost, verticale
"urgenza", SEO locale (motivo per cui l'SSR non è negoziabile). Il sito è per
tutta Italia: città, testi ed esempi mai limitati a una sola città.

---

## 8. Funzionalità chiave per innovazione, utilità, semplicità d'uso

In `docs/prodotto.md` (§8): richiesta guidata invece della ricerca a scaffale,
preventivo strutturato in-app, recensioni solo da lavoro confermato,
onboarding per chi non è pratico di digitale, notifiche quasi istantanee, app
leggera e offline-friendly, dati comparativi in dashboard.

---

## 9. Stato del progetto

Una riga corta per voce; dettaglio completo (endpoint, file, bug corretti) in
`docs/STATO.md`, storia in `docs/CHANGELOG.md` (archivio fino alla §403) e in
`docs/changelog/` (voci dal 28/10/2026).

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
- [x] Promemoria anti no-show via email e WhatsApp Meta (spento finché Meta non verifica la società); niente SMS
- [x] Email con modello unico (`apps/api/src/email/templates/`, marchio in `email-brand.ts`), solo con Resend configurato
- [x] Abbonamenti Stripe e boost di visibilità (codice pronto, servono le chiavi reali: skill `checklist-lancio`)
- [x] Area account cliente, professionisti salvati, cancellazione account
- [x] Area professionista e cliente a sezioni (`AccountShell`), preferenze di notifica
- [x] Area admin: moderazione, ruoli, registro azioni, chat in sola lettura, bootstrap del primo admin, due passaggi obbligatori (§359)
- [x] Smistamento a tutti i professionisti nel raggio (§210); richieste generali spegnibili con `GENERAL_REQUESTS_ENABLED` (§211)
- [x] Segnalazioni di problemi sul lavoro e controversie (modello A-Z)
- [x] Pagamento online dei lavori con Stripe (serve Stripe Connect per andare live)
- [x] Fatture e documenti: `COM` e `ABB`, estratto mensile, fattura chiesta dal cliente, modello di ricevuta occasionale, PDF dal server, quadratura Stripe, SdI con `OPENAPI_TOKEN_SDI`
- [x] Profilo creato da un operatore al telefono (`/admin/professionisti` → link `/completa-profilo`; fuori dalla ricerca finché non è confermato, `invitePendingAt`)
- [x] Dal problema scritto ai professionisti adatti: dizionario + IA nei dubbi, avviso di sicurezza, admin "Mestieri richiesti" (§392-§393)
- [x] Verifica dei professionisti: CF e P.IVA con Openapi, documento + selfie Didit prima del primo preventivo, badge "Verificato" (§253-§255)

---


## 10. Storia dettagliata delle modifiche

La storia di ogni modifica (richiesta → decisione → motivo → verifica) non sta
qui, perché questo file si rilegge a ogni messaggio: l'archivio §10-§403 è in
**`docs/CHANGELOG.md`** (indice in `docs/indice-changelog.md`, da cercare con
Grep, mai da leggere per intero), le voci dal 28/10/2026 in `docs/changelog/`.
Leggerlo prima di ritoccare un'area con un bug già corretto in passato (es. i
pattern flex/wrap o gli scoping bug di `styled-jsx`) o per capire il perché di
una scelta non ovvia dal codice.

**Regola per le prossime modifiche**: una nuova voce di lavoro (bug fix,
nuova funzionalità, giro di correzioni) va scritta in un file suo in
`docs/changelog/` (`AAAA-MM-GG-argomento.md`, istruzioni in
`docs/changelog/README.md`), mai qui e mai più in fondo a
`docs/CHANGELOG.md` (archivio chiuso). Stesso formato di sempre (richiesta esplicita dell'utente,
decisione presa, motivo, verifica); nel codice si cita il file. `CLAUDE.md` si aggiorna solo quando cambia davvero un fatto vivo
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
il badge "Verificato" lo dà solo la verifica di documento e selfie con Didit
(§253-§255): prima del lancio va controllato il flusso Didit dal vivo
(checklist punto 15), perché la promessa "Profili verificati" resti vera.
