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
