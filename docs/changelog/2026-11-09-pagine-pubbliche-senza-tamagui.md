# Pagine pubbliche in HTML semplice, senza il calcolo degli stili di Tamagui

**Richiesta** (Luca, 09/11/2026, dal thread "Velocizzare home, città e
profilo": "si migliorie tutte"): togliere il calcolo degli stili di Tamagui
all'apertura delle pagine pubbliche (home, città, profilo), con il suo
compilatore o con HTML semplice. Dopo
`2026-11-09-meno-javascript-comune.md` era il grosso del lavoro che restava al
telefono sulla home.

## Cosa costava (misurato prima)

Profilo del processore della home costruita in locale, telefono rallentato 4
volte: Tamagui da solo circa 770 ms (per ogni elemento `YStack`/`XStack`/`Text`
legge tema e props, calcola le classi e le scrive), più il lavoro di React per
"risvegliare" ogni suo componente (5-6 hook ciascuno). Sulla home ~280
elementi Tamagui, nel piè di pagina (su ogni pagina) ~60.

## Decisione

- **HTML semplice con CSS, non il compilatore di Tamagui.** Il compilatore
  (`tamagui-loader`, `@tamagui/next-plugin`) funziona solo con webpack ("legacy
  webpack compatibility plugin") e scrive i CSS con una sintassi di webpack
  (`!=!`) che Turbopack non capisce: da Next.js 16 il sito usa Turbopack
  (`2026-11-02-nextjs-16.md`), tornare indietro non conviene.
- **Stesso aspetto al pixel.** Gli elementi tengono le classi globali di
  Tamagui che danno la base (`is_View`, `is_Text`, `font_body`,
  `font_heading`, `tm-paragraph`, da `public/tamagui.css`) e le proprietà in
  più stanno in un foglio `*.module.css` accanto al componente, con le stesse
  variabili di spazi, colori e caratteri di Tamagui (`--t-space-N`,
  `--c-nome`, `--f-size-N`...), mai numeri ricopiati dove esiste la variabile.
  Le soglie dei media query sono quelle di Tamagui (801 px per `gtSm`, 1021 px
  per `gtMd`, 660 e 390 px per `sm`/`xs`).
- **Pezzi comuni in `packages/ui` come varianti per il sito**:
  `Section.web.tsx`, `Avatar.web.tsx`, `Rating.web.tsx` (stesso schema già
  usato da `Logo.web.tsx`, `icons.web.tsx`, `BadgeInfo.web.tsx`): il sito li
  prende al posto dei file Tamagui, l'app continua a usare quelli. I tipi
  stanno in `sectionProps.ts`, `avatarProps.ts`, `ratingProps.ts`, perché
  `./Section` dentro `Section.web.tsx` porterebbe a sé stesso.
  `packages/ui/src/css.d.ts` dichiara i `*.module.css`.
- **Piè di pagina preparato dal server**: `SiteFooter.tsx` non è più un
  componente del browser; solo tre pezzetti lo sono (`SiteFooterParts.tsx`:
  piede corto o completo secondo la pagina, "Accedi" nascosto con l'accesso
  fatto, "Preferenze cookie"). Logo in HTML semplice in `LogoPlain.tsx`
  (stesso disegno di `Logo.web.tsx`: se cambia uno, va cambiato l'altro).
- **Home**: `HomeContent`, `HomeHero` (tranne la barra di ricerca, `SearchBar`
  di packages/ui, con i campi e i loro temi), `PlatformStats`,
  `QuoteExampleSection`, `QualitySection`, `PriceEstimatorTool`,
  `NewProfilesCarousel`, `RecentReviews`, `ProCtaSection`.
- Non toccata la barra in alto: la sta cambiando la PR della pillola di
  ricerca (#280). Città e profilo (schede dei professionisti con l'agenda,
  `ProfessionalCard`, e `ProfessionalDetailContent`) in una seconda PR.

## Verifica

- **Elemento per elemento**: per ogni pagina toccata, sito prima e dopo
  accesi insieme, stessi dati, per ogni elemento confrontati tag, attributi
  (ruoli, `aria-*`, link), posizione e misure e 46 proprietà di stile
  calcolate, da computer (1440 px) e da telefono (390 px). Home con
  recensioni finte (risposta dell'API sostituita nel browser, così la sezione
  recensioni compare) e con l'elenco "Quanto costa" aperto: 937 elementi,
  nessuna differenza tranne gli identificativi automatici di React. Piè di
  pagina completo e corto (`/accedi`, `/dashboard`): identici.
- **Casi che i dati veri non mostrano** (foto profilo, stelle, sezione
  annidata con titolo, scura, compatta, con titolo della pagina): pagina di
  prova messa uguale nei due siti e non salvata: 104 elementi identici.
- `confronto-pagine` su 102 foto (pubbliche, area cliente e area
  professionista con gli account di prova): 69 identiche, le altre con
  differenze dovute a caricamenti e animazioni a orari diversi (numero sulla
  campanella, scorrimento dell'agenda all'ora corrente, mestieri che si
  accendono in /per-professionisti) o a pochi pixel di bordo dei caratteri;
  controllate a occhio una per una, nessuna differenza visibile.
- Misure sulla home in locale contro l'API vera, prima e dopo alternati:
  - Lighthouse telefono con il processore rallentato davvero
    (`--throttling-method=devtools`), mediana di 5: blocco (TBT) 1805 →
    1165 ms, punteggio 66 → 69.
  - Profilo del browser con processore 4 volte più lento, mediana di 7:
    lavoro lungo totale 1624 → 1039 ms.
  - Lighthouse simulato (quello predefinito), mediana di 12: TBT 395 → 430 ms,
    cioè uguale entro le oscillazioni; il tempo di esecuzione degli script
    scende da 1850 a 1541 ms e il compito più lungo da 466 a 225 ms, ma la
    simulazione non conta i compiti brevi in cui React divide il risveglio
    della pagina. Il processore rallentato davvero è più vicino a un telefono
    vero.
- `pnpm lint`, `pnpm typecheck` (sito, app e API), prove di `packages/ui`.
