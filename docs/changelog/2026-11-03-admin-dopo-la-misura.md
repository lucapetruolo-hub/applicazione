# Admin: correzioni dopo la misura "dopo" del riordino (03/11/2026)

**Richiesta di Luca:** "effettua tutte le migliorie" proposte dopo la misura
"dopo" (`analisi/admin-riordino/misura-dopo.md`: 10 compiti su 12 riusciti senza
aiuto, prima erano 6).

**Cosa cambia**

1. **Ricorso su un problema sul lavoro con conferma.** "Accogli il ricorso" e
   "Respingi il ricorso" aprono una finestra che dice cosa succede, con "Torna
   indietro". Prima decidevano al primo clic, ed è successo davvero durante la
   prova. Le spiegazioni già pronte "Il professionista non ha risposto" non si
   vedono più mentre il professionista ha ancora tempo per rispondere, e una
   riga dice fino a quando ha tempo. Nel ricorso, "Versione del professionista"
   spiega che la sua risposta è nel ricorso.
2. **Stato della ricerca coerente.** La scheda dell'account dice "Tolto dalla
   ricerca il …" con il motivo, e mostra "Rimetti nella ricerca" solo se il
   profilo è davvero fuori. Prima, con una misura già annullata, si vedevano
   insieme "Togli" e "Rimetti". Le spiegazioni già pronte sono adatte al
   contenuto: niente "Recensione non genuina" per un profilo (c'è "Profilo
   doppio o copiato"). L'interruttore "Account di prova" spento dice "Spento",
   ed "Elimina account di prova" compare, e il server la accetta, solo per un
   account già segnato come di prova e non chiuso.
3. **Stesso nome in ogni pagina.** Attività e persona insieme ("Bianchi
   Impianti Elettrici · Luigi Bianchi", `adminPersonName` in
   `packages/shared/src/adminNames.ts`) nella ricerca dell'admin, nella scheda,
   in Problemi segnalati e in Da fare. Gli account chiusi non mostrano più
   l'email finta `deleted-…@deleted.invalid`, ma "Account chiuso" e la data. In
   Da fare la colonna "Chi" del ricorso su una segnalazione mostra chi ha fatto
   ricorso.
4. **Tre parole per tre cose.** "Contestazione in banca" (aperta con la banca),
   "Contestazione di pagamento" (aperta dal sito, con una riga che spiega la
   differenza) e "Ricorso" (contro una decisione su una segnalazione: la scheda
   "Contestazioni" in Segnalazioni diventa "Ricorsi", e i pulsanti diventano
   "Accogli il ricorso" e "Respingi il ricorso"). Rimborso e contestazione di
   pagamento aperti sullo stesso lavoro si avvisano a vicenda: "decidili
   insieme". Il lato cliente non cambia: le email DSA dicono già "come
   contestare".
5. **Scadenze e pericoli anche fuori da Da fare.** La scheda della contestazione
   in banca mostra la scadenza e il motivo salvati all'arrivo anche quando
   Stripe non risponde. In Da fare i giorni si contano sul calendario di Roma
   (martedì mattina → venerdì è "fra 3 giorni", non 2), con "Oggi entro le" e
   "Domani entro le". "Ce ne occupiamo noi" mostra il possibile pericolo (gas,
   corrente...) in cima, il mestiere probabile al posto di "—", e "Prendo io" /
   "Lascia" come in Da fare.

**Dati di prova della misura** (`e2e/scripts/admin-dati-prova.ts`): l'account
chiuso di Bruno ha l'impronta dell'email, così si ritrova cercandola; il
profilo doppio è davvero tolto dalla ricerca, come dice la sua segnalazione.

**Verifica:** `e2e/tests/admin-dopo-misura.spec.ts` (ricorso con conferma e
"Torna indietro" che non decide, nome della persona, pericolo del gas e "Prendo
io", stato del profilo tolto dalla ricerca) su telefono e computer; passano
anche `admin-da-fare`, `admin-persone`, `admin-protezioni`, `andamento-sito`,
`segnalazioni`, `admin-due-passaggi`. Test unitari: `adminNames.test.ts`
(shared) e `admin.service.test.ts` (eliminazione solo di account di prova).
