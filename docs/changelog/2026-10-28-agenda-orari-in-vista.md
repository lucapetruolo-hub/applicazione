# Agenda: gli orari subito in vista all'apertura

**Richiesta** (Luca, 28/10/2026, thread "Vedere subito gli orari aprendo l'agenda", con uno screenshot da computer): aprendo l'agenda si vedevano solo le ore dalle 08 alle 13 circa. "Chi clicca su agenda deve avere subito la situazione in vista."

**Cosa succedeva** (misurato in locale con un professionista di prova, computer 1440×800 e telefono 390×740):
- Da computer titolo, schede, barra, campo di ricerca e intestazione dei giorni occupavano quasi metà dello schermo; la griglia era alta 640 px fissi, quindi finiva sotto il bordo della finestra e lo scorrimento automatico all'ora attuale non serviva (la griglia aveva solo 36 px da scorrere). Alle 14:50 si vedevano le 08-13.
- Sul telefono la griglia cominciava a metà schermo (barra a due righe, campo di ricerca, striscia dei giorni) e partiva dalle 07-08 anche a metà pomeriggio: l'ora attuale era sempre fuori vista.

**Decisione** (proposta del thread, da confermare con Luca sulle anteprime in `anteprime/agenda-orari-in-vista/`):
- **Parte alta compatta**: titolo, schede (Calendario, Orari di lavoro, Giro intelligente) e pulsanti in una riga da computer; su telefono le schede vanno a capo da sole.
- **Una sola riga di comandi**: Oggi, frecce, periodo con sotto il riepilogo ("6 lavori · 36 h 30 libere"), vista e una lente. Il campo "Cerca cliente, via, lavoro..." si apre dalla lente (si chiude con la X, che cancella anche la ricerca). Sul telefono la vista è un menu a tendina e, nella vista Giorno, restano solo le frecce della striscia dei giorni (erano doppie).
- **Da computer la griglia arriva fino in fondo allo schermo** e scorre al suo interno (altezza misurata prima di disegnare, nessuno spostamento: CLS invariato); così lo scorrimento all'ora attuale funziona davvero. Fuori da oggi parte dal primo lavoro o dal primo orario libero.
- **Ora più bassa da computer** (44 px invece di 52; sul telefono resta 52 per il dito): un lavoro di un'ora mostra ancora titolo e orario.
- **Giornata da 08 a 20** quando non ci sono orari né lavori prima o dopo (prima partiva dalle 07, un'ora sempre vuota).
- **Intestazione dei giorni in una riga** ("Mer 28") con le ore libere sotto.
- **Colonna di sinistra nascondibile** da computer (pulsante a sinistra di "Oggi"); la scelta resta su quel browser.
- **Sul telefono, oggi**: la giornata parte da un'ora prima di adesso; le ore già passate stanno in una riga "Prima delle 13:00 · 1 lavoro ›" che le riapre.

**Seconda parte** (Luca, stesso giorno: "effettua la miglioria 3"):
- **Sul telefono, se oggi non c'è niente in agenda, si apre la Settimana** (un giorno vuoto non dice niente). Solo al primo caricamento, mai con `?giorno=` e mai dopo una scelta fatta a mano; da computer si apre sempre la Settimana come prima. La domenica si apre la settimana che comincia domani: la sera si guarda il giorno dopo (stesso motivo di T4, §311; le prove T4, T9 e C1 ora vedono il lavoro di lunedì senza frecce).
- Per far stare la Settimana nella barra del telefono: la lente va accanto al titolo, le date sono abbreviate ("26 ott – 1 nov"), "Oggi" compare solo quando oggi non è già in vista. Il menu della vista resta a 16 px (regola del sito contro lo zoom di iPhone sui campi).
- **Giorni fermi in alto sul telefono** (miglioria 1, approvata da Luca sull'anteprima): mentre si scorre, la striscia dei giorni (vista Giorno) o le date della settimana restano sotto l'intestazione del sito e la barra delle sezioni (117 px). `.ag-cal` passa da `overflow: hidden` a `clip` sul telefono, altrimenti `sticky` non funziona.

**Terza parte** (Luca: "effettua la miglioria 1"): nella Settimana del telefono le ore libere sotto ogni giorno sono scritte brevi ("9h30" invece di "9 h 30 libere", 10 px), perché nelle colonne strette venivano tagliate; il lettore di schermo legge ancora "libere". Poi, sull'anteprima (Luca: "aggiungila"), nella stessa vista i lavori mostrano l'ora d'inizio al posto del nome, che nelle colonne strette diventava "A."; il lettore di schermo legge ancora nome e orario completo ("Anna Russo, 15:00–16:30").

**Quarta parte** (Luca: "effettua le due migliorie"):
- **Un tocco su un orario vuoto aggiunge un lavoro a quell'ora**, in Giorno e Settimana, da telefono e da computer: si apre "Aggiungi un tuo lavoro" con il giorno e l'ora (alla mezz'ora) già scritti. La fine è la durata dei lavori che fa più spesso (Luca: "effettua miglioria"): si contano i lavori non annullati con la fine, nello stesso giorno, arrotondati alla mezz'ora; serve che una durata si ripeta almeno due volte, altrimenti un'ora. Toccare un lavoro apre il lavoro come prima. Da tastiera resta il pulsante "Aggiungi lavoro".
- **Da computer l'agenda si riapre sull'ultima vista scelta** (Giorno, Settimana, Mese o Anno), salvata su quel browser. Sul telefono no: lì resta la regola della seconda parte (Giorno, o Settimana se oggi è vuoto).
- Il nome dei lavori per il lettore di schermo nella Settimana del telefono è in un solo testo: diviso in due pezzi, il browser della CI lo leggeva "09:00 –10:30" e le prove non lo trovavano.

**Verifica**: anteprime prima/dopo da computer e telefono con dati di prova; `pnpm lint` e `pnpm typecheck` di `apps/web` puliti; prove nel browser di `e2e` (T4, T9 e C1 aggiornate: la domenica sera il lavoro di lunedì è già in vista nella settimana; nuove prove in `agenda-orari-in-vista.spec.ts` per il tocco su un orario vuoto e la vista ricordata).
