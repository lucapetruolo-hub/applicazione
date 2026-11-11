# Home: apertura più vicina alla barra in alto (11/11/2026)

**Richiesta** (Luca): far iniziare la home un po' più in alto, così il primo
schermo è già centrato.

**Decisione e motivo**: tra la barra in alto e il titolo c'erano 71 px
(32 di margine esterno e 39 interni, `HomeHero.module.css`). Ora sono 40 px
da computer (8 + 32) e 32 da telefono (8 + 24). Su un portatile alto 768 px
la prima schermata prima tagliava "Richiesta urgente" (finiva a 781 px); ora
titolo, ricerca, esempi e "Richiesta urgente" ci stanno tutti (finisce a 750
px). Il resto dell'apertura non cambia.

**Verifica**: posizioni misurate con Playwright a 1440×900, 1366×768 e
390×844 (titolo da 135 a 104 px da computer, da 135 a 96 da telefono), foto
prima/dopo in `anteprime/home-caroselli-apple/alto*` della cartella del
progetto.

**"Non trovi il tuo lavoro?" torna in fondo alla riga delle categorie**
(stesso giorno): a Luca non piaceva come prima scheda (docs/changelog/2026-11-11-home-caroselli-larghi.md,
terzo giro). Le foto dei mestieri si vedono subito, e chi non trova il suo
mestiere trova l'uscita dopo l'ultima categoria. Tolti gli `order` del
telefono, che ora non servono più: anche lì la scheda è l'ultima, dopo "Mostra
altre N categorie", come prima.
