# Fotovoltaico, accumulo e wallbox all'Elettricista

**Richiesta** (Luca, 06/11/2026, thread "Chiarire l'iscrizione di chi
installa fotovoltaico"): come si iscrive chi installa pannelli fotovoltaici?
Il fotovoltaico non è un mestiere a sé: chi lo installa sceglie Elettricista
(l'impianto fotovoltaico è un impianto elettrico, DM 37/2008 lettera a). Il
sito però non conosceva la parola: "fotovoltaico" o "vorrei i pannelli
solari" finivano all'intelligenza artificiale o a "Che lavoro ti serve?", e
tra le prestazioni suggerite all'Elettricista non c'era niente. Luca ha
scelto la stessa strada del termoidraulico, senza un mestiere nuovo.

**Decisione** (`packages/shared/src/problemMatch.ts`):
- "fotovoltaico", "pannelli solari", "impianto solare", "batteria di
  accumulo", "wallbox", "colonnina di ricarica", "auto elettrica" portano a
  Elettricista. "Inverter" da solo no: lo sono anche i condizionatori.
- Eccezioni: pulire o lavare i pannelli va a Pulizie; il solare termico
  (pannelli che scaldano l'acqua) va a Climatizzazione e caldaie, poi
  Idraulico.
- `TRADE_NAMES`: "installatore fotovoltaico", "installatore di pannelli
  solari", "installatore wallbox" e simili portano subito a Elettricista.
- `POPULAR_SERVICES` dell'Elettricista: "Installazione impianto
  fotovoltaico", "Batteria di accumulo", "Installazione wallbox", con le
  varianti in `serviceNames.ts` (es. "pannelli solari", "colonnina di
  ricarica") così contano come la stessa prestazione.

**Scartato per ora**: un mestiere "Fotovoltaico" a sé (al lancio 4 mestieri
in una città; da rivedere se in Admin "Cercati ma non capiti" ne arrivano
molti) e un avviso in registrazione "Installi fotovoltaico? Scegli
Elettricista" (proposto, non scelto).

**Verifica**: nuove prove in `problemMatch.test.ts` (impianto, accumulo,
wallbox e inverter del fotovoltaico → Elettricista; pulizia → Pulizie;
solare termico → Climatizzazione; "condizionatore inverter" resta
Climatizzazione; i due nomi di mestiere sicuri). Tutte le prove di
`packages/shared` (anche il banco di prova delle frasi) e quelle di
`apps/api/src/problem-match` e `src/admin` passano.
