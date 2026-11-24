# Chi ha annullato e quando, sull'etichetta "Annullata"

**Richiesta** (Luca, 24/11/2026, con due foto da professionista): "Se lascio il
mouse su 'annullata' o se clicco sopra deve dire da chi annullata e quando".

**Decisione**: l'etichetta rossa "Annullata" della scheda in Richieste e
"Annullato" nel riquadro dell'appuntamento in Agenda diventano un pulsante con
una piccola "i". Col mouse si apre passandoci sopra; da telefono e da tastiera
con un tocco, e resta aperto finché non si tocca fuori, di nuovo l'etichetta o
Esc (Esc chiude solo il riquadro, non l'appuntamento). Dentro:
- chi: "Annullata dal cliente" oppure "Annullata da te";
- quando: giorno e ora italiani ("Martedì 24 novembre alle 11:52"), l'anno
  solo se non è quello in corso;
- "Con meno preavviso di quello che chiedi" se il cliente ha annullato dentro
  il preavviso;
- il motivo, se c'è (la nota scritta dal professionista al cliente, o le frasi
  automatiche come "Il cliente ha chiuso il suo account").

Componente unico `apps/web/src/components/CanceledInfo.tsx` (riquadro in un
portale con posizione fissa: la scheda ha l'overflow nascosto e il pannello
dell'Agenda scorre), testi in `apps/web/src/lib/canceledInfo.ts`.

**Dati**: chi ha annullato era già salvato (`Booking.canceledBy`, cliente o
professionista); quando no. Nuova colonna `Booking.canceledAt` (migrazione
additiva `20261124120000_annullato_quando`), scritta in tutti i percorsi che
annullano (cliente, professionista, calendario, account chiuso, lavori
ricorrenti) e azzerata quando l'appuntamento si riapre; esce anche
nell'esportazione dei dati ("Annullato il"). Un admin oggi non può annullare
un appuntamento, quindi "dall'admin" non serve. Per i lavori annullati prima
di questa modifica si legge solo chi (non c'è un dato affidabile da cui
ricavare l'ora); senza nemmeno chi l'etichetta resta com'era.

**Verifica**: prova nuova `e2e/tests/chi-ha-annullato.spec.ts` (annullamento
vero dall'API, passaggio del mouse, tocco, tocco fuori, Esc in Agenda) su
telefono e computer; prove dell'API su prenotazioni, profili e account verdi.
Foto in `/mnt/project-files/anteprime/chi-ha-annullato/`.
