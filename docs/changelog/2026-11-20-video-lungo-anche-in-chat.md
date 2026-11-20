# Video più lungo di un minuto: le due scelte anche in chat e in "Le mie richieste" (20/11/2026)

**Richiesta** (Luca: "effettua le 3 migliorie" proposte dopo
`2026-11-19-video-lungo-due-scelte.md`).

**Decisione**:
1. Il box "Tieni il primo minuto" / "Rifai il video" è ora un componente solo
   (`VideoTooLongChoice`) usato nella richiesta, in chat (`ConversationView`) e
   nella modifica di una richiesta già inviata (`GuidedRequestCard`). In chat,
   se scrive il professionista, la frase dice "al cliente arriva solo il primo
   minuto". Il taglio resta di Cloudinary.
2. La durata si scrive per intero: "1 minuto e 23 secondi" invece di "83
   secondi" (`durationText`).
3. Domanda L18 per l'avvocato in
   `analisi/domande-commercialista-avvocato.md`: l'avviso "dopo la conferma il
   sito non può più rimborsare" può stare in "Scopri di più" nella finestra
   "Il lavoro è finito e va bene?" o deve restare in vista?

**Verifica**: typecheck e lint; in locale, in chat da telefono con un video di
83 secondi compare il box con "1 minuto e 23 secondi". La modifica di una
richiesta usa lo stesso componente ma non è stata provata a schermo (serve una
richiesta ancora modificabile sull'account di prova).

**Controllo delle dipendenze**: il 19/11 sera è uscito l'avviso
GHSA-7589-6fvf-x4pw su `effect` (ReDoS, corretto dalla 3.22.1), che Prisma
(`@prisma/config` 6.19.3) ferma alla 3.21.0: `osv-scanner` era rosso su ogni
PR. Portato alla 3.22.4 con una riga in `overrides` di `pnpm-workspace.yaml`.
Verifica: prove dell'API (1713) verdi, Prisma legge lo schema.
