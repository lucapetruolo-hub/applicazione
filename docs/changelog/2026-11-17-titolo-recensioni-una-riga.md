# Home: "Cosa dicono i clienti" senza andare a capo

**Richiesta** (Luca, 17/11): in home la scritta "Cosa dicono i clienti. Solo da
lavori fatti tramite il sito." non deve andare a capo.

**Decisione**:
- Da computer (da 1024 px in su) titolo e frase grigia restano insieme su una
  riga con "Vedi tutti" a destra. Il titolo si stringe quanto basta: 40 px
  invece di 44 sugli schermi larghi, circa 34 px a 1024 px.
- Da telefono e tablet una riga sola sarebbe illeggibile (servirebbero circa
  15 px). Quindi titolo "Cosa dicono i clienti." su una riga, sotto la frase
  grigia intera più piccola (18 px telefono, 24 px tablet) e "Vedi tutti" sotto.
  Niente parola spezzata a metà frase. A 320 px il titolo scende a 26 px.
- Vale anche per "Nuovi professionisti. Appena arrivati sul sito.", la stessa
  sezione quando non ci sono ancora recensioni. Le altre sezioni non cambiano.

**Come**: `Section.module.css` (packages/ui) legge quattro variabili nuove
(`--section-title-row-wrap`, `--section-title-main-basis`,
`--section-title-note-*`) con i valori di sempre come riserva; la home le
imposta solo sul contenitore `.oneLineTitle` di questa sezione
(`HomeContent.module.css`).

**Verifica**: sito in locale con i dati dell'API, Playwright da 320 a 1920 px:
titolo su 1 riga e frase su 1 riga a ogni larghezza, nessuno scorrimento di
lato. Foto prima/dopo in `anteprime/titolo-recensioni/` nella cartella del
progetto.
