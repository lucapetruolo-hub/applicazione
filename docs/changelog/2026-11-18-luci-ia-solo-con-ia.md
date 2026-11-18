# Luci colorate su "Descrivi il lavoro" solo quando lavora l'IA

**Richiesta** (Luca, 18/11/2026): nella richiesta di preventivo a un
professionista scelto o a un gruppo di scelti, la casella "Descrivi il lavoro"
mostrava ancora le luci colorate che girano, il segno dell'IA. Lì l'IA non
lavora (già scelto a chi va la richiesta), quindi le luci non servono.

**Decisione**: la luce resta solo quando il modulo usa davvero i suggerimenti
(dizionario + IA, `suggestionsOn`). Con `professionista`, `scelti` o in attesa
di un mestiere senza iscritti la casella prende la classe
`guided-description-input--semplice`: bordo 1px come gli altri campi del
modulo (#8E867C) e verde pieno di marca mentre si scrive, come già oggi con
l'IA. Nessun altro segno dell'IA restava in quel percorso: esempi "Prova:",
"Sto capendo chi ti serve…", domanda di chiarimento e IA sulla foto erano già
spenti (docs/changelog/2026-11-17-avviso-sicurezza-richiesta-diretta.md e PR #389);
l'avviso di sicurezza piccolo resta.

**Motivo**: un segno visivo che promette l'IA dove l'IA non c'è confonde e
toglie valore alla luce dove invece lavora.

**Verifica**: Playwright su `/preventivo` generale (luce con `label-badge-spin`),
con un professionista e con 2 scelti (bordo 1px, nessuna animazione), da
telefono e computer, anche mentre si scrive.

## Secondo giro: foto e video (sì di Luca, 18/11)

**Richiesta**: fotocamera di "Foto del problema" verde pieno dove l'IA non
lavora; togliere l'obbligo di mettere per prima una foto; poter scegliere più
foto o video insieme, sempre fino a 5.

**Decisione**:
- `FieldCameraIcon tone="verde"` con professionisti scelti (o attesa di un
  mestiere): niente sfumatura pastello che ricorda le luci dell'IA.
- Con professionisti scelti anche il primo file può essere un video (menu
  "Fai un video" da subito, casella "Foto o video", testo "Fino a 5 foto o
  video del problema, anche più insieme"). Nella richiesta generale la prima
  resta una foto, perché è quella che l'IA guarda se dal testo non capisce il
  mestiere (scelta di Luca del 15/11).
- `PhotoPicker` con `onFiles`: dalla galleria o dal computer si scelgono più
  file insieme, in tutti e due i percorsi; si caricano uno alla volta
  nell'ordine scelto fino a 5; quelli in più si dicono in una riga grigia (il
  rosso resta per gli errori). Le altre pagine che usano `PhotoPicker` (home,
  profilo, copertina) restano a un file.

**Verifica**: Playwright da computer: 6 immagini scelte insieme, 5 miniature
e la riga grigia, sia con 2 scelti sia nella richiesta generale; con scelti
`accept="image/*,video/*"` già alla prima casella, nella generale `image/*`.

## Terzo giro: riordinare le foto trascinandole (sì di Luca, 18/11)

**Richiesta**: spostare le miniature col dito per cambiare l'ordine; poi
"vedi dove altro può essere usato" e sì a portfolio, foto aggiunte a una
richiesta già mandata, foto a fine lavoro e foto della recensione (no alle
segnalazioni di problemi, che servono come prova).

**Decisione**: un pezzo comune, `apps/web/src/lib/usePhotoReorder.ts`, senza
librerie: col dito si tiene premuta la miniatura 280 ms e poi si sposta (un
tocco o uno scorrimento della pagina non la prendono), col mouse si prende
subito, da tastiera frecce sinistra/destra; passando sopra un'altra miniatura
si scambiano di posto, anche su più righe; la miniatura presa si solleva con
un'ombra; il lettore di schermo sente "Spostata al posto N di M". Riga grigia
"Per cambiare l'ordine, tieni premuta una foto e spostala." quando le foto
sono almeno 2 (nel portfolio anche "La prima foto è quella che si nota di
più"). Usato in: modulo di richiesta, portfolio di Il mio profilo, modifica di
una richiesta in Le mie richieste, Completa il lavoro, recensione. Le
miniature di questi quattro punti passano da Tamagui a HTML semplice
(`.portfolio-thumb`), stesse misure di prima con angoli 10. L'ordine si salva
come oggi, col salvataggio di ciascun modulo (gli elenchi sono già in ordine).

**Verifica**: Playwright sul modulo: col mouse la prima foto portata in terza
posizione; freccia sinistra (fuoco che resta sulla foto, annuncio letto); X
che toglie ancora la foto; da iPhone 13 emulato uno scorrimento veloce non
cambia nulla, la pressione lunga e lo spostamento portano la prima in quarta.
Gli altri quattro punti usano lo stesso pezzo: controllati con tsc e lint,
non provati dal vivo perché serve un account con dati.
