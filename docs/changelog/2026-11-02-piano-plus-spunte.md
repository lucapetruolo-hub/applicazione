# Piano Plus più chiaro nella pagina per i professionisti

**Richiesta**: Luca, 2/11/2026: nella scheda del Plus su `/per-professionisti`
la frase "Lo stesso cliente conta una volta al mese" non si capiva e non si
vedeva come un vantaggio in più rispetto a Base. Colorarla di verde come la
riga dei lavori e metterla, con i 10 lavori, in un elenco con la spunta come
"Compreso in ogni livello".

**Decisione e cosa cambia**:
- Ogni scheda dei livelli mostra cosa dà in un elenco con la spunta verde, in
  grassetto: Base "3 lavori accettati al mese", Plus "10 lavori accettati al
  mese" e "Più lavori allo stesso cliente nello stesso mese contano come
  uno", Pro "Lavori senza limite" (`tierPerks` in `PerProfessionistiContent.tsx`).
- La frase nuova sta in un solo punto (`SAME_CLIENT_ONCE` in
  `packages/shared/src/plans.ts`) e si usa anche in `/dashboard/abbonamento`,
  con la stessa forma nella domanda frequente sul limite dei lavori.
- Etichetta "Consigliato" (verde pieno, testo bianco) accanto al nome del
  Plus, scelta da Luca tra le migliorie proposte.
- La regola non cambia (§362): su Plus e Pro lo stesso cliente conta una
  volta per periodo; su Pro non c'è limite, quindi si dice solo su Plus.

**Verifica**: typecheck e lint di `apps/web`; schermate da computer e da
telefono della sezione prezzi.
