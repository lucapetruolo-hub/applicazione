# Preventivo: l'importo dell'acconto mentre si scrive la percentuale

**Richiesta** (Luca, 18/11): quando il professionista sceglie l'acconto online,
fargli vedere subito l'importo che sta chiedendo in base alla percentuale che
scrive.

**Decisione**:
- Sotto "Acconto online __ % dell'importo massimo" una riga che si aggiorna a
  ogni tasto: "Il cliente paga subito 70,00 € con la carta (25% di 280 €, il
  prezzo massimo)."
- Stessa regola che il sito usa poi davvero (`quoteDepositEurCents`): la
  percentuale si calcola sul totale massimo di tutte le voci, diritto di
  chiamata compreso, arrotondata al centesimo. Con la forbice la riga dice "il
  prezzo massimo"; con un prezzo unico no.
- Al 100% con una forbice: "Il cliente paga subito 180,00 € con la carta, il
  prezzo minimo. Il resto, se serve, a lavoro finito." (decisione di Luca del
  13/11, docs/changelog/2026-11-13-tutto-online-forbice.md). La vecchia riga
  generica sulla forbice resta solo finché non ci sono prezzi.
- Lavoro ricorrente: "a visita".
- Senza prezzi: "Scrivi i prezzi delle voci: qui vedi quanto paga subito il
  cliente con la carta."
- Sotto 0,50 € (minimo di Stripe): la riga in ocra scuro dice l'importo e
  cosa fare, prima ancora di premere Invia. Percentuale non valida: nessuna
  riga, l'errore lo dà l'invio come prima.
- Letta dal lettore di schermo quando cambia (`aria-live="polite"`).

**Come**: `depositPreviewLine` in `packages/shared/src/onlinePayments.ts` (con
prove in `onlinePayments.test.ts`), usata da `RequestCard.tsx`.

**Verifica**: prove di `packages/shared` verdi, typecheck e lint del sito.
Foto prima/dopo da telefono e computer in `anteprime/importo-acconto/` (25%,
100% con forbice, senza prezzi, sotto il minimo).
