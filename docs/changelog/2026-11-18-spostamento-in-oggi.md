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
