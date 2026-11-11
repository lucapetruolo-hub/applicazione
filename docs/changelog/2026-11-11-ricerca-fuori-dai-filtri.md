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
in una riga sua). 
**Migliorie approvate da Luca** (stesso giorno, dopo la prima versione):
- lente a sinistra nella casella e una X per cancellare quello che si è
  scritto (area di tocco 44 × 44 px, il cursore resta nella casella; anche
  Esc cancella), componente unico `apps/web/src/components/RequestSearchField.tsx`;
- con una ricerca senza risultati: "Nessuna richiesta trovata", la parola
  cercata e il pulsante "Cancella ricerca" (prima diceva "Cambia filtro");
- stessa riga casella + "Filtri" anche nelle richieste del professionista da
  telefono, con la scelta A domicilio/Online spostata dentro "Filtri" come per
  il cliente. Da computer lato professionista nulla cambia;
- (secondo giro) la ricerca non bada a maiuscole, accenti e apostrofi curvi
  ("perdità" trova "Perdita", "d'acqua" trova "d’acqua") e la parola trovata
  è evidenziata in giallo chiaro (#FFE58A, testo scuro leggibile) nel titolo e
  nella riga mestiere/città delle schede, cliente e professionista; con la
  parola nel titolo il titolo si legge intero invece che su una riga
  (`apps/web/src/lib/requestSearch.tsx`).

**Verifica**: prova nel browser `e2e/tests/ricerca-richieste-telefono.spec.ts`
(telefono e computer: casella visibile senza aprire Filtri, scrivere filtra
l'elenco, da telefono stessa riga e stessa altezza di "Filtri", nessuna
seconda casella nel pannello, X e "Cancella ricerca", accenti, parola evidenziata, riga del professionista); foto in `anteprime/ricerca-fuori-filtri/`.
