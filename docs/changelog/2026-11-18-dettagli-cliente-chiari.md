# Dettagli cliente più chiari nella pagina richieste del professionista

**Richiesta** (Luca, 18/11/2026, con foto): "in dettagli cliente ci sono vari
formati e varie scritte, non si capiscono bene, devono essere più chiare".
Nel riquadro c'erano cinque stili insieme (nome come link verde sottolineato,
"Appuntamento:" in grassetto piccolo, un secondo nome in grassetto, indirizzo
e numero come link sottolineati, due pulsanti di colori diversi, email come
link).

**Decisione** (Luca ha detto sì alle proposte 1-5, no al pulsante "Copia"):
- Un nome solo, in grassetto, con la freccia che apre il profilo del cliente.
  È il nome scritto nella richiesta (chi riceve il professionista); se l'account
  ha un altro nome, sotto c'è una riga grigia "Richiesta dall'account di …"
  (i due nomi sono diversi apposta: chi ha l'account può chiedere il lavoro
  per un'altra persona).
- Appuntamento e indirizzo come righe con l'icona grigia (calendario,
  posizione), testo normale, niente "Appuntamento:" né sottolineato.
- Contatti come pulsanti tutti uguali (icona sopra, scritta sotto, come la
  scheda di un contatto sul telefono): Chiama, WhatsApp, Email, Mappa
  (indicazioni stradali di Google Maps). Stessa riga da telefono e da computer,
  divisi in parti uguali. Numero ed email restano leggibili in piccolo sotto,
  senza link. "Mappa" e non "Indicazioni": da telefono "Indicazioni" non ci
  stava e veniva tagliata.
- Il pulsante WhatsApp non è più verde scuro di WhatsApp ma uguale agli altri.

**Regole che restano**: i contatti si vedono solo dopo l'accettazione
(CLAUDE.md §5 punto 9); per un lavoro online l'indirizzo resta nascosto e
non c'è il pulsante Mappa.

**Verifica**: foto da telefono (390 px) e computer (1280 px) in
`anteprime/dettagli-cliente/` dei file del progetto, con nome della richiesta
diverso dal nome dell'account; `tsc` e `eslint` del sito verdi.
