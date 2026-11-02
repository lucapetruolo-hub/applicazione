# Iscrizione dei professionisti: altre 7 migliorie

**Richiesta** (Luca, 02/11/2026): dopo la PR #210
(`2026-11-02-registrazione-pro-grafica.md`) fare tutte le altre migliorie che
un esperto valuterebbe sull'iscrizione e sul primo profilo.

**Decisioni**:

1. **Un riquadro solo con le scelte fatte** (`SignupChoicesSummary` in
   `registrati/page.tsx`): "Ti iscrivi come · Con Partita IVA" e "Piano scelto
   · Base · gratis per 3 mesi", ognuno con il suo "Cambia". Prima c'erano
   l'etichetta del piano e il riquadro del tipo uno sopra l'altro. Al passo 1
   resta l'etichetta del piano. `useChosenPlanDetail` in `ChosenPlanChip.tsx`
   dà la stessa riga ai due.
2. **"Forse intendevi …?" sotto l'email** (`suggestEmailCorrection` in
   `packages/shared/src/emailSuggestion.ts`, con prove): uscendo dal campo,
   se il dominio somiglia a uno dei più usati in Italia (gmial.com,
   libero.ti, gmail.it, gmail,com) un tocco lo corregge. I domini aziendali e
   quelli veri vicini (tin.it, gmx.it) non si toccano; non blocca mai l'invio.
   Anche nel modulo "prima l'email" del cliente (`ClientEmailFirstAuth`).
   `AuthField` ha `onBlur`.
3. **Bozza che non si perde**: email e mestieri scelti restano nella scheda
   del browser (`sessionStorage`) se si ricarica o si va a cambiare il piano e
   si torna. Mai la password. Si cancella a iscrizione fatta, anche con Google.
4. **Primo profilo: cosa serve per pubblicarlo**: sotto il titolo "Per
   pubblicarlo 1 su 3" con Nome, Mestiere e Città che si spuntano mentre si
   compilano; un tocco porta al riquadro.
5. **Nomi corti nelle tessere da 3 per riga del telefono**: "Clima e
   caldaie", "Muratore" (`COMPACT_LABELS` in `CategoryTiles.tsx`); il nome
   intero resta per i lettori di schermo e sul computer.
6. **Indice del profilo sempre in vista**: resta attaccato sotto
   l'intestazione (sul telefono sotto la barra dell'area account, 118 px)
   mentre si scorre, con la parte che si sta guardando in verde; sul telefono
   scorre di lato da solo per mostrarla. Sul computer le 7 voci entrano in una
   riga sola.
7. **"circa 2 minuti"** accanto a "Passo 1 di 3" (`step.note` di
   `AuthStepHeader`).

**Verifica**: `pnpm test` di `packages/shared`, `pnpm typecheck` e
`pnpm lint` di `apps/web`; sito in locale con l'API vera, foto a 390 e
1440 px di ogni passo, del suggerimento, della bozza dopo il ricaricamento e
dell'indice mentre si scorre.
