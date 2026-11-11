#!/usr/bin/env bash
# Starts KHABSA inside a GitHub Codespace (or any machine) and prints the
# link to share. Data (accounts, rooms, scores) is kept in ./data, which
# survives stopping/restarting the codespace.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-3000}"
mkdir -p data

# one random secret per installation, kept on disk
if [ ! -s data/session-secret ]; then
  node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url'))" > data/session-secret
  chmod 600 data/session-secret
fi

[ -f dist/client/index.html ] || npm run build

if [ -n "${CODESPACE_NAME:-}" ]; then
  PUBLIC_URL="https://${CODESPACE_NAME}-${PORT}.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
else
  PUBLIC_URL="${PUBLIC_URL:-http://localhost:${PORT}}"
fi

# stop a previous instance (restart-safe)
if [ -f data/server.pid ] && kill -0 "$(cat data/server.pid)" 2>/dev/null; then
  kill "$(cat data/server.pid)" || true
  sleep 1
fi

NODE_ENV=production \
PORT="$PORT" \
PUBLIC_URL="$PUBLIC_URL" \
TRUST_PROXY=true \
SESSION_SECRET="$(cat data/session-secret)" \
DATABASE_URL="${DATABASE_URL:-pglite:./data/pglite}" \
ADMIN_EMAILS="${ADMIN_EMAILS:-}" \
nohup node src/server/index.ts > data/server.log 2>&1 &
echo $! > data/server.pid

echo "⏳ تشغيل خبصة..."
for _ in $(seq 1 90); do
  if curl -fs "http://127.0.0.1:${PORT}/api/health" > /dev/null; then break; fi
  sleep 1
done
if ! curl -fs "http://127.0.0.1:${PORT}/api/health" > /dev/null; then
  echo "❌ السيرفر ما اشتغل. آخر سطور من data/server.log:"
  tail -20 data/server.log
  exit 1
fi

# make the link reachable by friends without a GitHub login
if [ -n "${CODESPACE_NAME:-}" ]; then
  if gh codespace ports visibility "${PORT}:public" -c "$CODESPACE_NAME" > /dev/null 2>&1; then
    echo "🌍 الرابط صار عام"
  else
    echo "⚠️ ما قدرت أخلي الرابط عام تلقائياً. افتح تبويب PORTS، اكبس كليك يمين على 3000 ← Port Visibility ← Public"
  fi
fi

echo ""
echo "✅ خبصة شغالة! ابعت هالرابط لأصحابك:"
echo "   ${PUBLIC_URL}"
echo ""
