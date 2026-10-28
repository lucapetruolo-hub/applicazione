# Modelli WhatsApp da far approvare a Meta

Promemoria su WhatsApp (docs/changelog/2026-10-28-promemoria-whatsapp.md).
I testi vengono da `apps/api/src/whatsapp/whatsapp-templates.ts`: nome,
categoria, testo e pulsanti devono restare identici, altrimenti Meta
rifiuta l'invio. Cambiare un testo vuol dire farlo approvare di nuovo.

## Prima di inviarli (al lancio, con la società)

1. Business Manager di Meta verificato con i dati della società.
2. Numero aziendale (SIM della società, mai un numero personale già su
   WhatsApp) aggiunto in WhatsApp Manager, nome visualizzato con il
   marchio definitivo.
3. Carta nel Billing Hub (si paga a consumo, Meta Platforms Ireland).
4. In WhatsApp Manager → Modelli di messaggio → Crea modello, uno per
   sezione qui sotto, con `<dominio>` = il dominio definitivo del sito
   (oggi `applicazione-web.vercel.app`).
5. Token di sistema permanente (Business Manager → Utenti di sistema) con
   i permessi `whatsapp_business_messaging` e `whatsapp_business_management`.
6. Variabili su Render: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
   `WHATSAPP_APP_SECRET` (App → Impostazioni → Di base),
   `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (una stringa a caso scelta da noi).
7. Webhook nell'app di Meta: URL `https://professionisti-api.onrender.com/whatsapp/webhook`
   (o il dominio vero dell'API), stesso token del punto 6, campo
   `messages` sottoscritto.
8. Prova: in Notifiche "Mandami il codice" con un numero vero, poi
   Admin → WhatsApp per vedere consegna e costo.

Regole di Meta già rispettate (le controlla `meta-whatsapp.provider.test.ts`):
niente variabili all'inizio o alla fine del testo, piè di pagina entro 60
caratteri, pulsanti entro 25, nessuna promozione.

## promemoria_appuntamento_cliente

- Tipo nel codice: `BOOKING_REMINDER_CLIENT`
- Categoria: **Utility**, lingua: Italiano (it)
- Testo:

  > Promemoria: {{1}} hai l'appuntamento con {{2}}. Indirizzo, dettagli e chat sono nella tua richiesta. Se non puoi più esserci, avvisa il professionista dalla chat.

- Esempio delle variabili: {{1}} = "giovedì 5 novembre alle 10:30", {{2}} = "Rossi Idraulica"
- Piè di pagina: "Messaggio automatico, le risposte non vengono lette"
- Pulsante 1, "Visita il sito web", URL dinamico: testo "Apri la richiesta", indirizzo `https://<dominio>/{{1}}`, esempio `https://<dominio>/le-mie-richieste?open=esempio`
- Pulsante 2, risposta rapida: "Non ricevere più"

## promemoria_lavoro_professionista

- Tipo nel codice: `BOOKING_REMINDER_PROFESSIONAL`
- Categoria: **Utility**, lingua: Italiano (it)
- Testo:

  > Promemoria: {{1}} hai un lavoro ({{2}}) a {{3}}. Indirizzo e contatti del cliente sono nella tua agenda.

- Esempio delle variabili: {{1}} = "giovedì 5 novembre alle 10:30", {{2}} = "Idraulico", {{3}} = "Latina"
- Piè di pagina: "Messaggio automatico, le risposte non vengono lette"
- Pulsante 1, "Visita il sito web", URL dinamico: testo "Apri l'agenda", indirizzo `https://<dominio>/{{1}}`, esempio `https://<dominio>/dashboard/agenda`
- Pulsante 2, risposta rapida: "Non ricevere più"

## professionista_in_arrivo

- Tipo nel codice: `PROFESSIONAL_ON_THE_WAY`
- Categoria: **Utility**, lingua: Italiano (it)
- Testo:

  > Sta arrivando {{1}} per l'appuntamento di oggi alle {{2}}. A tra poco.

- Esempio delle variabili: {{1}} = "Rossi Idraulica", {{2}} = "10:30"
- Piè di pagina: "Messaggio automatico, le risposte non vengono lette"
- Pulsante 1, "Visita il sito web", URL dinamico: testo "Apri la richiesta", indirizzo `https://<dominio>/{{1}}`, esempio `https://<dominio>/le-mie-richieste?open=esempio`
- Pulsante 2, risposta rapida: "Non ricevere più"

## appuntamento_annullato

- Tipo nel codice: `BOOKING_CANCELED`
- Categoria: **Utility**, lingua: Italiano (it)
- Testo:

  > L'appuntamento di {{1}} con {{2}} è stato annullato. Trovi i dettagli sul sito.

- Esempio delle variabili: {{1}} = "giovedì 5 novembre alle 10:30", {{2}} = "Rossi Idraulica"
- Piè di pagina: "Messaggio automatico, le risposte non vengono lette"
- Pulsante 1, "Visita il sito web", URL dinamico: testo "Vedi i dettagli", indirizzo `https://<dominio>/{{1}}`, esempio `https://<dominio>/le-mie-richieste?open=esempio`
- Pulsante 2, risposta rapida: "Non ricevere più"

## codice_verifica_numero

- Tipo nel codice: `PHONE_VERIFICATION_CODE`
- Categoria: **Authentication**, lingua: Italiano (it)
- Testo: quello fisso di Meta, con "Aggiungi avviso di sicurezza" e "Scadenza del codice: 10 minuti" accesi
- Pulsante: "Copia codice"

