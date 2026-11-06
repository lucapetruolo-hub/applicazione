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

**Quarto giro** (Luca, "effettua prima miglioria"): sui telefoni stretti
(iPhone SE) nome e bollino "Assicurazione RC" uscivano dal bordo della
scheda. Sul telefono la colonna di nome e bollini ora prende tutta la
larghezza (`xs:stretch`), il bollino non supera mai la riga (`max-width:100%`
in `BadgeInfo.web.tsx`) e "dichiarata" va a capo se serve. Misurato su iPhone
SE: niente più sporge dalla scheda; computer uguale a prima.

**Quinto giro** (Luca, "sì" a due migliorie):
- prova nel browser `e2e/tests/bollini-telefono.spec.ts`: su un telefono da
  320px "+2" visibile, "Sponsorizzato" in vista, il tocco mostra gli altri
  bollini senza aprire il profilo, e niente esce dalla scheda né fa scorrere
  la pagina di lato; sul computer nessun "+N". Controllata togliendo la
  correzione: la prova diventa rossa.
- sul telefono il nome va sopra a tutta larghezza e la foto sta accanto ai
  bollini (prima un nome lungo prendeva 4 righe). Il nome è scritto due volte
  nella scheda e se ne vede uno solo (l'altro è nascosto anche al lettore di
  schermo): nelle prove cercare il nome con `.filter({ visible: true })`
  (sistemate `prestazioni-problema` e `scelti-restano`).

**Verifica**: in locale `bollini-telefono`, `badge-fumetto`, `quanto-costa`,
`conteggi`, `scelti-restano`, `prestazioni-problema` verdi. `tastiera` riga
99 rossa in locale anche senza queste modifiche (sito avviato in modalità
sviluppo), la decide la CI.

**Sesto giro** (Luca): sul telefono il cuore dei "Professionisti salvati" e
"Scegli" della ricerca stanno in alto a destra accanto al nome (prima in
mezzo, tra bollini e mestiere); il cuore è più piccolo (32px, icona 14, sopra
il minimo di 24px per il tocco). Sul computer restano dove erano. Prove
`scelti-restano`, `bollini-telefono`, `prestazioni-problema` verdi in locale.
