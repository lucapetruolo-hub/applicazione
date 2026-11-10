# Documentazione: indice

Punto di partenza per trovare un documento. Le regole vincolanti del progetto
stanno in [`CLAUDE.md`](../CLAUDE.md) (si rilegge a ogni messaggio, va tenuto
corto: la CI avvisa sopra i 25 KB); qui sotto il resto, da leggere quando serve.

## Regole e scelte
| Documento | Cosa contiene |
|---|---|
| [`../CLAUDE.md`](../CLAUDE.md) | regole del progetto, stack in breve, mappa delle cartelle, regole di sviluppo, stato |
| [`architettura/stack.md`](architettura/stack.md) | ogni servizio dello stack con motivo, data della decisione e dettagli (ex `CLAUDE.md` §2) |
| [`architettura/interfaccia.md`](architettura/interfaccia.md) | Tamagui 3, import da `@professionisti/ui`, pagine pubbliche in HTML semplice |
| [`prodotto.md`](prodotto.md) | categorie, abbonamento, pagamenti, documenti, go-to-market, funzioni chiave (ex `CLAUDE.md` §6-§8) |
| `CLAUDE.md` nelle cartelle | regole di una sola cartella: `apps/web`, `apps/api`, `apps/mobile`, `packages/ui`, `packages/shared`, `packages/database` (Claude Code li carica da solo) |
| [`glossario.md`](glossario.md) | parole del prodotto e del codice |

## Stato e storia
| Documento | Cosa contiene |
|---|---|
| [`STATO.md`](STATO.md) | dettaglio di ogni funzione fatta (endpoint, file, bug corretti) |
| [`changelog/`](changelog/) | una voce per lavoro dal 28/10/2026, nome `AAAA-MM-GG-argomento.md` ([regole](changelog/README.md)) |
| [`CHANGELOG.md`](CHANGELOG.md) | archivio chiuso §10-§403 (1,6 MB): non leggerlo per intero |
| [`indice-changelog.md`](indice-changelog.md) | una riga per sezione dell'archivio, con il numero di riga |
| [`archivio/`](archivio/) | documenti superati, tenuti perché citati (audit "fase 0" di settembre) |

## Operazioni e legale
| Documento | Cosa contiene |
|---|---|
| [`ops/`](ops/README.md) | rollback, ripristino del database, attività a orario, avvisi, variabili, cambio di dominio |
| [`registro-trattamenti.md`](registro-trattamenti.md) | registro dei trattamenti (GDPR) |
| [`legale/regolamento-controversie.md`](legale/regolamento-controversie.md) | regolamento delle controversie |
| [`whatsapp-modelli.md`](whatsapp-modelli.md) | modelli WhatsApp da far approvare a Meta |

## Skill del progetto
In `.claude/skills/`: `deploy-ops` (deploy, Render, Vercel, variabili),
`checklist-lancio` (cosa manca per lanciare), `professionisti-ceo` e
`professionisti-ceo-esperti` (analisi strategiche), `referrals`,
`web-animation-design`.

## Fuori dal repository
Analisi, foto prima/dopo e collaudi stanno nella cartella condivisa del
progetto (`analisi/`, `anteprime/`, `collaudo/`), con il suo `README.md` e
`analisi/INDICE.md`.
