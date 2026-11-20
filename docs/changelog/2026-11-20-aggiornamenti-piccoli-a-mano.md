# Aggiornamenti piccoli delle librerie rifatti a mano (20/11/2026)

**Richiesta**: Luca ha chiesto di portare avanti gli aggiornamenti delle
librerie rimasti indietro (elenco "cosa stiamo tralasciando", punto 7). La PR
automatica del mese (#199) era in conflitto e rossa, e una parte delle sue
versioni (Expo e compagnia) era già arrivata per altre strade.

**Decisione**: rifatti a mano solo quelli che mancavano ancora, scegliendo
versioni uscite da almeno 14 giorni (stessa prudenza usata per Stripe 23 e
NestJS 12):

| Libreria | Prima | Dopo |
|---|---|---|
| turbo | 2.10.5 | 2.11.10 |
| typescript-eslint | 8.72.0 | 8.72.1 |
| lucide-react, lucide-react-native | 1.61.0 | 1.70.0 |
| lighthouse | 13.5.0 | 13.6.0 |
| tsx (radice) | scritto ^4.23.1 | scritto ^4.23.15 (era già quella installata) |

Non toccati: `babel-preset-expo` (già 58.0.24, le versioni dopo hanno meno di
14 giorni) e le versioni di lucide dalla 1.71 in poi (troppo recenti).

**Motivo**: restare vicini alle versioni correnti con passi piccoli, senza
prendere versioni uscite da pochi giorni.

**Verifica**: `pnpm turbo run typecheck lint` verde su tutti i pacchetti (12
su 12); le prove nel browser e il controllo delle vulnerabilità li fa la CI
della PR.
