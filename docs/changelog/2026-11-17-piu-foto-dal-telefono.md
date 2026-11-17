# 17/11/2026 — Più foto con lo stesso codice QR, e il QR anche nel portfolio

**Richiesta di Luca.** Migliorie proposte prima di unire
`2026-11-16-scatta-dal-telefono.md` (PR #383): "più foto con lo stesso codice"
e "lo stesso QR dove si aggiungono foto, come il portfolio del professionista".
Luca ha risposto "sì" a tutte e due. "Copiare il link" era sconsigliata e non
si fa.

**Decisione.**
- Un codice può valere più foto: nella richiesta di preventivo fino ai posti
  liberi (massimo 5 foto in tutto), nel portfolio fino ai posti liberi del
  portfolio, mai più di 10 per codice. Nella ricerca della home resta una sola
  foto (la ricerca ne usa una).
- Sul telefono, dopo ogni invio: "N foto sono arrivate sul computer. Puoi
  mandarne ancora X, oppure torna al computer e tocca 'Fatto'", con "Scatta
  un'altra foto". Sul computer: "N foto arrivate · puoi mandarne ancora X" e il
  pulsante "Fatto". Con l'ultima foto la finestra si chiude da sola.
- Il portfolio del professionista (`dashboard/profilo`) usa ora lo stesso
  pulsante foto (`PhotoPicker`) della richiesta: da computer webcam, telefono
  con il QR o file; da telefono il menu Scatta/Galleria. Restano foto e video.

**Come funziona (API).**
- `photo_handoffs` ha `maxPhotos` e `sentCount`; le foto stanno in una tabella
  nuova `photo_handoff_photos` (migrazione additiva
  `20261117090000_piu_foto_dal_telefono`). Le colonne `photo` e `mediaType` del
  codice non si usano più: si tolgono in una PR a parte, quando nessuna copia
  vecchia dell'API gira.
- Il posto si prende con un solo `UPDATE ... WHERE "sentCount" < "maxPhotos"`:
  due invii insieme non superano mai il numero di foto del codice, anche con
  più copie dell'API. Codice pieno: 409 "Hai già mandato tutte le foto di
  questo codice."; scaduto: 410.
- Il computer prende le foto una alla volta, dalla più vecchia, e ognuna si
  cancella appena presa. Quando tutte le foto sono state prese il codice si
  cancella. Chiudendo la finestra si cancellano codice e foto non prese; il
  resto lo pulisce l'attività ogni 10 minuti. Restano i 30 codici al giorno
  per indirizzo; l'invio delle foto ha un limite di 15 al minuto.

**Verifica.**
- Prove dell'API (`photo-handoff.service.test.ts`): una foto, più foto in
  ordine, numero massimo, scadenza, chiusura.
- Prova vera computer + telefono (`e2e/tests/webcam-da-computer.spec.ts`): due
  foto mandate una dopo l'altra arrivano nella richiesta, "Fatto" chiude la
  finestra, poi il link non vale più.
- Foto in project-files `anteprime/webcam-da-computer/piu-foto-*.png`.
