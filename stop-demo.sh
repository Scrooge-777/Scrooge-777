#!/usr/bin/env bash
# Stops the nodes and portals started by run-demo.sh.
cd "$(dirname "$0")"
[ -f build/demo.pids ] || { echo "Nothing to stop."; exit 0; }
while read -r pid; do kill "$pid" 2>/dev/null || true; done < build/demo.pids
rm -f build/demo.pids
echo "Stopped."
