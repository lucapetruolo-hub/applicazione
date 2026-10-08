---
name: checklist-lancio
description: >-
  Checklist di ciò che resta da fare prima del lancio di Manovia (dati legali/societari, chiavi Google Maps,
  Stripe, Cloudinary, Resend, fiscale, avvocato, claim da correggere, giorno del lancio). Usala quando si
  chiede cosa manca per lanciare, quando si chiude o si aggiunge un punto aperto, o prima di andare live.
---

Spostata da `CLAUDE.md` §10 (stesso testo). Aggiornala qui quando un punto
si chiude o se ne aggiunge uno.

### Checklist — da fare prima del lancio

Elenco consolidato (deduplicato) di tutto ciò che risulta ancora aperto,
raccolto da tutte le sezioni del changelog che lo segnalavano — dettagli e
motivazione estesa di ogni punto in `docs/CHANGELOG.md` (cerca il testo tra
virgolette per trovare la sezione di origine).

**Dati legali/societari reali** (oggi segnaposto `[DA COMPILARE]` in
produzione):
1. Dati del titolare del trattamento su `/privacy` (ragione sociale, sede
   legale, P.IVA, email privacy).
2. Dati del prestatore ai sensi del D.Lgs. 70/2003 art. 7 (ragione sociale,
   P.IVA, sede legale, PEC) nella riga legale del footer.
3. Email di contatto reale per il canale di segnalazione accessibilità su
   `/accessibilita` (può coincidere con l'email privacy del punto 1).

**Credenziali/configurazione**:
4. **Chiavi Google Maps** (docs/CHANGELOG.md §133) — senza, la mappa mostra
   "Mappa non disponibile" e gli indirizzi restano al centro del comune.
   Serve un progetto Google Cloud con fatturazione attiva (carta) e le API
   *Maps JavaScript API* + *Geocoding API* abilitate:
   - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` su Vercel — chiave limitata ai siti
     web del progetto (HTTP referrer) e con **Maps JavaScript API** e
     **Places API (New)** tra le API consentite (senza Maps JavaScript API
     Google risponde `ApiTargetBlockedMapError`: è successo davvero, §138;
     senza Places API (New) il campo indirizzo non mostra suggerimenti, §141);
   - account di fatturazione Google Cloud **attivo** (non "periodo di prova
     terminato"): senza, Google può bloccare le API;
   - `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` su Vercel — Map ID creato in Google
     Cloud → Gestione mappe (tipo JavaScript, vettoriale), per i segnaposto
     avanzati; senza, si usa `DEMO_MAP_ID`, che è solo di prova (§140);
   - `GOOGLE_MAPS_API_KEY` su Render — seconda chiave, limitata alla sola
     Geocoding API;
   - impostare un budget/avviso di spesa su Google Cloud.
   Le variabili `NEXT_PUBLIC_*` richiedono un nuovo deploy su Vercel.
4bis. **Postgres free (Render) scade ogni 30 giorni** — non risolto
   tecnicamente, richiede un piano a pagamento (decisione di budget non
   presa autonomamente): promemoria operativo ricorrente, non ipotetico,
   non un rischio ipotetico da monitorare "quando capita". Alla scadenza
   va creato un nuovo DB free e aggiornato `DATABASE_URL` su Render (le
   migrazioni si applicano da sole al primo avvio sul DB vuoto, le
   categorie si ripopolano via `CategoriesSeedService`).
   **Scadenza in corso (docs/CHANGELOG.md §169):** il DB del 6 ottobre
   2026 è il secondo ed è anch'esso gratuito, quindi scade intorno al
   **5 novembre 2026** (data esatta nella dashboard Render). Il primo è
   scaduto il 3 ottobre; i dati di prova sono andati persi. Prima di
   quella data: passare a pagamento DB e servizio API (consigliato, tiene i
   dati e fa girare i job orari), oppure ripetere la procedura con un nuovo
   DB gratuito. **Prima del lancio il DB deve essere a pagamento**: con
   pagamenti e recensioni reali una scadenza vorrebbe dire perdere dati.
   Il vecchio `professionisti-db` non si cancella a mano perché è legato al
   Blueprint (`render.yaml`): si cancella da solo. Finché il Blueprint
   punta ancora a lui, non modificare `render.yaml` (una risincronizzazione
   potrebbe rimettere `DATABASE_URL` sul database vecchio).
5. Chiavi Stripe Checkout reali (già segnalate in §9 sopra:
   `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_PRICE_BASE`/
   `STRIPE_PRICE_PLUS`/`STRIPE_PRICE_PRO`, con gli eventi webhook
   `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`) e Cloudinary reali (`CLOUDINARY_CLOUD_NAME`/
   `CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET`).
5bis. **Resend reali** (`RESEND_API_KEY`, dominio verificato su Resend +
   `RESEND_FROM_EMAIL` corrispondente) — senza queste variabili i
   promemoria anti no-show (§9/`EmailService`, già implementati e
   funzionanti) non vanno in crash ma semplicemente non partono: nessuna
   email reale finché queste due variabili non sono impostate su Render,
   stesso pattern già usato per Stripe/Cloudinary/Google.
   ⚠️ **Senza un dominio proprio le email arrivano solo al titolare
   dell'account Resend** (richiesta esplicita dell'utente di tenerlo in
   checklist): finché non si verifica un dominio, Resend consegna solo
   all'indirizzo con cui è stato creato l'account — va bene per provare,
   non per i professionisti veri. Per usarlo davvero:
   1. Comprare un dominio (~€10/anno, es. `manovia.it`): `vercel.app` non
      è nostro e non si può verificare.
   2. Resend → Domains → Add Domain, poi copiare i record DNS mostrati nel
      pannello del registrar del dominio.
   3. Su Render impostare `RESEND_FROM_EMAIL` =
      `Manovia <notifiche@tuodominio.it>`.
   Verificato dall'utente: con il mittente di prova `onboarding@resend.dev`
   l'email del nuovo lead arriva, ma **in spam**. Il dominio proprio risolve
   anche questo: oltre ai record SPF/DKIM chiesti da Resend, aggiungere un
   record DMARC (`_dmarc`, es. `v=DMARC1; p=none;`) e provare l'invio su
   Gmail/Outlook prima di reclutare i professionisti.
6. Credenziali Stripe **Connect** reali per i pagamenti MANOVIA (distinte
   dalle chiavi Stripe Checkout del punto 5 — abilitano i pagamenti
   professionista↔piattaforma, non solo abbonamenti/boost/lead).
6bis. **Dati societari reali sull'account Stripe di Manovia** (ragione
   sociale, P.IVA, sede legale) prima del lancio: `invoice_creation:
   { enabled: true }` è già attivo su `createLeadCheckout`/
   `createBoostCheckout` (`apps/api/src/billing/billing.service.ts`,
   CEO — consiglio esperti, richiesta esplicita dell'utente) e genera già
   una ricevuta Stripe scaricabile dal professionista, ma finché
   l'account Stripe stesso porta dati provvisori/di test quella ricevuta
   non è un documento fiscale valido — è plumbing tecnico pronto, non
   fatturazione risolta. Da verificare (dashboard Stripe → Impostazioni
   azienda) prima di andare live, insieme al punto 7 sotto (ruolo fiscale
   esatto), che resta comunque la decisione a monte: non basta
   aggiornare l'account Stripe se il ruolo fiscale di Manovia
   nell'intermediazione non è ancora stato chiarito con un
   commercialista.

**Fiscale — richiede la firma di un vero commercialista/avvocato
tributario, non solo lavoro tecnico** (le 5 domande del CFO, dettagliate in
`docs/CHANGELOG.md` §88/§113):
7. Ruolo fiscale esatto di Manovia nell'intermediazione del pagamento
   (mandato con/senza rappresentanza vs. commissione).
8. Chi emette fattura al cliente finale per il lavoro svolto.
9. Trattamento IVA corretto della commissione trattenuta da Manovia.
10. Se la "consideration" DAC7 deve includere anche i pagamenti `DIRECT`
    fuori piattaforma (`Dac7Rule.includeDirectPayments`, oggi `true` di
    default, un'ipotesi di lavoro non confermata).
11. Verifica delle condizioni contrattuali B2B/B2C quando Stripe verrà
    attivato (diritto di recesso abbonamenti SaaS, fatturazione
    elettronica) — dipende da come sarà strutturata l'offerta commerciale
    reale.

**Legale — richiede un avvocato** (richiesta esplicita dell'utente, consiglio
CEO sulle segnalazioni, `docs/CHANGELOG.md` §144):
11bis. **Aggiornare `/termini`** con: le misure che possiamo prendere su una
    segnalazione (nascondere un contenuto, togliere un profilo dalla
    ricerca, sospendere un account), come si contesta una decisione (pagina
    `/segnalazioni`, reclamo interno DSA art. 20), il punto di contatto
    unico per utenti e autorità (DSA art. 11-12) e le regole sui contenuti
    (art. 14). Oggi `/termini` dice solo "possiamo sospendere/rimuovere" e
    non parla né di reclamo né di segnalazioni. Il testo va scritto o
    verificato da un avvocato, non solo riformulato nel codice. Aggiungere
    anche il regolamento delle segnalazioni sui lavori (bozza pronta in
    `docs/legale/regolamento-controversie.md`, con i punti da verificare,
    tra cui la clausola "non rispondiamo di danni").
11ter. **Far verificare la dicitura di registrazione dei clienti** (docs/CHANGELOG.md
    §176): al posto delle caselle, "Continuando accetti i nostri Termini di
    Servizio, confermi di aver letto e compreso la nostra Privacy Policy e
    di avere almeno 18 anni". Il professionista ha ancora le caselle.

**Fiscale — solo lavoro tecnico**:
12. Integrazione reale con il tracciato ufficiale DPI23 dell'Agenzia delle
    Entrate (Desktop Telematico) — l'export DAC7 attuale è una bozza
    JSON/XML interna, non il formato ufficiale validato.
13. ~~Percentuale di commissione MANOVIA~~ — decisa dall'utente: 5% sui
    pagamenti online, a carico del professionista (docs/CHANGELOG.md §168).
14. Emissione fatture reali (`Invoice`, schema già pronto, nessuna UI di
    generazione) — dipende dalle risposte del punto 8.

**Claim non veritieri pubblicati dal vivo** (decisione esplicita
dell'utente, §113: non riformulare il testo nel frattempo — costruire
davvero la verifica prima):
15. ~~Claim "Profili verificati"~~ — la verifica esiste (docs/CHANGELOG.md
    §200-§201): l'admin controlla documento e partita IVA e assegna il badge
    da `/admin/verifiche`, il professionista lo chiede dal profilo. Footer e
    risultati dicono ora "Badge Verificato: documento e P.IVA controllati".
    Resta da fare: verificare davvero i primi professionisti prima del
    lancio. "Professionisti verificati" generico tolto dalle descrizioni
    (§202).
16. ~~Risposte di `WhatIfSection.tsx` con promesse inesistenti~~ —
    allineate alle regole reali di pagamento e segnalazioni
    (docs/CHANGELOG.md §168).
    Se la verifica KYC reale non fosse pronta per il lancio, il punto 15
    va comunque corretto/rimosso prima di andare in
    produzione — non deve mai restare un'affermazione falsa pubblicata dal
    vivo.

**Giorno del lancio** (richiesta esplicita dell'utente: "ricorda questo
prima del lancio"):
0. **Rendere il sito visibile ai motori di ricerca**: impostare
   `NEXT_PUBLIC_SITE_INDEXABLE=true` su Vercel (Settings → Environment
   Variables, ambiente Production) e rifare il deploy (Deployments →
   ultimo deploy → Redeploy). Finché non si fa, il sito resta `noindex` e
   la sitemap vuota (docs/CHANGELOG.md §132). Subito dopo: inviare
   `/sitemap.xml` in Google Search Console.
0bis. **Impostare `LAUNCH_DATE`** su Render (AAAA-MM-GG, il giorno del
   lancio; meglio qualche giorno prima): da lì parte il mese gratuito dei
   professionisti e prima non scatta nessuna pausa (docs/CHANGELOG.md
   §170). Senza, la prova di chi si è iscritto prima del lancio è già
   scaduta.

**Prodotto**:
17. Rimuovere il blocco "Presto disponibile" (`WaitlistBlock`, homepage)
    quando l'offerta reale di professionisti in una città/categoria supera
    la soglia (`MIN_PROFESSIONALS_TO_SHOWCASE`) e la vetrina vera
    (`RealShowcase`) prende il suo posto.
18. ~~Promemoria automatici anti no-show~~ — fatto (email, vedi §9). SMS
    (Twilio) resta rimandato: nessun caso d'uso ancora non coperto
    dall'email.
21. **Nome e icona del marchio** (decisione dell'utente, 06/10/2026): per ora
    il sito si chiama "Professionisti"; il nome definitivo va scelto e
    cambiato prima del lancio. Per i testi (sito, app, email) basta
    `BRAND.name` in `packages/shared/src/brand.ts` (docs/CHANGELOG.md §199).
    A parte restano l'icona (`icon.svg`, `icon-192.png`, `icon-512.png`,
    `apple-icon.tsx`, `opengraph-image.tsx` in `apps/web/src/app`, il
    disegno in `packages/ui/src/Logo*.tsx`), `apps/mobile/app.json` e
    `RESEND_FROM_EMAIL` su Render; logo delle email da `EMAIL_LOGO_URL` o, di
    default, `icon-192.png` del sito.
21bis. **Email di assistenza reale**: le email e alcune pagine indicano
    `supporto@professionisti.it`, provvisoria come il nome. Crearla col dominio
    del punto 5bis e aggiornarla in `BRAND.supportEmail`
    (`packages/shared/src/brand.ts`): vale per email e pagine.
22. **Promemoria via SMS: ricerca di un'alternativa** (WhatsApp o altro).
    "Come funziona" (`HowItWorks.tsx`) oggi promette "email e SMS" ma gli SMS
    non sono attivi: finché la ricerca non è chiusa il testo non è stato
    toccato (decisione dell'utente, 06/10/2026). Prima del lancio o si attiva
    un canale reale o si corregge la frase.
23. **Conferma email obbligatoria per i professionisti** (docs/CHANGELOG.md §178, mai per i clienti): già nel
    codice, ma spenta. Dopo aver verificato il dominio su Resend (punto
    5bis) e provato che il link arriva a un indirizzo qualunque, impostare
    `EMAIL_VERIFICATION_REQUIRED=true` su Render. Prima di allora nessuno
    tranne il titolare dell'account Resend riceverebbe il link.
24. **Cloudflare Turnstile anti-bot sulla registrazione** (decisione
    dell'utente, 06/10/2026: da integrare prima del lancio). Widget sui
    moduli email+password (`/registrati` e `InlineAuthGate`), controllo
    del token in `POST /auth/register` (`apps/api/src/auth/`), chiavi
    `NEXT_PUBLIC_TURNSTILE_SITE_KEY` su Vercel e `TURNSTILE_SECRET_KEY` su
    Render, spento senza chiavi come Maps e Stripe. Gratuito, senza cookie
    di profilazione (niente banner), ma va citato nell'informativa privacy
    (dati a Cloudflare, USA) e aggiunto alla tabella dello stack in
    CLAUDE.md. Google Sign-In non ne ha bisogno. Nessun proxy/WAF
    Cloudflare davanti a Vercel: sconsigliato da Vercel e il sito non ha
    ancora un dominio proprio.
25. ~~Email transazionali mancanti~~ — fatto (docs/CHANGELOG.md §185):
    benvenuto, richiesta inviata, preventivi e date, lavori, pagamenti,
    recensioni, recupero password, con modello unico. Partono a tutti solo
    dopo il dominio su Resend (punto 5bis); il nome del marchio si cambia in
    `apps/api/src/email/email-brand.ts` (punto 21).

**Infrastruttura/qualità del codice** (CEO, audit tecnico — "zero test
automatici, zero CI/CD, e soprattutto `prisma db push --accept-data-loss`
gira ad ogni deploy in produzione — con dati reali di utenti paganti, un
push che droppa una colonna è perdita dati silenziosa"). CI minima
(`.github/workflows/ci.yml`, typecheck+build+test su ogni push), prima
infrastruttura di test reale (Vitest — commissione piattaforma, creazione
Booking da preventivo, gate contatti cliente) e CORS ristretto a
`FRONTEND_URL` (`apps/api/src/main.ts`) sono **già fatti**, vedi §9. Restano
aperti solo:
19. ~~Passo manuale di baseline sul database Render~~ — non più
    necessario: fatto in automatico dallo script `start` al primo `P3005`
    (vedi §2 e `docs/CHANGELOG.md` §128).
20. Postgres free che scade ogni 30 giorni — vedi punto 4bis più sopra
    (voce principale di questo problema, in cima alla checklist perché è
    un rischio operativo ricorrente, non solo tecnico).

