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

**Secondo giro** (sì di Luca alle migliorie proposte):
- Stessa disposizione per "Di cosa hai bisogno? Trova chi c'è vicino a te.",
  che andava a capo tra 801 e circa 1270 px. Da computer resta a 44 px dove ci
  sta e scende fino a circa 37 px a 1024 px; da tablet titolo e frase su due
  righe (da telefono "Non trovi il tuo lavoro?" resta nascosto come prima).
- Da telefono "Vedi tutti" subito sotto la frase grigia (niente spazio in più:
  il link è già alto 44 px per il tocco).
- La formula del computer ora legge `--one-line-ratio` e `--one-line-action`,
  così ogni titolo usa le sue misure.

**Come**: `Section.module.css` (packages/ui) legge quattro variabili nuove
(`--section-title-row-wrap`, `--section-title-main-basis`,
`--section-title-note-*`, `--section-title-row-gap`) con i valori di sempre come riserva; la home le
imposta solo sul contenitore `.oneLineTitle` di questa sezione
(`HomeContent.module.css`).

**Verifica**: sito in locale con i dati dell'API, Playwright da 320 a 1920 px:
titolo su 1 riga e frase su 1 riga a ogni larghezza, nessuno scorrimento di
lato. Foto prima/dopo in `anteprime/titolo-recensioni/` nella cartella del
progetto.
