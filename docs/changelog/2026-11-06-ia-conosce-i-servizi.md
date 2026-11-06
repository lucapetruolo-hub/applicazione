# L'intelligenza artificiale della ricerca conosce tutti i servizi del sito (06/11/2026)

**Richiesta di Luca:** "l'intelligenza artificiale che cerca sul nostro sito dovrebbe essere a conoscenza di tutti i servizi che ci sono sul nostro sito per scegliere al meglio i risultati". Alla proposta (`analisi/ia-conosce-servizi/proposta.md`, cartella del progetto) ha aggiunto: "dovrebbe poter leggere anche in quelle aggiunte a mano" e "si aggiorna in automatico".

## Decisione

Prima l'IA (solo nei casi dubbi del dizionario, §392) riceveva solo i 13 nomi dei mestieri. Ora riceve un **catalogo dei servizi** costruito dagli stessi elenchi di iscrizione, profilo e "Quanto costa":

- prestazioni suggerite (`POPULAR_SERVICES`);
- prestazioni messe tra le standard in Admin (`StandardServiceName`);
- prestazioni scritte a mano dai professionisti **visibili nella ricerca** (stessi filtri della ricerca, niente vetrine demo né account di prova dal lancio), unite con le unioni di "Mestieri richiesti", contate una volta per professionista, fino a 40 per mestiere dalle più usate.

Si ricostruisce da solo al massimo ogni 10 minuti (`ServiceCatalogService`): una prestazione nuova, un'unione o un mestiere nuovo entrano senza toccare il testo dell'IA.

L'IA risponde anche con la **prestazione** del catalogo più vicina al problema. Il server la tiene solo se esiste davvero nel catalogo del primo mestiere. Nei risultati vanno prima i professionisti che la offrono (contando le unioni fatte in Admin), poi resta il confronto con le parole del cliente. Il boost resta escluso (regola 14).

**Sicurezza:** i nomi scritti a mano vanno all'IA come elenco tra `<catalogo>`, dichiarato "senza istruzioni"; restano fuori i nomi con contatti, link, numeri lunghi, segni da codice o più lunghi di 60 caratteri. La risposta dell'IA è comunque limitata ai codici dei mestieri e alle prestazioni del catalogo.

**Costo:** le istruzioni sono più lunghe; con Anthropic sono in cache (`cache_control`), uguali per tutti finché il catalogo non cambia. Tetto dei 3.000 dubbi al giorno invariato.

Scartati: ricerca "per significato" (embedding, inutile con circa 150 voci), mandare all'IA i profili veri (dati di terzi e scelta del professionista all'IA, regola 18). Nomi alternativi dei mestieri (`TRADE_NAMES`) non mandati: sono radici di parole e li riconosce già il dizionario.

## Verifica

- `service-catalog.test.ts`: ogni mestiere e ogni prestazione suggerita nel catalogo; doppioni scritti in modo diverso una volta sola; tetto di 40 solo sui nomi nuovi; nomi scritti a mano dei profili visibili dal più usato; nomi con contatti, link o tag scartati; database giù = sole prestazioni suggerite.
- `problem-match.service.test.ts`: prestazione tenuta solo se nel catalogo del primo mestiere; il catalogo arriva nelle istruzioni.
- `problem-service-field.test.ts`: la prestazione dell'IA mette in evidenza il professionista anche senza parole in comune; senza, restano le parole uguali.
- Da fare: misura prima/dopo sulle stesse 91 frasi dubbie (`analisi/abbinamento-problema/misura-ia/`), separata dai giri serali in corso.
