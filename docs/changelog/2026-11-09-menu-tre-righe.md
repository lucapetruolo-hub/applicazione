# Menu con le tre righe (09/11/2026)

**Richiesta di Luca:** "il menu con le tre righe non lo trovo molto
funzionale, controlla come migliorarlo e a cosa serve realmente", insieme
alla miglioria rimasta dalla barra in alto (2026-11-09-barra-in-alto-semplice.md):
pagina sotto ferma col menu aperto, come nel menu dell'account.

**Cosa non andava (da telefono):** a chi aveva fatto l'accesso il menu
ripeteva in cima tutte le voci dell'account, identiche alla tendina del
tondino (17 voci per un professionista, più di due schermate), e nell'area
privata c'erano anche le schede Oggi/Agenda/Richieste: le stesse voci in tre
posti. I mestieri erano chiusi in tre gruppi da aprire; "Accedi" era già in
alto; si apriva da destra con il pulsante a sinistra; la pagina sotto restava
bloccata solo sul body (su iPhone si trascinava ancora); la × era piccola e
il fuoco della tastiera non entrava nel menu.

**Decisione (scelta di Luca sulla proposta, opzione "tutti i sì e togli Accedi"):**

1. Tre righe = "il sito", tondino = "il mio account": nel menu restano Come
   funziona, Quanto costa, Offri i tuoi servizi (non per i professionisti), i
   mestieri e "Richiedi un preventivo" (non per i professionisti). Tolte le
   voci dell'account e "Accedi".
2. I 15 mestieri subito visibili, con l'icona, in **ordine alfabetico**
   (ordine neutro, mai per numero di professionisti), sotto "Cerca per
   mestiere". Su computer "Servizi" resta il pannello a tre colonne.
3. Nell'area del professionista (`/dashboard`) e in Admin le tre righe non
   compaiono: ci sono già le schede e il tondino, il logo riporta al sito.
4. Il menu si apre da sinistra, dal lato del pulsante.
5. Pagina sotto ferma come nel menu dell'account: classe `site-menu-open`
   sull'html (`overflow: hidden` fino a 860 px, barra in basso del profilo
   nascosta) e `overscroll-behavior: contain` nell'elenco.
6. Tastiera: il fuoco va su "Chiudi menu" all'apertura, il Tab resta dentro
   il menu, con Esc o alla chiusura torna sulle tre righe; × da 44 px. Il
   menu si chiude anche cambiando pagina col tasto "indietro".

**Verifica:** telefono simulato (iPhone 13, 390 px) e 320 px, da
visitatore, cliente e professionista: pagina scorsa a 300 px, menu aperto,
rotella senza effetto (la pagina resta a 300 px), 30 Tab senza mai uscire
dal menu, Esc riporta il fuoco sulle tre righe. In `/dashboard` le tre righe
non ci sono. Nessuno scorrimento orizzontale a 320 px.
