# Spostamento dell'appuntamento visibile in Oggi

**Richiesta** (Luca, giro di prova, punto 13 "Sposta l'appuntamento", 18/11/2026):
"fallo vedere al professionista anche in Oggi". Quando il cliente chiedeva di
spostare un appuntamento già fissato, il professionista lo vedeva solo in
Agenda e in Richieste: in Oggi, la prima pagina che apre, non compariva niente.

**Decisione**:
- In "Date proposte dai clienti", in cima a Oggi, compaiono anche gli
  appuntamenti già fissati che il cliente chiede di spostare: "Chiede di
  spostarlo da mer 18 nov, 15:00 a ven 20 nov, 09:00" e "Rispondi", che apre la
  richiesta dove si accetta o si rifiuta come prima (`movesToConfirm` in
  `apps/web/src/app/dashboard/page.tsx`, da `ProfessionalBooking.dateChange`).
- In "Oggi e domani" la riga dell'appuntamento porta una pillola: ambra "Il
  cliente chiede di spostarlo" se serve una risposta, grigia "Nuova data
  proposta: in attesa del cliente" se l'ha proposta il professionista
  (`.today-move` in `globals.css`). Verde e rosso restano per fatto ed errori.
- Nessun avviso nuovo: email e notifiche restano quelle di prima.

**Verifica**: typecheck e lint del sito. Dal vivo in locale con un
professionista di prova e due appuntamenti (oggi con spostamento chiesto dal
cliente, domani proposto dal professionista): foto
`collaudo/2026-11-17-giro-cliente-professionista/foto/oggi-spostamento-*`.

## La stessa pillola in Agenda (sì di Luca, 18/11/2026)

Nella Settimana e nel Giorno dell'Agenda l'appuntamento confermato con
un'altra data proposta ha la sua pillola corta, per stare nel riquadro: "Da
spostare" (ambra, la chiede il cliente) o "Nuova data" (grigia, in attesa del
cliente). Il testo intero ("Il cliente chiede di spostarlo") si legge nel
foglio che si apre toccando il riquadro e dal lettore di schermo; sul telefono,
dove la colonna della settimana è stretta, c'è un pallino dello stesso colore
(`move` di `AgendaGridEvent`). Foto `agenda-spostamento-*` nella cartella del
giro di prova.

## Una sola parola, "Spostamento", e sempre ambra (Luca, 18/11/2026 sera)

"Nuova data" faceva pensare che la data fosse già cambiata. Ora la parola è la
stessa per tutti e due i casi, con chi l'ha chiesto, e la pillola è sempre
ambra:
- Oggi: "Spostamento dal cliente" o "Spostamento da te".
- Agenda, nel riquadro: "Spostamento" con sotto "dal cliente" o "da te"; sul
  telefono il pallino è ambra per tutti e due. Nel foglio che si apre toccando
  il riquadro: "Spostamento chiesto dal cliente" o "Spostamento chiesto da te:
  in attesa del cliente".
- Il riquadro tratteggiato sulla data proposta resta "Nuova data proposta",
  perché lì è davvero la data nuova.
