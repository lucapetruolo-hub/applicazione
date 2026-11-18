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

**Verifica**: prove unitarie in `apps/api/src/agenda/agenda-tools.test.ts`
(sereno nei 3 giorni, solo fenomeni dopo, giorni passati saltati); foto da
computer e telefono con il meteo vero di Open-Meteo in
`/mnt/project-files/anteprime/agenda-meteo-tre-giorni/`.
