# Conti del mese: richieste agli abbonati e "troppo pochi per fidarsi"

**Richiesta** (Luca, 26/11/2026, thread "Calcolare quando si arriva a 12.000 € di
utile", risposta a "cosa stiamo tralasciando?"): sì a misurare quanti restano
dopo i mesi gratis sui primi 20-30 professionisti, sì alle richieste al mese per
abbonato in Conti del mese, sì a verificare il costo della protezione dalle
perdite di Stripe. No a contare il suo tempo. All'inizio non preleva nulla dalla
società.

## Decisioni

- **Richieste agli abbonati** (Admin → Numeri → Conti del mese): richieste
  arrivate nel mese (dal lancio, §395) agli abbonati di oggi, paganti e nei mesi
  gratis con la carta. Media a testa e quanti non ne hanno ricevuta nessuna:
  chi non riceve lavoro è il primo che non rinnova.
- **"Troppo pochi per fidarsi"**: finché meno di 20 professionisti hanno finito
  i mesi gratis (`STAYED_RELIABLE_FROM`), il numero "Restano dopo i mesi gratis"
  lo dice. Prima di spendere in pubblicità si aspettano 20-30 professionisti.
- **Stripe, perdite a carico di Stripe** (verificato sulla documentazione il
  26/11): con il listino standard la protezione non costa nulla in più. Serve
  però Radar acceso per i conti collegati, e con `fees_collector: application`
  i costi di Radar li paga la piattaforma. Radar Lite è gratis; Radar Standard
  per le piattaforme costa 0,05 € a pagamento esaminato più 1 € al mese per
  conto attivo. Da chiedere al supporto di Stripe se Lite basta (punto aggiunto
  nella checklist di lancio). Anche nel caso peggiore il costo è piccolo
  rispetto alla trattenuta del 7%.

## Verifica

Tipi e lint di API e sito; Playwright di Conti del mese da telefono e computer.
