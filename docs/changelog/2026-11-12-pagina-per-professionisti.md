# Pagina per i professionisti: difetti corretti e proposte A-H (12/11/2026)

**Richiesta** (Luca, thread "Migliorare la pagina per i professionisti"):
"sistema e migliora questa pagina e valutala come farebbe un professionista
di alto livello in questo campo" su /per-professionisti. Dopo l'analisi
(`analisi/per-professionisti/analisi.md` nella cartella del progetto): "a-h",
tutte le proposte.

**Difetti corretti**:
- Schermata dell'agenda rifatta dall'agenda vera con l'identità di #324
  (prima il verde acceso di prima e "Latina" due volte, contro "sito per
  tutta Italia"): professionista di prova a Bologna, nomi d'esempio, ora
  fissata a martedì 10/11 alle 10:20. Sul computer la settimana (1600×800,
  tagliata dove finisce il calendario), sul telefono la giornata (780×975).
- "Compreso in ogni livello": sul telefono le spunte delle righe che vanno a
  capo si rimpicciolivano (`flexShrink: 0`).
- Banda "GRATIS PER 3 MESI": sul telefono "MESI" restava da solo; carattere
  un po' più piccolo e righe bilanciate.
- La recensione d'esempio diceva "Giulia R." e sembrava vera: ora "Esempio"
  (niente testimonianze finché non ce ne sono di vere).

**Proposte fatte**:
- A. Invito finale: pulsante principale "Iscriviti gratis" verso la
  registrazione (prima "Scegli il tuo livello" riportava su ai prezzi);
  "Scopri di più" diventa "Come funzionano i pagamenti".
- B, C. Sotto i pulsanti del primo schermo tre punti con la spunta: "Nessun
  costo per contatto", "3 mesi gratis, poi 19 € + IVA al mese" (mesi e
  prezzo letti dall'offerta attiva e da `SUBSCRIPTION_TIERS`), "Annulli
  quando vuoi". Sostituiscono "Iscrizione gratuita. La carta serve solo per
  attivare i mesi gratis."; la carta resta detta nei prezzi ("in
  automatico"), nelle domande e nei Termini.
- D. Domanda sul limite di lavori: frase breve, il conto (10 € + differenza
  + 10%) dietro "Scopri di più".
- E. Ordine: "Tutto quello che serve" e "Come funziona" prima del
  "Pagamento online".
- F. Barra in alto: su /per-professionisti, /per-professionisti/pagamenti e
  /lavora-con-noi/* chi non ha un account vede "Iscriviti gratis"
  ("Iscriviti" sotto i 360 px) al posto di "Richiedi preventivo".
- G. Titolo per Google: "Lavora come professionista nella tua zona", con la
  descrizione che dice "senza costo per contatto".
- H. Sottotitolo più corto: "Richieste di lavoro vicino a te, preventivi
  chiari, agenda e recensioni. Tutto in un posto."

**Verifica**: typecheck e lint di `apps/web`; sito e API in locale con un
database di prova; foto prima e dopo di computer e telefono in
`anteprime/per-professionisti/` della cartella del progetto; nessuno
scorrimento orizzontale a 390 e 320 px.
