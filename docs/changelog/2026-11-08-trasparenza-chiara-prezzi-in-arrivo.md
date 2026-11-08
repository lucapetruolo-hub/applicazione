# Home: "La trasparenza" chiara e prezzi "in arrivo"

**Richiesta di Luca (07-08/11/2026)**, thread "Prendere spunti dalla homepage
di miodottore" (analisi in `/mnt/project-files/analisi/spunti-miodottore/`):
di miodottore gli piacciono "le scritte e la sensazione di pulito e
ordinato". Sulle sezioni ancora vuote: "non nascondere le sezioni vuote, il
sito deve essere già pronto per l'uscita pubblica [...] diciamo
semplicemente che stiamo elaborando dati veri prima di renderli pubblici,
arriverà a breve". L'08/11 ha detto "Fai le prime due migliorie".

**Decisione**:
- "Quanto costa in media?" senza prezzi resta visibile e dice "Stiamo
  raccogliendo i prezzi veri dei professionisti. Li pubblichiamo a breve.",
  con il pulsante del preventivo gratuito. Prima diceva "I prezzi medi
  appariranno qui non appena i professionisti inseriranno le loro
  prestazioni". La soglia non cambia: un prezzo medio compare da solo quando
  almeno 3 professionisti veri lo indicano (`MIN_PROFESSIONALS_FOR_SERVICE_PRICE`),
  sempre senza account di prova (`COUNTED_USER`).
- "La trasparenza che non trovi in giro" (`QualitySection.tsx`) non è più una
  fascia scura: sfondo della pagina, punti in un riquadro bianco con bordo e
  ombra come "Quanto costa in media?", spunte verdi su velo verde.
  Nessuna fascia scura in mezzo alla home, come su miodottore.

## Secondo giro (08/11/2026): "Effettua le migliorie"

- Home, riquadro verde: tolta la frase "Non chiamare a caso. Chiamalo
  giusto." sopra il titolo; la riga sotto la ricerca dice "Ricerca gratuita,
  senza registrazione · Preventivi voce per voce". La pillola "Richiesta
  urgente" resta com'è (scelta di Luca del 28/10,
  `2026-10-28-richiedi-preventivo-in-alto.md`).
- Home, "La trasparenza": una riga per punto, i dettagli (7 giorni, rimborso
  sulle segnalazioni accolte) dietro "Scopri di più" verso
  /problemi-e-rimborsi.
- Home, profili: finché non ci sono recensioni la sezione si chiama "Nuovi
  professionisti" (prima "Cosa dicono i clienti" con solo profili nuovi),
  con "Vedi tutti" verso /cerca; con le recensioni torna "Cosa dicono i
  clienti". Le schede "biglietto da visita" restano (§232).
- /per-professionisti: una schermata dell'agenda (nomi d'esempio) al posto
  della foto del lampadario; tolta la fila di foto "Per ogni tipo di lavoro"
  (i mestieri erano già nella scheda "Lavori vicino a te" e in "Lavora con
  noi come"); "Iscrizione gratuita. La carta serve solo per attivare i mesi
  gratis." al posto di "nessuna carta richiesta", che contraddiceva i mesi
  gratis con la carta; in fondo "Preferisci farti aiutare al telefono?
  Lasciaci il numero, ti richiamiamo", che apre il modulo Contatti come
  professionista con il messaggio già avviato (`?motivo=aiuto-profilo`).
- Le frasi sull'acconto e "anti no-show" le corregge il thread "Provare il
  sito con persone simulate".

**Verifica**: typecheck e lint di `apps/web`; build di produzione in locale
e foto di home e /per-professionisti su computer e telefono (nessuno
scorrimento orizzontale a 390 px); /contatti?motivo=aiuto-profilo apre il
messaggio già avviato.
