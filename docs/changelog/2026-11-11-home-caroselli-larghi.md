# Home stile apple.com: caroselli larghi, sfumatura continua, apertura senza riquadro (11/11/2026)

**Richiesta** (Luca, con uno screenshot di apple.com): in home l'elenco delle
categorie e dei nuovi professionisti come su apple.com, a tutta larghezza
della pagina; la stessa sfumatura su tutta la home; correggere lo sfondo che
"a metà pagina si interrompe".

**Causa dello sfondo che si interrompe**: le due luci sfumate del sito
(`.site-blobs`, fisse dietro ai contenuti, docs/CHANGELOG.md §180) si vedono
solo dove la pagina è trasparente. Le sezioni `Section` della home avevano il
fondo pesca pieno (`--c-gesso`), le altre no: scorrendo, la sfumatura
compariva e spariva a ogni sezione.

**Decisione**:
- `Section` (variante del sito) prende il fondo da `--section-light-bg`, di
  base `--c-gesso` come prima; la home lo mette trasparente
  (`HomeContent.module.css`). Le altre pagine non cambiano.
- Nuovo `BleedRail` (`apps/web/src/components/BleedRail.tsx`, stili
  `.bleed-rail*` in `globals.css`): riga che esce dalla colonna della
  sezione fino ai bordi dello schermo, prima scheda allineata al titolo
  (anche tornando indietro, `scroll-padding`), niente bordi sfumati, sotto a
  destra la barra di avanzamento (scelta di Luca, §232) e le due frecce
  spente alle estremità; senza frecce sui telefoni senza mouse.
- Categorie (`CategoryStoryRail`) e nuovi professionisti
  (`NewProfilesCarousel`) usano entrambe `BleedRail`: prima ognuna aveva
  frecce e bordi diversi. Da computer le schede delle categorie passano da
  230×340 a 260×380 px.
- Da telefono le categorie restano la griglia a due colonne con "Mostra
  altre N categorie" (docs/CHANGELOG.md §271, scelta di Luca); i nuovi
  professionisti arrivano fino al bordo dello schermo.
- Il contenitore della home ha `overflow-x: clip`, perché `100vw` comprende
  la barra di scorrimento su Windows.

**Secondo giro (stesso giorno, scelte di Luca)**:
- **Apertura senza riquadro verde** (Luca ha scelto "Sì, apertura stile
  Apple", al posto della decisione "hero verde" del 24/10): titolo scuro più
  grande (64 px da computer) sulla stessa sfumatura pesca, testi grigio
  caldo, esempi e "Richiesta urgente" come pillole bianche col filo, verde
  solo su "Cerca", "A domicilio", "Novità" e nei bordi di fuoco. Le luci
  compaiono solo durante l'attesa della ricerca, nel tono chiaro.
- **Barra in alto più bassa e trasparente scorrendo**, solo in home
  (`SiteHeader`, `.site-header-shell` in `globals.css`): il fondo bianco sta
  in un livello a parte che scorrendo sale di 12 px (barra visibile di 52
  px), bianco al 72% con sfocatura e saturazione, come su apple.com; logo e
  pulsanti salgono di 6 px. Solo trasformazioni: la barra resta alta 64 px
  nella pagina. Il primo tentativo cambiava l'altezza vera e la prova
  `barra-preventivo` (CLS 0) è diventata rossa: spostava di 12 px tutta la
  pagina (riprodotto in locale, 4 spostamenti; dopo, zero). Due soglie (24
  px per stringerla, 4 px per riallargarla) perché non tremi.
- **Titolo d'apertura su due righe proprie** ("Scrivi il problema." / "Ti
  diciamo chi chiamare."): prima il "Ti" restava in fondo alla prima riga.
  Testo sotto con a capo curati (`text-wrap`), ombra leggera sotto la
  casella bianca, "Ricerca gratuita, senza registrazione" a 14 px in grigio
  #766b62 (4,6:1 sul pesca, sopra il minimo AA). Scelte di Luca.
- **Da telefono la casella della ricerca a 12 px dai bordi** (Luca chiedeva
  da bordo a bordo): consigliato così perché resti una scheda con angoli e
  ombra; foto delle due versioni a Luca.

**Verifica**: foto prima/dopo da telefono (390 px) e computer (1440 px) in
`anteprime/home-caroselli-apple/` della cartella del progetto; lint,
controllo dei tipi e prove della home.
