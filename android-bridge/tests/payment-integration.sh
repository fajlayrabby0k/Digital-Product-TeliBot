#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bridge_test_dir=$(mktemp -d)
trap 'rm -rf "$bridge_test_dir"' EXIT
if command -v javac >/dev/null; then
  javac -encoding UTF-8 -d "$bridge_test_dir" src/com/telibot/bridge/ReceiptParser.java tests/ReceiptFixtureExport.java
else
  : "${ECJ_JAR:?Set ECJ_JAR or install a JDK to run Android parser integration tests}"
  java -jar "$ECJ_JAR" -8 -encoding UTF-8 -d "$bridge_test_dir" src/com/telibot/bridge/ReceiptParser.java tests/ReceiptFixtureExport.java
fi
java -cp "$bridge_test_dir" com.telibot.bridge.ReceiptFixtureExport > "$bridge_test_dir/receipts.json"
node tests/payment-integration.cjs "$bridge_test_dir/receipts.json"
