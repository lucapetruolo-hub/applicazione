# Ricevuta del lavoro occasionale: un modello che il professionista numera e firma

**Richiesta**: Luca, 02/11/2026, nel thread del gruppo 9 del collaudo: "ma
conviene lasciare così impostato da noi il documento o basta solo che gli
forniamo il documento relativo alle nostre fee quindi solo quello di nostra
competenza?". Sulla scheda ha scelto il modello già compilato. Sostituisce la
decisione del 30/10 (`2026-10-30-documenti-snelli.md`) sul numero dato da noi.

**Decisione**:

- **Il numero non lo diamo più noi.** La ricevuta resta già compilata con i
  dati del lavoro (voci, importo, cliente, diciture, promemoria del bollo), ma
  il professionista la controlla, scrive il suo numero, la firma e la dà al
  cliente come documento suo. Stessa logica della partita IVA del 30/10: il
  documento fiscale è di chi lo emette, noi diamo solo i dati.
- **"È un documento tuo"** in grassetto in cima alla pagina della ricevuta.
- **Campo "Numero della ricevuta"** sopra nome e codice fiscale del cliente.
  Sotto, come aiuto, l'ultimo numero che ha scritto ("L'ultima che hai
  numerato: 3/2026"), oppure "Segui la tua numerazione, per esempio 1/2026".
  Testo libero fino a 20 caratteri (cifre, lettere, barra, trattino).
- **Senza numero il PDF non parte**, come per il nome del cliente.
- **Lo stesso numero su due ricevute non passa**: "Il numero 5/2026 l'hai già
  usato per un'altra ricevuta: scrivine un altro". Un controllo per lui, non
  una numerazione nostra.
- **Invariati**: le nostre fatture (COM, ABB), l'estratto del mese, l'elenco
  "Ricevute date ai clienti", il riepilogo dell'anno per il commercialista (ora
  in ordine di data, col numero scritto da lui), l'avviso del 15 dicembre,
  Admin → Documenti ai clienti (la ricerca per numero cerca il testo scritto
  dal professionista).
- **Email "Il cliente ti chiede la ricevuta"**: "Dopo "Lavoro terminato" trovi
  la ricevuta già compilata: è un documento tuo, la controlli, le dai il tuo
  numero, la firmi e la dai al cliente."
- **Correzione trovata strada facendo**: un errore del server premendo "Salva"
  nella pagina della ricevuta non si vedeva. Ora si legge sotto il pulsante.
- **Database**: migrazione `20261102130000_ricevuta_numero_del_professionista`.
  Aggiunge `receiptNumber` (testo), toglie `number` e il suo indice unico. Le
  ricevute già scaricate tengono il numero che il cliente ha in mano
  ("1/2026"); quelle mai scaricate restano senza, e il professionista scrive il
  suo.

**Verifica**:
- 1139 prove dell'API verdi, con le nuove: ricevuta nuova senza numero e con
  l'ultimo usato come aiuto, PDF fermo senza numero, numero salvato com'è
  scritto, numero doppio rifiutato, riepilogo dell'anno in ordine di data.
- Migrazione provata su PostgreSQL 16 in locale con tre ricevute (scaricata col
  numero, mai scaricata col numero, senza numero): resta solo "1/2026" sulla
  prima. Dopo la migrazione lo schema coincide con `schema.prisma`.
- Controllo dei tipi di sito e API e `pnpm lint` verdi.
