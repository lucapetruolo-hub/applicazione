# Ritaglio della foto del professionista in verticale 3:4

**Richiesta** (Luca, 10/11/2026): in `/dashboard/profilo` la finestra
"Posiziona la tua immagine" ritagliava ancora la foto in cerchio, mentre nelle
schede della ricerca la foto è verticale 3:4 con gli angoli arrotondati
(docs/CHANGELOG.md §400, `CARD_PHOTO`).

**Decisione**:
- `ImageCropModal` ha una forma: `shape="portrait"` per il professionista
  (riquadro 240×320 con angoli di 40 px, cioè la scheda 120×160 con angoli di
  20 px in scala 2:1; foto salvata 600×800, entro il limite di 800 px di
  Cloudinary), `"circle"` (di serie) per la foto dell'account in `/account`,
  che resta tonda come in tutto il sito.
- L'anteprima accanto a "Cambia immagine" in `/dashboard/profilo` è verticale
  72×96 con angoli di 12 px, nelle stesse proporzioni della scheda.
- Se l'immagine finisce di caricarsi prima che React colleghi `onLoad`, le
  misure si leggono lo stesso (prima il riquadro restava schiacciato e "Salva"
  spento).

**Altri punti dove si vede la foto** (nessuna modifica): risultati, salvati,
profilo pubblico e finestrella della mappa sono già verticali e ora mostrano
la foto intera come l'ha posizionata il professionista, senza i tagli ai lati
del vecchio quadrato. Le foto piccole tonde (chat, menu, preventivi, barra dei
professionisti scelti, 36-48 px) e quelle tonde di "Nuovi profili" (80 px) e "Prenotazione
confermata" (88 px) prendono la parte centrale della foto verticale. Le foto
già caricate (quadrate) restano come sono.

**Verifica**: `pnpm typecheck` e `eslint` su `apps/web`; pagina di prova con
Playwright a 375 e 1280 px: riquadro 240×320, trascinamento entro i bordi,
foto salvata 600×800 (verticale) e 480×480 (account, tonda). Foto in
`anteprime/foto-profilo-ritaglio/` della cartella condivisa.
