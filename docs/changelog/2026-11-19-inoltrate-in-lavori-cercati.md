# Richieste inoltrate in "Lavori cercati" ("Poi in Lavori cercati")

**Richiesta (Luca, 19/11/2026):** "Non possiamo inserire il pulsante che dice
che se neanche loro rispondono va nella pagina che abbiamo creato oggi dei
lavori", poi "Elabora un piano da massimo esperto del settore". Piano scritto
nel thread della bacheca, con la miglioria 1 (numeri in Admin).

**Cosa cambia**
- *Modulo della richiesta, ultimo passo:* sotto "Inoltra se non risponde"
  compare "Poi in Lavori cercati", già acceso: "Se nessuno ti manda un
  preventivo neanche dopo l'inoltro, dopo 2 giorni la mostriamo anche ai
  professionisti non ancora iscritti. Senza nome, foto e indirizzo." Solo con
  l'inoltro acceso, mai per le urgenti né dal link personale del
  professionista. Usa lo stesso stato di "Mostra in Lavori cercati"
  (`boardAllowed`).
- *Database:* colonna nuova `GuidedRequest.boardAfterForward` (migrazione
  additiva `20261119180000_bacheca_dopo_inoltro`), vera per le richieste
  dirette con l'inoltro acceso e non urgenti inviate da oggi: le richieste
  dirette di prima non entrano in bacheca, perché il cliente non ha visto
  l'interruttore.
- *Giro orario (`publishNew`):* oltre alle generali entra una richiesta
  diretta con `boardAfterForward`, già inoltrata e senza preventivi attivi,
  48 ore dopo l'inoltro, o subito se l'inoltro non ha trovato nessun altro
  professionista (nessun lead dell'inoltro). Restano tutte le altre regole
  (non urgente, non tolta dal cliente, mai gli account di prova, mai dal link
  personale). Chi l'ha già ricevuta non la rivede in Oggi né nell'avviso.
- *Riassunto dell'IA:* toglie anche i nomi di ditte e professionisti, così il
  nome del professionista scelto non compare mai.
- *Le mie richieste:* "Togli dai lavori cercati" / "Mostra in Lavori cercati"
  anche su queste richieste.
- *Admin, Richieste da seguire:* "Risposte su richieste inoltrate" e
  "Preventivi su richieste inoltrate", per capire se l'inoltro rende.
- *Termini (punto 3) e Privacy (punto 3, lettera g):* aggiunte le richieste
  inoltrate; una riga in più nella versione dei Termini del 19/11 (prima del
  lancio, nessun avviso). Rientra nella domanda L16 per l'avvocato.

**Motivo:** una richiesta a un professionista scelto che non risponde
nessuno, neanche dopo l'inoltro, resta senza preventivi: la bacheca la fa
vedere a chi non è ancora iscritto e ai professionisti tra il loro raggio e i
100 km.

**Verifica:** typecheck di API e sito, lint, prove di `request-board`,
`problem-match` e `guided-requests` (nuove prove sulle condizioni del giro
orario in `request-board-client.test.ts`).
