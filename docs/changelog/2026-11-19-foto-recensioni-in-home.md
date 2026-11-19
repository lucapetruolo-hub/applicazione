# Foto del cliente nelle recensioni della home

**Richiesta** (Luca, 19/11/2026): nel riquadro "Cosa dicono i clienti" della
home sotto il testo della recensione c'è spazio vuoto: mostrare anche la foto
che il cliente ha messo nella recensione.

**Decisione**: scelta la proposta A (anteprime in
`anteprime/foto-recensioni-home/` dei file del progetto), con le due migliorie
approvate da Luca:
- sotto la firma del cliente al massimo 3 miniature (72 px da computer, 64 da
  telefono, angoli 10), "+N" sull'ultima se ce ne sono di più, scritta grigia
  "Foto del cliente"; al clic il visore delle foto già usato nel profilo. Senza
  foto la scheda resta com'era. La foto del professionista a sinistra non
  cambia (scartata la B, foto del cliente al suo posto: non si capiva chi o
  cosa si guardava);
- **controllo con Claude Haiku** solo sulle foto che possono andare in home
  (recensioni da 3 stelle in su con un testo), mai sui video, che in home non
  vanno: niente contatti (CLAUDE.md §5 punto 9), volti riconoscibili, targhe,
  documenti, citofoni o numeri civici. Non va contro la decisione del 14/11
  (niente IA sulle foto della richiesta per il professionista): quelle restano
  private, queste vanno sulla pagina più vista. Il risultato sta nel database
  (`Review.homePhotoUrls`, `homePhotosCheckedAt`): ogni foto si guarda una
  volta sola, anche con più copie dell'API. Il controllo parte dietro le quinte
  quando la recensione viene scritta o aggiornata e, per quelle di prima, alla
  prima visita della home: la foto compare dalla visita dopo, mai prima del
  controllo. Se una foto non si può controllare (rete, IA ferma, chiave
  mancante in produzione) non si salva niente e si riprova dopo 30 minuti;
- **a parità di stelle prima le recensioni con foto**: la home legge le ultime
  20 recensioni adatte e ne mostra 6, ordinate per stelle, poi con foto, poi
  dalla più recente. Prima erano semplicemente le ultime 6.

Le foto delle recensioni erano già pubbliche nel profilo e la posizione GPS
viene già tolta al caricamento (`CloudinaryService`). Lo scaricamento della
foto ridotta da Cloudinary è ora una funzione sola
(`apps/api/src/common/cloudinary-photo.ts`), usata anche dal PDF delle
contestazioni in banca.

**Verifica**: prove `review-photo-check.test.ts` (solo foto buone, niente
video, niente salvataggio se una foto non si controlla o non si scarica,
niente in produzione senza chiave, nessun nuovo tentativo subito dopo un
errore) e `reviews.service.test.ts` (ordine con le foto, solo foto
controllate, al massimo 6, controllo avviato per quelle nuove); tipi di API e
sito e `pnpm lint` verdi. Sito in locale con i dati veri e 5 foto finte: foto
da computer e da telefono, "+2" sull'ultima, visore "1 / 5" al clic
(`anteprime/foto-recensioni-home/vero-*.png`).
