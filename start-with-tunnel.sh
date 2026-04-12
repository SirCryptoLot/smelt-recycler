#!/usr/bin/env bash
# Starts the Next.js dev server + public tunnel so anyone can access the app remotely.
# Run from the project root:  bash start-with-tunnel.sh

SUBDOMAIN=recycler-sol

echo ""
echo "  ♻  Recycler — starting up"
echo ""

# Start Next.js (auto-picks an available port)
npm run dev > /tmp/recycler-dev.log 2>&1 &
NEXT_PID=$!
echo "  [1/2] Next.js starting... (waiting for port)"

# Wait until Next.js reports its port
for i in $(seq 1 20); do
  PORT=$(grep -o "localhost:[0-9]*" /tmp/recycler-dev.log 2>/dev/null | head -1 | cut -d: -f2)
  if [ -n "$PORT" ]; then break; fi
  sleep 1
done

if [ -z "$PORT" ]; then
  echo "  ERROR: Next.js did not start. Check /tmp/recycler-dev.log"
  kill $NEXT_PID 2>/dev/null
  exit 1
fi

echo "  [1/2] Next.js ready on port $PORT"

# Start localtunnel
echo "  [2/2] Opening public tunnel..."
npx localtunnel --port "$PORT" --subdomain "$SUBDOMAIN" > /tmp/recycler-tunnel.log 2>&1 &
TUNNEL_PID=$!
sleep 3

echo ""
echo "  ✅ App is live!"
echo ""
echo "  Local (this PC):   http://localhost:$PORT"
echo "  Public (internet): https://$SUBDOMAIN.loca.lt"
echo ""
echo "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  📲 Share with your brother:"
echo "     https://$SUBDOMAIN.loca.lt"
echo ""
echo "  ⚠️  First visit only: localtunnel shows a password page."
echo "     Your brother needs to enter YOUR public IP address."
echo "     Find it at: https://whatismyip.com"
echo "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Press Ctrl+C to stop everything."
echo ""

trap "echo ''; echo '  Shutting down...'; kill $NEXT_PID $TUNNEL_PID 2>/dev/null; echo '  Done.'" INT TERM
wait
