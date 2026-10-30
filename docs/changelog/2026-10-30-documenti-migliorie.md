# Migliorie ai documenti dopo il collaudo (gruppo 2)

**Richiesta**: Luca, 30/10/2026, sulle migliorie proposte con la PR #192:
"Effettua le migliorie tranne la 1". La 1, cioè chi paga il bollo sulla copia
del forfettario, si valuta insieme.

**Decisioni**:

- **Lavori pagati online senza documento**: in "Fatture e documenti" compare un
  riquadro con i lavori terminati e pagati online che non hanno ancora il
  documento per il cliente, al massimo 50, dal più recente. Ogni riga porta
  alla pagina dove lo si prepara.
  - Per il lavoro occasionale vale la ricevuta scaricata.
  - Per chi ha la partita IVA vale il numero della fattura vera scritto sul
    sito, perché la fattura la fa col suo programma.
  - L'importo è quello pagato meno i rimborsi, e un lavoro rimborsato del
    tutto non compare.
  - Fonte: `CourtesyCopyService.missingForProfessional`.
- **Dati DAC7 subito**: quando il professionista apre i suoi dati DAC7 e
  l'ultimo calcolo ha più di 10 minuti, il trimestre e l'anno in corso si
  ricalcolano prima di mostrarli. Il calcolo ricomincia solo se non ce n'è già
  uno in corso, e se fallisce restano i dati di prima. Il giro delle 1 di notte
  resta. Il testo "un lavoro chiuso oggi compare qui domani" diventa "Compaiono
  qui quando chiudi un lavoro".
- **Nostre fatture al commercialista**: l'email del 1° del mese allega anche
  le nostre fatture del mese in PDF: le trattenute (COM), l'abbonamento, le
  quote e i pacchetti (ABB). L'email aggiunge che l'originale elettronico è nel
  cassetto fiscale del professionista.
- **Cosa dare al commercialista**: è un "Scopri di più" nel riquadro "Il tuo
  commercialista", non una pagina nuova, per tenere il sito snello. Dice cosa
  gli arriva da solo ogni mese e a gennaio, dove sono i dati DAC7 e cosa resta
  da dargli a mano: le fatture del professionista e le spese della sua
  attività.

**Verifica**: in tutto 1037 prove dell'API verdi. Ce ne sono di nuove per i
lavori senza documento (`statements.test.ts`) e per la fattura allegata
all'email del commercialista (`documents-pdf-sdi.test.ts`). Test dei permessi
in locale senza problemi, controlli dei tipi di API e sito verdi, `pnpm lint`
verde.
