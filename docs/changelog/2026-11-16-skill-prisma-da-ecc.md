# Skill prisma-patterns e database-migrations da ECC

**Richiesta** (Luca, 16/11/2026): controllare la raccolta "ecc" di affaan-m
(Everything Claude Code) e capire se serve al progetto. Dopo la valutazione,
"Sì" alla proposta di copiare solo due skill come testo.

**Decisione**: niente installazione di ECC (hook in Node a ogni comando,
4.700 file, sovrapposizioni con le nostre skill). Copiate solo
`.claude/skills/prisma-patterns/` e `.claude/skills/database-migrations/`, dal
commit `d2ef268` di github.com/affaan-m/ECC, licenza MIT (file `LICENSE`
accanto). Testo originale invariato, con in cima una sezione "Nel nostro
progetto" che lo lega alle regole di `packages/database/CLAUDE.md` (mai
`db push`, migrazioni solo additive, mai toccare una migrazione unita, Prisma
6 senza adapter, API su Render non serverless, filtri di visibilità di
`CLAUDE.md` §5 punto 11).

**Motivo**: raccolgono trappole di Prisma e regole per cambiare il database
senza fermare il sito, utili per i lavori sul backend prima e dopo il lancio.
Le altre skill di ECC sono generiche o doppioni di quelle che abbiamo già
(owasp-security-audit, seo-audit, accessibility-review).

**Verifica**: lette riga per riga le due skill (nessun comando che parte da
solo, nessun link esterno oltre alla fonte); controllati i percorsi citati
(`packages/database/scripts/migrate-deploy.mjs`, `docs/ops/rollback.md`,
`publicVisibilityWhere`).
