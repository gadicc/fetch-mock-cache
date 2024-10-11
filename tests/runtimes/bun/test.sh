#!/bin/sh

#!/bin/sh

rm -f results.yaml
rm -rf tests/fixtures/http
echo "bun:" >> results.yaml

resultToStatus() {
  if [ $1 -eq 0 ]; then
    echo "pass"
  else
    echo "fail"
  fi
}

bun test
echo "    native: $(resultToStatus $?)" >> results.yaml
