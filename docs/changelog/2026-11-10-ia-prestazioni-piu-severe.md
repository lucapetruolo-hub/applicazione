# IA: prestazioni più severe e mestiere del dizionario se l'IA non ne dà

**Richiesta di Luca (10/11/2026):** dopo la rimisura del 9/11 (`analisi/abbinamento-problema/misura-ia/rimisura-servizi.md`), su 36 frasi l'IA dava ancora 4 prestazioni sbagliate, per esempio "Realizzazione cartongesso" per un buco nel solaio e per un massetto storto. Inoltre, in 2 frasi non indicava nessun mestiere. Luca ha scelto la strada "Istruzioni più severe all'IA".

**Decisione:**
- Le istruzioni dicono che, se nel catalogo non c'è il lavoro chiesto, la prestazione è null, anche quando ce n'è una vicina dello stesso mestiere. Seguono esempi dei casi visti nella misura: solaio e massetto non sono cartongesso, sbalzi di tensione non sono certificazione, cerniere di un mobile non sono porte, valvole dei termosifoni non sono installazione della caldaia.
- Se l'IA non dà nessun mestiere, e non dice né "fuori servizio" né "non è un lavoro", resta la risposta del dizionario.
- Chi scrive a mano "Cartongesso" tra i suoi servizi continua a essere trovato quando il cliente chiede il cartongesso, sia con le parole uguali sia tramite l'IA.

**Verifica:** test di `problem-match.service.test.ts` (due casi nuovi). La misura in produzione si fa di sera, sulle stesse 36 frasi del 9/11, con il limite gratuito condiviso con il giro delle 376 frasi.
