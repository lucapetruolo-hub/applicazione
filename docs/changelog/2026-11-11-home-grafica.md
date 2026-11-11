# Home: sei ritocchi grafici da esperto (11/11/2026)

**Richiesta** (Luca, dopo la PR #319 sui caroselli larghi): proposte da
esperto di grafica per la home. Luca ha detto sì a tutte e sei, anche alle
tre facoltative.

**Decisione e motivo**:
- **Una sola ombra per le schede bianche** (`--card-shadow` e
  `--card-shadow-hover` in `:root` di `globals.css`): la usano la casella della
  ricerca in apertura, "Quanto costa in media?", le tessere di "La trasparenza
  che non trovi in giro" e le schede dei nuovi professionisti. Prima c'erano tre
  ombre diverse. La riga dei caroselli ha 28 px sotto, così `overflow-y:
  hidden` non taglia l'ombra.
- **Foto delle categorie che si ingrandiscono appena** (scala 1,05 in 500 ms)
  al passaggio del mouse, mentre la scheda resta ferma, come su apple.com.
  Prima la scheda si alzava di 6 px con un'ombra. Con "riduci movimento"
  attivo la foto non si muove.
- **Velo caldo sulle foto delle categorie** (`sepia(0.12) saturate(1.06)`):
  ora hanno tutte la stessa tonalità. Prima alcune erano fredde e altre calde.
- **Professionisti senza foto**: al posto del grande cerchio verde con le
  iniziali, che sembrava un segnaposto, l'icona del mestiere con le iniziali
  piccole sotto, sul colore della categoria (`NewProfilesCarousel`).
- **Fascia scura "Meno telefonate inutili" larga quanto lo schermo**, senza
  angoli, come le fasce scure di apple.com. Da computer il testo parte dove
  partono i titoli delle altre sezioni (`100cqw`, colonna di 1080 px).
- **Lettere più strette nei titoli grandi della home** (−1 px da computer,
  −0,5 px da telefono), con `--section-title-tracking` letto da `Section`.

**Verifica**: foto da telefono e da computer in `anteprime/home-caroselli-apple/`
della cartella del progetto (file `grafica-*`). `pnpm --filter
@professionisti/web lint` e `typecheck` passano.
