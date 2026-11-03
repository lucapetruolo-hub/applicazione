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
