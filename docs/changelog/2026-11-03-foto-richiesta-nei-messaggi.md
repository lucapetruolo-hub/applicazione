# Foto della richiesta nella lista dei messaggi

**Richiesta** (Luca, 03/11/2026, con l'esempio di un'altra app): nella pagina
Messaggi, se il cliente ha messo foto nella richiesta di preventivo, la foto
grande e in piccolo la foto del profilo; senza foto, solo la foto del profilo.

**Decisione**: stessa regola per cliente e professionista.
- Con foto nella richiesta: la prima foto grande (56 px, angoli 10 px) e la
  foto dell'altra parte piccola (26 px, bordo bianco) in basso a destra. Il
  cliente vede il suo lavoro e il professionista; il professionista vede il
  lavoro e il cliente (le iniziali finché il preventivo non è accettato, come
  prima, §216).
- Solo video: il primo fotogramma del primo video di Cloudinary (stesso
  indirizzo con `.jpg`, ritagliato da Cloudinary a 112 px).
- Nella conversazione aperta da Messaggi la stessa foto, piccola (40 px) a
  destra dell'intestazione: un tocco apre la richiesta con tutte le foto. Non
  nelle finestre di chat aperte da una richiesta, che le foto le mostra già.
- Lo scheletro di caricamento ha la stessa forma quadrata da 56 px.
- Senza foto: solo la foto dell'altra parte, come prima. Il posto della foto è
  largo uguale nei due casi, così i testi restano allineati.

**Secondo giro (03/11, migliorie scelte da Luca)**:
- La foto piccola della persona passa da 26 a 30 px, per riconoscerla meglio
  dal telefono.
- Popup del nuovo messaggio: la foto del lavoro (36 px, angoli 10 px) al posto
  dell'icona. L'indirizzo viaggia nella notifica (`requestPhotoUrl`), solo se
  di Cloudinary.
- Email "Nuovo messaggio in chat": la prima foto della richiesta piccola nel
  riquadro, come nell'email della richiesta (`requestPhotos`). Niente foto con
  la richiesta ritirata o l'account del cliente eliminato.

**Privacy**: le foto della richiesta le vedono già tutti e due (CLAUDE.md §5
punto 9), quindi non si mostra niente di nuovo. La miniatura non c'è con la
richiesta ritirata dal cliente o con il suo account eliminato.

**Dove**: `ChatThreadSummary.requestPhotoUrl` (`packages/shared/src/dashboard.ts`),
`requestThumbnailUrl` in `apps/api/src/timeline/timeline.service.ts`, la riga in
`apps/web/src/components/ChatThreadRow.tsx` (spostata fuori da
`apps/web/src/app/chat/page.tsx`).

**Verifica**: `timeline-thread-photo.test.ts` (prima foto, video, nessuna foto,
richiesta ritirata, account eliminato); foto della proposta da telefono e
computer in `anteprime/foto-richiesta-chat/` della cartella del progetto.
