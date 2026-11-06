# Mestieri "Elettrodomestici" e "Tende da sole e zanzariere", dizionario addestrato sulle ricerche più frequenti

**Richiesta di Luca (06/11/2026)**, thread "Trovare i servizi più cercati che
mancano" (analisi in `/mnt/project-files/analisi/servizi-piu-cercati.md`):
"aggiungi mestiere elettrodomestici", "e addestra dizionario"; poi, su
"Potrebbero fare anche questo lavoro": "non facciamo comparire fino a 3 ma
tutti quelli che la fanno in ordine standard".

**Perché**: la riparazione degli elettrodomestici è il primo lavoro senza
categoria nelle 769 frasi dei clienti (22 frasi), è tra i "più richiesti" di
ProntoPro e in Italia si cerca 1.000-10.000 volte al mese (Keyword Planner del
06/11/2026). Finora chi scriveva "la lavatrice non scarica" finiva in "fuori
servizio" e vedeva solo chi aveva scritto la prestazione.

**Decisione**:
- Mestiere nuovo `elettrodomestici` ("Elettrodomestici") in
  `PROFESSIONAL_CATEGORIES`: specializzazioni lavatrici e lavastoviglie,
  frigoriferi e congelatori, forni e piani cottura; 8 prestazioni suggerite
  (lavatrice, lavastoviglie, frigorifero, forno, asciugatrice, piano a
  induzione, microonde, cappa) con le loro varianti in `serviceNames.ts`;
  icona (lavatrice), colore acciaio smaltato (contrasto 7:1), menu "Lavori e
  manutenzione", testi delle pagine, frasi d'esempio, codice Stripe 7629.
  La categoria entra nel database da sola all'avvio (`CategoriesSeedService`).
  Foto della scheda in home: vedi "Foto delle schede" sotto.
- "Riparazione elettrodomestici" resta anche tra le prestazioni di
  Elettricista e Tutto Fare, per chi fa anche quel lavoro.
- Dizionario (`problemMatch.ts`): un guasto con un elettrodomestico nominato
  (anche solo la marca, se non fa caldaie) va al mestiere nuovo con 10 punti,
  non più "fuori servizio"; installarlo resta a idraulico, elettricista e
  Tutto Fare. Nomi di mestiere: tecnico elettrodomestici/lavatrici/frigo,
  riparatore, centro assistenza. Tolto `elettrodomestici` dai lavori fuori
  servizio e dal testo per l'intelligenza artificiale; le parole insegnate in
  Admin come "fuori servizio: elettrodomestici" ora portano al mestiere.
- Dizionario, altre ricerche frequenti che non capiva: tetto, tegole, coppi,
  lattoniere → Muratore; svuota cantine → Traslochi; stiratura → Pulizie;
  montatore (di mobili) → Tutto Fare.
- Banco di prova: le 22 frasi segnate "fuori servizio: elettrodomestici" ora
  hanno il mestiere `elettrodomestici` (S149 e S158 lo hanno come secondo).
- "Potrebbero fare anche questo lavoro" (`/cerca?problema=...`): tutti i
  professionisti di altri mestieri che offrono quel lavoro, nell'ordine della
  ricerca, non più al massimo 3. `serviceMatchingProblem` riconosce
  "Riparazione elettrodomestici" quando il cliente nomina un elettrodomestico.

## Secondo giro (stesso giorno): tende da sole e marche

**Richiesta di Luca**: "si" alle migliorie proposte dopo la PR: categoria
"Tende da sole e zanzariere", marche più cercate per gli elettrodomestici, foto
della scheda, le altre prestazioni del documento (queste in una PR dopo).

**Perché**: "tende da sole latina" ha 100-1.000 ricerche al mese, come
l'idraulico; in Italia 10.000-100.000 (Keyword Planner del 06/11/2026).

**Decisione**:
- Mestiere `tende-da-sole` ("Tende da sole e zanzariere"): specializzazioni
  installazione, riparazione, zanzariere; 7 prestazioni (tende, telo,
  pergotenda, zanzariere) con varianti; icona, colore sabbia (contrasto 6:1),
  menu "Casa e famiglia", testi, frasi d'esempio, codice Stripe 1799. Niente
  motorizzazione tra le prestazioni: collegare un motore è dell'elettricista
  (DM 37/2008).
- Dizionario: tende da sole, pergotende, tende a bracci/caduta, telo della
  tenda, tendista → mestiere nuovo (non più "fuori servizio"); "zanzariere"
  va prima al mestiere nuovo, il Tutto Fare resta tra i possibili e compare in
  "Potrebbero fare anche questo lavoro" con "Montaggio zanzariere". Banco di
  prova: le 7 frasi "tende da sole" e le 8 frasi sulle sole zanzariere ora
  hanno il mestiere nuovo (le zanzariere con Tutto Fare come secondo).
- Pagina Elettrodomestici di ogni città: domanda frequente "Su quali marche
  intervengono i tecnici?" con le marche più cercate
  (`APPLIANCE_BRANDS_SEARCHED`), senza dire che siamo partner di nessuna.

## Foto delle schede in home

**Richiesta di Luca**: "1 e tende-1" tra le foto proposte, con le migliorie
"ritagliarla sul tecnico" e "cancellare le foto non sicure".

**Decisione**: Tende da sole con la foto Pexels 18348172 (balconi con tende a righe),
centrata sul balcone giallo. Elettrodomestici con la foto Pexels 34734504
(tecnico che ripara una lavastoviglie) in verticale: il primo taglio
orizzontale sul solo tecnico a Luca non andava ("voglio si veda
l'elettrodomestico"); ora si vedono persona e lavastoviglie, senza il
cartello in cirillico e senza le scritte di tuta ed etichetta, tagliata sotto
il volto ("fai in modo che non si vede il volto"). Scartate tre foto di Pixabay: TinEye le trova in
vendita dal 2018 su Shutterstock e Adobe Stock, caricate su Pixabay da altri.
Il loader delle immagini e `scripts/riduci-foto-mestieri.mjs` accettano ora
anche nomi con il trattino (`tende-da-sole`), prima solo lettere.

Coordinata con `2026-11-06-fotovoltaico.md` (PR #250, stessi file): questa
parte dal suo ramo e non tocca fotovoltaico, accumulo e wallbox.

**Verifica**: prove di `packages/shared` (nuovi casi per gli elettrodomestici
e per tetto/svuota cantine/stiratura/montatore, banco di prova con le soglie
di sempre), prove dell'API, typecheck e lint; prova nel browser
`e2e/tests/prestazioni-problema.spec.ts` con un caso nuovo (tecnico di
lavatrici in cima e 4 professionisti di altri mestieri nella sezione), su
telefono e computer. Foto in `/mnt/project-files/analisi/mestiere-elettrodomestici/`.
