# Finestra "Lavoro terminato" del cliente: poche parole (19/11/2026)

**Richiesta** (Luca, dalla prova): quando il cliente conferma che il lavoro è
terminato, "con tutte quelle scritte si può impaurire e non pagare". Scelta la
versione in positivo, senza il pulsante del problema nella finestra: "C'è un
problema" sta già accanto a "Lavoro terminato" sulla scheda.

**Decisione**: titolo "Il lavoro è finito e va bene?", una riga sola (col
pagamento diretto: "Confermando dici anche di aver pagato il professionista"),
pulsanti "Sì, conferma" e "Annulla". L'avviso che dopo la conferma il sito non
rimborsa più non è tolto: sta in "Scopri di più" (`LearnMore`), perché il
cliente deve poterlo leggere prima di confermare.

**File**: `apps/web/src/components/ClientCompleteModal.tsx`,
`e2e/tests/sposta-e-terminato-in-anticipo.spec.ts` (nome del pulsante).

**Verifica**: typecheck e lint; la prova `sposta-e-terminato-in-anticipo`
passa dalla finestra.
