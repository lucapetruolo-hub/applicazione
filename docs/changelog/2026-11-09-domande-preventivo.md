# Domande anche in "Richiedi preventivo" e tre domande nuove (09/11/2026)

**Richiesta di Luca:** "controlla la pagina della richiesta preventivo, quando scrivo muffa sul muro mi dà muratore, è corretto? come migliorarlo date le modifiche che abbiamo fatto per la ricerca", poi "sì tutte e tre" e "come muffa sul muro deve essere così anche per tutte le ricerche, valuta quali servono altre domande".

## Decisione

**Modulo `/preventivo`** (`GuidedRequestForm.tsx`), per ogni domanda del dizionario, non solo la muffa:
1. La stessa domanda della ricerca sotto la descrizione, con le risposte da toccare: la risposta sceglie il mestiere.
2. Con una domanda aperta nessun mestiere si sceglie da solo; la riga dice "Può servirti un muratore o un imbianchino: rispondi alla domanda qui sopra o scegli tu." e, senza scelta, l'avviso è "Rispondi alla domanda o scegli una categoria."
3. "Non lo so" sceglie tutti i mestieri proposti (una richiesta ciascuno, il cliente decide tra i preventivi).
Senza domanda resta com'era: il primo mestiere già scelto e "Può servire anche…" per gli altri. I nomi "un muratore", "un imbianchino" e `joinWithOr` ora stanno in `lib/problemChoices.ts`, usati da modulo e ricerca.

**Tre domande nuove** (`packages/shared/src/problemMatch.ts`). Controllo sulle 719 frasi del banco (`analisi/abbinamento-problema/frasi/frasi-etichettate.csv`): 178 hanno due mestieri vicini (il secondo ad almeno metà punti del primo, la soglia per fare una domanda); le coppie più frequenti (caldaie/idraulico 38, imbianchino/muratore 21, idraulico/muratore 14, falegname/tuttofare 11) avevano già la loro domanda. Restavano senza domanda, con il primo mestiere spesso sbagliato o due mestieri giusti:
- climatizzazione/elettricista ("la caldaia non riparte dopo che è saltata la corrente", scaldabagno elettrico): "Che cosa non funziona?" → caldaia/climatizzatore, scaldabagno o scaldasalviette elettrico (idraulico), prese/luci/quadro;
- idraulico/tuttofare (box doccia da sigillare): "Perde acqua o vanno collegati dei tubi?";
- fabbro/giardiniere (recinzione): "Di che recinzione si tratta?".
Non fatte: pulizie con muratore/falegname (le frasi dicono già "pulire", serve una parola del dizionario, non una domanda) e coppie con 1-2 frasi.

## Verifica

- Test di `packages/shared` (96) e di `apps/api/src/problem-match` (35) verdi, con i casi nuovi; `typecheck` e `lint` del sito verdi.
- Modulo provato in locale con "muffa sul muro": domanda visibile, nessuna categoria scelta, "Non lo so" sceglie Muratore e Imbianchino.
