# Iscrizione con la carta più solida

**Richiesta** (Luca, 30/10/2026, "versione più profonda"): rendere solida
l'iscrizione del professionista con piano e carta (account → profilo → piano
e carta a 0 € → dati fiscali → identità → pagamenti online). Le richieste
erano sei:
- numeri di partenza e soglia;
- casi della carta con le carte di prova di Stripe;
- recupero di chi non dà la carta;
- giorno e messaggio prima del lancio;
- regole sul rinnovo automatico;
- prove esterne.

Poi: "Vanno bene le migliorie proposte prima se vanno in accordo con il
nuovo prompt" (prova completa con Stripe, email a chi non dà la carta,
conteggio delle carte in Admin).

**Decisione**

- **Imbuto** in Admin → Numeri → Professionisti e ricerche, "Iscrizione
  passo per passo":
  - quanti per settimana di iscrizione (ora italiana) arrivano ad account,
    email, profilo, carta, dati fiscali, identità e pagamenti online;
  - dal lancio, mai gli account di prova (`apps/api/src/admin/signup-funnel.ts`).
- **Soglia proposta**: 6 su 10 danno la carta entro 24 ore dal profilo e 8
  su 10 entro 7 giorni (`CARD_WITHIN_24H_TARGET`, `CARD_WITHIN_7D_TARGET`).
  Il giorno della carta si salva in `Subscription.cardAddedAt` (migrazione
  `20261030120000_carta_abbonamento`).
- **Ritorno da Stripe**:
  - carta salvata: "Fatto: carta salvata e mesi gratis attivi…";
  - pagina chiusa a metà: "Non hai finito di aggiungere la carta…", con il
    pulsante per riprovare.
  - L'email del pagamento non riuscito dice "Cambia la carta".
- **Promemoria della carta** 1 e 3 giorni dopo il profilo, dentro "Completa
  il profilo" (stesse notifiche, nessun tipo nuovo).
- **Elenco "Senza carta"** in Admin → Profili da confermare, sotto
  l'offerta, per telefonare.
- **Regole Visa e Mastercard sulle prove gratuite con carta**:
  - conferma subito dopo la carta (`SUBSCRIPTION_FREE_MONTHS_STARTED`, in
    "Account e sicurezza", non si spegne), con fine dei mesi gratis, importo
    e come annullare;
  - avviso del primo addebito **7 giorni prima** invece di 3
    (`FREE_MONTHS_END_NOTICE_DAYS`), con testo proprio "I tuoi mesi gratis
    finiscono il…";
  - i rinnovi normali restano a 3 giorni.
- **Prova automatica** `e2e/carta/iscrizione-carta.spec.ts` con
  `playwright.carta.config.ts`, controllo della CI `iscrizione-carta`:
  - cinque casi: 4242, 3155 con 3D Secure, 9995 rifiutata, pagina chiusa a
    metà, 0341 con test clock e primo addebito fallito;
  - per ognuno controlla schermo, database e Stripe;
  - gira solo con il segreto `E2E_STRIPE_SECRET_KEY` (solo chiavi
    `sk_test_`), altrimenti lo dice e passa;
  - prezzo e IVA di prova li crea `e2e/carta/prepara-stripe.mjs`;
  - i webhook arrivano con Stripe CLI.
- Giorno e messaggio prima del lancio, regole, domande per l'avvocato (81-83)
  e copione di 6 minuti per 5 professionisti: in
  `analisi/iscrizione-carta-solida/risultato.md` dei file del progetto.

**Verifica**

- Test dell'API verdi:
  - imbuto;
  - finestre dei promemoria;
  - `cardAddedAt`;
  - conferma una volta sola;
  - avviso a 7 giorni solo per la fine dei mesi gratis.
- Typecheck di API, sito e prove nel browser puliti.
- Prova nel browser fatta girare qui fino al pulsante di Stripe (profilo,
  finestra "Ora scegli il piano", pagina Abbonamento) con una chiave finta.
- La parte su Stripe aspetta la chiave di prova.
