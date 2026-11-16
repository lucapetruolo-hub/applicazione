# Scelta della categoria: scheda solo quando il suggerimento è sicuro, e proposte in Admin dalle categorie cambiate

**Richiesta** (Luca, 16/11/2026, thread "Modernizzare la scelta della
categoria"): "Effettua le 4 migliorie" proposte dopo
`2026-11-15-scelta-categoria-suggerita.md` (tabella degli errori dell'IA,
riga "una richiesta per ciascuno" al "+ Fabbro", pannello da chiudere
trascinandolo in giù, test con 5 persone vere). Poi: "Fai in modo che i
numeri in admin poi arrivino già automatizzati per l'approvazione
dell'admin".

**Decisione**:
- **Scheda unica solo quando il suggerimento è sicuro.** Sul banco di frasi
  del progetto il dizionario quando è sicuro sbaglia circa 1 volta su 100,
  l'IA circa 4 su 100, il dizionario usato perché l'IA non ha risposto 1 su
  5. Quindi: suggerimento dell'IA, parola insegnata o dizionario sicuro →
  scheda con "Cambia"; dizionario nel dubbio → la categoria resta scelta
  ma si vedono le pillole, con la riga "Forse ti serve …: l'abbiamo già
  scelta, controlla qui sotto o scegline un'altra." (`GuidedRequestForm`,
  `suggestionSure`; `CategoryChoice`, prop `unsure`). Un errore si vede a
  colpo d'occhio invece di stare dietro "Cambia".
- **"Ogni mestiere aggiunto riceve una richiesta a parte."** sotto "Può
  servire anche: + Fabbro", detto prima del tocco.
- **Trascinare giù il pannello da telefono** dalla maniglia o dal titolo,
  come i fogli di iOS e Android: si chiude oltre 100 px o con un gesto
  veloce, altrimenti torna su. Con "riduci movimento" si chiude senza
  animazione. Da computer niente trascinamento.
- **Test con 5 persone vere**: copione con tre compiti (IA giusta, IA
  sbagliata, due mestieri) nella cartella del progetto,
  `analisi/scelta-categoria/test-5-persone.md`. Va fatto a mano.
- **Proposte automatiche in Admin dalle categorie cambiate** (nuovo tipo
  `CATEGORY_CHANGE_WORD`, "Categoria che i clienti cambiano"): ogni notte,
  dalle richieste con la categoria suggerita (dal lancio, senza account di
  prova, §395), se almeno 5 clienti hanno scritto la stessa parola e
  cambiato lo stesso mestiere con lo stesso altro, e almeno 9 richieste su
  10 con quella parola sono finite su quel mestiere, in "Da approvare"
  arriva "Con «parola» suggerisci X", con i numeri e cosa cambia.
  "Insegna la parola" chiama lo stesso `teachWord` del pulsante a mano;
  si toglie da Mestieri richiesti. Mai parole generiche, numeri o già
  insegnate, mai se il dizionario la porta già al mestiere scelto. Niente
  parte da solo (`2026-11-03-automazioni-admin.md`). Regola in
  `categoryChangeWordCandidates` (`apps/api/src/admin-proposals/admin-proposals.ts`).

**Motivo**: la scheda unica è più semplice solo finché il suggerimento è
giusto; dove sbaglia di più deve vedersi l'elenco. I numeri "tenuta o
cambiata" servono solo se diventano una correzione: così l'admin non deve
leggerli e decidere da sé, approva o rifiuta una proposta già pronta.

**Verifica**: `e2e/tests/richiesta-preventivo.spec.ts` (suggerimento nel
dubbio con l'IA spenta, riga del "+ mestiere", trascinamento solo da
telefono: corto torna su, lungo chiude); `admin-proposals.test.ts` (5 cambi
sì, 4 no, meno di 9 su 10 no, già insegnata, generica, conosciuta dal
dizionario, numeri).
