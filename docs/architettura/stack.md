# Stack tecnologico: scelte e motivi (CLAUDE.md §2)

Testo spostato parola per parola da `CLAUDE.md` §2 il 10/11/2026
(docs/changelog/2026-11-10-riordino-file.md) per non rileggerlo a ogni
messaggio. Le citazioni "CLAUDE.md §N" nel codice restano valide: §N è la
sezione di `CLAUDE.md` che rimanda qui.

| Livello | Scelta | Perché |
|---|---|---|
| Web (desktop/mobile browser) | **Next.js 16** (App Router, TypeScript, Turbopack) | SSR/SSG per SEO su pagine categoria/professionista — critico per il ricavo da visibilità |
| App mobile (iOS + Android) | **Expo 58 / React Native 0.88** (TypeScript) | Un'unica codebase per iOS e Android, OTA update, accesso a push notification/fotocamera/geolocalizzazione native |
| UI condivisa web+mobile | **Tamagui 3** (o in alternativa NativeWind) | Stessi componenti/design tokens compilati sia per React Native che per web → "stessa interfaccia" richiesta, senza duplicare il design system |
| Backend API | **NestJS 11** (Node.js, TypeScript, Express 5) | Struttura modulare adatta a un dominio con tanti bounded context (utenti, prenotazioni, pagamenti, ricerca) |
| Database | **PostgreSQL** + **PostGIS** | Ricerca geografica (professionisti vicini) nativa in SQL; PostGIS evita di introdurre subito un motore di ricerca separato |
| ORM | **Prisma 6** | Type-safety end-to-end condivisa col resto del monorepo TS |
| Ricerca full-text avanzata (fase 2) | **Meilisearch** o **Typesense** | Da introdurre quando serve ranking sponsorizzato + filtri complessi oltre a ciò che Postgres gestisce bene |
| Autenticazione | **Email+password + Google Sign-In**, JWT emesso da `apps/api` | Login implementato direttamente in NestJS (bcrypt + `@nestjs/jwt`, niente Auth.js/Clerk): un solo backend emette la sessione per web e mobile. Google: pagina di accesso di Google in una finestra (OpenID Connect `id_token` + `nonce` firmato dal server e monouso, solo email verificate da Google, docs/changelog/2026-11-08-sicurezza-controllo-lancio.md; ritorno su `/accesso-google`), nessuno script Google sul sito e quindi nessun consenso cookie (docs/CHANGELOG.md §265). Niente Apple Sign-In (richiede Apple Developer Program a pagamento, non attivato) |
| Pagamenti | **Stripe** (Subscriptions + Checkout one-off) | Copre sia l'abbonamento SaaS ricorrente sia i pacchetti di visibilità one-shot |
| Notifiche | Expo Push, **Resend** (email), **WhatsApp con Meta diretto** (Cloud API, `apps/api/src/whatsapp/`) | Promemoria automatici anti no-show. Decisione di Luca del 28/10/2026 (docs/changelog/2026-10-28-promemoria-whatsapp.md): niente Twilio né SMS. Su WhatsApp solo promemoria del giorno prima (al cliente con i pulsanti "Ci sarò"/"Non posso più" e, con un acconto in gioco, 6 ore prima del preavviso; al professionista un solo riepilogo la sera, all'ora del riassunto della sera delle email, `notificationPrefs.digestHour`, 18-21 e di serie 19: una sola ora per sito, email e WhatsApp), "sto arrivando", appuntamento annullato e codice del numero (`WHATSAPP_MESSAGE_TYPES`), a chi ha confermato il cellulare con un codice e acceso i promemoria in Notifiche. Gli stessi pulsanti nell'email del promemoria (link firmato a `/promemoria/…`, la risposta conta solo con un tocco); "Non posso più" porta alla stessa "Proponi un'altra data" dei preventivi (proposta sul preventivo accettato, nessuna strada separata), che il professionista accetta con "Accetta nuova data" (l'appuntamento si sposta), rifiuta o cambia con "Modifica" (allora risponde il cliente), con la data "In attesa" in Agenda e un promemoria dopo 12 ore senza risposta; ore di silenzio 21-8, tetto al giorno (`WHATSAPP_DAILY_LIMIT`), registro `outbound_messages` con esito e costo, webhook firmato. Spento senza `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID` su Render, si accende con la società verificata da Meta (`docs/whatsapp-modelli.md`). Fornitore sostituibile dietro `WhatsAppProvider` |
| Push in tempo reale (chat, notifiche in-app) | **Server-Sent Events** (`@Sse()` di NestJS lato server, `EventSource` nativo del browser lato client) — non Socket.io né WebSocket grezzo | Un solo servizio Render (nessuno scaling orizzontale, l'argomento Socket.io/adapter Redis non si applica), l'invio passa già per REST (serve solo un push server→client, mai bidirezionale), zero dipendenze nuove (`EventSource` è nativo, nessuna libreria client), riconnessione automatica alla caduta della connessione (Render free tier va in sleep/si riavvia). `EventSource` non può impostare header custom: nell'indirizzo passa un biglietto monouso da 60 secondi (`POST /realtime/ticket`, poi `?ticket=...`), mai il token di accesso (docs/CHANGELOG.md §293). Stato in memoria (`RealtimeService`, `Map<userId, Subject>`) esplicitamente scoped a singola istanza — se il progetto scalasse orizzontalmente, va sostituito con un pub/sub condiviso (es. Redis, già nello stack per BullMQ) solo internamente a quel servizio, l'interfaccia pubblica non cambia. Dettagli in `docs/CHANGELOG.md` §115. Il polling esistente resta come rete di sicurezza, solo allungato dove SSE copre ormai il caso comune |
| Anti-bot registrazione | **Cloudflare Turnstile** (`apps/web/src/components/TurnstileWidget.tsx`, `apps/api/src/auth/turnstile.ts`) | Deciso dall'utente il 06/10/2026, implementato in docs/CHANGELOG.md §204: sulla registrazione con email e password (`/registrati` e `InlineAuthGate`), su "Password dimenticata" e sul modulo `/contatti`; Google Sign-In escluso. Gratuito, senza cookie di profilazione (nessun consenso nel banner), citato nell'informativa privacy. Spento senza chiavi (`NEXT_PUBLIC_TURNSTILE_SITE_KEY` su Vercel, `TURNSTILE_SECRET_KEY` su Render). Se Cloudflare non risponde la registrazione passa (resta il limite di 5/min per IP). Nessun proxy/WAF Cloudflare davanti a Vercel |
| Controllo codice fiscale e partita IVA | **VIES** (gratis, solo P.IVA) poi **Openapi** (`apps/api/src/tax-id-check/`, `OPENAPI_TOKEN_RISK` e `OPENAPI_TOKEN_COMPANY` su Render, un token per servizio) | Decisione dell'utente del 14/10/2026 (docs/CHANGELOG.md §253-§254): la P.IVA prima con VIES e, se non conferma (non valida, lenta oltre 5s, non risponde), subito Openapi (Registro Imprese); CF del titolare con Openapi (Agenzia delle Entrate); CF del legale rappresentante solo controlli gratuiti, lo conferma il documento (§255). Nell'interfaccia solo "Verifica P.IVA" / "Verifica codice fiscale", senza nominare enti (decisione dell'utente). Un esito "non valido" toglie il profilo dalla ricerca (`publicVisibilityWhere`); Openapi irraggiungibile o senza chiave non blocca mai (riprova ogni 30 minuti). Fornitore sostituibile dietro `TaxIdProvider` |
| Verifica identità (documento + selfie) | **Didit** (`apps/api/src/identity-verification/`, `DIDIT_API_KEY`/`DIDIT_WORKFLOW_ID`/`DIDIT_WEBHOOK_SECRET` su Render) | Decisione dell'utente del 14/10/2026 (docs/CHANGELOG.md §253): obbligatoria prima del primo preventivo, sostituisce la verifica manuale; nessun caso passa all'admin: se non conferma, il professionista riceve il motivo e la rifà (decisione dell'utente, §255). Consenso biometrico esplicito (art. 9 GDPR) prima di iniziare; si conserva solo l'esito, mai immagini. Fornitore sostituibile dietro `IdentityProvider`. Senza chiavi non è richiesta |
| Fatture della piattaforma allo SdI | **Openapi** (`apps/api/src/accounting/sdi-provider.ts`, `OPENAPI_TOKEN_SDI` e `OPENAPI_SANDBOX` su Render) | Decisione dell'utente del 27/10/2026 (docs/CHANGELOG.md §378): stesso fornitore della verifica di P.IVA e codice fiscale. XML FatturaPA generato da noi (`invoice-xml.ts`), cifrato nel database; senza chiave le fatture si emettono comunque e l'XML si scarica da Admin → Finanza. Dati della società e data di partenza in Admin → Finanza: finché mancano partono solo gli estratti. Fornitore sostituibile dietro `SdiProvider`; con `OPENAPI_SANDBOX=true` il pulsante "Prova l'invio allo SdI" in Finanza (§379). PDF dei documenti fatti dal nostro server con **pdfkit** (`apps/api/src/accounting/document-pdf.ts`, §379), non dalla stampa del browser |
| Code/cache | **Redis** (BullMQ) | Job asincroni: invio reminder, sync ranking di visibilità |
| Monorepo | **Turborepo** + **pnpm workspaces** | Build cache e task orchestration tra app/pacchetti condivisi |
| Error tracking e statistiche | **Sentry** (solo `apps/api`, `SENTRY_DSN`) + **Vercel Web Analytics** (`apps/web`, senza cookie) | Decisi con l'utente (consiglio CEO, docs/CHANGELOG.md §132): prima un 500, un cron fallito o un'email non inviata non li vedeva nessuno, e non esisteva nessuna misura delle visite. Piani gratuiti, nessuna carta. Uptime: `.github/workflows/uptime.yml` e **UptimeRobot** (piano gratuito, ogni 5 minuti su `/health/db` e sulla homepage, avviso sul telefono: deciso da Luca il 09/11/2026, docs/changelog/2026-11-08-infrastruttura-lancio.md, passi in `docs/ops/avvisi.md`) |
| Hosting | Web → **Vercel** (`applicazione-web.vercel.app`); Mobile build → EAS (Expo); API/DB → **Render** a Francoforte, a pagamento dal 05/11/2026 (`professionisti-api-eu` Starter + Postgres Basic-256mb, docs/changelog/2026-11-05-render-francoforte.md; in precedenza Railway, abbandonato per scadenza piano free); funzioni Vercel a Francoforte (`fra1`) | Scelta pragmatica per iterare velocemente in fase iniziale |
| Mappa risultati ricerca | **Google Maps** (`@vis.gl/react-google-maps`, `apps/web` only, mai in `packages/ui`) | Decisione esplicita dell'utente prima del lancio (docs/CHANGELOG.md §133), che **ribalta** la scelta iniziale di Leaflet + OpenStreetMap (presa allora per non collegare una carta di pagamento a Google Cloud): mappa più familiare agli utenti e indirizzi trovati meglio. Unico ingresso: `GoogleMapGate` (`apps/web/src/components/GoogleMapGate.tsx`) — lo script Google si carica solo con `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` impostata **e** dopo il consenso ai servizi Google del banner cookie (consenso centralizzato in `apps/web/src/lib/cookieConsent.ts`); senza consenso un'immagine fissa della mappa con i segnaposto preparata dal nostro server (`GET /maps/static`, Maps Static API con la chiave server, docs/CHANGELOG.md §265) e il pulsante "Usa la mappa interattiva", senza chiave "Mappa non disponibile". Mappa dei risultati con **segnaposto avanzati** (`AdvancedMarker` con la foto/icona del professionista, scelti dall'utente dopo il confronto, docs/CHANGELOG.md §140): richiede un Map ID (`NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`, fallback `DEMO_MAP_ID` di prova). Mappa del raggio in dashboard con `Marker` classico (icona SVG del brand). API in versione `quarterly`. Gli errori interni di Google visti in §135-§137 erano causati dalla chiave senza Maps JavaScript API (§138), non dai marker avanzati. Se Google rifiuta la chiave (`gm_authFailure`) la mappa viene smontata e compare un messaggio con l'indirizzo del sito. Solo web: su mobile andrà valutato `react-native-maps`, non nello scope attuale |
| Dal problema scritto ai mestieri | Dizionario in `packages/shared/src/problemMatch.ts` + **Claude Haiku** (Anthropic, `claude-haiku-5-5`) solo nei casi dubbi, da `apps/api/src/problem-match/` (`ANTHROPIC_API_KEY` su Render) | Decisione di Luca (docs/CHANGELOG.md §392): prima il dizionario, al minimo dubbio l'intelligenza artificiale. Al modello va il testo senza email, telefoni, indirizzi e link; gli avvisi di sicurezza vengono sempre e solo dal dizionario; senza chiave, oltre 3000 dubbi al giorno (`PROBLEM_MATCH_AI_DAILY_LIMIT`) o se Anthropic non risponde in 3 secondi resta il dizionario. Fino al lancio, senza `ANTHROPIC_API_KEY`, lo stesso modello passa da **OpenRouter** (`OPENROUTER_API_KEY`, §394, decisione di Luca); senza credito su OpenRouter un modello gratuito, oggi Gemma 4 31B di Google con due gratuiti di riserva (docs/changelog/2026-10-28-ia-gratuita-fino-al-lancio.md e 2026-10-28-ia-gratuita-riserve.md: massimo 50 richieste al giorno, i testi senza contatti possono essere usati da chi fornisce il modello, quindi mai dopo il lancio): al lancio si torna ad Anthropic cambiando solo le variabili. All'IA va anche il catalogo dei servizi del sito (prestazioni suggerite, standard di Admin e scritte a mano dai professionisti visibili, rifatto ogni 10 minuti) e l'IA indica la prestazione, che mette prima chi la offre (docs/changelog/2026-11-06-ia-conosce-i-servizi.md). Il boost a pagamento non conta in questi risultati. Domanda n. 68 per l'avvocato (informativa e DPA) |
| Agenda: meteo, giro, calendario collegato | **Open-Meteo** (meteo, gratis e senza chiave) + **Google Routes API** (tempi di strada, chiave server `GOOGLE_MAPS_API_KEY`) + feed **iCalendar** in sola lettura (`apps/api/src/agenda/`) | Decisi con l'utente (docs/CHANGELOG.md §288). Meteo: solo un'icona sui giorni con pioggia, temporale, neve, vento forte o nebbia, chiesto dal nostro server per le coordinate del profilo (nessun consenso). Giro intelligente: tappe a domicilio del giorno nell'ordine degli orari, mai riordinate; senza Routes API una stima in linea d'aria mostrata come "circa". Calendario collegato: link segreto `/calendar/<token>.ics` (Google o iPhone), si rigenera spegnendo e riaccendendo |
| Storage immagini profilo | **Cloudinary** | Upload dell'immagine profilo dei professionisti (`apps/api/src/cloudinary/`). Deciso esplicitamente con l'utente al posto di Vercel Blob o di salvare il file nel database: piano gratuito senza carta di pagamento, CDN + resize automatico (800×800 max) incluso lato upload |
| Geocodifica indirizzo preciso | **Google Places API (New)** dal nostro server (§264, prima nel browser) + **Google Geocoding API** lato server | Nel profilo in dashboard, e nei campi "Via/piazza" del cliente (richiesta di preventivo, modifica richiesta, impostazioni account, dove la scelta compila anche civico/CAP/città/provincia), il campo indirizzo propone indirizzi reali mentre si scrive (`apps/web/src/components/AddressAutocompleteInput.tsx`, docs/CHANGELOG.md §141: solo vie/civici in Italia, favoriti quelli vicini alla città indicata; dal §264 li chiede a Google il nostro server, `GET /address/suggestions` e `/address/place/:id` con Places API (New) e la chiave server, quindi niente consenso cookie e via e città in un solo campo; se il server non risponde resta un campo di testo); scegliendo un suggerimento le coordinate esatte vengono inviate col salvataggio e il server non geocodifica. Per un indirizzo scritto a mano resta `apps/api/src/geocoding/geocoding.service.ts`, che geocodifica l'indirizzo preciso (opzionale) inserito dal professionista in `/dashboard/profilo` per posizionarlo esatto sulla mappa dei risultati, invece che al centro del comune. Sostituisce Nominatim (docs/CHANGELOG.md §133, stessa decisione della mappa). Chiave server `GOOGLE_MAPS_API_KEY` su Render, distinta da quella del browser. Usata al salvataggio del profilo e, dal §264, per i suggerimenti degli indirizzi (serve "Places API (New)" abilitata sulla chiave), mai nella ricerca dei professionisti. Se la chiave manca, la geocodifica non trova nulla o Google non risponde entro 5s, si ricade silenziosamente sul centro del comune (dataset ISTAT) — non deve mai bloccare il salvataggio del profilo |

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
- **Next.js 16** (docs/changelog/2026-11-02-nextjs-16.md, prima Next.js 15
  §297): le pagine le prepara **Turbopack**, non più webpack; gli alias
  (`react-native` → `react-native-web`, sorgenti di `packages/shared`) e
  l'ordine delle estensioni `.web.*` stanno in `turbopack` di
  `next.config.mjs`. L'ingresso nascosto all'admin è in `src/proxy.ts` (il
  vecchio `middleware.ts`); niente runtime `edge`, deprecato. `next build`
  non fa più il lint: lo fa `pnpm lint` in CI. Nelle pagine server `params` e
  `searchParams` (come `cookies()` e `headers()`) sono Promise da attendere;
  il `typecheck` di `apps/web` esegue prima `next typegen`, che genera i tipi
  con cui si controllano le props delle pagine. Sito e app usano la stessa
  versione di React 19, fissata con `overrides` in `pnpm-workspace.yaml`
  (§299): aggiornandola, cambiarla lì e nei `package.json` di `apps/web` e
  `apps/mobile` insieme. Prima e dopo un aggiornamento importante
  `pnpm --filter @professionisti/web confronto-pagine` fotografa tutte le
  pagine e confronta i due giri pixel per pixel (istruzioni in testa a
  `apps/web/scripts/confronto-pagine.mjs`). Per zod, `src/zod.ts` di
  `packages/shared` tiene i messaggi d'errore di zod 3 (lo importa ogni file con
  schemi, unico con effetti in `sideEffects`; gli schemi importano `z` da "zod", e `apps/web` usa i sorgenti di
  shared, non `dist/`, per non caricare nel browser tutto zod) e `pnpm --filter @professionisti/shared confronto-zod` confronta
  le validazioni prima/dopo un aggiornamento, anche da solo nelle PR che
  cambiano la versione di zod (`.github/workflows/zod.yml`, docs/CHANGELOG.md §326).
- **Versione di Node.js** (docs/CHANGELOG.md §373-§374): una sola fonte,
  `.nvmrc` con la versione esatta (oggi 24.22.1), letta da Render e dalla CI;
  `engines.node` è `24.x` per Vercel, che aggiorna da sé le correzioni.
  Il controllo giornaliero `.github/workflows/node.yml` apre una
  segnalazione quando esce una correzione di sicurezza di Node 24, appena
  una versione più nuova diventa LTS (decisione di Luca: passarci subito,
  §376) e 6 mesi prima della fine del supporto (§375). Il passaggio a una
  nuova versione principale si fa in un thread dedicato.
- **Aggiornamenti delle dipendenze** (docs/CHANGELOG.md §302): Dependabot
  (`.github/dependabot.yml`) apre una PR al mese con gli aggiornamenti
  piccoli raggruppati, da unire se la CI è verde; gli aggiornamenti grandi
  arrivano in PR separate e vanno trattati in un thread dedicato con il
  confronto delle pagine. React, React Native e le versioni grandi di Expo
  sono esclusi: si aggiornano a mano, insieme. Per questi e per la fine del
  supporto di Next.js, React, React Native e NestJS c'è il controllo mensile
  `.github/workflows/aggiornamenti.yml` (apre una segnalazione); PostgreSQL di
  Render lo controlla l'API ogni mese (email ai super admin).
- **Il sito usa i sorgenti di `packages/shared`** (alias in
  `apps/web/next.config.mjs`, `sideEffects: false`, docs/CHANGELOG.md §345):
  ogni pagina prende solo le parti che usa. Un modulo di `packages/shared`
  non deve contare su effetti al solo import (registrazioni, globali). L'API
  usa sempre `dist/`.
- **Tamagui 3** (docs/changelog/2026-11-02-tamagui-3.md, prima Tamagui 1):
  valori "piatti", token senza `$` e stati nel valore
  (`backgroundColor="blue10 hover:blue9 press:blue8"`, `fontSize="16px xs:13px"`),
  niente `hoverStyle`/`pressStyle`/`$xs`; `render` al posto di `tag`, `role` e
  `aria-label` al posto di `accessibilityRole`/`accessibilityLabel`; un
  `lineHeight` numerico è un rapporto, i pixel si scrivono `"26px"`.
  `styleCompat: "legacy"` e `defaultPosition: "relative"` in
  `packages/ui/src/config.ts` tengono l'impaginazione di prima. `Button` e
  `Input` sono nostri (`packages/ui/src/Button.tsx`, `Input.tsx`) con le
  misure "1"…"5" di Tamagui 1: quelli di Tamagui 3 hanno misure "xs…xl".
  Le classi atomiche di Tamagui 3 valgono quanto una sola classe: una regola
  di `globals.css` con due classi ora vince sugli stili scritti nel
  componente (prima no). I valori di base (token, font, temi) di Tamagui 1
  restano fissati in `packages/ui/src/tamaguiDefaults.ts` (Tamagui 3 non ha
  più quella config): un tema nuovo si scrive a mano lì e in
  `packages/ui/src/usedThemes.ts`, poi
  `pnpm --filter @professionisti/ui genera-default-tamagui` lo controlla. Non
  si importa `@tamagui/config` nel sito (§345). Sul sito niente animazioni di
  Tamagui (nessun driver, `animations.web.ts`). Due comportamenti di
  Tamagui 1 rimessi sul sito: i riquadri con ruolo button/checkbox/link/
  radio/textbox/switch raggiungibili col Tab (`focusableRoles.ts`) e il
  tocco che risale ai contenitori, con una correzione di una riga al
  pacchetto (`patches/@tamagui__web@3.1.10.patch`, da rifare a ogni
  aggiornamento di Tamagui).
- **Pagine pubbliche in HTML semplice** (docs/changelog/2026-11-09-pagine-pubbliche-senza-tamagui.md
  , 2026-11-09-citta-e-profilo-senza-tamagui.md e
  2026-11-09-barra-in-alto-senza-tamagui.md): piè di pagina, barra in alto,
  home, schede dei professionisti (logica comune in `professionalCardModel.ts`),
  profilo pubblico, contenitore dei risultati e i pezzi comuni `Section`, `Avatar`, `Rating`, `Badge`, `Chip`,
  `EmptyState`, `PriceLine`, `ProfessionalKindBadge` (varianti
  `*.web.tsx` in `packages/ui`) usano `div`/`span` con le classi globali di
  Tamagui (`is_View`, `is_Text`, `font_body`, `font_heading`) e un
  `*.module.css` con le sue variabili (`--t-space-N`, `--c-nome`), non le
  primitive Tamagui: il telefono non calcola gli stili all'apertura. Nuove
  parti di queste pagine si scrivono così; una variante `.web.tsx` cambia
  insieme al suo file per l'app. Il compilatore di Tamagui non va con
  Turbopack. Anche `Button` sul sito è HTML semplice (`Button.web.tsx`,
  docs/changelog/2026-11-10-pulsanti-senza-tamagui.md): varianti comuni con
  l'app in `buttonStyle.ts`, prop di stile (anche `"44px xs:40px"` e
  `hover:`) tradotte in classi di `Button.module.css`, che si genera con
  `pnpm --filter @professionisti/ui genera-css-pulsante`.
- **React Compiler** acceso su tutto il sito (docs/CHANGELOG.md §345), ma
  rompe gli stili `<style jsx>`: ogni componente che li usa deve iniziare
  con la direttiva `"use no memo"` (lo controlla `pnpm lint`,
  `apps/web/scripts/controlla-style-jsx.mjs`).
- Il build di produzione di `apps/mobile` avviene su **EAS Build** (cloud).
  Dal passaggio a Expo 58 (§299) `npx expo export --platform android|ios`
  funziona anche in locale ed è un buon controllo veloce che il pacchetto
  si generi; `npx expo-doctor` controlla le versioni.
- Lo script `build` di `apps/api` compila prima `@professionisti/database` e
  `@professionisti/shared` (altrimenti TypeScript non trova quei moduli): non toglierlo.
- **Migrazioni DB**: mai `prisma db push` in produzione. Lo `start` di
  `apps/api` esegue `packages/database/scripts/migrate-deploy.mjs`
  (`prisma migrate deploy`, con baseline automatica solo sull'errore `P3005`).
  `20260921212750_baseline` deve restare lo schema realmente presente in
  produzione al passaggio, mai lo schema corrente: ogni
  modifica allo schema va in una nuova migrazione (`prisma migrate dev --name
  <nome>` in locale), **mai modificare una migrazione già unita** (la CI lo
  blocca). Migrazioni **solo additive** (nuove colonne e tabelle): un `DROP`
  o un `RENAME` va in una PR a parte, almeno un deploy dopo il codice che
  non usa più quella colonna, così il rollback dell'API resta possibile
  (`docs/ops/rollback.md`). Le
  categorie si sincronizzano a ogni avvio via `CategoriesSeedService`.
- **Operazioni** (docs/changelog/2026-11-08-infrastruttura-lancio.md):
  rollback, ripristino del database, attività a orario, avvisi, variabili e
  cambio di dominio in `docs/ops/`. Ogni variabile letta dall'API va in
  `render.yaml` (la CI lo controlla, `apps/api/scripts/check-render-env.mjs`).
  Le attività a orario si scrivono con `@ScheduledJob` di
  `apps/api/src/common/scheduled-job.ts`, mai con `@Cron`: ora italiana,
  nessun giro accavallato e un solo giro anche con due API accese durante
  un deploy (tabella `cron_runs`). `/health` è il controllo leggero di
  Render, `/health/db` (usato dall'uptime) controlla anche il database.
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
