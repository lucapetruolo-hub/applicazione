# Pagina "Le mie richieste" bloccata dopo archivia e ripristina

**Richiesta** (Luca, 10/11/2026, da iPhone con Safari): "Quando archivio e
disarchivio non riesco più ad interagire con la pagina". La foto mostrava
"Nessuna richiesta in questa sezione · Cambia filtro per vedere le altre
richieste" senza schede né filtri.

**Causa**: con una sola richiesta in tutto la pagina nasconde schede di stato
e filtri (docs/CHANGELOG.md §336). Archiviandola le schede ricompaiono; con
"Vedi archiviate" si apre "Archiviate"; con "Ripristina" la richiesta torna
l'unica non archiviata e schede e filtri spariscono di nuovo, ma la scheda
scelta restava "Archiviate". L'elenco filtrato era vuoto e non c'era più
niente da toccare per cambiare scheda: non era uno strato sopra la pagina,
era un filtro rimasto acceso e invisibile. Succedeva anche su Android e
computer, non solo su Safari. Nata con la sesta scheda "Archiviate" in vista
(docs/changelog/2026-11-10-richieste-archiviate.md).

**Decisione**:
- Con schede e filtri nascosti l'elenco non applica nessun filtro rimasto
  da prima (scheda, zona, modalità, ricerca): mostra sempre l'unica richiesta.
- Ripristinata l'ultima archiviata, la pagina torna da sola su "Tutte", dove
  il messaggio "Richiesta ripristinata: la trovi di nuovo in Tutte" dice
  proprio quello. Vale anche per "Richieste e lavori" del professionista,
  dove prima restava una scheda "Archiviate" vuota. Scatta solo nel
  passaggio da almeno una a zero archiviate: aprire "Archiviate" già vuota
  la lascia aperta. `apps/web/src/lib/useLeaveEmptyArchive.ts`.

**Verifica**: nuova prova `e2e/tests/iphone-richiesta-unica-archiviata.spec.ts`
(motore di Safari, iPhone 14) e la stessa su Android in
`e2e/tests/richieste-archiviate.spec.ts` (passi comuni in
`e2e/fixtures/archiviate.ts`): archivia l'unica richiesta, "Vedi archiviate",
"Ripristina", poi la richiesta deve essere in vista e il suo menu deve
aprirsi. Con il codice di prima la prova WebKit falliva (scheda sparita),
con la correzione passa. Le prove con più richieste ora controllano anche il
ritorno a "Tutte" dopo l'ultimo ripristino, per cliente e professionista.
Rifatte in locale tutte le prove che aprono le due pagine (77 passate).
