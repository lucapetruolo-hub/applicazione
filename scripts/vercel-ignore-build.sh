#!/usr/bin/env bash
# "Ignored Build Step" di Vercel (apps/web/vercel.json → ignoreCommand),
# docs/CHANGELOG.md §131: exit 0 = build SALTATA, exit 1 = build eseguita.
# Obiettivo: non consumare minuti di build e spazio "Deployment Storage" del
# piano gratuito per commit che non cambiano il sito.
#
# 1. Anteprime (qualunque branch diverso da quello di produzione): mai.
#    Se servisse di nuovo un'anteprima, basta commentare questo blocco.
# 2. Produzione: solo se dall'ultimo deploy riuscito è cambiato qualcosa che
#    finisce nel sito (apps/web, pacchetti condivisi, dipendenze). Un commit
#    che tocca solo apps/api, apps/mobile o docs non ricostruisce il sito.
# In ogni caso dubbio (primo deploy, storico non disponibile, "Redeploy" o
# Deploy Hook sullo stesso commit) la build si fa: meglio una build in più
# che un sito che smette di aggiornarsi.

if [ "$VERCEL_ENV" != "production" ]; then
  echo "Anteprima ($VERCEL_GIT_COMMIT_REF): build saltata."
  exit 0
fi

cd "$(git rev-parse --show-toplevel)" || exit 1

if [ -z "$VERCEL_GIT_PREVIOUS_SHA" ] || [ "$VERCEL_GIT_PREVIOUS_SHA" = "$VERCEL_GIT_COMMIT_SHA" ]; then
  echo "Nessun deploy precedente da confrontare (o stesso commit): build."
  exit 1
fi

if ! git cat-file -e "$VERCEL_GIT_PREVIOUS_SHA^{commit}" 2>/dev/null; then
  git fetch --quiet --depth=50 origin "$VERCEL_GIT_COMMIT_REF" 2>/dev/null
  if ! git cat-file -e "$VERCEL_GIT_PREVIOUS_SHA^{commit}" 2>/dev/null; then
    echo "Commit precedente non disponibile nello storico: build."
    exit 1
  fi
fi

if git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- \
  apps/web packages/ui packages/shared packages/api-client packages/config \
  package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc; then
  echo "Nessuna modifica al sito dall'ultimo deploy: build saltata."
  exit 0
fi

echo "Il sito è cambiato: build."
exit 1
