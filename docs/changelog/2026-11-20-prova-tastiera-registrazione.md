# Prova della tastiera sulla registrazione: non cade più se la pagina tarda (20/11/2026)

**Richiesta** (Luca: "sì miglioria"): trovare perché la prova "la casella dei
Termini della registrazione si spunta con Spazio" (`e2e/tests/tastiera.spec.ts`)
ogni tanto cade. Sulla PR #455 è caduta due volte di fila ed è passata al
rilancio, senza che la PR toccasse la registrazione.

**Causa**: la prova premeva Invio su una scelta e subito dopo cominciava a
premere Tab (fino a 150 volte) cercando il passo successivo. Se quel passo
tardava ad arrivare, i Tab giravano tutti sul passo vecchio e finivano prima
che la casella fosse sulla pagina. Non è un difetto del sito: una persona
aspetta di vedere la pagina.

**Decisione**: dopo ogni Invio la prova aspetta che il passo successivo sia
visibile (la scelta "Privato", poi la casella) e solo allora preme Tab. La
prova controlla le stesse cose di prima.

**Verifica**: in locale, rallentando di 1,5 secondi il passo successivo, la
prova di prima cade 8 volte su 8 e quella nuova passa 8 volte su 8.
