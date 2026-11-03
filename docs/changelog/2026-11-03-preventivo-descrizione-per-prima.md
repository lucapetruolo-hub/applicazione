# Richiedi preventivo: prima la descrizione, poi le categorie suggerite

**Richiesta** (Luca, 03/11/2026): in "Richiedi preventivo" mettere per primo
"Descrivi il lavoro" per suggerire le categorie adatte, e sulla casella la
stessa luce del campo "Cosa è successo?" della home.

**Decisione**:
- `GuidedRequestForm`, passo 1: "Descrivi il lavoro" è il primo campo, con la
  luce della home (`.guided-description-input` in `globals.css`: due giri
  all'apertura, verde pieno mentre si scrive, ferma per chi chiede meno
  animazioni).
- Sotto, **tutte le categorie sempre in vista** (scelta di Luca dopo la
  prima versione, che le chiudeva sotto "Cambia o aggiungi una categoria"),
  con la categoria proposta dalla descrizione **già scelta** e una riga "Ti
  suggeriamo …: è già scelta", perché la tessera può essere più in basso (le
  tessere non si riordinano, §324). Proposta: mentre si scrive il dizionario
  (`matchProblem`, gratis e immediato); uscendo dal campo lo stesso
  `POST /problem-match` della ricerca, con l'intelligenza artificiale nei
  dubbi (una chiamata per descrizione, non una per lettera, così "Mestieri
  richiesti" non si riempie di frasi a metà). "Proposta automatica. Come
  funziona" come nella ricerca quando risponde l'IA. Descrizione non capita:
  "Non abbiamo capito chi ti serve: sceglilo tu."
- Toccata una categoria a mano, o arrivata dal link (profilo, pagina del
  mestiere, ricerca per problema, "Ripeti la richiesta"), la descrizione non
  cambia più la scelta.
- Avviso "Prima di tutto la sicurezza" sotto la casella, lo stesso della
  ricerca (`SafetyNotice` di `ProblemBand`).
- Con un professionista scelto (o più scelti dalla ricerca) nessuna
  categoria da scegliere, come prima: la descrizione resta comunque prima.
- `problemMatchFromDictionary` in `packages/shared`: la risposta del solo
  dizionario, una sola per API, ricerca e modulo (prima era ripetuta).

**Verifica**: `e2e/tests/richiesta-preventivo.spec.ts` (descrizione prima
delle tessere, tutte le tessere in vista, proposta già scelta che segue il testo, scelta a mano che
resta, categoria del link che resta, gas, descrizione non capita), le altre
prove della richiesta e i test dell'API su `problem-match`. Foto da telefono
e computer in `preventivo-descrizione/` della cartella del progetto.

## Secondo giro (03/11/2026, richieste di Luca)

- **"A domicilio / Online" è la prima scelta** del modulo, sopra la
  descrizione: un tocco, già su "A domicilio", e decide il resto.
- **La tessera suggerita va in cima all'elenco** (`CategoryTiles`, prop
  `first`): si sposta solo quando cambia il suggerimento, non a ogni tocco.
- **Due esempi da toccare sotto la casella** ("Il rubinetto perde", "Salta la
  corrente", riconosciuti con sicurezza dal dizionario): il tocco scrive il
  testo e lascia il cursore in fondo per continuare. Solo con il campo vuoto e
  senza una categoria di partenza (con "Imbianchino" già scelto un esempio da
  idraulico confonderebbe).
- **Admin "Mestieri richiesti"**: quante richieste di preventivo tengono la
  categoria proposta e quante la cambiano, con le sostituzioni più frequenti
  (dicono quale parola insegnare al dizionario). Nuova colonna
  `GuidedRequest.suggestedCategorySlug` (migrazione
  `20261103180000_categoria_suggerita`), solo sulla prima richiesta di un
  invio; conta dal lancio e senza account di prova (§395).
- **Ricerca per problema: prima chi fa proprio quel lavoro.** Con
  `?problema=` la ricerca (`GET /professionals/search?problema=`) confronta la
  descrizione con le prestazioni dei professionisti
  (`serviceMatchingProblem` in `packages/shared`: almeno una parola non
  generica in comune, "rubinetto" e "Sostituzione rubinetto"); chi ce l'ha va
  prima e la scheda la mostra con il suo prezzo, come per "Quanto costa"
  (`matchedServiceId`). Il boost resta fuori (§392).

**Verifica**: prove nel browser nuove (scelta per prima, esempi, tessera in
cima, niente esempi con una categoria di partenza), test di
`serviceMatchingProblem` e `suggestionOutcomes`.

## Terzo giro: "Potrebbero fare anche questo lavoro" (03/11/2026)

**Richiesta** (Luca): nella ricerca per problema mostrare anche chi fa quella
prestazione ma è di un'altra categoria, con il titolo al condizionale.

**Decisione** (consiglio approvato da Luca): sezione a parte sotto i
risultati, "Potrebbero fare anche questo lavoro" (`AlsoDoThisJob`), al massimo
3 professionisti. La prestazione trovata deve essere, per il dizionario, proprio
del mestiere scelto ("Sostituzione rubinetto" è da idraulico, "Pulizia cucina"
no): una parola in comune come "cucina" non basta. Mai con l'avviso di
sicurezza (impianti solo da imprese abilitate, DM 37/2008). Le richieste a
tutti restano per categoria: questi si contattano solo dal profilo, che parte
con la prestazione già scritta. Boost fuori. La riga "Perché" delle schede usa
la stessa prestazione trovata dalla ricerca.

**Verifica**: `e2e/tests/prestazioni-problema.spec.ts` (ordine, sezione,
pulizie escluse, niente sezione con il gas, scheda in Admin).
