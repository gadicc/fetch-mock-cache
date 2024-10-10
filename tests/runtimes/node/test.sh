#!/bin/sh

rm -f results.yaml
echo "node:" >> results.yaml

resultToStatus() {
  if [ $1 -eq 0 ]; then
    echo "pass"
  else
    echo "fail"
  fi
}

npm install

npm run test:native
echo "    native: $(resultToStatus $?)" >> results.yaml

npm run test:jest
echo "    jest: $(resultToStatus $?)" >> results.yaml

npm run test:vitest
echo "    vitest: $(resultToStatus $?)" >> results.yaml
