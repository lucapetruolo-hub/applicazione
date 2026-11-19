# 19/11/2026 — Tolta la casella "Aggiungi più lavori insieme"

**Richiesta** (Luca): eliminare dal profilo del professionista, quando clicca
su Modifica, la casella "Aggiungi più lavori insieme" (aggiunta il 17/11,
`2026-11-17-prestazioni-veloci.md`).

**Decisione**: tolta la casella con il suo pulsante "Aggiungi" e la riga
"Separali con una virgola". Restano tutti gli altri modi di aggiungere una
prestazione: i "Più cercati dai clienti" con un tocco e "+ Scrivi un'altra
prestazione" / "+ Aggiungi prestazione", uno alla volta, con prezzo e
suggerimenti dei nomi come prima. Tolta anche la funzione `splitServiceList`
in `packages/shared` (la usava solo la casella) con le sue prove.

Il componente `ServicesEditor` è usato solo nel modulo di `/dashboard/profilo`
(anche il primo profilo passa da lì), quindi la casella sparisce ovunque.

Arrivando da Oggi o dal preventivo (`?campo=prestazioni` o
`#profilo-prestazioni`) il modulo si apre e scorre alla sezione Prestazioni,
senza più mettere il cursore nella casella che non c'è.

**Verifica**: type check e lint del sito, prove di `packages/shared`; la prova
`e2e/tests/preventivo-veloce.spec.ts` ora controlla che la sezione sia in vista
e che la casella non ci sia più.

## Cursore sul prezzo dopo un "Più cercato"

**Richiesta** (Luca, stessa giornata): dopo un tocco su un "Più cercato dai
clienti", mettere subito il cursore sul prezzo, così si fa tutto in un passo.

**Decisione**: il tocco aggiunge la prestazione con la riga già aperta e il
cursore nel campo "Da €" (sul telefono si apre la tastiera dei numeri). Il
prezzo resta facoltativo: si può toccare un altro "Più cercato" o "Fatto".
La pagina scorre solo quanto basta per mostrare il campo.

**Verifica**: lint e type check; `e2e/tests/preventivo-veloce.spec.ts` tocca
il primo "Più cercato" e controlla che il cursore sia sul suo prezzo minimo.

## Invio nel prezzo chiude la riga

**Richiesta** (Luca): con Invio nel campo prezzo chiudere la riga come
"Fatto", così da tastiera si va avanti senza toccare lo schermo.

**Decisione**: Invio in "Da €" o "A €" chiude la riga (se la prestazione ha un
nome) e non invia il modulo del profilo; sulla tastiera del telefono il tasto
dice "Fine". **Verifica**: lint e type check; la stessa prova e2e scrive un
prezzo, preme Invio e controlla che la riga sia chiusa.
