# I professionisti scelti restano tornando dal profilo

**Richiesta** (Luca, 03/11/2026): nei risultati della ricerca dal problema, dopo aver scelto alcuni professionisti con "+ Scegli" e aperto un profilo per vederlo meglio, come si torna indietro tenendo le scelte?

**Prima**: la scelta viveva solo nella pagina dei risultati. Provato sul sito pubblicato (telefono): scelto un professionista, aperto un profilo e premuto indietro, la barra dei scelti spariva e nessuna scheda restava "Scelto". Nel profilo non c'era un modo per tornare ai risultati.

**Decisione**:
- La scelta si salva nella scheda del browser (sessionStorage, nessun cookie), legata alla ricerca: mestiere, città e descrizione (`apps/web/src/lib/chosenProsStore.ts`). Tornando con il tasto indietro, con "Torna ai risultati" o ricaricando la pagina, le schede scelte e la barra in basso tornano come prima. Una ricerca diversa riparte da zero. Un professionista che non è più nei risultati non resta tra i scelti.
- Il profilo aperto da quei risultati (`?scelta=1`) mostra in cima "← Torna ai risultati", quanti sono già scelti ("2 scelti su 5") e lo stesso pulsante "Scegli"/"Scelto" delle schede (`ProfileChoiceStrip`). Con almeno un professionista scelto, la barra in basso del profilo è quella dei risultati ("Chiedi preventivo ai N scelti") al posto di quella del solo professionista; il pulsante "Richiedi un preventivo a ..." nella pagina resta.

**Verifica**: prova nel browser `e2e/tests/scelti-restano.spec.ts` (telefono e computer): due scelti, profilo, indietro del browser, scelta dal profilo, "Torna ai risultati", ricerca nuova che riparte da zero. Typecheck e lint del sito puliti.
