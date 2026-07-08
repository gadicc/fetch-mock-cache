#!/bin/sh

rm -f results.yaml
rm -rf tests/fixtures/http
echo "bun:" >> results.yaml
status=0

resultToStatus() {
  if [ $1 -eq 0 ]; then
    echo "pass"
  else
    echo "fail"
  fi
}

bun test
result=$?
echo "    native: $(resultToStatus $result)" >> results.yaml
if [ $result -ne 0 ]; then
  status=1
fi

exit $status
