#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bridge_test_dir=$(mktemp -d)
trap 'rm -rf "$bridge_test_dir"' EXIT
mapfile -t bridge_test_sources < <(find tests/uploader-stubs -name '*.java')
bridge_test_sources+=(src/com/telibot/bridge/ReceiptUploader.java src/com/telibot/bridge/ReceiptQueueRunner.java)
if command -v javac >/dev/null; then
 javac -encoding UTF-8 -d "$bridge_test_dir" "${bridge_test_sources[@]}"
else
 : "${ECJ_JAR:?Set ECJ_JAR or install a JDK}"
 java -jar "$ECJ_JAR" -8 -encoding UTF-8 -d "$bridge_test_dir" "${bridge_test_sources[@]}"
fi
java -cp "$bridge_test_dir" com.telibot.bridge.UploaderTest
