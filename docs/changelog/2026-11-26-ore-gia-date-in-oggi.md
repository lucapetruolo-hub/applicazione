# Oggi: ore già date e titolo per i lavori online

**Richiesta** (Luca, 26/11/2026, "sì" a due migliorie proposte dopo
`2026-11-25-orari-di-arrivo-validi.md`): nel riquadro di Oggi "Dì ai clienti di
domani verso che ora passi", segnare l'ora già scelta per un altro cliente
della stessa fascia, e un titolo giusto per i lavori online.

**Decisione**:
- Pallino (lo stesso di "chiesto dal cliente" nella scelta della data) sulla
  pillola di un'ora già data a un altro cliente della stessa fascia, scelta ora
  o già salvata; il lettore di schermo dice "09:00, già data a Bianca". Si può
  scegliere lo stesso (due lavori vicini possono stare nella stessa ora), ma
  si vede. Sopra, una riga di legenda solo quando serve.
- Titolo: "verso che ora passi" con soli lavori a domicilio, "verso che ora li
  contatti" con soli lavori online, "verso che ora passi o li contatti" se ci
  sono tutti e due; la riga sotto dice "Arrivo" o "Ti contatta" allo stesso
  modo.

**Verifica**: `e2e/tests/agenda-fasce-ampie.spec.ts` (pallino sulle 09:00 di
Carlo dopo la scelta per Bianca, legenda; nuova prova con due lavori online:
titolo "li contatti" e "Ti contatta tra le 16:00 e le 17:00"). Typecheck e
lint puliti.
