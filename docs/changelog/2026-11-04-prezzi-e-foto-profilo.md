# Prezzi senza "a lavoro", foto del profilo, agenda più corta, filtro pagamento online

**Richiesta** (Luca, 04/11/2026, con una foto di `/cerca`):
1. nei prezzi delle prestazioni "a lavoro" si può omettere, mostrando solo le
   unità diverse;
2. nella pagina del singolo professionista la foto è ancora tonda: uniformarla
   a quella rettangolare dei risultati;
3. rendere meno estesa la parte aperta "Vedi orari e prezzi" della prima
   scheda (che resta aperta: Luca ha scelto di lasciarla com'è);
4. nei filtri della ricerca, un filtro per chi ha il pagamento online.

**Decisione**:
1. `shownServicePriceUnit` in `packages/shared/src/professionals.ts`: nessuna
   unità per "a lavoro", che è il modo normale di leggere un prezzo; restano
   "all'ora", "al giorno", "al m²". Vale ovunque si vede un prezzo al cliente:
   schede dei risultati e salvati (`ProfessionalCard`, anche la riga chiusa
   "da 10 €"), pagina del professionista, "Prezzi per mestiere" e "Quanto
   costa" (anche nel testo per i lettori di schermo). Nessuna nota "prezzi a
   lavoro salvo indicazione": un prezzo senza unità si legge già così. Nella
   dashboard la scelta dell'unità mostra ancora "a lavoro".
2. Pagina `/professionista/[id]`: foto verticale 3:4 con angoli di 20px
   (140px di larghezza, 96 sul telefono), come le schede (§400). La foto
   piccola nella barra "Richiedi preventivo" in fondo resta tonda.
3. `ProfessionalCard`: le frecce dei giorni stanno ai lati dei giorni, una
   riga in meno; fino a 390px di larghezza gli orari non ci starebbero e le
   frecce vanno in fondo alla riga di "Orari per:". La scelta "A domicilio /
   Online" resta (Luca l'ha voluta tenere dopo una prima versione che la
   toglieva). A scheda chiusa la riga "Vedi orari e prezzi" ha meno margine
   sopra e sotto (Luca: "sembra uno spazio bello largo"): 18+13 px sopra
   diventano 13+7, il margine sotto della scheda 24 (18 sul telefono)
   diventa 18 (13).
4. Filtri della ricerca: sezione "Pagamento" con "Solo con pagamento online",
   che tiene chi ha il bollino "Pagamenti online attivi" (`stripeVerified`).
5. Agenda della pagina del professionista: le frecce dei giorni sulla riga di
   "Orari per:", a destra, invece che su una riga loro; sul telefono frecce
   da 32px e pillole un po' più piccole perché ci stiano (sotto i 375px vanno
   ancora a capo).
6. Pagina del professionista sul telefono: foto (96px di larghezza) accanto
   al nome come su computer, e Salva/Condividi in colonna a destra del nome,
   non più sopra la foto (prima il nome andava sotto la foto, §252).

**Verifica**: typecheck di `web` e `ui`, `pnpm lint` del sito; foto con
Playwright di `/cerca/idraulico?citta=Roma` a 1440, 412, 390 e 360px e della
pagina del professionista a 1440 e 390px, con dati di prova (prestazioni a
lavoro, all'ora e al m², orari su 5 giorni). Il filtro con l'interruttore
acceso dà 0 risultati in locale, dove i pagamenti online sono spenti.
