# Piano scelto in registrazione, carta nel percorso del profilo

**Richiesta** (Luca, 29/10/2026): "chi si registra come professionista ad un
certo punto deve selezionare il piano con cui vuole abbonarsi e scegliendo sul
base con i 3 mesi gratis alla fine della registrazione gli si chiede la
validazione della carta, oppure elaboriamo un modo professionale dei vari
passaggi".

**Decisione** (opzione consigliata, scheda di scelta a Luca)
- La registrazione del professionista ha 5 passi: ruolo, come lavori,
  **piano**, account, codice email.
- Nella schermata "Scegli il piano":
  - Base porta i mesi gratis dell'offerta attiva ("3 mesi gratis");
  - Plus e Pro risultano "Dal lancio" finché i pagamenti non sono attivi e il
    sito non è lanciato (`FounderSpots.paidTiersOpen`).
- Da /per-professionisti il piano arriva già nel link e la schermata si salta.
- Nel modulo dell'account il piano scelto si vede con "Cambia", come il tipo.
- La carta non si chiede subito. È il nuovo passo **"Piano e carta"** di
  Completa il profilo, dopo i Dati fiscali: Dati fiscali → Piano e carta →
  Identità → Pagamenti online.
  - Il pulsante "Attiva i mesi gratis" porta ai livelli della pagina
    Abbonamento, dove parte lo stesso Checkout di Stripe di sempre (nessuna
    strada nuova).
  - Sulla pagina Abbonamento compare la barra dei passi.
- Chi sceglie Plus o Pro va subito alla pagina Abbonamento per pagare, come
  prima.
- Il passo non compare finché la carta non si può dare: senza Stripe, o prima
  del lancio senza `LAUNCH_DATE`. Altrimenti "Completa il profilo" resterebbe
  aperto per tutti fino al lancio. Con `LAUNCH_DATE` fissata compare anche a
  chi è già iscritto senza carta.

**Motivo**: chiedere la carta a chi non ha ancora visto il sito fa
abbandonare la registrazione. Nel percorso a passi la carta arriva quando il
profilo è avviato, una cosa alla volta.

**Verifica**
- Test di `founderSpots`: Plus e Pro solo con Stripe e dopo il lancio.
- Typecheck e lint del sito puliti.
- Guardate su telefono e computer la schermata del piano e il modulo
  dell'account.
