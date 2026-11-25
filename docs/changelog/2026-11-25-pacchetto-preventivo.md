# Pacchetto per il commercialista: anche preventivo e riepilogo pagamenti

**Richiesta** (Luca, 25/11/2026, thread "Preparare la cartella per il
commercialista"): "ci sono anche i file del preventivo?" e poi "sì" a farli
uscire in automatico dallo script.

**Decisione**: `apps/api/scripts/pacchetto-commercialista.ts` crea anche
`13-preventivo.pdf` e `14-riepilogo-pagamenti-del-cliente.pdf` con lo stesso
codice del sito (`QuotePdfService`) e un database finto in memoria con dati
inventati (idraulico con partita IVA, 170–200 € IVA inclusa, acconto online
30%). Non tocca il database e non chiama Stripe: la chiave finta serve solo a
mostrare l'acconto online nel testo.

**Motivo**: il commercialista deve vedere anche il prezzo del preventivo
(domanda C28) e la scritta "non è una fattura né una ricevuta" del riepilogo.

**Verifica**: script lanciato in locale, escono 12 PDF e 5 XML; i due PDF
nuovi controllati a vista.
