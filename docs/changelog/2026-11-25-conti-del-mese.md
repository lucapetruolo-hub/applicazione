# Conti del mese in Admin e Plus proposto nei mesi gratis

**Richiesta** (Luca, 25/11/2026, thread "Calcolare quando si arriva a 12.000 € di utile"):
dopo l'analisi `analisi/punto-di-pareggio-12000-versione-profonda.md` Luca ha
approvato tre migliorie: una pagina in Admin "Conti del mese" con paganti,
prezzo medio, quanti restano dopo i mesi gratis e utile stimato presi dal
database; rifare il calcolo 2-3 mesi dopo il lancio con i numeri veri;
proporre Plus già nei mesi gratis a chi riceve più di 3 richieste.

**Decisione**:
- **Numeri → Conti del mese** (`/admin/conti-del-mese`, area Finanza,
  `GET /admin/monthly-accounts?month=AAAA-MM`, `PUT /admin/monthly-accounts/costs`):
  - in alto quattro numeri: abbonati che pagano oggi, prezzo medio al mese
    (annuale diviso 12), quanti restano dopo i mesi gratis (chi li ha finiti
    con la carta dal lancio e paga ancora), utile stimato del mese;
  - il traguardo dei 12.000 € all'anno con la barra "abbonati che pagano su
    quelli che servono": costi fissi dell'anno + 12.000 € diviso il margine
    di un abbonato in un anno (`payingNeededFor`). Il margine è quello vero
    del mese (entrate meno costi variabili, diviso gli abbonati); senza
    abbonati o senza entrate si usa la stima del 25/11 (42,33 €);
  - sotto "Vedi i numeri" gli abbonati per livello, i mesi gratis, gli
    abbonamenti chiusi nel mese (stato chiuso aggiornato nel mese, come in
    "Professionisti e ricerche") e il conto del mese: abbonamenti e passaggi
    (`payments` riusciti), pacchetti di visibilità, trattenute
    (`platform_fee_entries` HOLD e RETURN, IVA esclusa) meno carta dei
    pagamenti online (registrata a ogni incasso), Connect e bonifici, carta
    degli abbonamenti e fatture (stime dal listino in
    `apps/api/src/admin/monthly-accounts.ts`), WhatsApp (costo di ogni
    messaggio) e costi fissi;
  - **costi fissi al mese** scritti dall'admin (tabella nuova
    `platform_monthly_costs`, migrazione solo additiva, nel registro azioni),
    con "Parti dalla stima" che mette le 9 voci dell'analisi del 25/11
    (10.878 € l'anno) da correggere con le fatture vere;
  - account di prova e profili dimostrativi mai contati (§395); prima del
    lancio la pagina lo dice e mostra anche le prove.
- **Plus nei mesi gratis** (`shouldSuggestPlus` in `packages/shared/src/plans.ts`,
  `PlusSuggestionCard`): in Oggi e in Abbonamento, a chi è nei mesi gratis con
  la carta, con limiti attivi (dopo il lancio, pagamenti accesi) e ha
  ricevuto nel periodo più richieste dei 3 lavori di Base, prima di finirli
  (al limite resta l'avviso "Hai esaurito l'abbonamento"). Riquadro con tono
  di buona notizia, il costo come nella finestra di passaggio (prezzo meno i
  19 € del mese gratis), "Passa a Plus" e "Non ora" (nascosto fino al
  periodo dopo su quel dispositivo; nella pagina Abbonamento resta sempre).
  Nuovo campo `MySubscription.usage.requests` (richieste ricevute nel periodo).
- Il ricalcolo dopo il lancio è un promemoria nel thread, non codice.

**Motivo**: il numero da guardare ogni mese è "abbonati paganti × prezzo
medio" e quanti restano dopo i mesi gratis; Plus è la leva più forte del
modello (con tutti su Base servono 81 abbonati invece di 48).

**Verifica**: prove dei calcoli (`apps/api/src/admin/monthly-accounts.test.ts`,
stesso 48 dell'analisi) e della proposta di Plus
(`packages/shared/src/plusSuggestion.test.ts`); prova nel browser
`e2e/tests/admin-conti-del-mese.spec.ts` (telefono e computer: stima, voce
corretta e salvata, ricaricamento, axe senza errori).
