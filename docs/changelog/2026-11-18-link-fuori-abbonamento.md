# "Il tuo link": far vedere che i lavori non contano nell'abbonamento

**Richiesta** (Luca, 18/11/2026): in "Il tuo link" la frase "Mandalo ai tuoi
clienti: le loro richieste arrivano solo a te e i lavori non contano nel tuo
abbonamento." non fa capire abbastanza che quei lavori non contano
nell'abbonamento. Valutare testo, colore ed effetti da esperto.

**Cosa non andava**: il vantaggio più forte stava in coda a una frase lunga,
grigia, con lo stesso peso del resto. Si leggeva per ultimo o non si leggeva.

**Decisione**:
- Sotto il titolo una **fascia verde chiaro** (velo verde come il bollino
  "Verificato", angoli 20) con una spunta in un cerchio verde scuro, il titolo
  in grassetto verde "Non contano nel tuo abbonamento" e una riga sotto: "I
  lavori dei clienti del tuo link, anche quando hai finito quelli del mese."
  Verde = buona notizia, come da regole del sito.
- La frase di sotto si accorcia: "Mandalo ai tuoi clienti: le loro richieste
  arrivano solo a te." con "Scopri di più" come prima.
- Nel conteggio del periodo la coda diventa "**fuori abbonamento**" in verde
  grassetto.
- In "Oggi", il riquadro "Porta i tuoi clienti" dice "I lavori dal tuo link
  **non contano nel tuo abbonamento**" con la stessa parte in verde.
- Un solo effetto leggero all'apertura: la fascia sale di 6 px comparendo e la
  spunta si posa (420 ms, una volta). Con "riduci movimento" niente effetto
  (regola globale di `globals.css`). Niente coriandoli, niente animazioni che
  si ripetono.
- Non si scrive "gratis": i lavori pagati online hanno comunque la trattenuta
  del 7%, quindi "gratis" sarebbe impreciso.

**Verifica**: tipi e lint di `apps/web`; foto prima/dopo da telefono e da
computer in `anteprime/tuo-link/` (cartella del progetto).
