# Decisioni di prodotto, go-to-market e funzionalità (CLAUDE.md §6-§8)

Testo spostato parola per parola da `CLAUDE.md` §6-§8 il 10/11/2026
(docs/changelog/2026-11-10-riordino-file.md) per non rileggerlo a ogni
messaggio. Le citazioni "CLAUDE.md §N" nel codice restano valide: §N è la
sezione di `CLAUDE.md` che rimanda qui.

## 6. Decisioni di prodotto

### Categorie professionisti (MVP)

Lancio con poche categorie ad alta frequenza di ricerca, poi si espande:
idraulico, elettricista, imbianchino, pulizie (casa/ufficio), giardiniere,
traslochi, fabbro, climatizzazione/caldaie, muratore/ristrutturazioni,
falegname. Ogni categoria ha sotto-tag di specializzazione (es. Elettricista
→ impianti civili, domotica, certificazioni), usati sia per il matching in
ricerca sia per differenziare i piani a pagamento.

Espansa oltre il set iniziale di mestieri artigianali con cinque categorie,
su richiesta esplicita dell'utente: **Tutto Fare** (piccole riparazioni
generiche), **Dogsitter** e **Babysitter** (queste due al posto di OSS e
Badanti, tolte su decisione dell'utente, docs/CHANGELOG.md §217),
**Elettrodomestici** (riparazione) e **Tende da sole e zanzariere**
(richiesta di Luca del 06/11/2026, docs/changelog/2026-11-06-mestiere-elettrodomestici.md:
prima erano lavori "fuori servizio" del dizionario). Ogni
professionista sceglie da 1 a 3 categorie (`MAX_PROFESSIONAL_CATEGORIES`). Fonte di verità unica in
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

| Livello | Mensile + IVA | Annuale + IVA | Lavori accettati al mese |
|---|---|---|---|
| **Base** | 19 € | 190 € (16 €/mese) | 3 |
| **Plus** | 59 € | 590 € (49 €/mese) | 10 |
| **Pro** | 99 € | 990 € (83 €/mese) | senza limite |

Prezzi e limiti decisi dall'utente il 26/10/2026 (docs/CHANGELOG.md §361),
al posto di 19/39/69 € e 5/15 lavori: mostrati "+ IVA" con l'IVA compresa
in piccolo, annuale (dieci mensilità, "Risparmi 2 mesi") in vista per primo;
prezzi Stripe nelle variabili `STRIPE_PRICE_<LIVELLO>` e
`STRIPE_PRICE_<LIVELLO>_ANNUAL`, IVA con `STRIPE_TAX_RATE_IVA`.

- **Mesi gratis decisi dall'offerta in Admin** (decisioni di Luca del
  29/10/2026, docs/changelog/2026-10-29-offerta-mesi-gratis.md, sostituiscono
  il mese gratuito per tutti e il mese regalato a sorpresa): chi si iscrive
  mentre un'offerta è attiva (di partenza 3 mesi, `SubscriptionOffer`) ha
  quei mesi Base gratis, uno dopo l'altro, poi **Base mensile in automatico**
  (va detto all'attivazione). **Carta obbligatoria**: "Attiva i mesi gratis"
  è un abbonamento Base di Stripe in prova; senza carta dal lancio il profilo
  è in pausa (`CARD_NEEDED`). Luca ferma l'offerta o ne crea un'altra in
  Admin → Profili da confermare, con gli iscritti professionisti e clienti;
  chi è già iscritto tiene i suoi mesi. **Plus o Pro nei mesi gratis**: il
  mese del livello meno 19 €, mese nuovo da quel giorno con 0 lavori, i mesi
  non iniziati in attesa (`freeMonthsWaiting`) e **mai persi**: si
  riprendono con "Torna a Base" o scegliendo Base. Mesi a 0,99 € valutati e
  scartati da Luca. **Per ora solo mensile** (l'annuale torna con i dati
  reali). Sul sito resta la banda "GRATIS PER 3 MESI" dei primi 100
  (`founderNumber`, `FOUNDER_SPOTS`), mai il conto alla rovescia.
- **I mesi gratis valgono come Base** (3 lavori). Sulla pagina prezzi Base
  mostra "€19" barrato e "Gratis per N mesi".
- **Account in pausa** (`ProfessionalProfile.pausedAt`/`pausedReason`,
  docs/CHANGELOG.md §162): a fine mese gratuito senza livello e ad
  abbonamento concluso il profilo esce dalla
  ricerca e dallo smistamento, non accetta richieste dirette né prenotazioni
  (resta visibile dal link); banner fisso in Home e in Abbonamento. Ogni
  nuovo punto che mostra professionisti o assegna richieste deve filtrare
  anche `pausedAt` e `invitePendingAt` (profilo creato da un operatore e
  non ancora confermato, docs/CHANGELOG.md §170). **Nessuna pausa finché
  i pagamenti non sono attivi** (`STRIPE_SECRET_KEY` assente) **e prima
  di `LAUNCH_DATE`**: senza Stripe nessuno potrebbe scegliere un livello e
  a fine prova la ricerca resterebbe vuota.
- **I mesi gratis partono dal lancio** (`LAUNCH_DATE` su Render,
  AAAA-MM-GG, docs/CHANGELOG.md §170): chi si iscrive prima li ha dal
  lancio. Senza la variabile non si dà la carta e non si paga nulla.
- **Al limite:** si passa al livello superiore pagando **10 € più la
  differenza di prezzo per i giorni che mancano al rinnovo, maggiorata del
  10%**, senza tetto (decisione dell'utente, §361; `upgradeFeeEurCents` in
  `packages/shared/src/plans.ts`; nei mesi gratis vale la regola sopra); il nuovo livello vale fino al rinnovo, poi si paga
  intero. Una sola cifra nell'interfaccia, il calcolo in "Scopri di più" e
  nei Termini. Altrimenti si aspetta il rinnovo.
- **Lavori esauriti** (decisioni dell'utente, docs/CHANGELOG.md §362): i
  lavori si contano per periodo e **ripartono al rinnovo** (annuale: ogni
  mese dal giorno di attivazione), mai il 1° del mese; su Plus e Pro lo
  stesso cliente conta una volta per periodo (detto solo ai professionisti).
  Al limite il profilo **resta nella ricerca** e riceve le richieste, ma
  non manda preventivi nuovi e non risponde per primo in chat; l'agenda
  resta visibile per chi chiede un preventivo (§363)
  (`ProfessionalProfile.jobLimitReachedAt`, non
  `pausedAt`); i preventivi già mandati restano validi. Finestra "Hai
  esaurito l'abbonamento Base" con la richiesta, il livello sopra e una
  sola cifra (`JobLimitModal`).
- **Clienti dal link personale** (decisione di Luca del 26/10, fatta l'8/11,
  docs/changelog/2026-11-08-canale-del-professionista.md): le richieste
  partite da `/p/<codice>` del professionista sono clienti suoi
  (`GuidedRequest.fromProfessionalLink`, solo se il sito non glieli aveva già
  portati): **non contano nei lavori**, gli si risponde anche al limite e la
  casella "Inoltra se non risponde" parte spenta. Pagina "Il tuo link" con QR
  e "Invita un tuo cliente" (il messaggio lo manda lui, mai noi).
- **Rinnovo automatico** mensile o annuale con avviso 3 giorni prima (sito + email);
  annullabile da `/dashboard/abbonamento`, resta attivo fino alla scadenza.
  Passare a un livello inferiore non è ancora previsto.
- Prezzi e limiti da rivedere sui dati dei primi mesi.
- Si incassa solo con P.IVA/società e parere del commercialista (checklist
  §10). **Pagamento dei lavori** (decisioni dell'utente, docs/CHANGELOG.md
  §168): nel preventivo il professionista offre uno o più modi (§237: diretto,
  acconto online con percentuale sua 1-100% e saldo online o diretto) e
  accettando il cliente sceglie tra questi: **online con Stripe**
  (acconto, 20% del massimo se non cambiato, saldo a lavoro chiuso, soldi addebitati
  sul conto Stripe del professionista meno la **trattenuta unica del 7% + IVA**,
  tutto compreso (carta e bonifici di Stripe a carico nostro, docs/CHANGELOG.md
  §378, prima 5% più i costi di Stripe), mai in custodia sulla piattaforma, e bloccati lì con i bonifici in manuale
  fino alla conferma o per 7 giorni (massimo 90, regola Stripe),
  docs/CHANGELOG.md §249; assistenza e rimborso sulle segnalazioni accolte)
  oppure **diretto** (nessun rimborso né decisione nostra: le segnalazioni
  restano tra le parti, il cliente può comunque recensire). Il pagamento
  diretto non paga commissione.
  **Tetto online** (decisione di Luca, docs/changelog/2026-10-28-tetto-pagamenti-online.md):
  al massimo 2.000 € a lavoro chiesti online finché il professionista non ha
  10 lavori pagati online senza contestazioni e 120 giorni dal primo
  (`packages/shared/src/onlineLimit.ts`); l'admin lo può togliere, una
  contestazione persa lo rimette.
- **Documenti contabili** (decisioni dell'utente del 27/10/2026,
  docs/CHANGELOG.md §378): una fattura al mese delle trattenute (serie `COM`,
  nota di credito se il mese è negativo) e una per ogni pagamento
  dell'abbonamento, quota di passaggio o pacchetto (serie `ABB`), dalla
  pagina "Fatture e documenti" (`/dashboard/documenti`, scheda dell'area
  "Fisco e pagamenti" con Dati fiscali, Pagamenti online e Dati
  DAC7, docs/changelog/2026-10-28-fisco-e-pagamenti-schede.md; voce
  solo nella tendina dell'account) con estratto del mese e riepilogo a 0 € dei mesi gratuiti (mai una
  fattura a zero). La fattura del professionista al cliente la fa lui:
  noi diamo solo i dati chiesti dal cliente, **mai
  nulla all'Agenzia delle Entrate per conto del professionista**. Solo per il
  lavoro occasionale prepariamo un modello di ricevuta già compilato, che il
  professionista controlla, numera e firma come documento suo (decisione di
  Luca del 02/11, docs/changelog/2026-11-02-ricevuta-modello.md); con la
  partita IVA nessuna copia della fattura, la fa col suo programma (decisione
  di Luca del 30/10, docs/changelog/2026-10-30-documenti-snelli.md). L'estratto
  (e a gennaio il riepilogo dell'anno delle ricevute, §390)
  va al commercialista solo con la spunta del professionista.

### Pacchetti di visibilità

- **Boost locale**: prime posizioni nei risultati per categoria + zona, a
  canone mensile o a credito consumato per contatto ricevuto.
- **Badge reputazione**: evidenza per rating alto + tempo di risposta rapido.
- **Storie di successo**: contenuti editoriali per i top professionisti
  (leva marketing/retention, come su miodottore.it).

---

## 7. Strategia go-to-market

1. **Concentrare la liquidità, non disperderla**: lanciare in 1 città con 4
   categorie ad alta frequenza (idraulico, elettricista, pulizie, falegname;
   falegname aggiunto il 24/10/2026 sui volumi di Keyword Planner,
   docs/CHANGELOG.md §303) prima di espandere. Un marketplace con ricerca vuota non converte, a prescindere
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
