# Lavori fatti tramite il sito (08/11/2026)

**Richiesta** (collaudo prima del lancio dell'08/11, funzione nuova n. 6,
`collaudo/2026-11-08/esperto-E10-prodotto.md`; "sì" di Luca a tutte tranne la
n. 12): sul profilo del professionista le foto di fine lavoro dei lavori fatti
tramite il sito, con il consenso del cliente dato recensendo.

**Decisione**

- Nella finestra della recensione, se il professionista ha caricato foto di
  fine lavoro, compaiono le miniature e la casella "Mostra le foto del lavoro
  nel profilo di X. Senza il tuo nome né l'indirizzo, le togli quando vuoi."
  **Spenta di serie**: le foto sono di casa del cliente (consenso esplicito,
  GDPR art. 6.1.a). Stessa casella delle dichiarazioni (`ConsentCheckbox`).
- Sotto "Recensione inviata" la stessa casella resta per togliere o dare l'ok
  dopo (anche quando il cliente ha recensito prima che il professionista
  chiudesse il lavoro con le foto). `PUT /reviews/:id/showcase`, solo
  l'autore, mai senza foto del professionista.
- `Review.showcaseConsentAt` (migrazione `20261108210000_lavori_fatti`).
- Sul profilo, sopra le recensioni, "Lavori fatti tramite il sito": le ultime
  12 schede con la prima foto (le altre nella galleria), la prima voce del
  preventivo accettato, stelle, città e mese. Solo lavori `COMPLETED` con
  recensione visibile; mai nome del cliente né indirizzo. Diverso da "Lavori
  svolti", che carica il professionista da sé.
- Il professionista non può chiedere o forzare l'ok: lo decide solo il
  cliente (§5.18, nessun lavoro "garantito" dal sito).

**Verifica**: test dell'API (`reviews.service.test.ts`, consenso solo con le
foto, ritiro, solo l'autore), `e2e/tests/lavori-fatti.spec.ts` su telefono e
computer (casella spenta, ok, sezione sul profilo, galleria, ritiro che la
toglie), axe senza errori gravi sulla casella.
