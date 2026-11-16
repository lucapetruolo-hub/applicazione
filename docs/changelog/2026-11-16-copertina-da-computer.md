# Copertina del profilo: si scorre in su anche da computer

**Richiesta** (Luca, 16/11/2026): "fai in modo che anche da computer la
visualizzazione di quando apro un account dopo la ricerca è standard come ora,
ma posso avere la possibilità di scrollare un po' più sopra per vedere un po'
di foto come ora succede da cellulare".

**Decisione**: lo stesso comportamento del telefono
(`2026-11-13-copertina-profilo.md`) vale anche da computer.
- `COVER_DESKTOP_SPACE = 260` in `packages/shared/src/coverPresets.ts`
  (telefono resta `COVER_PHONE_SPACE = 180`): da computer ci sono 260 px di
  copertina sopra il percorso e la pagina si apre già scesa di 260 px, quindi
  all'apertura si vede esattamente quello di prima. Scorrendo in su si vede
  la foto quasi intera (circa 540 px su uno schermo da 1440).
- Stesso script in linea e stesso controllo dopo la navigazione di prima, ora
  per tutte le larghezze (`startBelowCover`); niente scorrimento con un `#`
  nel link o se si è già scesi. La classe `headPhoneSpace` diventa
  `headCoverSpace`.
- La copertina finisce dove finiva prima: `bottom: calc(45% - 117px)`, perché
  il 45% si calcola anche sui 260 px in più.
- Copertina scura: il velo scuro si sposta dietro il percorso (che ora sta a
  metà della foto), appena accennato in cima per non spegnere la foto.
- Anteprima nell'area professionista (`preview`) invariata: niente spazio.

**Motivo**: da computer la copertina si vedeva solo come una fascia stretta
dietro il primo riquadro; ora chi vuole vede la foto, chi non scorre non nota
differenze.

**Verifica**: pagina aperta con un'API finta su 1440×900 e su iPhone 14, con
copertina foto, colore chiaro e senza copertina: computer aperto a 260 px e
identico a prima, telefono aperto a 180 px e identico a prima, senza
copertina nessuno scorrimento, nessuno scorrimento di lato.

## Migliorie approvate da Luca (16/11/2026)

- **Schermi molto larghi** (da 1600 px, `COVER_WIDE_MIN_WIDTH`): 360 px di
  copertina nascosta (`COVER_WIDE_SPACE`) invece di 260, perché la foto 2:1 a
  tutta larghezza è più alta: in cima se ne vede circa il 70% e non solo una
  fascia. Velo scuro e fine della copertina spostati di conseguenza.
- **"Come la vede il cliente"** (`CoverPicker`): accanto al titolo la scelta
  "All'apertura / Scorrendo in su"; con la seconda il riquadro scende e la
  copertina si allunga, da computer e da telefono, con un'animazione breve
  (niente animazione con "riduci movimento").
- **Prova automatica** `e2e/tests/copertina-profilo.spec.ts`: apertura a
  180 px da telefono, 260 da computer, 360 a 1680 px; il nome sta nello stesso
  punto di un profilo senza copertina; in cima la copertina scende di tutto lo
  spazio nascosto; senza copertina o con un `#` nessuno scorrimento.

**Verifica**: la prova nuova verde su telefono e computer (7 prove) con API,
sito e database veri; foto dell'anteprima (computer e telefono, tutti e due
gli stati) e del profilo a 1920 px (aperto a 360 px).
