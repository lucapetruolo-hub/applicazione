# L'IA dei casi dubbi con un modello gratuito fino al lancio

**Richiesta** (Luca, 28/10/2026, stesso thread di docs/CHANGELOG.md §392): dopo l'unione la prova in produzione rispondeva sempre il dizionario, perché la chiave di OpenRouter ha il limite di spesa a 0 $; Luca: "devi usare qualche intelligenza artificiale gratuita che non richiede credito".

**Decisione**:
- Senza `OPENROUTER_MODEL` OpenRouter usa `google/gemma-4-31b-it:free` (Gemma 4 31B di Google, gratuito, risposta in JSON). Con `OPENROUTER_MODEL=anthropic/claude-haiku-5.5` e un po' di credito torna Claude Haiku con i vincoli del §394.
- Con un modello `:free` non si può chiedere "solo server di Anthropic" né `data_collection: "deny"`: i fornitori gratuiti possono usare i testi (già senza email, telefoni, indirizzi e link). Va bene solo prima del lancio, quando i testi sono prove; al lancio si passa ad Anthropic (checklist punto 42). Luca deve attivare i modelli gratuiti nelle impostazioni Privacy di OpenRouter.
- Ragionamento spento per stare nei 3 secondi; il JSON tra ```json e ``` viene accettato. I modelli gratuiti di OpenRouter danno al massimo 50 richieste al giorno senza credito: oltre resta il dizionario.

**Verifica**: test con `fetch` finto per il modello gratuito (nessun vincolo di fornitore, JSON tra ```). Prova vera in produzione dopo l'attivazione da parte di Luca.
