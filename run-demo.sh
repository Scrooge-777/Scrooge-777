#!/usr/bin/env bash
# One command to run the whole CertVerify network on macOS or Linux:
#   builds the CorDapp, creates the four nodes, starts them, starts the three web portals,
#   and issues + shares one sample certificate so there is something to verify.
# Stop everything with Ctrl+C (or ./stop-demo.sh from another terminal).
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(pwd)"
LOGS="$ROOT/build/demo-logs"
PIDS="$ROOT/build/demo.pids"

JVM_OPENS=(--add-opens java.base/java.time=ALL-UNNAMED --add-opens java.base/java.io=ALL-UNNAMED
  --add-opens java.base/java.util=ALL-UNNAMED --add-opens java.base/java.net=ALL-UNNAMED
  --add-opens java.base/java.nio=ALL-UNNAMED --add-opens java.base/java.lang.invoke=ALL-UNNAMED
  --add-opens java.base/java.security.cert=ALL-UNNAMED --add-opens java.base/java.security=ALL-UNNAMED
  --add-opens java.base/javax.net.ssl=ALL-UNNAMED --add-opens java.base/java.lang=ALL-UNNAMED
  --add-opens java.base/java.util.concurrent=ALL-UNNAMED --add-opens java.sql/java.sql=ALL-UNNAMED)

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mError: %s\033[0m\n' "$*" >&2; exit 1; }

# ---- 1. check Java 17 -------------------------------------------------------------------------
command -v java >/dev/null || fail "Java not found. Install JDK 17 (e.g. Eclipse Temurin 17) and try again."
JV=$(java -version 2>&1 | awk -F'"' '/version/ {print $2}' | cut -d. -f1)
[ "$JV" = "17" ] || fail "Corda 4.12 needs Java 17, but 'java' is version $JV. Set JAVA_HOME to a JDK 17 and try again."

# ---- 2. build, test and create the nodes ------------------------------------------------------
say "Building the CorDapp, running the tests and creating the nodes (first run downloads dependencies)"
chmod +x ./gradlew
./gradlew clean build deployNodes :clients:bootJar

mkdir -p "$LOGS"; : > "$PIDS"
cleanup() {
  say "Stopping all nodes and portals"
  while read -r pid; do kill "$pid" 2>/dev/null || true; done < "$PIDS"
  rm -f "$PIDS"
}
trap cleanup INT TERM

# ---- 3. start the four nodes -------------------------------------------------------------------
say "Starting the Notary, University, Student and Employer nodes"
for dir in build/nodes/*/; do
  [ -f "$dir/corda.jar" ] || continue
  name=$(basename "$dir")
  ( cd "$dir" && exec java -jar corda.jar --no-local-shell ) > "$LOGS/$name.log" 2>&1 &
  echo $! >> "$PIDS"
  echo "   started $name (log: build/demo-logs/$name.log)"
done

wait_port() { # host port seconds label
  for _ in $(seq 1 "$3"); do (exec 3<>"/dev/tcp/$1/$2") 2>/dev/null && return 0; sleep 1; done
  fail "$4 did not start on port $2. See build/demo-logs/ for details."
}
for p in 10003 10006 10009 10012; do wait_port localhost "$p" 240 "Node with RPC port $p"; done
echo "   all four nodes are accepting RPC connections"

# ---- 4. start the three portals ----------------------------------------------------------------
JAR=$(ls clients/build/libs/*.jar | grep -v plain | head -1)
start_portal() { # label http-port rpc-port
  java "${JVM_OPENS[@]}" -jar "$JAR" --server.port="$2" --config.rpc.host=localhost --config.rpc.port="$3" \
    --config.rpc.username=user1 --config.rpc.password=test > "$LOGS/portal-$1.log" 2>&1 &
  echo $! >> "$PIDS"
}
say "Starting the web portals"
start_portal university 8081 10006
start_portal student 8082 10009
start_portal employer 8083 10012
for p in 8081 8082 8083; do wait_port localhost "$p" 120 "Portal $p"; done
sleep 3

# ---- 5. sample data ----------------------------------------------------------------------------
say "Issuing and sharing a sample certificate"
SAMPLE="$ROOT/demo/sample-certificate.txt"
if command -v sha256sum >/dev/null; then HASH=$(sha256sum "$SAMPLE" | cut -d' ' -f1); else HASH=$(shasum -a 256 "$SAMPLE" | cut -d' ' -f1); fi
curl -s -X POST localhost:8081/api/certificates -H 'Content-Type: application/json' -d "{
  \"certificateId\":\"VU-2026-CSE-0142\",\"studentName\":\"Asha Rao\",\"rollNumber\":\"1VU22CS042\",
  \"program\":\"B.Tech\",\"specialization\":\"Computer Science and Engineering\",\"cgpa\":8.74,
  \"yearOfPassing\":2026,\"documentHash\":\"$HASH\",\"student\":\"StudentWallet\"}" ; echo
curl -s -X POST localhost:8082/api/certificates/VU-2026-CSE-0142/share -H 'Content-Type: application/json' \
  -d '{"verifier":"TechCorp Employer"}' ; echo
curl -s -X POST localhost:8083/api/verify -H 'Content-Type: application/json' \
  -d "{\"certificateId\":\"VU-2026-CSE-0142\",\"university\":\"Vidya University\",\"documentHash\":\"$HASH\"}" ; echo

cat <<EOF

  CertVerify is running.

    University portal   http://localhost:8081
    Student portal      http://localhost:8082
    Employer portal     http://localhost:8083

  Try it: in the Employer portal, open Verify, enter VU-2026-CSE-0142, choose Vidya University and
  upload demo/sample-certificate.txt  -> Genuine and valid.
  Upload demo/sample-certificate-edited.txt -> Document does not match.

  Logs are in build/demo-logs/.  Press Ctrl+C to stop everything.
EOF
wait
