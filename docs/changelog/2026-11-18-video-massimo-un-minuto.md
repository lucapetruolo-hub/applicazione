# 18/11/2026 — "Massimo 1 minuto" scritto e foto/video non scaricabili

**Richiesta** (Luca, thread "Inviare il video anche se sta ancora caricando",
dopo l'unione di #402): "ma mentre faccio un video, questo si stoppa
automaticamente a 60 secondi?" e poi "non dare la possibilità di scaricare il
video", "né le foto".

**Decisioni**
- La fotocamera del telefono non si può fermare dal sito a 60 secondi (il
  sito apre la fotocamera di sistema, che non riceve un limite). Quindi il
  limite si dice prima: "Massimo 1 minuto" sotto "Fai un video" nel menu
  della fotocamera, nella riga sotto lo spazio foto della richiesta, negli
  allegati della chat e in "Le mie richieste". Il controllo di #402 (video
  oltre 1 minuto fermato subito con un messaggio chiaro) resta.
- Foto e video degli utenti (`MediaPreview`, `PhotoLightbox`, cioè richieste,
  chat, portfolio, recensioni, lavori) non offrono più il download: niente
  tasto destro "Salva", niente trascinamento sul desktop, niente "Scarica"
  nel lettore video (`controlsList="nodownload"`), niente finestrella
  picture-in-picture, niente menu "Salva" tenendo premuto su iPhone
  (`-webkit-touch-callout: none`). File in `apps/web/src/lib/noSaveMedia.ts`.
- I documenti allegati in chat (fatture, ricevute) restano scaricabili: servono.

**Limite noto**: una foto o una registrazione dello schermo resta sempre
possibile, e chi conosce il browser può trovare l'indirizzo del file. Si
toglie il gesto normale, non si può rendere impossibile la copia.

**Verifica**: typecheck e lint di `apps/web`.
