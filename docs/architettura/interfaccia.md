# Interfaccia: Tamagui 3 e pagine in HTML semplice

Regole per chi scrive interfaccia in `apps/web`, `apps/mobile` e `packages/ui`
(importato dai `CLAUDE.md` di quelle cartelle). Testo spostato parola per
parola da `CLAUDE.md` §2 il 10/11/2026 (docs/changelog/2026-11-10-riordino-file.md).

- **Regola critica Tamagui**: in `apps/web` e `apps/mobile` non importare
  MAI primitive da `"tamagui"` direttamente (`Text`, `XStack`, `YStack`,
  `H1`, `Input`, ecc.) — vanno sempre importate da `"@professionisti/ui"`,
  che le ri-esporta. Motivo: né `apps/web` né `apps/mobile` dichiarano
  `tamagui` come propria dipendenza (solo `packages/ui` la dichiara);
  importarla direttamente crea un'istanza del modulo diversa da quella in
  cui `createTamagui()` è stato eseguito, causando a runtime l'errore
  `Can't find Tamagui configuration` (capita sia in SSR che client-side,
  indipendentemente da `@tamagui/next-plugin`). Se serve una nuova
  primitiva Tamagui in un'app, va prima ri-esportata da
  `packages/ui/src/index.ts`.
- **Tamagui 3** (docs/changelog/2026-11-02-tamagui-3.md, prima Tamagui 1):
  valori "piatti", token senza `$` e stati nel valore
  (`backgroundColor="blue10 hover:blue9 press:blue8"`, `fontSize="16px xs:13px"`),
  niente `hoverStyle`/`pressStyle`/`$xs`; `render` al posto di `tag`, `role` e
  `aria-label` al posto di `accessibilityRole`/`accessibilityLabel`; un
  `lineHeight` numerico è un rapporto, i pixel si scrivono `"26px"`.
  `styleCompat: "legacy"` e `defaultPosition: "relative"` in
  `packages/ui/src/config.ts` tengono l'impaginazione di prima. `Button` e
  `Input` sono nostri (`packages/ui/src/Button.tsx`, `Input.tsx`) con le
  misure "1"…"5" di Tamagui 1: quelli di Tamagui 3 hanno misure "xs…xl".
  Le classi atomiche di Tamagui 3 valgono quanto una sola classe: una regola
  di `globals.css` con due classi ora vince sugli stili scritti nel
  componente (prima no). I valori di base (token, font, temi) di Tamagui 1
  restano fissati in `packages/ui/src/tamaguiDefaults.ts` (Tamagui 3 non ha
  più quella config): un tema nuovo si scrive a mano lì e in
  `packages/ui/src/usedThemes.ts`, poi
  `pnpm --filter @professionisti/ui genera-default-tamagui` lo controlla. Non
  si importa `@tamagui/config` nel sito (§345). Sul sito niente animazioni di
  Tamagui (nessun driver, `animations.web.ts`). Due comportamenti di
  Tamagui 1 rimessi sul sito: i riquadri con ruolo button/checkbox/link/
  radio/textbox/switch raggiungibili col Tab (`focusableRoles.ts`) e il
  tocco che risale ai contenitori, con una correzione di una riga al
  pacchetto (`patches/@tamagui__web@3.1.10.patch`, da rifare a ogni
  aggiornamento di Tamagui).
- **Pagine pubbliche in HTML semplice** (docs/changelog/2026-11-09-pagine-pubbliche-senza-tamagui.md
  , 2026-11-09-citta-e-profilo-senza-tamagui.md e
  2026-11-09-barra-in-alto-senza-tamagui.md): piè di pagina, barra in alto,
  home, schede dei professionisti (logica comune in `professionalCardModel.ts`),
  profilo pubblico, contenitore dei risultati e i pezzi comuni `Section`, `Avatar`, `Rating`, `Badge`, `Chip`,
  `EmptyState`, `PriceLine`, `ProfessionalKindBadge` (varianti
  `*.web.tsx` in `packages/ui`) usano `div`/`span` con le classi globali di
  Tamagui (`is_View`, `is_Text`, `font_body`, `font_heading`) e un
  `*.module.css` con le sue variabili (`--t-space-N`, `--c-nome`), non le
  primitive Tamagui: il telefono non calcola gli stili all'apertura. Nuove
  parti di queste pagine si scrivono così; una variante `.web.tsx` cambia
  insieme al suo file per l'app. Il compilatore di Tamagui non va con
  Turbopack. Anche `Button` sul sito è HTML semplice (`Button.web.tsx`,
  docs/changelog/2026-11-10-pulsanti-senza-tamagui.md): varianti comuni con
  l'app in `buttonStyle.ts`, prop di stile (anche `"44px xs:40px"` e
  `hover:`) tradotte in classi di `Button.module.css`, che si genera con
  `pnpm --filter @professionisti/ui genera-css-pulsante`.
