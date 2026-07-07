#!/bin/sh

rm -f results.yaml
rm -rf tests/fixtures/http
echo "deno:" >> results.yaml

resultToStatus() {
  if [ $1 -eq 0 ]; then
    echo "pass"
  else
    echo "fail"
  fi
}

deno test --unstable-sloppy-imports --allow-env --allow-read --allow-write
result=$?
echo "    native: $(resultToStatus $result)" >> results.yaml
exit $result
