# Meteo in agenda: oggi, domani e dopodomani sempre

**Richiesta** (Luca, 18/11/2026): "perché il simbolo del meteo non compare nei
vari giorni dell'agenda?". L'icona compariva solo col maltempo (decisione del
22/10, docs/CHANGELOG.md §288): un giorno di sole senza icona sembrava un
errore. Scelta di Luca: "meteo per i prossimi 3 giorni con spiegazione al
passaggio del mouse o con tocco", senza temperatura.

**Decisione**:
- `GET /agenda/weather`: da oggi a dopodomani (giorno italiano) un'icona
  sempre, anche con sereno, poco nuvoloso e nuvoloso; più avanti, fino a 14
  giorni, solo col maltempo come prima (pioggia, temporale, neve, vento forte,
  nebbia). I giorni passati ancora nella cache di un'ora non hanno l'icona del
  bel tempo. Costante `WEATHER_ALWAYS_DAYS` in `packages/shared/src/agendaTools.ts`.
- Icona del bel tempo in grigio chiaro, maltempo a colori come prima: l'occhio
  va solo ai giorni a rischio.
- Spiegazione: al passaggio del mouse il nome del tempo ("Sereno", "Pioggia");
  al tocco il giorno si apre e accanto a "N lavori · N h libere" compare
  l'icona con la parola per esteso. Niente fumetto dentro il pulsante del
  giorno, che resta "apri il giorno" (un pulsante dentro un pulsante non è
  accessibile).

**Secondo giro** (Luca, stesso giorno: "sì, possiamo aggiungerci oltre il nome
del tempo anche la città, così è chiaro"):
- Il meteo di ogni giorno dell'agenda è del comune del primo lavoro a
  domicilio del giorno, come già in "Oggi"; senza lavori a domicilio, della
  zona del profilo. Al massimo 6 comuni diversi nei 14 giorni (ognuno è una
  chiamata a Open-Meteo, con un'ora di cache), oltre si usa la zona del
  profilo. `WeatherDayAlert.place` porta il nome del comune; la ricerca dei
  lavori del giorno è in comune con "Oggi" (`weatherPlaces`).
- Nuvoletta grafica subito al passaggio del mouse sull'icona: tempo sopra,
  comune sotto ("Nuvoloso / Roma"), larga quanto la colonna così non esce
  mai dalla scheda; solo con il mouse (`hover: hover`). Nel giorno aperto:
  "1 lavoro · 9 h libere · Nuvoloso · Roma".
- `comuneInAddress` riconosce anche la provincia senza parentesi
  ("00186 Roma RM"), il formato degli indirizzi scritti a mano nei lavori
  esterni.

**Verifica**: prove unitarie in `apps/api/src/agenda/agenda-tools.test.ts`
(sereno nei 3 giorni, solo fenomeni dopo, giorni passati saltati); foto da
computer e telefono con il meteo vero di Open-Meteo in
`/mnt/project-files/anteprime/agenda-meteo-tre-giorni/`.
