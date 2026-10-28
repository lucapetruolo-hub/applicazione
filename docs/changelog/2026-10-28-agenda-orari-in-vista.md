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

**Verifica**: anteprime prima/dopo da computer e telefono con dati di prova; `pnpm lint` e `pnpm typecheck` di `apps/web` puliti; prove nel browser di `e2e` (la prova C1 dei tempi usa la freccia della striscia, "Giorno successivo", al posto di "Periodo successivo" che sul telefono nella vista Giorno non c'è più).
