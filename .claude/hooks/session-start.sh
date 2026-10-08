#!/bin/bash
# Avvio delle sessioni cloud di Claude Code: installa le dipendenze e prepara
# le variabili che servono a typecheck, build e test (stesse della CI).
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

pnpm install --frozen-lockfile

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  # Come in .github/workflows/ci.yml: "prisma generate" vuole un URL valido,
  # non apre mai una connessione.
  if [ -z "${DATABASE_URL:-}" ]; then
    echo 'export DATABASE_URL=postgresql://ci:ci@localhost:5432/ci' >> "$CLAUDE_ENV_FILE"
  fi
  # Il proxy della sessione usa un proprio certificato: senza, la build del
  # sito non scarica i font di Google (next/font).
  if [ -f /root/.ccr/ca-bundle.crt ]; then
    echo 'export NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt' >> "$CLAUDE_ENV_FILE"
  fi
fi
