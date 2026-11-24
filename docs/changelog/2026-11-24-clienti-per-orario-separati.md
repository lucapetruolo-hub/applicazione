# Clienti per orario: a domicilio e online separati nella settimana

**Richiesta** (Luca, 24/11/2026, foto della pagina Agenda → Orari): "se viene
selezionato online c'è bisogno di due sezioni diverse per indicare quanti a
domicilio e quanti online".

**Cosa succedeva**: in "La tua settimana" (`WeekTemplateEditor.tsx`) c'era un
solo menu "Clienti per orario" che scriveva lo stesso numero in `homeMax` e in
`onlineMax`. Il database, l'API (prenotazioni, posti liberi, richieste) e la
modifica della singola fascia in agenda li tenevano già separati. In più, una
settimana salvata con numeri diversi (es. 4 a domicilio e 1 online) mostrava
solo quello a domicilio e, salvando, lo copiava anche sull'online.

**Decisione**:
- Con "A domicilio" e "Online" scelti insieme: titolo "Clienti per orario" e
  sotto due menu affiancati, "A domicilio" e "Online" (a capo da telefono
  stretto), in un gruppo con nome per il lettore di schermo.
- Con una sola modalità: resta un menu solo, "Clienti per orario", col numero
  di quella modalità.
- Ogni numero si ricorda anche spegnendo e riaccendendo la modalità; un online
  mai impostato parte dal numero a domicilio (come prima).
- Un numero salvato fuori dall'elenco (es. 7 dalla singola fascia) resta tra
  le scelte invece di sparire.

Nessuna modifica al server o al database. Non toccati il modulo di richiesta e
la disponibilità online (PR #474).

**Verifica**: prova nuova in `e2e/tests/settimana-tipo.spec.ts` (due menu con
2 e 1, online cambiato a 5 e salvato, l'API restituisce 2 e 5; spenta "A
domicilio" resta un menu solo con 5); tutte le prove della settimana tipo
verdi in locale; typecheck del sito e lint puliti. Foto prima/dopo da telefono
e computer in `anteprime/clienti-per-orario/` (cartella del progetto).
