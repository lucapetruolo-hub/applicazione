# Le parti lasciate fuori dal test di sicurezza

**Richiesta**: Luca ha chiesto "Cosa stiamo tralasciando?" dopo il test di
sicurezza (`2026-11-25-correzioni-test-sicurezza.md`), poi "Sì tutto" alle
nove parti proposte. Le prove si sono fatte su Cloudinary dal vivo, su una
copia locale con dati di prova (azioni che cambiano dati, accesso, Stripe,
admin), e con il controllo ASVS livello 2. Rapporto in
`analisi/test-sicurezza-attacco-simulato.md` nei file del progetto, sezione
"Parti lasciate fuori"; ASVS in `analisi/asvs-livello-2.md`.

**Decisione e motivo**

1. **Documenti della chat con l'estensione giusta.** Provato dal vivo: un PDF
   vero caricato in chat tornava come `.../283cf7d78f96-fattura`, senza
   `.pdf`. Il sito riconosce i documenti dall'estensione (`isDocumentUrl`),
   quindi il PDF non si vedeva come documento. Per i file "raw" Cloudinary
   ignora `format` e usa il `public_id` così com'è. Adesso l'estensione, presa
   dal contenuto (`documentExtension`), va in fondo al `public_id`
   (`cloudinary.service.ts`, `uploadMedia`).
2. **Messaggio chiaro quando Cloudinary rifiuta un file.** Cloudinary risponde
   con un oggetto `{ message, http_code }` e non con un `Error`, quindi prima
   usciva "Caricamento non riuscito: Errore sconosciuto.". `uploadFailureMessage`
   dice cosa caricare (foto, documento o video) e non mostra il testo inglese
   di Cloudinary.

Nessun'altra falla trovata. Le tre cose da decidere con Luca (foto rimaste su
Cloudinary dopo la chiusura dell'account, elenco delle password comuni, numeri
di telefono scritti in lettere in chat) sono nel rapporto.

**Verifica**: `cloudinary-documents.test.ts` (PDF vero chiamato `.html` →
`.pdf` nell'indirizzo; Word → `.docx`; messaggi dei rifiuti). Le 42 prove in
locale e quelle dal vivo sono elencate nel rapporto.
