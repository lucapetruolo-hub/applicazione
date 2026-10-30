# Piano e carta subito dopo il profilo

**Richiesta** (Luca, 29-30/10/2026): "chi si registra come professionista ad
un certo punto deve selezionare il piano con cui vuole abbonarsi e scegliendo
sul base con i 3 mesi gratis alla fine della registrazione gli si chiede la
validazione della carta". Poi: "non si può chiedere la carta nel momento della
scelta dell'abbonamento?", con un confronto con i siti grandi.

**Confronto** (30/10/2026):
- Booksy, Fresha e Squarespace non chiedono la carta per la prova; Shopify la
  chiede quando si sceglie il piano a pagamento.
- Con la carta chiesta subito paga circa il 49% di chi prova (senza carta il
  18%), ma si iscrivono circa 3 volte meno persone.
- Stripe apre la pagina della carta solo con il profilo già creato (nome e
  città).

**Decisione** (opzione consigliata, scheda di scelta a Luca)
- Registrazione invariata: ruolo, come lavori, account, codice email.
- Al primo salvataggio del profilo, se la carta si può già dare, si apre
  "Profilo salvato! Ora scegli il piano". Il pulsante porta ai livelli della
  pagina Abbonamento: scegliendo Base si apre subito lo stesso Checkout di
  Stripe di sempre, oggi 0 €. Nessuna strada nuova.
- Completa il profilo: **Piano e carta** → Dati fiscali → Identità →
  Pagamenti online. I dati fiscali da fare aspettano il piano. Sulla pagina
  Abbonamento compare la barra dei passi.
- Il passo e la finestra non compaiono finché la carta non si può dare
  (senza Stripe, o prima del lancio senza `LAUNCH_DATE`); allora resta la
  finestra degli orari come prima. Con `LAUNCH_DATE` fissata il passo compare
  anche a chi è già iscritto senza carta.

**Verifica**
- Typecheck e lint del sito puliti, test degli abbonamenti verdi.
