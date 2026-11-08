# Accessibilità: gruppo 8 del controllo prima del lancio (08/11/2026)

**Richiesta**: Luca ha approvato tutti i gruppi del controllo dell'8/11
("sì a tutto quello che ritieni"), tra cui il gruppo 8, accessibilità:
E7-01…E7-17 ed E6-14 (rapporti in `collaudo/2026-11-08/esperto-E7-accessibilita.md`
ed `esperto-E6-ux.md` della cartella del progetto), con le migliorie "sì" del tema.

**Decisione e cosa cambia**:
- **E7-01** Area riservata: ogni pagina ha un titolo suo nella scheda del
  browser ("Agenda | …", "Le mie richieste | …"), da un `layout.tsx` con
  `metadata` (le pagine sono client), e un H1. "Messaggi" ha un H1 solo per il
  lettore di schermo (niente titolo visibile per scelta, §198).
- **E7-02, E7-03, E7-16** Un solo comportamento delle finestre
  (`lib/useDialogFocus.ts`, `components/ModalDialog.tsx`): il fuoco entra, il
  Tab resta dentro, Esc chiude e il fuoco torna sul pulsante. Usato da Filtri
  (cliente e professionista) e "Aggiungi un tuo lavoro". "Preferenze cookie"
  porta il fuoco sui pulsanti del banner; "Scopri di più" in Abbonamento si
  chiude con Esc.
- **E7-04** Chat: la riga della conversazione e "Vai alla richiesta" sono due
  pulsanti affiancati, non uno dentro l'altro; nome breve ("Conversazione con
  …, ultimo messaggio: …").
- **E7-05** Contrasti sopra 4,5:1: scadenza "Rispondi entro" in ocra scuro
  (`ottoneScuro`), numero sul filtro scelto in bianco pieno, appuntamento
  annullato e giorni passati senza trasparenza, scheda "A domicilio" e "Torna
  ai risultati" del profilo pubblico sui verdi scuri, trimestri vuoti DAC7 su
  fondo pesca invece che trasparenti.
- **E7-06, E7-07** Contatti e Account: il campo sbagliato è segnato
  (`aria-invalid`), collegato al messaggio e prende il fuoco; il messaggio è in
  un `role="alert"`. Riempimento automatico su nome, cognome, email, provincia,
  scala/piano.
- **E7-08** Aprendo "Prepara il preventivo", "Modifica profilo" e "Modifica"
  dei dati fiscali il fuoco va sul titolo del modulo.
- **E7-10** Calendarietto dell'Agenda: `aria-pressed` sul giorno scelto,
  `aria-current="date"` su oggi, 32 px di altezza.
- **E7-11** Bersagli da almeno 24 px: piè di pagina, "Vedi dettagli" (44 px),
  "Aggiorna password", "Esci da tutti gli altri dispositivi", "Scarica",
  "Elimina", "Prova il suono", "Apri l'agenda →", "Scopri di più" del banner.
- **E7-12** Agenda sotto i 360 px: resta la vista Giorno.
- **E7-13** "Vedi i lavori terminati" e "Apri l'agenda" in Oggi: una sola
  fermata del Tab.
- **E7-15** Menu "Servizi": Esc riporta il fuoco sul pulsante.
- **E7-17** "Vai al contenuto" porta il fuoco sul contenuto
  (`components/SkipLink.tsx`). Il `tabindex` resta sul `<main>` solo finché ha
  il fuoco: sempre presente faceva prendere il fuoco al contenuto a ogni clic e
  rendeva instabile la prova della tastiera.
- **E6-14** Ore dell'agenda a 13 px (erano 11), ore libere e testi degli
  appuntamenti a 12-12,5 px, barra "Andamento" delle schede a 12 px.
- Migliorie "sì": numero di richieste mostrate annunciato al cambio di scheda
  o filtro; chat con `role="log"` (i messaggi nuovi si leggono da soli); un
  solo ocra e un solo grigio per i testi, scritto in `packages/ui/src/tokens.ts`.

**Non cambiato**:
- **E7-09** "undefined" nelle schede: è il bloccante E6-02, corretto nel
  gruppo 1.
- **E7-14** Nome dell'account letto due volte: non riprodotto. Il nome
  calcolato dal browser è "Nome, il mio account" sia da computer sia da
  telefono; la nuova prova lo controlla. Un `aria-label` sul pulsante faceva
  segnalare ad axe "etichetta diversa dal testo visibile", quindi resta com'era.
- Bollini dei risultati (20 px): restano, sono suggerimenti e non comandi
  principali.

**Verifica**: lint e typecheck di `apps/web` verdi; prove nel browser del
progetto `telefono-italia` (161) verdi in locale con Postgres; prove nuove in
`e2e/tests/tastiera.spec.ts`: titoli e H1 dell'area riservata, finestra Filtri
(fuoco dentro, Esc, ritorno su "Filtri"), nome dell'account letto una volta,
errore di Contatti annunciato, "Vai al contenuto".
