# Pulsanti del sito in HTML semplice, senza il calcolo degli stili di Tamagui

**Richiesta** (Luca, 10/11/2026, thread "Velocizzare home, città e profilo",
"Ok" alle migliorie rimaste dopo `2026-11-09-barra-in-alto-senza-tamagui.md`):
fare i pulsanti (`Button`), usati in tutto il sito, con una prova completa
perché sono ovunque, senza nessun cambiamento visibile. La barra di ricerca
resta per ultima.

## Decisione

- **`Button.web.tsx`** (solo sito): un `<button>` con le classi di Tamagui
  (`is_View`, `is_Text`, `font_body`, `is_Button`) e `Button.module.css`. Stessi
  attributi di prima (`role="button"`, `aria-disabled` e `disabled` sul
  pulsante spento, nessun `type`), `onPress` sul clic e nessun clic da spento,
  come faceva Tamagui.
- **Varianti comuni** in `packages/ui/src/buttonStyle.ts` (`BUTTON_TONES`,
  `BUTTON_TEXT`, `BUTTON_FRAME_BASE`): le legge anche `Button.tsx`
  dell'app, con gli stessi valori di prima. Una sola tabella, due modi di
  disegnarla.
- **Prop di stile delle pagine** (`height`, `width`, `opacity`,
  `backgroundColor`, `alignSelf`, `flex`, …, anche `"44px xs:40px"`,
  `"100% gtXs:auto"` e `"1 hover:0.88 press:0.8"`): ogni proprietà in ogni
  condizione ha una classe che legge il valore da una variabile CSS scritta
  sul pulsante. Così il pulsante ha solo le proprietà che gli dava Tamagui,
  con la stessa forza (una classe sola, quindi le regole di `globals.css`
  vincono come prima) e le stesse regole di Tamagui, viste sulla pagina di
  prova:
  - vince la prop scritta per ultima e sostituisce anche gli stati
    (`backgroundColor={rosso}` toglie il colore col mouse sopra);
  - una prop `undefined` toglie la proprietà;
  - `flex={1}` vale "1 1 auto", `flex="xs:1"` vale "1 1 0%".
- **`Button.module.css` si genera** da `buttonStyle.ts`
  (`pnpm --filter @professionisti/ui genera-css-pulsante`); un test controlla
  che sia aggiornato. Il tipo delle prop sul sito elenca solo gli stili
  previsti, quindi `pnpm typecheck` segnala uno stile nuovo da aggiungere lì.
- Restano Tamagui gli elementi scritti dalle pagine dentro i pulsanti (testi,
  icone, frecce) e la barra di ricerca, per ultima come deciso.

## Verifica

- **Ogni pulsante, elemento per elemento** (tag, attributi, misure e 75 stili
  calcolati, a riposo, col mouse sopra, premuto, col fuoco da tastiera e col
  fuoco dopo un clic, da computer e da telefono), sito prima e dopo accesi
  insieme, tutto identico:
  - pagina di prova non salvata con 133 pulsanti: 7 varianti × 6 misure,
    spenti, con icona, tutte le prop di stile usate dalle pagine, schede
    delle richieste (`CardButton`) in ogni tono;
  - tutte le pagine di `confronto-pagine` da visitatore, cliente e
    professionista (una pagina con misure instabili rifatta con più attesa);
  - dopo un clic: "Avanti" in `/preventivo` e `/urgente`, "Accedi" vuoto,
    menu dell'account aperto.
- **Comportamento uguale**: clic, Invio e Spazio su "Accedi", "Richiedi
  preventivo" (pulsante dentro un link) che porta a `/preventivo`, pulsante
  spento che lascia passare il tocco, stesso ordine del Tab.
- `confronto-pagine` su 102 foto: 101 identiche, l'altra con 37 pixel di bordo
  di un riquadro senza pulsanti.
- Misure in locale, telefono col processore 4 volte più lento, prima e dopo a
  ordine alternato, mediana di 12 giri, blocco (TBT):
  - pagina di prova con 133 pulsanti: 839 → 536 ms;
  - `/accedi`: 600 → 522 ms;
  - home: 775 → 748 ms, città: 543 → 532 ms, uguali entro le oscillazioni.

  Il guadagno cresce con il numero di pulsanti: le pagine pubbliche ne hanno
  pochi, l'area dei professionisti e i moduli di più.
- `pnpm lint`, `pnpm typecheck`, test di `packages/ui`,
  `npx expo export --platform android` (l'app usa la tabella comune): tutti ok.
