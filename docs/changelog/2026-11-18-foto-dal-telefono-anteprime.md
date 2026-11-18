# Più foto insieme dal telefono e anteprime con la X sul computer

**Richiesta** (Luca, giro di prova del 17/11/2026, punto 20 del foglio): "quando
si inviano le foto dal cellulare con il qr code, perché non mandarne più di una
o caricarne più di una, e dal pc vedere già le anteprime di quelle che arrivano
con una x per eliminarle?"

**Cosa c'era già** (`2026-11-17-piu-foto-dal-telefono.md`): un codice valeva
già più foto (richiesta fino a 5, portfolio fino ai posti liberi), ma una alla
volta: scegli, guarda, manda, poi la successiva. Sul computer solo il numero
"2 foto arrivate", senza vederle e senza poterle togliere.

**Decisione** (da esperto UX, sui percorsi già esistenti):
- **Telefono** (`ScattaDalTelefono.tsx`): dalla galleria se ne scelgono più
  insieme (fino ai posti liberi), e con "Scatta" se ne aggiungono altre di
  fila. Si vedono in piccolo, tre per riga, ognuna con la X; un solo pulsante
  "Manda 3 foto al computer" le manda una dopo l'altra ("Mando la foto 2 di
  3…"). Se una non parte, dice quante sono arrivate e si ritocca "Manda". Con
  una foto sola (ricerca della home, foto del profilo, copertina) resta tutto
  come prima: foto grande e "Rifai".
- **Computer** (`PhoneHandoff.tsx`): con più foto quelle arrivate si vedono
  sotto il codice QR, ognuna con la X. Il pulsante "Fatto" diventa "Aggiungi 2
  foto" e le passa al modulo tutte insieme (`onPhotos`, la stessa strada della
  scelta di più file). La finestra non si chiude più da sola all'ultima foto,
  così si possono ancora togliere. Chiudendo la finestra in un altro modo
  (X in alto, Esc, clic fuori) le foto arrivate passano comunque al modulo: non
  si perdono.
- **La X libera il posto**: nuova rotta `POST /photo-handoff/:code/release`
  (solo con la chiave del computer, mai sotto zero). Il telefono rilegge il
  conto ogni 5 secondi e torna a "Puoi mandarne ancora N", anche dopo "Fatto".
  Per questo il codice non si cancella più quando il computer ha preso tutte le
  foto: resta fino alla chiusura della finestra o ai 10 minuti.

**Verifica**:
- Test API `photo-handoff.service.test.ts`: la X libera il posto solo con la
  chiave giusta, non va sotto zero, il codice resta fino alla chiusura.
- Dal vivo in locale (richiesta di preventivo, computer + telefono finto): 3
  foto scelte insieme, una tolta con la X sul telefono, 2 mandate; sul computer
  le 2 anteprime, una tolta con la X, il telefono torna a "Puoi mandarne ancora
  4"; "Aggiungi la foto" mette 1 foto nel modulo. Foto in
  `anteprime/foto-dal-telefono/` dei file del progetto.
