# Modelli gratuiti di riserva quando Gemma è saturo

**Richiesta** (stesso thread di docs/changelog/2026-10-28-ia-gratuita-fino-al-lancio.md): dopo il deploy i casi dubbi restavano al dizionario; nei log di Render Luca ha trovato "OpenRouter 429", cioè il modello gratuito Gemma 4 31B era saturo.

**Decisione**:
- Con un modello `:free` la richiesta porta anche `models` con due gratuiti di riserva, in ordine: `google/gemma-4-26b-a4b-it:free` e `nvidia/nemotron-3.5-super-vl:free` (entrambi rispondono in JSON). Se il primo risponde 429 o non risponde, OpenRouter prova il successivo; solo modelli gratuiti, quindi nessun costo. Valgono le stesse condizioni di Gemma: i testi, già senza contatti, possono essere usati dal fornitore, quindi solo prima del lancio.
- Nel log dell'errore di OpenRouter ora c'è anche l'inizio della risposta (massimo 300 caratteri), per distinguere un modello saturo dal limite di 50 richieste al giorno.

**Verifica**: test del modello gratuito con l'elenco `models`; prova in produzione dopo il deploy.
