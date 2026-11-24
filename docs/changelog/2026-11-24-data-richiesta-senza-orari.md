# Data nella richiesta: riga quando mancano gli orari, Online spento per chi non lavora online

**Richiesta** (Luca, 24/11/2026, prova sul sito): "Nella richiesta preventivo
online non mi fa scegliere la data, penso sia un errore".

**Cosa succedeva**: la casella "Data e orario dell'appuntamento" del modulo
(`GuidedRequestForm.tsx`) compare solo per un professionista scelto che ha
orari liberi in agenda nella modalità scelta (fasce home e online separate).
Con "Online" e un professionista senza fasce online la casella spariva in
silenzio, e il tasto "Online" restava sceglibile anche per chi non lavora
online: la richiesta partiva lo stesso, il server non la fermava. Nella
richiesta a tutti la data non c'è mai, ed è voluto (nessuna agenda comune).

**Decisione** (Luca, scheda di scelta: "entrambe le correzioni", con la riga
riscritta da lui):
- Senza orari liberi in quella modalità, al posto della casella resta il
  titolo con la riga "<Nome> non ha orari online (a domicilio) liberi in
  agenda: dicci quando ti serve e ti proporrà una data in base alla sua
  disponibilità." Così vale anche per una data fuori agenda, che il
  professionista può proporre nel preventivo. La riga compare solo dopo che
  l'agenda è arrivata, per non lampeggiare.
- Professionista che non lavora online (`remoteAvailable` falso): "Online"
  resta visibile ma spento (`aria-disabled`, "Online, non disponibile" per il
  lettore di schermo), con la riga "<Nome> non lavora online: il lavoro si fa a
  domicilio."; un link con `modalita=ONLINE` torna ad "A domicilio".
- Il server rifiuta una richiesta online diretta a chi non lavora online
  (`guided-requests.service.ts`, "<Nome> non lavora online: scegli \"A
  domicilio\"."), per un link vecchio o una chiamata diretta.

Non toccati: richiesta a tutti e a più professionisti scelti (ognuno ha il suo
filtro `remoteAvailable` nello smistamento).

**Verifica**: prova nuova `apps/api/src/guided-requests/online-solo-a-chi-lavora-online.test.ts`
(ferma / parte); prove delle richieste guidate e di tutti i file con "ONLINE"
verdi (244); typecheck di sito e API e lint del modulo puliti. Foto da telefono
e computer con API finta in `anteprime/data-richiesta-online/` (cartella del
progetto).
