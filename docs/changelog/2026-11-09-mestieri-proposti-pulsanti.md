# Mestieri proposti ben visibili nei risultati del problema (09/11/2026)

**Richiesta di Luca:** "mi sembra che sul sito ne propone solo uno?" (IA e dizionario danno fino a 3 mestieri), poi "sì" alla proposta di mostrarli come pulsanti in alto con quanti professionisti, "e controlla anche le richieste preventivo se ne seleziona solo una di categorie o due".

## Decisione

- **Ricerca per problema** (`/cerca?problema=`): quando i mestieri adatti sono più di uno, in cima alla banda c'è un pulsante per ciascuno con quanti professionisti ci sono (es. "Idraulico 12", "Muratore 5"); il primo è già scelto (pieno, `aria-current`), toccando un altro si vedono i suoi professionisti. Prima gli altri erano solo nella riga piccola "Oppure:", tolta. I numeri vengono dalla stessa ricerca di tutti i professionisti della zona che già serviva a "Potrebbero fare anche questo lavoro" (nessuna chiamata in più); per il mestiere scelto il numero è quello dei risultati. Elenco unico per mestiere: i mestieri non si mescolano, perché il cliente deve sapere a chi chiede il preventivo. Codice: `ProblemBand.tsx` (`CategoryChoice`), `lib/problemChoices.ts`, `app/cerca/page.tsx`.
- **Richiedi preventivo**: si sceglie da solo solo il primo mestiere proposto (ogni mestiere in più è una richiesta separata a più professionisti, quindi non si aggiunge senza che il cliente lo voglia). Gli altri proposti erano già in cima alle tessere ma senza dirlo: ora la riga sotto "Categorie" aggiunge "Può servire anche Muratore: toccala per aggiungerla." (`GuidedRequestForm.tsx`).

## Verifica

- `typecheck` e `lint` del sito verdi.
- Pagina provata in locale con risposte finte (idraulico e imbianchino): due pulsanti con i numeri, il secondo porta a `&mestiere=imbianchino`.
