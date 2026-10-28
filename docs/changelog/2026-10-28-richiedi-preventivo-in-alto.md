# "Richiedi preventivo" in alto di nuovo in home

**Richiesta** (Luca, 28/10/2026): "prima c'era un pulsante in alto a destra
con richiedi preventivo che nella home non vedo più": rimetterlo per i
clienti e per chi non ha fatto l'accesso, e toglierlo nel profilo di un
professionista, dove c'è già la barra "Richiedi un preventivo".

**Perché era sparito**: tolto di proposito solo dalla home nella revisione
del design del 25/10 (docs/CHANGELOG.md §349, PR #143), perché nel primo
schermo della home c'è già il pulsante grande. Le altre pagine lo hanno
sempre avuto. Nel profilo con la barra era già nascosto dal §385 (PR #161).

**Decisione**:
- Home: il pulsante torna in alto a destra (`SiteHeader.tsx`), così resta a
  portata di mano anche scorrendo la pagina, dove il pulsante del primo
  schermo non si vede più. Come prima: mai per un professionista, mai su
  accesso e registrazione.
- Profilo di un professionista che accetta richieste: resta nascosto
  (`body:has(.profile-cta-bar)` in `globals.css`); nei profili in pausa resta,
  perché è l'unico modo di chiedere ad altri.
- Nuovo: non compare su `/preventivo`, dove porterebbe alla pagina già aperta.

**Verifica**: prova nel browser in `e2e/tests/barra-preventivo.spec.ts`
(visibile in home da telefono e da computer, il clic apre `/preventivo`, lì
non c'è); foto della home e del profilo da telefono e computer.
