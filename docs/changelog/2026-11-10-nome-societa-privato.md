# Nome da società con "Privato, senza Partita IVA": avviso subito e correzione diretta

**Richiesta** (Luca, 10/11/2026, con una foto di `/dashboard/fiscale`):
"qui c'è un errore". Al passo dell'indirizzo, premendo Salva, compariva in
rosso: "Il nome della tua attività ha la forma di una società (S.R.L.,
S.N.C., S.p.A.): un privato senza partita IVA non può usarla. Cambia il nome
nel profilo, oppure scrivici dalla pagina Contatti se sei un'azienda."

**Causa**: il controllo (collaudo A-11, M-03, `looksLikeCompanyName` in
`packages/shared/src/fiscalCompleteness.ts`) è giusto: il nome del profilo
pubblico era quello di una società e il tipo scelto "Privato, senza Partita
IVA". Ma lo diceva solo il server, all'ultimo clic, dopo aver fatto compilare
tutto, con un testo lungo e senza un modo per correggere: il nome sta nel
profilo, non in questa pagina, e il tipo si cambia solo tornando indietro.

**Decisione**:
- Il sito fa lo stesso controllo appena carica il nome del profilo: con
  "Privato, senza Partita IVA" e un nome da società compare in cima al modulo
  un avviso breve con il nome ("Il nome del tuo profilo, **…**, è quello di
  una società: da privato senza partita IVA non si può usare.") e due
  pulsanti: **Cambia il nome** e **Ho la partita IVA** (apre la scelta del
  tipo; nascosto con Stripe collegato, dove il tipo non si cambia). "Avanti" e
  "Salva" restano spenti finché il conflitto c'è.
- "Cambia il nome" porta a `/dashboard/profilo?campo=nome`: modulo aperto,
  nome selezionato e col fuoco; salvato, si torna a Dati fiscali, dove la
  bozza già scritta (indirizzo compreso) viene ripresa.
- Messaggio del server unico e più corto (`COMPANY_NAME_FOR_PRIVATE_MESSAGE`);
  se arriva comunque (nome cambiato da un'altra scheda), il sito mostra lo
  stesso avviso con i due pulsanti invece della riga rossa. Più corto anche il
  messaggio del profilo pubblico, che ora indica dove cambiare il tipo.

**Verifica**: typecheck di web e api; prova nel browser su un account di prova
(privato con "Luca idraulica S.R.L.") da telefono (iPhone 14) e computer:
avviso al passo 1, "Ho la partita IVA" apre la scelta del tipo, "Cambia il
nome" apre il profilo con il nome selezionato, salvato si torna a Dati fiscali
senza avviso.
