# Agenda: voci spente di "Mostra" sempre in vista

**Richiesta** (Luca, 18/11/2026): "in agenda, in "mostra" colora sia tutta la
casella che la voce che è stata levata, poiché può capitare che il
professionista disattivi qualche voce e poi si dimentichi poiché poco
visibile".

**Decisione**:
- Con almeno una voce spenta la casella "Mostra" prende il velo ottone con
  bordo ottone (colore di avviso del sito: il rosso resta agli errori), sotto
  il titolo "N voci nascoste nel calendario" con l'occhio barrato e in alto a
  destra "Mostra tutto", che riaccende tutto con un tocco.
- La voce spenta diventa una pillola bianca con bordo ottone e testo ottone
  scuro, e al posto del numero dice "Nascosti".
- Se la colonna di sinistra è chiusa (o lo schermo è stretto e la colonna non
  c'è) sopra il calendario compare la riga "Non stai vedendo: Terminati, Orari
  liberi" con "Mostra tutto": così un lavoro non sparisce senza un motivo
  visibile. Con la colonna aperta la riga non si ripete.
- Le voci restano spente solo finché la pagina è aperta, come prima.

**Verifica**: prova `e2e/tests/agenda-filtri-spenti.spec.ts` (casella colorata,
"Nascosti", riga sopra il calendario a colonna chiusa, "Mostra tutto");
`agenda-accessibilita` verde. Foto in
`/mnt/project-files/anteprime/agenda-filtri-spenti/`.
