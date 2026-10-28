# Area "Fisco e pagamenti" a schede

**Richiesta** (Luca, 28/10/2026): i due link "Fatture e documenti" e
"Riepilogo annuale dei compensi (DAC7)" in fondo a Dati fiscali e pagamenti
devono diventare "due sottomenu selezionabili", non stare lì in fondo; poi
la versione più profonda del compito (`analisi/fatture-dac7-menu-versione-profonda.md`
nei file del progetto): riordinare tutta l'area dei soldi, confrontare
schede in cima e voci nel menu, un nome che un artigiano capisca al posto di
"DAC7", nessun indirizzo delle email cambiato, un test ad albero simulato.

**Prima**: le pagine sui soldi erano sparse in quattro posti. "Abbonamento"
nel menu laterale; "Dati fiscali e pagamenti" solo nella tendina
dell'account, con i pagamenti online in fondo alla stessa pagina
(`#pagamenti-online`); "Fatture e documenti" senza nessuna voce di menu
(si arrivava da Dati fiscali, da Abbonamento e dalle email, §378); il
riepilogo DAC7 solo dal link in fondo a Dati fiscali o dall'email di
gennaio (§246). Nessuna delle quattro pagine faceva vedere le altre.

**Inventario degli ingressi** (tutti invariati): email a `/dashboard/fiscale`
(8: dati bancari, attiva i pagamenti, Stripe attivo, promemoria DAC7,
IBAN diverso, dati su Stripe, codice fiscale non valido, dati fiscali),
a `/dashboard/documenti` (2: documenti del mese, documenti da sistemare),
a `/dashboard/fiscale/dac7` (1: comunicazione DAC7); notifiche in app
(`notificationSections.ts`); ritorno da Stripe
(`/dashboard/fiscale?stripeConnect=`); percorso "Completa il profilo"
(`PAYMENTS_ANCHOR`); link da Abbonamento, dalle schede delle richieste, dal
riepilogo dei bonifici e da `/per-professionisti/pagamenti`.

**Confronto** (dettaglio e test ad albero simulato con 5 professionisti e 3
compiti in `analisi/fatture-dac7-menu/test-ad-albero.md`): voci sotto il
menu laterale avrebbero superato il tetto delle 8 voci (§334) e, con il
menu ridotto a icone (fino a 1366 px parte così) o nella barra del
telefono, sarebbero quattro icone senza nome da imparare. Le schede in cima
sono uguali su computer, tablet e telefono, e sono lo schema di Stripe
(Impostazioni → schede), Fatture in Cloud e Airbnb (Account → Tasse). Nel
test simulato: al primo tentativo 14/15 con le schede, 10/15 con le voci nel
menu (che vincono solo col menu aperto su uno schermo grande).

**Decisione**:
- Una sola area **"Fisco e pagamenti"** (titolo `h1`) con quattro schede in
  cima, sempre nello stesso posto: **Dati fiscali** (`/dashboard/fiscale`),
  **Pagamenti online** (`/dashboard/fiscale/pagamenti`, pagina nuova con
  l'attivazione Stripe, l'IBAN e lo stato del conto che prima stavano in
  fondo a Dati fiscali), **Fatture e documenti** (`/dashboard/documenti`,
  invariato) e **Dati DAC7** (`/dashboard/fiscale/dac7`).
  `FiscoArea`/`FiscoTabs` in `apps/web/src/components/fisco/FiscoArea.tsx`,
  stili `.fisco-tabs` in `globals.css`. Sono collegamenti tra pagine, quindi
  `nav` con `aria-current="page"`, non un `tablist`; sul telefono la riga
  scorre e sfuma a destra finché c'è altro; area da toccare 44 px.
- La voce della tendina dell'account diventa "Fisco e pagamenti"
  (`alsoMatches: ["/dashboard/documenti"]`: resta evidenziata su tutte e
  quattro le pagine). Il menu laterale non cambia (8 voci al massimo).
- Il pallino rosso "da completare" del passo facoltativo dei pagamenti
  online resta sulla voce del menu (decisione di Luca, §334) e compare
  anche sulla scheda Pagamenti online: `hasNavAttention` in
  `accountMenuItems.ts` riconosce i passi nelle sottopagine
  (`STEP_MENU_HREF.payments = /dashboard/fiscale/pagamenti`).
- **Il nome della scheda DAC7**: proposto "Compensi al fisco" con la sigla in
  piccolo; Luca ha scelto un generico **"Dati DAC7"** (scheda, titolo della
  pagina ed email di gennaio, "Vedi i dati DAC7", lo stesso indirizzo), la
  stessa sigla del PDF e dell'email. La norma: la direttiva (UE) 2021/514, allegato V,
  sezione III, parte A, punto 3, recepita dal D.Lgs. 32/2023, chiede di
  comunicare al professionista le stesse informazioni mandate all'Agenzia
  delle Entrate **entro il 31 gennaio** dell'anno dopo: per ogni trimestre il
  totale dei compensi, il numero dei lavori, le trattenute e il conto dei
  bonifici, più i dati identificativi. È quello che la pagina e l'email
  già mostrano (§246); il PDF ufficiale resta "Riepilogo annuale dei
  compensi (DAC7)".
- **Nessun indirizzo smette di funzionare**: `/dashboard/fiscale#pagamenti-online`
  e `/dashboard/fiscale?stripeConnect=...` (nei link già in giro) rimandano
  alla scheda Pagamenti online; Stripe torna direttamente lì
  (`return_url`/`refresh_url`); le notifiche in app sui bonifici e sull'IBAN
  aprono quella scheda. Le email nuove su bonifici, IBAN e conto Stripe
  (bonifico non arrivato, attiva i pagamenti, Stripe attivo, IBAN diverso,
  dati da aggiornare su Stripe) portano direttamente a
  `/dashboard/fiscale/pagamenti` (miglioria approvata da Luca); il promemoria
  DAC7 e il codice fiscale non valido restano su Dati fiscali. Le pagine di dettaglio (fattura,
  estratto, mese gratuito) tengono il loro link "← Fatture e documenti".
- Testi: "Dati fiscali e pagamenti" diventa "Fisco e pagamenti" (e
  "scheda Pagamenti online" dove serve) in email, notifiche, PDF del
  riepilogo DAC7, modulo del preventivo e pagina `/per-professionisti/pagamenti`.
  Nel riepilogo dei dati fiscali il titolo e il badge "Verificati" salgono
  accanto al titolo della scheda, così non si ripetono.
- Caricamento: le quattro pagine tengono lo spazio del contenuto mentre
  caricano (niente salto, CLS 0 come chiesto da Luca al §334).
- In Abbonamento il riquadro "Fatture e documenti" (titolo, descrizione e
  pulsante) diventa una riga con il link e il pulsante "Cambia la carta":
  le fatture hanno ormai la loro scheda.
- Le schede sulle pagine di dettaglio (una fattura, un estratto) restano
  fuori: Luca ha chiesto solo un esempio visivo
  (`anteprime/fatture-dac7-menu/esempio-schede-dettaglio.png`).

**Verifica**: `typecheck` di sito, API e prove; `lint`; prova nel browser
`e2e/tests/fisco-schede.spec.ts` (le quattro schede su ogni pagina, quella
aperta segnata, tastiera, i vecchi indirizzi, la tendina, axe senza errori);
`confronto-pagine` fotografa anche `/dashboard/fiscale/pagamenti` e
`/dashboard/documenti` (e aspetta il caricamento con `load`, poi la rete
calma solo se arriva: su `/chat` la connessione degli eventi resta aperta e
la foto del telefono usciva tagliata); Lighthouse in CI
(`e2e/lighthouse/agenda.mjs`) misura anche le quattro schede; anteprime da computer (1440 e 1280 col menu
ridotto), tablet e telefono in `anteprime/fatture-dac7-menu/`.
