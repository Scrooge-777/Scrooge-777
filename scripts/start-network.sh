#!/usr/bin/env bash
# Starts the four deployed nodes and the three portals in the background (used by CI and headless runs).
# Requires: ./gradlew deployNodes :clients:bootJar to have run first.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build/demo-logs
: > build/demo.pids
for dir in build/nodes/*/; do
  [ -f "$dir/corda.jar" ] || continue
  name=$(basename "$dir")
  ( cd "$dir" && exec java -Xmx1g -jar corda.jar --no-local-shell ) > "build/demo-logs/$name.log" 2>&1 &
  echo $! >> build/demo.pids
done
wait_port() { for _ in $(seq 1 "$2"); do (exec 3<>"/dev/tcp/localhost/$1") 2>/dev/null && return 0; sleep 2; done; echo "port $1 did not open"; return 1; }
for p in 10003 10006 10009 10012; do wait_port "$p" 180; done
echo "nodes up"
JAR=$(ls clients/build/libs/*.jar | grep -v plain | head -1)
OPENS="--add-opens java.base/java.time=ALL-UNNAMED --add-opens java.base/java.io=ALL-UNNAMED --add-opens java.base/java.util=ALL-UNNAMED --add-opens java.base/java.net=ALL-UNNAMED --add-opens java.base/java.nio=ALL-UNNAMED --add-opens java.base/java.lang.invoke=ALL-UNNAMED --add-opens java.base/java.security.cert=ALL-UNNAMED --add-opens java.base/java.security=ALL-UNNAMED --add-opens java.base/javax.net.ssl=ALL-UNNAMED --add-opens java.base/java.lang=ALL-UNNAMED --add-opens java.base/java.util.concurrent=ALL-UNNAMED --add-opens java.sql/java.sql=ALL-UNNAMED"
start_portal() {
  java -Xmx512m $OPENS -jar "$JAR" --server.port="$2" --config.rpc.host=localhost --config.rpc.port="$3" \
    --config.rpc.username=user1 --config.rpc.password=test > "build/demo-logs/portal-$1.log" 2>&1 &
  echo $! >> build/demo.pids
}
start_portal university 8081 10006
start_portal student 8082 10009
start_portal employer 8083 10012
for p in 8081 8082 8083; do wait_port "$p" 120; done
echo "portals up"
