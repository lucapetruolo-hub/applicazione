# Ritenuta d'acconto del cliente azienda: online al massimo l'80%

**Richiesta** (Luca, 26/11/2026, dopo le risposte del commercialista): un
cliente azienda che lavora con chi non ha la partita IVA può pagare online al
massimo l'80% del lavoro; il resto lo gestiscono tra loro di persona.

**Decisione**:
- Il 20% è la ritenuta d'acconto: il cliente sostituto d'imposta lo trattiene
  e lo versa allo Stato con l'F24 (codice tributo 1040) entro il 16 del mese
  dopo. Non va al professionista.
- Nella richiesta della ricevuta "A una partita IVA" verso un professionista
  occasionale c'è la casella "Trattengo la ritenuta d'acconto del 20%", spuntata
  di serie (da togliere per i forfettari). Nuova colonna
  `client_invoice_requests.withholdingAgent` (migrazione solo additiva).
- Con la ritenuta (`clientWithholds`), "tutto online" diventa "acconto online e
  saldo di persona" e l'acconto è al massimo l'80% del prezzo minimo
  (`withholdingPaymentOffer`): mai oltre l'80% del prezzo finale. Il saldo è
  sempre di persona, quindi saldo automatico, rimborsi, contestazioni e
  bonifico non cambiano. Il preventivo del professionista resta com'era: cambia
  solo l'offerta letta da `loadAcceptableQuote` (accettazione e acconto pagato).
- La riga sotto la richiesta spiega la ritenuta al cliente
  (`WITHHOLDING_PAYMENT_NOTE`).
- Sulla ricevuta del professionista la spunta della ritenuta parte da quello
  che ha detto il cliente; il professionista la può cambiare. Nei dati per la
  ricevuta compare "Trattiene la ritenuta d'acconto del 20%" o "Non trattiene".

**Motivo**: chi lavora in modo occasionale con un'azienda riceve l'80%; se
l'azienda pagasse tutto online non potrebbe più trattenere il 20% per lo Stato.

**Verifica**: test nuovi in `onlinePayments.test.ts` (shared) e
`bookings.service.test.ts` (80% online, forfettario come sempre); typecheck di
API e sito.
