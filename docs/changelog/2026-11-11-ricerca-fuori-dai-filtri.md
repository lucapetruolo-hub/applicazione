# Ricerca delle richieste fuori dal pannello "Filtri"

**Richiesta** (Luca, 11/11/2026, foto da iPhone di "Le mie richieste" con il
pannello Filtri aperto): "La casella della ricerca mettila all'esterno". Da
telefono la casella "Cerca in ogni campo della richiesta..." stava dentro
"Filtri" (scelta del §349 per non avere tre file di controlli): per cercare
servivano due tocchi e la tastiera copriva il pannello.

**Decisione**: da telefono la casella sta sulla pagina, nella stessa riga del
pulsante "Filtri" (casella larga, "Filtri" compatto a destra, stessa
altezza), con il testo corto "Cerca nelle richieste..." e il tasto "Cerca"
sulla tastiera. Così resta sempre a vista senza aggiungere una fila di
controlli. Nel pannello "Filtri" resta solo la scelta A domicilio/Online,
"Mostra", ordine e zona. Da computer nulla cambia (la casella era già fuori,
in una riga sua). Lato professionista la casella era già fuori.

**Verifica**: prova nel browser `e2e/tests/ricerca-richieste-telefono.spec.ts`
(telefono e computer: casella visibile senza aprire Filtri, scrivere filtra
l'elenco, da telefono stessa riga e stessa altezza di "Filtri", nessuna
seconda casella nel pannello); foto in `anteprime/ricerca-fuori-filtri/`.
