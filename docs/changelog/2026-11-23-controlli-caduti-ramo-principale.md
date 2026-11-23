# Segnalazione automatica quando un controllo cade sul ramo principale

**Richiesta** (Luca, 23/11/2026, "si" alle proposte del giro serale): non
scoprire per caso che il ramo principale è rosso, e correggere il documento
degli avvisi dove promette tempi che GitHub non rispetta.

**Decisione**

- Nuovo `.github/workflows/ramo-principale.yml`: quando "CI" o "Controlli di
  sicurezza" finiscono rossi sul ramo principale (dopo un'unione o nel giro del
  lunedì) apre una segnalazione "Controllo caduto sul ramo principale: <nome>"
  con i passi caduti e il link al giro. Se è già aperta aggiunge un commento,
  senza doppioni. Quando lo stesso controllo torna verde la chiude da solo.
  Non scarica il codice, legge solo l'esito del giro, con i soli permessi
  `actions: read` e `issues: write`.
- `docs/ops/avvisi.md`: riga nuova nella tabella e sezione "I giri a orario di
  GitHub partono in ritardo". "Uptime" è scritto per ogni 10 minuti ma gira
  ogni 2 ore o più, la prova notturna delle 2:40 UTC parte verso le 10-11 UTC:
  l'avviso rapido è solo UptimeRobot.

- Stessa segnalazione anche per "Prova notturna" e "Copia del database" (sì di
  Luca alla miglioria proposta): prima avvisavano solo con l'email di GitHub.
  La copia del database senza i segreti si salta e resta verde, quindi non
  apre nulla finché Backblaze non è impostato.

**Motivo**: il 23/11 CodeQL era rosso sul ramo principale da giorni e lo si è
visto solo aprendo una PR (`2026-11-23-sicurezza-ramo-principale.md`). Le PR
mostrano solo i propri controlli, e CodeQL nelle PR guarda solo le righe
cambiate: il giro completo è quello del ramo principale.

**Verifica**: lo script del passo provato in locale con un `gh` finto nei
quattro casi (rosso senza segnalazione, rosso con segnalazione aperta, verde
con segnalazione aperta, verde senza). Un `workflow_run` parte solo dal file
che sta sul ramo principale, quindi la prova vera è la prima unione dopo
questa: giro verde, nessuna segnalazione aperta.
