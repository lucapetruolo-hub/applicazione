# L'IA indica una prestazione solo quando è proprio il lavoro chiesto (09/11/2026)

**Richiesta di Luca:** "sì" alla miglioria proposta dopo la rimisura (`/mnt/project-files/analisi/abbinamento-problema/misura-ia/rimisura-servizi.md`): dire all'IA di indicare una prestazione solo quando corrisponde davvero, altrimenti nessuna.

## Decisione

Nelle istruzioni dell'IA (`systemPrompt` in `apps/api/src/problem-match/problem-match.service.ts`) il campo `service` chiede ora la prestazione che è proprio il lavoro descritto, non la più vicina, con tre esempi dagli errori misurati (scaldabagno non è caldaia, riparare non è manutenzione, umidità non è muffa) e "nel dubbio null". Segue `2026-11-06-ia-conosce-i-servizi.md`.

**Motivo:** nella rimisura del 7-8/11, quando nessuna prestazione andava bene l'IA ne indicava una lo stesso in 11 frasi su 16, e 4 delle 23 prestazioni date erano vicine ma sbagliate: così in cima andava chi fa un lavoro simile.

## Verifica

- Test dell'API verdi; nessun cambio al codice che controlla la risposta (la prestazione resta valida solo se è nel catalogo del primo mestiere).
- Da rimisurare sulle stesse 93 frasi con `rimisura-servizi.py` (a sera, prima del rinnovo delle richieste gratuite), confrontando quante prestazioni date senza una adatta.
