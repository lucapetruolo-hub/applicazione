# Voci del prezzo una sotto l'altra

**Richiesta** (Luca, 11/11/2026, con la foto della scheda del preventivo da
telefono): "Dove c'è il prezzo mettili uno dopo l'altro e non a fianco". Le
voci stavano in fila separate da "·" ("Sostituzione sifone 100–2.000 € ·
manodopera 50 € · Sturatura scarichi 100 €") e andavano a capo a metà di una
voce, così non si capiva quale importo andava con quale voce.

**Decisione**: nella scheda del preventivo del cliente
(`apps/web/src/app/le-mie-richieste/_components/QuoteCard.tsx`) ogni voce sta
su una riga sua, nome a sinistra (grigio) e importo a destra (cifre
allineate, `tabular-nums`), come la tabella dell'importo finale già presente
nella scheda dopo il lavoro (`BookingSection.tsx`) e nella scheda del
professionista (`RequestCard.tsx`). Un nome lungo va a capo senza spingere
l'importo fuori. La lista è larga al massimo 460 px: da computer, a tutta
larghezza, l'importo finiva a un palmo dal nome e l'occhio perdeva la riga. Il testo passa da 13 a 15 px (a 13 era poco leggibile,
stessa scelta di docs/CHANGELOG.md §349). Le voci restano nascoste quando ce
n'è una sola (ripeterebbe il totale, scelta del 05/11/2026). Anche il caso
senza prezzi ("Lavori") mette i lavori uno sotto l'altro. Nella scheda del
professionista le righe avevano già nome e importo ai lati: aggiunto solo lo
spazio tra i due, perché un nome lungo non tocchi l'importo.

Altri punti controllati: il riepilogo chiuso del preventivo accettato
(`GuidedRequestCard.tsx`) resta in una riga perché è il titolo di una sezione
che si apre; dentro, le voci sono già in colonna.

**Secondo giro** (Luca, stesso giorno, "sì" alla miglioria proposta): nella
scheda del professionista il nome della voce passa in grigio (`grafite70`) e
l'importo resta scuro con le cifre allineate, come nella scheda del cliente.

**Verifica**: prova nel browser `e2e/tests/voci-prezzo-colonna.spec.ts`
(telefono e computer): tre voci, una sotto l'altra, importi allineati a
destra, la voce lunga non spinge l'importo fuori dalla scheda.
