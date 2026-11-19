# Pagamento a righe nel riquadro dell'appuntamento (19/11/2026)

**Richiesta** (Luca, con la foto dell'Agenda): in "Pagamento", nel riquadro
aperto dell'appuntamento, mettere in ordine i numeri e scrivere anche il totale
del preventivo, quanto è stato pagato online e quanto resta.

**Decisione**: il riquadro non è più una riga sola con l'acconto nel titolo e
una cifra a destra senza nome ("Acconto pagato online 49,60 €" e, staccato,
"110,40–140,40 €"). Ora è un piccolo conto, una riga per cifra, scritta a
sinistra e cifra a destra:

- lavoro fissato con acconto pagato: "Totale del preventivo", "Acconto pagato
  online" (con la spunta), poi sotto una riga sottile "Resta a fine lavoro" in
  grassetto;
- acconto non ancora pagato: totale e "Acconto online da pagare";
- pagamento diretto: solo il totale;
- lavoro terminato: "Importo finale", "Pagato online" e, se resta qualcosa,
  "Resta da pagare online" o "Resta da incassare"; con il saldo diretto la riga
  "Saldo diretto".

Sotto resta una riga piccola che dice come arriva il saldo. Le cifre sono le
stesse di prima (`agendaPayment` in `apps/web/src/lib/agendaPayment.ts`, prima
`agendaPaymentLine`): cambia solo come sono scritte.

**Motivo**: il professionista in giro deve capire a colpo d'occhio quanto vale
il lavoro, quanto ha già preso e quanto deve ancora arrivare. La cifra a destra
senza nome si leggeva come il totale, invece era quello che restava.

**Verifica**: typecheck e lint; foto da computer e da telefono con tre lavori
dell'account di prova (acconto pagato, finito tutto online, finito con saldo
diretto) in `/mnt/project-files/anteprime/pagamento-in-agenda/`.
