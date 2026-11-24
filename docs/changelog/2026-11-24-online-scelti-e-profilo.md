# Online: professionisti scelti che non lavorano online e agenda del profilo

**Richiesta** (Luca, 24/11/2026, sì alle due migliorie proposte dopo
`2026-11-24-data-richiesta-senza-orari.md`).

**Cosa succedeva**: con più professionisti scelti (`scelti=`) e "Online", la
richiesta arrivava anche a chi non lavora online, senza dirlo a nessuno
(lo smistamento dei scelti non guarda `remoteAvailable`). Sul profilo pubblico
l'agenda mostrava la scheda "Online" anche a chi non lavora online, con gli
orari tutti vuoti.

**Decisione**:
- Modulo di richiesta (`GuidedRequestForm.tsx`): con "Online" e qualche
  scelto che non lavora online, sotto il tasto una riga rossa "Bianchi
  Impianti non lavora online: toglilo con la X o scegli \"A domicilio\"." e
  "Avanti" si ferma con lo stesso messaggio. Se nessuno dei scelti lavora
  online, "Online" si spegne come per il professionista singolo e un link con
  `modalita=ONLINE` torna ad "A domicilio".
- Server (`guided-requests.service.ts`): una richiesta online con un scelto
  che non lavora online si ferma con lo stesso messaggio (nomi elencati).
- Profilo pubblico (`ProfessionalDetailContent.tsx`): per chi non lavora
  online niente "Orari per: A domicilio / Online", solo la scritta "Orari a
  domicilio"; `modalita=ONLINE` nel link apre gli orari a domicilio.

**Verifica**: due prove nuove in `chosen-professionals.test.ts` (online si
ferma e dice chi; a domicilio parte); prove delle richieste guidate e di tutti
i file con "ONLINE" verdi (246); typecheck di sito e API e lint puliti. Foto
da telefono e computer con API finta in `anteprime/data-richiesta-online/`
(`scelti-uno-non-online-*`, `profilo-senza-online-*`, `profilo-con-online-*`).
