#!/bin/sh
# Production deploy of the-ai-certification.com (Vercel). Pre-approved by the owner.
# 26/11 : GitHub main = référence commune (ce Mac, serveurs OVH/Paris via « deployer-site », autres ordinateurs).
#   - refuse si GitHub a des commits absents d'ici (mis en ligne depuis un autre poste) ;
#   - après une mise en ligne réussie, enregistre et pousse sur GitHub ce qui vient d'être mis en ligne.
set -e
cd "$HOME/Projets/the-ai-certification"
export PATH="$HOME/.local/node/actuel/bin:$PATH"
export GIT_SSH_COMMAND="ssh -o ConnectTimeout=15 -o BatchMode=yes"
if git fetch -q origin main 2>/dev/null && ! git merge-base --is-ancestor origin/main HEAD; then
  echo "⛔ GitHub a des changements absents de ce Mac (mis en ligne depuis un autre poste)."
  echo "   Fais d'abord : git stash -u && git pull && git stash pop   puis relance."
  exit 1
fi
node scripts/garde-paiements.mjs   # build refusé si autre opérateur que Stripe (26/11)
npx tsc --noEmit -p .
OUT=$(npx -y vercel@50.4.0 deploy --prod --yes 2>&1) || true
echo "$OUT" | grep -E "Aliased|rror" || true
echo "$OUT" | grep -q "Aliased" || exit 1
git add -A
git commit -qm "Mise en ligne du $(date '+%d/%m %H:%M') depuis le Mac" || true
if git push -q origin HEAD:main 2>/dev/null; then echo "GitHub à jour."; else echo "⚠ Push GitHub raté : lance git push à la main."; fi
