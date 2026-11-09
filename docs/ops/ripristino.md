# Ripristinare il database

> **Da provare una volta prima del lancio** (checklist di lancio, punto 28):
> la prima volta non deve essere con i dati veri. Dopo la prova, correggere
> qui i passi che non tornano.

## Cosa c'è

- **Solo sul piano a pagamento** (Basic o superiore). Sul piano Free Render
  non fa backup e il database scade dopo 30 giorni: va controllato in
  Render → `professionisti-db-eu` → Info → Plan.
- **Ripristino a un istante** (Point-in-Time Recovery): ultimi 3 giorni sul
  workspace Hobby, 7 sul Professional.
- **Backup scaricabili** (logical backup): tenuti 7 giorni.

## Passi (15-30 minuti)

1. Scegliere l'istante: un minuto **prima** dell'errore (ora UTC nella
   dashboard: d'inverno l'Italia è UTC+1, d'estate UTC+2). Si perde tutto
   quello che è successo dopo.
2. Render → `professionisti-db-eu` → **Recovery** → **Restore Database** →
   istante scelto. Render crea un **database nuovo** accanto al vecchio (il
   vecchio non si tocca).
3. Quando il nuovo è pronto: copiarne la **Internal Database URL**.
4. Render → `professionisti-api-eu` → **Environment** → `DATABASE_URL` →
   incollare la nuova → **Save** (l'API riparte da sola; all'avvio
   `migrate deploy` non trova nulla da fare).
5. Controllare: `https://professionisti-api-eu.onrender.com/health/db`
   risponde `{"status":"ok","database":"ok"}`; sul sito una ricerca e
   l'accesso con un account di prova funzionano.
6. Tenere il database vecchio qualche giorno (per recuperare a mano
   eventuali righe scritte dopo l'istante), poi cancellarlo: si paga.

Il database non è nel Blueprint (`render.yaml`) proprio per questo: dopo un
ripristino si cambia solo `DATABASE_URL`, e una sincronizzazione del
Blueprint non può collegare l'API al database sbagliato.

## Dopo un ripristino

- Pagamenti: quello che Stripe ha registrato dopo l'istante scelto non è nel
  database. Stripe → Developers → Events: rimandare gli eventi di quell'arco
  di tempo all'endpoint (**Resend**). Stripe ripete già da sé gli eventi e
  l'API è fatta per riceverli più volte, ma dopo conviene controllare la
  quadratura in Admin → Finanza.
- Didit: le verifiche finite dopo l'istante si ricontrollano da sole (ogni
  10 minuti l'API chiede l'esito di quelle aperte).
- Avvisare chi ha scritto dopo l'istante, se si riesce a capirlo dai log.
