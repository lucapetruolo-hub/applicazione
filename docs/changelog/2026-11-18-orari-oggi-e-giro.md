# Orari completi in "Oggi e domani" e tappe del giro scelte per fascia

**Richiesta** (Luca, 18/11/2026): "nella pagina del professionista in «oggi» e
poi «oggi e domani» nell'orario inserisci la fascia completa e anche l'orario
che si è scritto in «arrivo verso le»; e poi il giro intelligente in agenda fai
in modo che si possano selezionare o deselezionare i vari appuntamenti divisi
per le varie fasce che ci sono della giornata".

**Decisione**

1. **"Oggi e domani"** (`apps/web/src/app/dashboard/page.tsx`): accanto al nome
   non più solo l'inizio ("08:00") ma la fascia completa ("08:00–13:00") e, se
   il professionista l'ha scritta, una pillola verde chiaro "Arrivo 09:00"
   (letta "Arrivo verso le 09:00" dal lettore di schermo). L'ora di arrivo vale
   come in agenda: solo per un lavoro di un giorno e dentro la sua fascia. Con
   l'ora di arrivo il lavoro si mette a quell'ora nell'elenco, come in agenda e
   nel giro. La colonna dell'orario è larga 112 px fissi, così i nomi restano in
   colonna con e senza pillola.
2. **Giro intelligente** (`apps/web/src/components/agenda/DayRouteSection.tsx`):
   sotto il titolo un riquadro chiuso "Scegli le tappe · 6 di 6". Aperto,
   elenca i lavori del giorno divisi per fascia ("Mattina 08:00–13:00",
   "Pomeriggio…", "Sera…": stesso inizio e stessa fine), con una casella per la
   fascia intera (piena, vuota o "a metà") e una per ogni lavoro. Il giro
   (mappa, ordine, tempi di strada, avvisi, Google Maps) si ricalcola sui soli
   lavori scelti; i tolti restano barrati per rimetterli, con "Rimetti tutte le
   tappe". La scelta vale per giorno finché la pagina è aperta. Mentre arriva il
   giro nuovo resta quello di prima sbiadito (niente riquadro vuoto a ogni
   casella), e più caselle di fila fanno una sola richiesta.
3. **API**: `GET /agenda/route?date=…&skip=booking-<id>,external-<id>`
   (`parseDayRouteSkip` in `packages/shared/src/agendaTools.ts`, al massimo 60
   chiavi, quelle non valide si ignorano). La risposta ha in più `skipped` (le
   tappe tolte) e `arrivalTime` su ogni tappa. Limite portato da 20 a 40
   richieste al minuto, perché ogni scelta ricalcola il giro (i tratti già
   chiesti a Google restano in memoria 24 ore).

**Motivo**: il professionista con più lavori nella stessa fascia lunga vedeva
"08:00" tre volte e non sapeva a che ora aveva detto di passare; nel giro non
poteva togliere un lavoro che fa un collaboratore o che salta, quindi tempi e
avvisi "non fai in tempo" erano sbagliati.

**Verifica**: prova nuova `e2e/tests/agenda-giro-scelta.spec.ts` (fascia e ora
di arrivo in Oggi, fascia intera tolta e rimessa a metà, axe senza problemi
gravi sul riquadro); passano anche `oggi-appuntamento`, `oggi-meteo`,
`agenda-fasce-ampie` e `agenda-accessibilita`; prova unitaria di
`parseDayRouteSkip` in `apps/api/src/agenda/agenda-tools.test.ts`. Foto prima e
dopo, telefono e computer, in `anteprime/agenda-giro/` dei file del progetto.
