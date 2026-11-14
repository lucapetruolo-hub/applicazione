# Foto dentro il campo di ricerca e luce con i colori dello sfondo (13/11/2026)

**Richiesta** (Luca, thread "Mettere il caricamento foto nel campo di ricerca"):
mettere il caricamento della foto dentro il campo di ricerca della home invece
del pulsante separato "Aggiungi una foto del problema"; poi, dopo alcune prove
con le foto prima/dopo: niente arcobaleno e niente "IA", fotocamera colorata
dentro con i colori dello sfondo senza rosa ("sfumato"), deve sembrare un
pulsante, luce intorno al campo più tenue, pillola "Novità" con gli stessi
colori della luce del campo, e lo stesso nella richiesta di preventivo.

**Decisione**:
- Home: tasto bianco "📷 Foto" (ombra leggera, 44 px da toccare, nome
  "Aggiungi una foto del problema") alla fine del campo "Cosa è successo?".
  Scelta la foto, la miniatura entra all'inizio del campo con la ✕ ("Togli la
  foto") e sotto il riquadro compare "Foto aggiunta: ora tocca Cerca. Niente
  persone o documenti.", con il controllo anti-bot. L'avviso su persone e
  documenti non si vede più prima della scelta: lo controlla anche il server.
  Con PHOTO_SEARCH_ENABLED spenta, o con "Online", il campo resta com'era.
- `Autocomplete` e `SearchBar` (`packages/ui`) accettano `inputStart`/`inputEnd`:
  contenuto dentro il campo, che lascia lo spazio per non scriverci sotto.
- Richiesta di preventivo: lo stesso tasto "Foto" in basso a destra dentro
  "Descrivi il lavoro" e le foto subito sotto il campo, con la ✕; tolta la
  sezione "Foto o video" più in basso, che ripeteva la stessa cosa.
- La fotocamera è `FieldCameraIcon`: contorno verde di marca, dentro la
  sfumatura pesca, azzurro e menta.
- Luce che gira sul campo della home, su "Novità" e su "Descrivi il lavoro":
  pesca, rosa, lilla, azzurro e menta tenui (`--field-light` in globals.css) al
  posto di verdi e oro (supera la scelta del 03/11). Scrivendo, il bordo resta
  verde pieno.

- Da computer (campi in riga) il campo non si restringe più quando si sceglie
  la foto: con la miniatura il margine totale resta quello del tasto (miglioria
  scelta da Luca il 14/11).

**Verifica**: typecheck e lint; sito costruito e provato nel browser su
telefono, 320 px e computer (tasto trovato col Tab, sparisce con "Online",
foto scelta con miniatura e ✕ nella home e nella richiesta di preventivo).
