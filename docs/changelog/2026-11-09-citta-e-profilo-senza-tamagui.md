# Città e profilo in HTML semplice, senza il calcolo degli stili di Tamagui

**Richiesta** (Luca, 09/11/2026, thread "Velocizzare home, città e profilo"):
dopo la home e il piè di pagina (`2026-11-09-pagine-pubbliche-senza-tamagui.md`),
fare allo stesso modo le pagine città (le schede dei professionisti con
l'agenda) e il profilo pubblico, in una seconda PR, senza nessun cambiamento
visibile.

## Decisione

Stesso metodo della prima PR: `div`/`span` con le classi globali di Tamagui
(`is_View`, `is_Text`, `font_body`, `font_heading`, `tm-paragraph`) e un
`*.module.css` accanto al componente con le variabili di Tamagui. I colori del
marchio che non hanno una variabile sono scritti in esadecimale con il nome nel
commento.

- **Scheda del professionista** (`ProfessionalCard`): la logica (giorni
  dell'agenda, primo orario libero, frecce, servizi, "Mostra tutte") sta ora
  in `packages/ui/src/professionalCardModel.ts`, usata sia dalla versione
  Tamagui per l'app (`ProfessionalCard.tsx`, aspetto invariato) sia dalla
  nuova `ProfessionalCard.web.tsx` per il sito: una sola logica, due modi di
  disegnarla.
- **Pezzi comuni** in `packages/ui` con la loro variante per il sito: `Badge`,
  `Chip`, `EmptyState`, `PriceLine`, `ProfessionalKindBadge` (tipi in
  `badgeProps.ts`, `chipProps.ts`, `emptyStateProps.ts`, `professionalKind.ts`).
- **Foto e icone dei mestieri**: `ProfessionalAvatar` e `CategoryIconBadge` del
  sito usano un riquadro comune (`PhotoBox.module.css`, `photoBoxStyle.ts`)
  invece di `YStack`.
- **Profilo pubblico** (`ProfessionalDetailContent.tsx`): tutta la pagina in
  HTML semplice con `ProfessionalDetailContent.module.css`. I riquadri
  cliccabili tengono `role="button"` e `tabIndex={0}` come prima, e Invio e
  Spazio continuano ad arrivare da `KeyboardActivation`.
- Restano Tamagui: la barra in alto (aspetta la PR del menu a tre righe, #292),
  la barra degli strumenti e l'intestazione della pagina città, `Button` e il
  riquadro "Richiedi preventivo".
- Riprodotti anche i dettagli che Tamagui scriveva così: un testo con
  `fontSize="8"` ha solo la dimensione (niente interlinea), `gap="1-5"` non è
  un valore valido e non scriveva nulla, la freccia spenta eredita il
  puntatore, i pulsanti `role="button"` senza `type`.

## Verifica

- **Elemento per elemento** (tag, attributi, posizione, misure e 46 proprietà
  di stile calcolate, da computer e da telefono), sito prima e dopo accesi
  insieme, tutto identico:
  - pagina città con la scheda chiusa, aperta, in modalità "Online" e coi
    giorni spostati avanti;
  - pagina di prova (non salvata) con le schede dei casi rari, anche dopo i
    clic su "+N", "Mostra tutte", "Mostra orari disponibili" e le frecce;
  - profilo pubblico normale, giorni avanti, "Online", `?link=1`, da cliente;
  - anteprima del profilo con dati finti (recensioni, foto, lavori finiti, più
    mestieri), agenda finta con orari liberi e agenda vuota;
  - professionisti salvati.
- `confronto-pagine` su 102 foto: 86 identiche, le altre per bordi dei
  caratteri o numero sulla campanella, controllate a occhio.
- Elementi Tamagui nella parte centrale della pagina città: 119 → 13.
- Misure in locale contro l'API vera, prima e dopo alternati:
  - profilo del browser col processore 4 volte più lento, mediana di 7:
    lavoro lungo città 964 → 818 ms (TBT 638 → 532), profilo 923 → 755 ms
    (TBT 634 → 485);
  - Lighthouse telefono col processore rallentato davvero, mediana di 5:
    città TBT 668 → 586 ms (punteggio 80 → 84), profilo 614 → 597 ms
    (83 → 84, entro le oscillazioni).
  - Con solo 2 professionisti di prova nella città: il guadagno cresce con
    ogni scheda in più nei risultati.
- `pnpm lint`, `pnpm typecheck`, test di `packages/ui`,
  `npx expo export --platform android` (l'app usa `packages/ui`): tutti ok.
