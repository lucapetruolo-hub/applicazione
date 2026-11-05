# Correzioni dalla prova da utente nuovo

**Richiesta** (Luca, 05/11/2026): correggere i punti 1, 2, 3 e 5 del rapporto
della prova del sito da utente nuovo
(`collaudo/2026-11-04-utente-nuovo/rapporto.md` nei file del progetto). Il
punto 4 ("Quando ti serve?" chiesto anche dopo aver scelto il giorno) resta
com'è: Luca vuole lasciare al cliente la scelta di un'altra data od ora.

**Decisioni**

1. **Preavviso nel preventivo con appuntamento entro 24 ore**
   (`RequestCard.tsx`). Prima compariva in rosso "Scegli un preavviso più
   breve", ma 24 ore è già il più breve e il preventivo partiva lo stesso.
   Ora l'avviso rosso resta solo quando esiste davvero un preavviso più breve
   che va bene; altrimenti una riga grigia informativa: "L'appuntamento è tra
   meno di 24 ore: il preavviso per questo lavoro è già passato", con cosa
   succede se il cliente annulla (non paga niente, o l'acconto online resta al
   professionista se l'ha scelto). Il cliente lo legge già prima di accettare
   (`QuoteAcceptSummary.tsx`).
2. **Professionista appena iscritto: conteggi che si contraddicevano.** Nel
   Profilo "Per pubblicarlo 3 su 3" diventa "Per salvarlo", e la frase sotto
   dice che per comparire nelle ricerche servono poi i dati fiscali. La
   finestra "Profilo salvato!" lo ricorda quando mancano. "Completa il
   profilo" in Oggi resta (è il nome usato anche nelle email).
3. **Niente consigli sulle visite né boost a chi non è nelle ricerche**
   (`dashboard/page.tsx`): con `publicVisible` falso (dati fiscali mancanti)
   spariscono "Il tuo profilo è visitato meno della media della zona" e
   "Aumenta la tua visibilità".
5. **"Totale indicativo · Prezzo finale"** per il cliente: "Totale" con un
   prezzo unico, "Totale stimato" con un prezzo "da… a…" (come già vede il
   professionista); "Prezzo finale" diventa "Tutto compreso" (resta "IVA
   inclusa" per chi la applica).

## Secondo giro (stesso giorno): punti 4, 6, 7, 9, 11, 12, 13, 14

Richiesta di Luca: "risolvi anche i punti 4-6-7-9-10 (proponi alternative)-11-12-13-14".
Sul 10 ("Nuovo profilo" accanto a lavori già terminati) Luca ha scelto "Lascia com'è".

4. **"Quando ti serve?" con un orario già scelto in agenda**: niente più errore
   "Scegli quando ti serve.". Andando avanti senza risposta, si ricava dal giorno
   (`timingForPreferredDate` in `packages/shared/src/requestTiming.ts`: entro 7
   giorni "In settimana", oltre "Con calma", mai "Oggi"); nel riepilogo è già
   segnata e si cambia. Nessuna scelta segnata all'apertura del modulo (come
   deciso nel §344: chi andava di fretta lasciava quella già scelta) e il cliente
   può sempre scegliere un altro giorno od orario.
6. **Cosa vede il professionista prima dell'accettazione**, stessi testi nel
   passo "Dove" ("Questi dati il professionista li vede solo quando accetti un
   preventivo") e nel riepilogo ("vede solo il tuo nome, la città e il lavoro:
   cognome, telefono e via restano nascosti"), come fa davvero
   `clientNameForProfessional`.
7. **Nome del cliente dopo l'accettazione**: per un account senza nome il titolo
   della scheda del professionista restava "Cliente". Ora, solo dopo
   l'accettazione, usa nome e cognome scritti nella richiesta (`getMyLeads` e
   `getMyBookings`). Prima dell'accettazione niente cambia.
9. **Schede dei risultati sul telefono**: sotto i 660px "Scegli" va sotto nome e
   bollini (`ProfessionalCard`), il nome non va più su tre righe e i bollini
   stanno due per riga.
11. **Richiesta del cliente**: compare "Orario chiesto: giovedì 5 novembre ·
    08:00–13:00" finché non c'è l'appuntamento, e l'indirizzo ha il numero civico.
12. **Accessibilità**: il campo "Indirizzo preciso (opzionale)" del Profilo ha il
    suo nome per il lettore di schermo (prima l'esempio).
13. **Professionista senza profilo**: Oggi e Profilo non fanno più le chiamate che
    rispondevano 404 (richieste, appuntamenti, abbonamento, verifica...), grazie a
    `professionalProfileId` dell'account.
14. **API che non risponde per qualche secondo** (riavvio di Render dopo un
    aggiornamento): le letture si riprovano da sole due volte, dopo 1,5 e 3
    secondi (`request` in `packages/api-client`); mai le scritture.

**Verifica**: typecheck, lint e test di web, shared, ui, api-client e api;
pagina costruita in locale contro l'API in linea: modulo del preventivo con
appuntamento entro 24 ore (riga grigia) e oltre (rosso con 48 ore), Oggi del
professionista nuovo (senza consigli né boost) e di Marco (con), scheda dei
risultati sul telefono, richiesta da agenda senza "Quando ti serve?" fino al
riepilogo con "In settimana" segnato.
