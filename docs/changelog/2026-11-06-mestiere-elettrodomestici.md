# Mestiere "Elettrodomestici" e dizionario addestrato sulle ricerche più frequenti

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
  Foto della scheda in home: da scegliere con Luca, intanto l'icona.
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

Coordinata con `2026-11-06-fotovoltaico.md` (PR #250, stessi file): questa
parte dal suo ramo e non tocca fotovoltaico, accumulo e wallbox.

**Verifica**: prove di `packages/shared` (nuovi casi per gli elettrodomestici
e per tetto/svuota cantine/stiratura/montatore, banco di prova con le soglie
di sempre), prove dell'API, typecheck e lint; prova nel browser
`e2e/tests/prestazioni-problema.spec.ts` con un caso nuovo (tecnico di
lavatrici in cima e 4 professionisti di altri mestieri nella sezione), su
telefono e computer. Foto in `/mnt/project-files/analisi/mestiere-elettrodomestici/`.
