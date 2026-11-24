# "Scarica le fatture del mese" in Admin → Finanza

**Richiesta** (Luca, 24/11/2026, thread "Emettere fatture elettroniche ai
professionisti"): un pulsante in Admin → Finanza che dia in un solo file zip
le fatture del mese da girare al commercialista, in qualunque programma lavori
(Aruba, Fatture in Cloud…). Prima controllare che non ci sia già: non c'era
(si scaricava solo l'XML di una fattura alla volta).

**Decisione**: `GET /admin/invoices/month/:month/zip` (scopo `FINANCE`, come
tutta la contabilità admin) con tutte le nostre fatture emesse nel mese
(`MANOVIA_TO_PROFESSIONAL`, `ISSUED`, serie `ABB` e `COM`, note di credito
comprese), ordinate per serie e numero:
- `xml/ABB-2026-0003.xml`: il file della fattura elettronica, quando c'è;
- `pdf/ABB-2026-0003.pdf`: sempre, lo stesso PDF del sito;
- `da-sistemare.txt`: solo se qualche fattura non ha ancora l'XML (dati
  fiscali del professionista incompleti, non ancora inviata), con il motivo.

Lo zip lo scrive `apps/api/src/common/zip.ts` senza dipendenze nuove (file
"stored", senza compressione: XML e PDF di un mese sono pochi MB). Ogni
download va nel registro azioni ("Fatture del mese scaricate in zip"), perché
dentro ci sono i dati fiscali dei professionisti. Pulsante accanto a
"Controlla che i conti tornino", con lo stesso campo Mese.

**Motivo**: il commercialista può comunque prendere le fatture dal cassetto
fiscale dell'Agenzia delle Entrate; lo zip serve se preferisce un file solo
o se una fattura non è ancora passata dallo SdI (domanda C13 nel file delle
domande al commercialista).

**Verifica**: `zip.test.ts` (nomi, CRC, nomi con accenti, zip vuoto) e
`fatture-del-mese-zip.test.ts` (XML e PDF, fattura senza XML nel
`da-sistemare.txt`, mese sbagliato o vuoto); zip aperto anche con `zipfile`
di Python. Prova a mano in locale con due fatture COM di ottobre:
download riuscito da computer e telefono, foto in
`anteprime/fatture-del-mese-zip/`.
