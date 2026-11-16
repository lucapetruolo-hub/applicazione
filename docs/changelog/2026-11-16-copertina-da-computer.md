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
