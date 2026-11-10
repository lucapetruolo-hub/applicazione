# Barra in alto in HTML semplice, senza il calcolo degli stili di Tamagui

**Richiesta** (Luca, 09/11/2026, thread "Velocizzare home, città e profilo",
"Ok" alle migliorie rimaste dopo `2026-11-09-citta-e-profilo-senza-tamagui.md`):
fare la barra in alto, dopo il menu con le tre righe (#292), e insieme i
riquadri Tamagui rimasti nella pagina città, senza nessun cambiamento visibile.

## Decisione

Stesso metodo delle due PR prima: `div`/`span` con le classi globali di
Tamagui (`is_View`, `is_Text`) e un `*.module.css` con le sue variabili.

- **Barra in alto** (`SiteHeader.tsx` + `SiteHeader.module.css`, su ogni
  pagina): righe, logo, "Come funziona", "Quanto costa", "Offri i tuoi
  servizi", "Accedi", le scritte di "Richiedi preventivo" e il posto della
  ricerca compatta. Il logo è `LogoPlain`, che ora ha anche la variante solo
  quadrato (`variant="mark"`, letta col nome, come in `Logo.web.tsx`).
- **Tondino dell'account** (`AccountMenu.tsx` + `.module.css`): `role="button"`
  con `tabIndex={0}` come lo scriveva Tamagui; Invio e Spazio arrivano da
  `KeyboardActivation`, Freccia giù apre il menu come prima.
- **Ricerca in cima ai risultati da telefono** (`SearchHeader.tsx` +
  `.module.css`): riquadro, "Chiudi" e il riassunto. Il riassunto dentro il
  pulsante ora è uno `span` (prima un `div`, che dentro un `button` non è HTML
  valido): stesse misure e stessi stili.
- **Contenitore delle pagine dei risultati** (`CategoryContent.tsx`,
  `CercaContent.tsx`, `ResultsPage.module.css`), con "Servizio" e il filtro.
- **Lasciati in Tamagui**:
  - il pulsante `Button` (resta per ultimo);
  - la barra di ricerca `SearchBar` (per ultima, come deciso);
  - i riquadri dentro `ResultsListWithMap`: Filtri e Mappa, la mappa, l'elenco,
    "Nessun professionista entro…" e "Potrebbero fare anche questo lavoro".
    Convertiti, erano identici a vista ma la pagina città faceva più lavoro
    subito dopo l'apertura: +85 ms in mediana su 16 giri, ripetuto due volte, e
    tornava come prima togliendo solo quel file. La causa non è chiara (nessun
    errore di idratazione, stesse richieste di rete); per 6 elementi non ne
    valeva la pena.

## Verifica

- **Elemento per elemento** (tag, attributi, misure e 46 stili calcolati, da
  computer e da telefono), sito prima e dopo accesi insieme. Tutto identico in
  questi casi:
  - barra da visitatore (home, città, `/accedi`, `/preventivo`, `/cerca`);
  - barra da cliente, con il menu dell'account aperto con un clic, con Freccia
    giù e con Invio;
  - barra da professionista in `/dashboard`;
  - pagine dei risultati: città, Online, servizio, problema scritto, mappa da
    telefono, ricerca da telefono aperta;
  - casi rari su una pagina di prova non salvata: professionista lontano e
    "Potrebbero fare anche questo lavoro".

  Unica differenza: il `div` → `span` del riassunto.
- `confronto-pagine` su 102 foto: 95 identiche. Le altre 7:
  - la home, con le foto dei mestieri caricate in tempi diversi (rifatte: una
    volta mancano prima, una volta dopo);
  - 6 con pochi pixel di bordo dei caratteri.
- Misure in locale contro l'API vera, telefono col processore 4 volte più lento,
  prima e dopo a ordine alternato, mediana di 12 giri, blocco (TBT):
  - home: 876 → 808 ms;
  - `/accedi`: 578 → 525 ms;
  - città: 465 → 492 ms, uguale entro le oscillazioni;
  - `/cerca` per servizio: 508 → 520 ms, uguale.

  Il guadagno è piccolo: la barra aveva circa 25 elementi Tamagui.
- `pnpm lint` e `pnpm typecheck`: ok.
