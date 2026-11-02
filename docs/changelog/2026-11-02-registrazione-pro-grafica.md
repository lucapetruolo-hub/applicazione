# Grafica dell'iscrizione dei professionisti

**Richiesta** (Luca, 02/11/2026): valutare da esperto come migliorare la
grafica di `/registrati?ruolo=professionista&livello=BASE` e dei passi
successivi, poi fare tutte e 12 le migliorie proposte e vedere se uniformare
anche la scelta tra cliente e professionista. Analisi e foto in
`analisi/registrazione-pro-grafica.md` e `anteprime/registrazione-pro-grafica/`
nella cartella del progetto.

**Decisioni**:

1. **Dopo la conferma dell'email si va al profilo**, non più alla pagina
   Abbonamento: senza profilo quella mostrava solo "Completa il tuo profilo
   per iniziare" e il livello scelto si perdeva. Il profilo riceve
   `?livello=` e dopo il primo salvataggio la finestra del piano porta a
   `/dashboard/abbonamento?livello=…` con "Attiva Base". Un account che già
   esisteva (accesso con Google) va dritto all'abbonamento come prima. Tolto
   `nuovo=1` dalla pagina Abbonamento (non lo manda più nessuno).
2. **Piano scelto sempre in vista** (`ChosenPlanChip`): "Piano Base · gratis
   per 3 mesi · Cambia" sotto il titolo dei passi e in cima al primo profilo.
   I mesi arrivano dall'offerta attiva (`GET /subscriptions/founders`); Plus e
   Pro con il prezzo + IVA. "Cambia" porta ai livelli di /per-professionisti.
3. **Tre passi, non quattro**: Come lavori (1), Account (2), Email (3). La
   scelta cliente/professionista non si conta più: chi arriva da "Iscriviti"
   la salta e partiva da "Passo 2". Per coerenza il cliente non ha più "Passo
   2 di 2", solo "Indietro".
4. **Mestieri più compatti sul telefono**: `CategoryTiles` con `compact`
   (usato da `CategoryMultiPicker`, quindi anche nel profilo e in admin) sotto
   560 px mette 3 tessere per riga, più basse, icona a 36 px. L'ordine delle
   tessere non cambia.
5. **Piede corto** anche nelle pagine di accesso e iscrizione (`AUTH_PAGES` in
   `SiteFooter`), come nelle aree riservate.
6. **Foto e vantaggi accanto alla scheda sul computer** (da 1024 px, colonna a
   sinistra che resta ferma scorrendo); sul telefono non ci sono più: allungavano
   la pagina a metà iscrizione. Anche "Come lavori?" usa lo stesso schema.
7. Etichette dei campi: controllate, "Che lavori fai?" usa già la stessa
   classe di Email e Password. Nessun cambio.
8. **Icona del titolo "Come lavori?"**: ricevuta invece della valigetta, che è
   già l'icona di "Con Partita IVA".
9. **Schermata dell'email**: "Email sbagliata? Correggila" come link grigio
   più piccolo (`link-button is-quiet`), "Lo faccio dopo" come pulsante bordato.
10. Banner dei cookie: misurato, sul telefono occupa circa l'11% dello schermo
    (non metà, come scritto nell'analisi). Per accorciarlo andrebbero tolte frasi
    messe per il Garante e per il collaudo (M-13): lasciato com'è.
11. **Profilo: indice dei riquadri** in cima (Identità, Mestieri e bio,
    Esperienza, Preavviso, Prestazioni, Lingue, Portfolio), che scorre di lato
    sul telefono. Il primo profilo si apre con "Account creato" e "Ora il tuo
    profilo pubblico: servono nome, mestiere e città". "Salva profilo" resta
    attaccato al fondo appena si cambia qualcosa (già così dal §349).
12. **Rotellina** nel pulsante "Registrati" mentre si crea l'account
    (`.button-spinner`).

**Verifica**: `pnpm typecheck` e `pnpm lint` di `apps/web`; sito in locale con
l'API vera, foto di ogni passo a 390 e 1440 px prima e dopo.
