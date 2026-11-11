# Campo orario: si scrive a mano e c'è la rotella

**Richiesta** (Luca, 10/11/2026, foto da Chrome al computer): in Agenda,
nella finestra della fascia oraria, il campo dell'ora apriva l'elenco del
browser con solo alcune ore e i minuti 00, 15, 30, 45: "una persona potrebbe
non capire come cambiare orario che non è presente in quell'elenco". Chiede
di poter scrivere l'ora e una rotella come quella dell'iPhone.

**Decisione** (da esperto UX): `ItalianTimeInput`, l'unico campo ora del sito,
non usa più il campo ora del browser. Cambia quindi in tutti i suoi punti
(fascia oraria e settimana tipo in Agenda, lavoro esterno, data proposta nel
preventivo e nella controproposta, scelta della data del cliente, "I miei
clienti"), senza strade parallele.
- **Si scrive a mano**: campo di testo con la tastiera dei numeri sul
  telefono; i due punti si mettono da soli ("1430" → 14:30, "930" → 9:30) e
  all'uscita l'ora si sistema ("9" → 09:00, "9.30", "9,30" e "9 30" →
  09:30). Un'ora che non esiste (25:00) torna all'ultima buona. Frecce su e
  giù: 5 minuti alla volta (o il passo dato con `step`).
- **Rotella**: l'orologio nel campo apre due colonne che scorrono e si
  fermano a scatti (ore 00-23, minuti di 5 in 5, più quello scritto se è
  diverso), con la fascia verde al centro come sull'iPhone. Al computer si
  apre anche con un clic nel campo, sotto il campo (sopra se manca spazio) e
  si gira con la rotella del mouse o con un clic sul numero; sul telefono
  sale dal basso dello schermo con il nome del campo in alto e "Fatto".
- **Tastiera e lettore di schermo**: il campo ha il suo nome ("Ora di
  inizio"); le colonne sono elenchi "Ore" e "Minuti" con l'opzione scelta
  annunciata, frecce, Pagina su/giù, Inizio/Fine; Esc chiude solo la rotella
  (non la finestra della fascia) e riporta al campo.
- **Minuti della fascia**: prima la fascia e la settimana tipo avevano passi
  da 15 minuti (`step={900}`); ora la rotella va di 5 in 5 anche lì, e a mano
  si scrive qualunque minuto (si poteva già: iOS ignorava il passo).
- Gli orari doppi su iPhone (docs/changelog/2026-11-09-orari-doppi-iphone.md)
  non possono più tornare: non c'è più un testo nativo sotto il nostro.
  `ItalianDateInput` resta com'era.

**Verifica**: lint e typecheck di `apps/web`; prova nuova
`e2e/tests/campo-orario.spec.ts` (telefono e computer: "930", "1810",
frecce, ora sbagliata, "9", rotella con tocco, rotella del mouse, tastiera,
Esc, Fatto, posizione sotto il campo e dal basso sul telefono);
`e2e/tests/iphone-campi-orario.spec.ts` aggiornata (campo di testo, ora una
volta sola, rotella che si apre) e verde con WebKit; giro completo delle
prove dell'agenda. Foto in `anteprime/campo-orario/` della cartella del
progetto.
