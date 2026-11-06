# Filtro della ricerca: "Accetta pagamenti online"

**Richiesta** (Luca, 06/11/2026): il filtro pagamento nella ricerca non deve
far pensare a "paga solo online", ma a "riceve pagamenti online".

**Decisione**: nella sezione "Pagamento" dei filtri la scritta
"Solo con pagamento online" diventa "Accetta pagamenti online", uguale su
telefono e su computer (stesso componente, `ResultsListWithMap.tsx`). Il
lettore di schermo legge la stessa scritta (`aria-labelledby`).

**Logica invariata**: il filtro tiene i profili con `stripeVerified`, cioè chi
può ricevere pagamenti online; non esclude chi accetta anche il pagamento
diretto (il modo lo sceglie il professionista in ogni preventivo).

**Secondo giro** (Luca, stesso giorno, "sì" alle due migliorie proposte):
- il bollino "Paga online" (schede della ricerca, profilo, fumetto, email di
  Stripe verificato/da sistemare) diventa "Pagamenti online", per lo stesso
  dubbio "si paga solo online";
- riaprendo i filtri con "Accetta pagamenti online" acceso, la sezione
  "Pagamento" è già aperta.

**Verifica**: typecheck e lint di `apps/web`.

**Terzo giro** (Luca, stesso giorno, scelta "3 bollini più +3"): sul telefono
(sotto i 660px) una scheda con tutti i bollini ne metteva 6 in colonna. Ora
restano sempre in vista Verificato, Privato/Partita IVA, Pagamenti online e
Sponsorizzato (la pubblicità deve restare riconoscibile, quindi non va mai
dietro il "+"); "Nuovo profilo" e "Assicurazione RC" stanno dietro un "+N"
che li mostra al tocco senza aprire il profilo. Sul computer tutto come prima.

**Verifica**: foto su iPhone SE, Pixel 7 e computer
(`analisi/bollino-pagamenti-online/` nella cartella del progetto): "+2"
visibile solo sul telefono, il tocco mostra gli altri bollini, la pagina non
cambia e nessun fumetto si apre da solo.
