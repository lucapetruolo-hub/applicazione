# Conferma dell'email con il pulsante, codice di riserva

**Richiesta** (Luca, 28/10/2026): per la verifica dell'email dare un link da
cliccare al posto del codice. Alla domanda se tenere il codice come riserva
(link aperto su un altro dispositivo o nel browser interno dell'app di posta)
Luca ha scelto "Link più codice di riserva".

**Prima**: la stessa email aveva già codice e pulsante (§178, §243), ma il
codice era la cosa principale: nell'oggetto ("482915 è il tuo codice…"),
grande prima del pulsante, e il sito chiedeva di scriverlo. Il link
confermava da solo all'apertura della pagina, quindi un antivirus della
posta che apre i link da solo poteva consumarlo (la persona poi vedeva
"link non valido") e confermare un indirizzo senza che nessuno lo avesse
aperto. Riaperto dopo la conferma diceva "non valido o scaduto".

**Decisione**:
- Email: oggetto "Conferma la tua email per Professionisti", pulsante
  "Conferma la mia email" in primo piano; sotto, in un riquadro piccolo,
  "Il pulsante non si apre? Scrivi questo codice sul sito:" con il codice
  (`code.backup` in `email-layout.ts`). Pulsante 48 ore, codice 15 minuti
  come prima.
- Pagina del link (`/conferma-email?token=`): aprire il link non conferma
  nulla. Serve il tocco su "Conferma la mia email" (gli antivirus aprono il
  link ma non toccano i pulsanti). Con l'accesso già fatto in quel browser
  conferma da sola, perché un antivirus non ha la sessione.
- Una volta sola: la conferma è un `updateMany` condizionato
  (`emailVerifiedAt: null`), e il link resta salvato fino al prossimo invio,
  così riaperto dice "Email già confermata" senza cambiare nulla. Cambiando
  l'indirizzo il link vecchio smette subito di valere.
- Esiti della pagina: "Email confermata" (con il popup "Email verificata con
  successo" del §259; senza accesso aggiunge "Se ti sei iscritto da un altro
  dispositivo, lì la pagina si aggiorna da sola"), "Email già confermata",
  "Il link è scaduto", "Questo link non vale più" (sostituito da un'email più
  recente), "Conferma non riuscita" con "Riprova" (rete o troppi tentativi:
  il link è ancora buono). Da scaduto o non valido: "Mandami una nuova
  email" con l'accesso fatto, altrimenti "Accedi per riceverne una nuova".
- Attesa sul sito (dopo la registrazione, `/conferma-email`, riquadro del
  cliente in `/account`, `EmailCodeForm` con `linkFirst`): "Ti abbiamo
  mandato un'email a …, aprila e premi Conferma la mia email. Questa pagina
  si aggiorna da sola, anche se confermi dal telefono"; "Apri Gmail" (o
  Outlook, Yahoo, Libero, Virgilio, iCloud) secondo l'indirizzo; "Mandami
  una nuova email" dopo 60 secondi; "Il pulsante non si apre? Usa il codice"
  apre le sei caselle; "Email sbagliata? Correggila". Se il pulsante è già
  scaduto all'arrivo ne parte uno nuovo da solo (`/auth/me` dà
  `emailLinkValidForSeconds`).
- Avviso in alto: "…premi il pulsante nell'email che ti abbiamo mandato a …
  Non è arrivata?".
- Il recupero password resta con codice e pulsante com'era.

**Verifica**: `auth/email-verification.test.ts` (codice non nell'oggetto e
dopo il pulsante, conferma condizionata, riaperto "già confermata" senza
scritture, scaduto e sconosciuto con messaggi diversi, link vecchio annullato
al cambio d'indirizzo, validità per `/auth/me`); 867 prove dell'API verdi.
Prove nel browser `e2e/tests/conferma-email-link.spec.ts` su telefono e
computer (12 verdi): link aperto senza tocco non conferma, tocco conferma,
riaperto già confermata, scaduto, non più valido, conferma da sola con
l'accesso fatto, attesa che passa avanti quando si conferma "dal telefono",
codice di riserva, nessun problema grave di accessibilità (axe). Anteprime
in `anteprime/verifica-email-link/` (email e pagine, telefono e computer).
