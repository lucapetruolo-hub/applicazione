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

**Verifica**: typecheck e lint di `apps/web`, foto della home su computer e
telefono prima e dopo.
