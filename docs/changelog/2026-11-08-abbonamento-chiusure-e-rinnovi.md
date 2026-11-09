# Abbonamento: chiusura dell'account, doppie attivazioni, quota di passaggio e rinnovi non pagati

**Richiesta**: controllo completo prima del lancio dell'8/11/2026, gruppo 2
(`collaudo/2026-11-08/riepilogo.md`), approvato da Luca: E1-01, E3-01, E3-02,
E3-03, E3-07, E3-08, E3-09, E3-10, E3-11, con le migliorie "sì" dello stesso
tema (riusare la pagina di pagamento aperta, pausa dopo N giorni di rinnovo
non pagato).

**Decisioni e motivo**
- **E1-01 chiusura dell'account**: l'abbonamento di Stripe si annulla
  subito, senza conguagli (`BillingService.cancelForClosedAccount`, registrato
  in `AuthService.onProfessionalAccountClosed`). Prima la carta continuava a
  essere addebitata ogni mese e partivano fatture ABB a un account chiuso. I
  webhook ignorano gli account chiusi (solo la fine dell'abbonamento passa) e
  il riquadro "Elimina account" lo dice: "Il tuo abbonamento si annulla
  subito: niente altri addebiti sulla carta". Se Stripe non risponde, il
  controllo orario riprova.
- **E3-01 due schede "Attiva"**: una seconda scheda riapre la pagina di
  pagamento già aperta per lo stesso livello (una per un altro livello si
  chiude); se una pagina è appena stata pagata il sito dice di ricaricare. Se
  comunque nasce un secondo abbonamento, si annulla subito e la riga resta sul
  primo; con un addebito la Finanza riceve "Abbonamento pagato due volte"
  (`ADMIN_SUBSCRIPTION_DUPLICATE`) per il rimborso con la nota di credito (la
  nota di credito ABB automatica è E5-06, gruppo 5).
- **E3-02 quota di passaggio**: un passaggio alla volta per abbonamento
  (`upgradeStartedAt`, scade dopo 2 minuti); la fattura della quota si
  ricorda (`upgradeInvoiceId`) prima di pagarla. Se il cambio di livello non
  riesce, il tentativo dopo o il controllo orario danno il livello senza far
  pagare di nuovo, e il professionista legge "Quota pagata: il nuovo livello
  si attiva entro un'ora". Una carta rifiutata annulla la fattura e si può
  riprovare subito (prima la stessa chiave di idempotenza restituiva la
  fattura annullata ed era un errore interno per 24 ore).
- **E3-03 rinnovo non pagato**: si segna da quando (`pastDueSince`); dopo
  14 giorni (`PAST_DUE_GRACE_DAYS`) il sito annulla l'abbonamento su Stripe e
  il profilo va in pausa come "Abbonamento concluso", anche se la Dashboard
  lascia l'abbonamento sospeso. Banner ed email del pagamento non riuscito
  dicono "entro 14 giorni". Voce della Dashboard aggiunta alla checklist (5ter).
- **E3-07**: Checkout dell'abbonamento solo carta (`CARD_ONLY`).
- **E3-08**: negli ultimi 2 giorni dei mesi gratis la prova di Stripe dura
  48 ore (minimo di Stripe) invece di far pagare subito: fino a 2 giorni
  gratis in più, mai un addebito prima della data promessa.
- **E3-09**: righe `Payment` dell'abbonamento solo da `invoice.paid` con un
  addebito (livello, rinnovo, Plus/Pro nei mesi gratis, quota): niente più
  righe a 0 € per la carta data, nessun addebito mancante.
- **E3-10**: Admin → Finanza dice che sui pagamenti online all'addebito si
  tiene al massimo il 7% + IVA e segna le regole più alte.
- **E3-11**: `paidEurCents` e `applicationFeeEurCents` sommati sul database
  (`increment`), non sul valore letto prima.

## Seguito del 09/11/2026: tre migliorie e pausa dopo 1 giorno

Richieste di Luca: "Effettua le 3 migliorie" e, sul rinnovo non pagato, "1
giorno, poi pausa, sempre rimanendo i 15 giorni che hai descritto".

- **Doppio abbonamento rimborsato da solo**: il secondo abbonamento annullato
  viene anche rimborsato subito (`refunds.create`, motivo `duplicate`); la
  Finanza riceve l'avviso con "già rimborsato" e la nota di credito arriva dal
  rimborso (gruppo 5).
- **Ultimo avviso 3 giorni prima della chiusura** di un rinnovo non pagato
  (`pastDueWarnedAt`, una volta sola), nella campanella e per email.
- **Quota di passaggio con la conferma della banca (3D Secure)**: se la banca
  chiede la conferma, il sito apre la pagina di pagamento di Stripe e il
  livello cambia all'arrivo di `invoice.paid`; il controllo orario lascia
  aperta per un po' quella fattura invece di annullarla. Anche per Plus o Pro
  nei mesi gratis (secondo "si" di Luca): il cambio resta in sospeso su Stripe
  (`pending_if_incomplete`, con lo sconto del mese Base, possibile dalla
  versione API 2026-05-27) finché la banca non conferma; con una carta
  rifiutata il cambio si scarta e resta Base nei mesi gratis.
- **Ritorno al sito**: la pagina della banca si apre in una scheda nuova
  (`BankConfirmStep`, nella finestra "Hai esaurito l'abbonamento" e in
  Abbonamento) e il sito resta aperto: controlla ogni 4 secondi e, appena il
  livello è cambiato, dice "Fatto: ora sei al livello …". La pagina di Stripe
  non ha un ritorno al sito, così chi chiude quella scheda trova già tutto
  aggiornato.
- **Rinnovo non pagato**: il primo giorno il profilo resta visibile, poi va in
  pausa ("Rinnovo non pagato", `PAYMENT_FAILED`, `PAST_DUE_VISIBLE_DAYS = 1`,
  esce dalla ricerca e non riceve richieste) finché il pagamento non passa;
  Stripe riprova e dopo 14 giorni l'abbonamento si chiude come prima. Banner,
  email e campanella lo dicono con "Cambia la carta". Cambiando la carta dal
  portale (`customer.updated`, da aggiungere agli eventi del webhook: checklist
  5ter) il sito riprova subito le fatture aperte, così la pausa finisce senza
  aspettare il tentativo di Stripe.

**Verifica**: `billing-safety.test.ts` (chiusura, doppione, quota a metà,
rinnovo non pagato, righe dei pagamenti), nuovi casi in
`billing-checkout.test.ts` (solo carta, 48 ore, pagina riaperta, pagina appena
pagata) e `subscriptions-launch.test.ts` (data del non pagato, account
chiuso, ultimo avviso), `subscription-rules.test.ts` (pausa dopo 24 ore),
rimborso, 3D Secure e carta cambiata in `billing-safety.test.ts`. API: 1310 test verdi, typecheck e lint di tutto il monorepo verdi.
Migrazione `20261108200000_abbonamento_rinnovo_e_passaggio` (quattro colonne nuove,
nessun dato toccato).
