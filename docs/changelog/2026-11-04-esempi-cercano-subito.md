# Esempi della home che cercano subito, numero nella fascia, avviso del massimo

**Richieste di Luca (04/11/2026):**
1. un tocco sugli esempi sotto la ricerca della home ("Prova:" e "O scrivi
   solo chi cerchi:") deve far partire subito la ricerca;
2. dopo aver spostato la mappa i numeri nelle scritte non tornano più;
3. "Chiedi preventivo a tutti": a chi arriva?;
4. un avviso visibile al sesto tocco su "Scegli" (miglioria proposta e scelta).

**Decisioni:**
1. `SearchBar` (`packages/ui`) dà a `footer` anche `searchFor(testo)`, che
   scrive il testo e cerca con la città e il modo già scelti; la home lo usa
   per gli esempi sotto il riquadro. Gli esempi dentro l'elenco del campo
   restano come prima (si sceglie e poi "Cerca").
2. La fascia della ricerca per problema diceva "N professionisti qui sotto",
   ma la lista segue la mappa e il numero no. Ora dice "N professionisti a
   [città]", il numero della ricerca, che non cambia spostando la mappa.
3. "Chiedi preventivo a tutti" apre la richiesta generale per mestiere e
   città, che lo smistamento manda a tutti i professionisti del mestiere il
   cui raggio copre l'indirizzo del cliente (docs/CHANGELOG.md §210): non
   dipende dalla mappa né dalla lista. La fascia ora lo dice: "La richiesta
   arriva a tutti quelli che lavorano nella tua zona".
4. Toccando "Scegli" oltre i 5 compare "Puoi sceglierne al massimo 5." per
   4 secondi sopra la barra dei scelti (e nel profilo al posto di "N scelti
   su 5"), letto anche dai lettori di schermo. Prima c'era solo il
   suggerimento al passaggio del mouse, che sul telefono non si vede.

**Verifica:** `e2e/tests/esempi-home.spec.ts` (frase e mestiere d'esempio
aprono i risultati) e un nuovo caso in `e2e/tests/scelti-restano.spec.ts`
(sesto tocco), su telefono e computer.
