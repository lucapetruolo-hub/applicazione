# "E WhatsApp" anche dove mancava

**Richiesta** (Luca, 19/11/2026, dal collaudo totale in
`/mnt/project-files/collaudo/2026-11-19-collaudo-totale/rapporto.md`, voce T1):
la home dice "Promemoria via email e WhatsApp", il resto del sito solo
"email". Il collaudo proponeva di togliere WhatsApp dalla home; Luca: "verrà
implementato prima del lancio sicuramente e dobbiamo essere già pronti, quindi
si può aggiungere anche dove manca".

**Decisione**: la frase della home resta; "e WhatsApp" entra anche in
- "Compreso in ogni livello" (`packages/shared/src/plans.ts`, la legge
  /per-professionisti e la pagina Abbonamento): "Promemoria via email e
  WhatsApp, così il cliente non si dimentica";
- FAQ del professionista "Il cliente riceve un promemoria dell'appuntamento?"
  (`packages/shared/src/faq.ts`): "per email e, se lo ha acceso, su WhatsApp".

**Motivo**: una sola promessa in tutto il sito. "Se lo ha acceso" perché su
WhatsApp il promemoria parte solo a chi ha confermato il numero in Notifiche.

**Da ricordare**: se al lancio il canale non è acceso le tre frasi si tolgono
insieme (checklist di lancio, punto 22).

**Verifica**: `pnpm lint` e prove di `packages/shared`.
