# "Completa profilo" porta al passo giusto dopo il primo salvataggio

**Richiesta** (Luca, 19/11/2026): "se clicco su Oggi e poi Completa profilo mi
porta sul profilo pubblico e non su Fisco e pagamenti, è giusto?"

**Cosa succedeva**: Oggi ha due "Completa":
- il riquadro "Completa il profilo" con la barra dei passi, il cui pulsante
  porta già al primo passo che manca (Piano e carta, Dati fiscali, Identità);
- la schermata "Completa il tuo profilo per iniziare" con "Completa profilo",
  solo per chi non ha ancora un profilo: lì portare al Profilo pubblico è
  giusto, perché senza nome, mestiere e città i dati fiscali non si salvano.

Il difetto: al primo salvataggio del profilo la pagina non aggiornava l'account
tenuto nel browser (`professionalProfileId` restava `null`). Tornando su Oggi
senza ricaricare ("Più tardi" dopo il salvataggio, o il menu), Oggi credeva
ancora che il profilo mancasse e "Completa profilo" riportava al Profilo
pubblico, che però esisteva già. Solo ricaricando compariva il percorso con
"Compila i dati fiscali".

**Decisione**: dopo il primo salvataggio riuscito `saveProfile` chiama
`refreshUser()` di `AuthContext` (vale anche per "Salva ed esci"), così Oggi
mostra subito il percorso con il passo che manca. Nessun cambio d'aspetto.

**Verifica**: prova nel browser `e2e/tests/completa-profilo-passo-giusto.spec.ts`
(telefono e computer): professionista nuovo, "Completa profilo", salva nome e
città, "Più tardi", su Oggi c'è "Completa il profilo" e "Compila i dati
fiscali" porta a `/dashboard/fiscale`. Fallisce sul codice di prima.
