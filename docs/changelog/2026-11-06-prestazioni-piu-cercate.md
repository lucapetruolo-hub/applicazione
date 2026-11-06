# Prestazioni più cercate: vasca in doccia, caldaia, pompa di calore, condizionatore

**Richiesta di Luca (06/11/2026)**, thread "Trovare i servizi più cercati che
mancano" (analisi in `/mnt/project-files/analisi/servizi-piu-cercati.md`):
"si" alle migliorie dopo la PR #252: le altre prestazioni del documento e il
difetto "serramenti" che trova "serratura".

**Perché**: "vasca in doccia", "installazione caldaia", "pompa di calore" e
"installazione condizionatori" hanno 1.000-10.000 ricerche al mese in Italia
(Keyword Planner del 06/11/2026); "condizionatore" si cerca più di
"climatizzatore", che era la parola usata nei nomi delle prestazioni.

**Decisione**:
- Prestazioni suggerite nuove: "Trasformazione vasca in doccia" (Idraulico e
  Muratore), "Installazione caldaia" (anche in Climatizzazione e caldaie),
  "Installazione pompa di calore" (Climatizzazione e caldaie).
- "Sostituzione caldaia" diventa "Installazione caldaia"; "Installazione",
  "Ricarica gas" e "Pulizia filtri" usano "condizionatore" al posto di
  "climatizzatore". I nomi di prima restano varianti
  (`serviceNames.ts`), quindi le prestazioni già salvate dai professionisti
  contano nella stessa voce.
- Ricerca delle prestazioni (`serviceSearch.ts`, `sameServiceWord`): due
  parole intere sono la stessa solo se la più corta cambia al massimo
  nell'ultima lettera. Prima bastavano le prime cinque lettere, e
  "serramenti" trovava "Riparazione serratura", "elettrodomestici" trovava
  "elettrico". Resta la parola scritta a metà ("rubinet").

**Verifica**: prove di `packages/shared` con `serviceSearch.test.ts` nuovo
(serramenti/serratura, plurali, le quattro ricerche), prove dell'API,
typecheck e lint.
