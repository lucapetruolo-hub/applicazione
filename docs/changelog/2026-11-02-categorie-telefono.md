# Categorie in home da telefono: "Mostra altre N categorie" sotto le schede

**Richiesta esplicita dell'utente** (02/11/2026, thread "Mostrare tutte le categorie da telefono"): "da cellulare la lista delle categorie quando si è sulla scheda tutti, non si vedono tutti, bisogna sistemare, non si capisce subito come si fanno a vedere tutte le categorie, valuta come un professionista di alto livello la soluzione adatta".

**Problema**: da telefono la sezione "Di cosa hai bisogno?" mostra le prime 6 categorie su 13 (§271). L'unico modo di vedere le altre era il link "Vedi tutte (13)" accanto al titolo, in alto e lontano dalle schede: chi scorre arriva in fondo alle sei schede, trova subito "Non trovi il tuo lavoro?" e crede che l'elenco sia finito.

**Decisione presa** (`CategoryStoryRail.tsx`, regole `.story-show-all` in `globals.css`):
- Il comando si sposta dove finisce lo sguardo: subito sotto l'ultima scheda visibile e prima di "Non trovi il tuo lavoro?", come pulsante vero a tutta larghezza (48 px, bianco con bordo e testo verdi, angoli tondi come i filtri).
- Il testo dice quante categorie mancano: "Mostra altre 7 categorie" (con un filtro scelto il numero cambia; se le categorie sono 6 o meno il pulsante non c'è). Aperto diventa "Mostra meno".
- Tolto il link accanto al titolo (scelta del §271, superata da questa richiesta): due comandi per la stessa cosa confondono.
- Aprendo, le nuove schede entrano piano (220 ms, ferme con "riduci movimento") e il fuoco della tastiera va alla prima comparsa; chiudendo, la pagina segue il pulsante invece di restare in fondo.
- Anche la riga dei filtri ("Tutte", "Casa e impianti"...) sfuma sul bordo dove c'è altro da scorrere (`.scroll-fade`, già usato altrove).
- Da computer nulla cambia: riga da scorrere con le frecce, il pulsante non compare.

**Ordine per professionisti iscritti** (02/11, Luca: "passa già l'ordine in base al numero di professionisti iscritti", "sia in quella lista sia nella lista di registrazione delle categorie"):
- Home: le schede vanno dalla categoria con più professionisti visibili nella ricerca a quella con meno (un professionista conta in ognuna delle sue categorie); a parità resta l'ordine di `PROFESSIONAL_CATEGORIES`. Conteggio fatto dai profili che la home riceve già (`HomeContent.tsx`), nessuna chiamata in più. Vale anche dentro i filtri.
- Scelta dei lavori del professionista (`CategoryMultiPicker`: registrazione, profilo in dashboard e operatore in admin): prima i lavori con più professionisti, al posto dei più cercati (§280). Nuova rotta pubblica `GET /professionals/category-counts` (solo numeri, stessi filtri della ricerca pubblica, senza demo), `orderBy="professionals"` in `CategoryTiles`. La richiesta di preventivo del cliente resta con i più cercati.
- Contano i profili visibili oggi nella ricerca, anche gli account di prova finché sono visibili: è l'ordine che vede chi visita.

**Verifica**: lint e typecheck di `apps/web` e `apps/api`, nuovo test di `getCategoryProfessionalCounts` (una volta per categoria, i più scelti prima, filtri pubblici), rotta aggiunta alle pubbliche in `access-policy.mjs`. Provato nel browser a 390 e 320 px (chiuso e aperto) e a 1366 px; foto prima e dopo in `/mnt/project-files/anteprime/categorie-telefono/`.
