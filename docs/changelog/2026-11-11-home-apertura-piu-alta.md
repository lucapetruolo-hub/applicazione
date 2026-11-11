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
