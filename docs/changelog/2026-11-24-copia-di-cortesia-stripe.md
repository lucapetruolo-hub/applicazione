# Scritta "Copia di cortesia" sui PDF di Stripe

**Richiesta** (Luca, 24/11/2026, thread "Emettere fatture elettroniche ai
professionisti"): Stripe manda al professionista un suo PDF con scritto
"Fattura" e un numero diverso dalla nostra fattura elettronica ABB. Va scritto
che non è la fattura valida, così non la confonde con la nostra.

**Decisione**: ogni cliente Stripe del professionista nasce con
`invoice_settings.footer` = `STRIPE_INVOICE_FOOTER` (`apps/api/src/billing/billing.service.ts`):
"Copia di cortesia, non valida ai fini fiscali. La fattura elettronica valida è
quella inviata allo SdI: la trovi sul sito in Fisco e pagamenti, Fatture e
documenti." Vale per abbonamento e rinnovi. La stessa scritta va anche sulla
fattura della quota di passaggio (`footer` di `invoices.create`). Un cliente
ripreso da un abbonamento vecchio riceve la scritta con `customers.update`.

**Motivo**: la sola fattura valida in Italia è l'XML allo SdI (serie ABB);
due "fatture" per lo stesso pagamento fanno rischiare una doppia
registrazione (collaudo G-02, domanda F del pacchetto per il commercialista,
domanda C4). Le email di Stripe restano accese (decisione del 2/11).

**Cosa manca**: i clienti Stripe già creati nella sandbox prima di questa
modifica restano senza scritta finché non si riprende il loro abbonamento.
In Live si parte da zero, quindi tutti l'avranno. Per sicurezza si può mettere la stessa
frase anche come piè di pagina predefinito in Stripe → Impostazioni →
Fatturazione → Modello di fattura (checklist-lancio punto 14c).

**Verifica**: prove di `apps/api/src/billing` (51 verdi, con i controlli
nuovi su creazione e ripresa del cliente), `tsc` senza errori.
