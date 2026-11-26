#!/bin/sh
# Production deploy of the-ai-certification.com (Vercel). Pre-approved by the owner.
set -e
cd "$HOME/Projets/the-ai-certification"
export PATH="$HOME/.local/node/actuel/bin:$PATH"
node scripts/garde-paiements.mjs   # build refusé si autre opérateur que Stripe (26/11)
npx tsc --noEmit -p .
npx -y vercel@50.4.0 deploy --prod --yes 2>&1 | grep -E "Aliased|rror"
