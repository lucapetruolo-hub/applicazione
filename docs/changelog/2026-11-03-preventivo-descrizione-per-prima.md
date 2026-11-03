# Richiedi preventivo: prima la descrizione, poi le categorie suggerite

**Richiesta** (Luca, 03/11/2026): in "Richiedi preventivo" mettere per primo
"Descrivi il lavoro" per suggerire le categorie adatte, e sulla casella la
stessa luce del campo "Cosa è successo?" della home.

**Decisione**:
- `GuidedRequestForm`, passo 1: "Descrivi il lavoro" è il primo campo, con la
  luce della home (`.guided-description-input` in `globals.css`: due giri
  all'apertura, verde pieno mentre si scrive, ferma per chi chiede meno
  animazioni).
- Sotto, "Ti serve" con le categorie proposte dalla descrizione: mentre si
  scrive il dizionario (`matchProblem`, gratis e immediato); uscendo dal campo
  lo stesso `POST /problem-match` della ricerca, con l'intelligenza
  artificiale nei dubbi (così una chiamata per descrizione, non una per
  lettera, e "Mestieri richiesti" non si riempie di frasi a metà). La prima
  proposta è già scelta; le altre accanto, da toccare per aggiungerle.
  Riga "Proposta automatica" come nella ricerca quando risponde l'IA.
- Elenco completo chiuso sotto "Cambia o aggiungi una categoria" ("Scegli tu
  la categoria" prima di scrivere). Si apre da solo se la descrizione non fa
  capire il mestiere o se si va avanti senza categoria.
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
delle tessere, proposta già scelta che segue il testo, scelta a mano che
resta, categoria del link che resta, gas, descrizione non capita), le altre
prove della richiesta e i test dell'API su `problem-match`. Foto da telefono
e computer in `preventivo-descrizione/` della cartella del progetto.
