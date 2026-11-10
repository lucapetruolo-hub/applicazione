# Barra di ricerca in HTML semplice ed esempi della home pronti subito

**Richiesta** (Luca, 10/11/2026, thread "Velocizzare home, città e profilo",
"si" alle due migliorie proposte dopo `2026-11-10-pulsanti-senza-tamagui.md`):

1. fare la barra di ricerca (`SearchBar`), l'ultima parte delle pagine
   pubbliche ancora in Tamagui, senza nessun cambiamento visibile;
2. far funzionare gli esempi della home ("Prova:", "O scrivi solo chi
   cerchi:") anche se toccati prima che la pagina sia pronta: prima quel tocco
   non faceva nulla, e la prova del browser in CI
   (`barra-preventivo.spec.ts`) a volte falliva per questo.

## Decisione

- **`SearchBar.web.tsx`** e **`Autocomplete.web.tsx`** (solo sito), con
  `SearchBar.module.css` e `Autocomplete.module.css`: `div`/`span`/`label`/
  `input` con le classi globali di Tamagui, come le PR prima. Resa piena
  (home, risultati da telefono), pillola della barra in alto con il piccolo
  menu "A domicilio / Online", elenco dei suggerimenti, "Vicino a me",
  titoletti dell'elenco.
- **Logica comune con l'app** in due file nuovi, così sito e app non si
  separano:
  - `searchBarModel.ts`: tipi, schede del modo, campo città, stato e azioni
    della barra (`useSearchBar`);
  - `autocompleteModel.ts`: filtro, frecce/Invio/Esc, chiusura al clic fuori,
    annuncio per i lettori di schermo (`useAutocomplete`).
  `SearchBar.tsx` e `Autocomplete.tsx` dell'app ora li usano e disegnano come
  prima.
- **Stessi attributi di prima**: campo con `role="combobox"`, `name="Input"`,
  `data-disable-theme`, `aria-labelledby` verso l'etichetta; dentro lo stesso
  `span` del tema dei campi (`t_light_Input`), che dà colori, bordo e anello
  del fuoco da `tamagui.css`. Dove Tamagui ripeteva la classe quattro volte
  (bordi, margini interni, posizione dell'elenco), qui lo stesso: le regole di
  `globals.css` (`.search-pill-input`, `.guided-city`, `.hero-problem-input`)
  vincono o perdono come prima.
- **Misure del campo** "3", "4" e "5" (le sole usate): il tipo
  `AutocompleteSize` ora elenca solo quelle, quindi `pnpm typecheck` segnala
  una misura nuova da aggiungere in `Autocomplete.module.css`.
- **Esempi della home**: le due righe stanno in un modulo vero
  (`<form action="/cerca" method="get">`). Prima che la pagina sia pronta un
  tocco apre `/cerca?problema=…` (frasi) o `/cerca/<mestiere>` (mestieri);
  dopo, il tocco cerca come sempre, con la città scritta e le luci
  dell'attesa. Aspetto identico.

## Verifica

- **Elemento per elemento** (tag, attributi, misure e stili calcolati, da
  computer e da telefono), sito prima e dopo accesi insieme, tutto identico:
  - home: a riposo, elenco aperto a campo vuoto, problema scritto (elenco
    nella pagina da telefono), voce scelta con le frecce, città con "Vicino a
    me" e con un comune scritto, scheda "Online";
  - pillola della barra in alto: a riposo, menu aperto, elenchi aperti;
  - ricerca in cima ai risultati da telefono, aperta;
  - campi città degli altri moduli (richiesta di preventivo, account,
    profilo, admin, "Le mie richieste") su una pagina di prova non salvata
    con ogni variante, anche con l'elenco aperto;
  - stati forzati (mouse sopra, premuto, fuoco da tastiera e dopo un clic) di
    schede, menu, voci dell'elenco, campi ed etichette: identici.
  Unica differenza: gli esempi della home sono dentro un `form` e sono
  pulsanti di invio, come voluto.
- **Comportamento uguale** sui due siti: frecce e Invio, Esc, clic fuori,
  clic su una voce (il cursore passa a "Città"), schede con Invio, menu della
  pillola (clic fuori, Esc, scelta da tastiera che aggiorna i risultati),
  "Cerca" con problema e città, esempi e mestieri toccati a pagina pronta.
  Con JavaScript spento solo il sito nuovo apre la ricerca dagli esempi; c'è
  una prova nuova in `barra-preventivo.spec.ts`.
- `confronto-pagine` su 100 foto: 96 identiche, le altre con 23-140 pixel di
  bordo sfumato di riquadri lontani dalla barra (filtri, scelte dei mestieri).
- Misure in locale, telefono col processore 4 volte più lento, prima e dopo a
  ordine alternato, mediana di 12 giri, blocco (TBT):
  - home: 969 → 550 ms;
  - città (`/cerca/idraulico/latina`): 586 → 588 ms, uguale (da telefono la
    barra lì è chiusa nel riassunto).
- `pnpm lint`, `pnpm typecheck` (sito, `packages/ui`, app, e2e), test di
  `packages/ui`, `npx expo export --platform android`: tutti ok.
