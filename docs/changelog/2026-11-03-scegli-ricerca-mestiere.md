# "+ Scegli" anche nella ricerca per mestiere

**Richiesta di Luca (03/11/2026):** far scegliere più professionisti con
"+ Scegli" anche quando si cerca un mestiere (per esempio "Idraulico a
Latina"), come già succede cercando con la descrizione del problema.

**Decisione:** le pagine `/cerca/[categoria]`, `/cerca/[categoria]/[citta]` e
quelle per servizio hanno le stesse schede con "Scegli", la stessa barra in
basso ("Chiedi preventivo ai N scelti") e la scelta che resta aprendo un
profilo e tornando indietro (2026-11-03-scelti-restano.md). Servono almeno
due professionisti nei risultati, come per il problema. Qui non c'è una
frase di partenza: il modulo della richiesta si apre con la descrizione
vuota e il cliente la scrive lì (`chosenRequestHref` non mette più
`descrizione=` quando è vuota).

**Come:** la logica della scelta è passata da `CercaContent` a un hook
comune, `apps/web/src/lib/useChosenPros.ts`, usato anche da
`CategoryContent`. Le pagine per servizio hanno una scelta a parte da quella
del solo mestiere nella stessa città.

**Verifica:** `e2e/tests/scelti-restano.spec.ts`, nuovo caso sulla pagina
"Idraulico a Latina" (scelta di due, profilo e ritorno, link alla richiesta
con `scelti=` e senza descrizione), su telefono e computer.
