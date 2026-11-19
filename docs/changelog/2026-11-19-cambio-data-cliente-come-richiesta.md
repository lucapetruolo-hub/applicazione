# Cambio data dal cliente con la scelta nuova degli orari (19/11/2026)

**Richiesta** (Luca, durante le prove a mano): "dal cliente, per la modifica
data sembra ci sia ancora la scelta vecchia degli orari".

**Cosa c'era**: "Proponi un'altra data" del cliente (sul preventivo e sul
lavoro fissato, `QuoteDateChooser`) usava ancora il menu a tendina con tutte le
fasce in fila e la voce "Altro (data e orario personalizzati)". La richiesta e
il preventivo del professionista erano già passati alla scelta a righe
(`WeekSlotPicker`, docs/changelog/2026-11-18-scelta-data-come-profilo.md):
questo punto era rimasto indietro.

**Decisione**: stessa scelta a righe anche qui, sette giorni alla volta, un
giorno per riga con gli orari liberi del professionista come pillole. Sotto,
"Scrivi un altro giorno o orario" apre i tre campi a mano di prima (e
"Scegli tra gli orari liberi del professionista" torna indietro). L'orario di
adesso, se è una fascia dell'agenda, resta segnato ("appuntamento di adesso" o
"data del preventivo"). Non parte più nessun orario già scelto: prima era
selezionata la data di adesso e "Invia proposta" poteva rimandare la stessa.
Se il professionista non ha orari liberi si scrive la data a mano (prima
compariva solo "Nessun orario libero" e non si poteva proporre niente).

**Motivo**: un solo modo di scegliere una data in tutto il sito (regola di
Luca: funzioni sui percorsi che già esistono).

**Verifica**: typecheck e lint; foto da computer e da telefono su un lavoro di
prova fissato in `/mnt/project-files/anteprime/cambio-data-cliente/`.
