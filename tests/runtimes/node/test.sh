#!/bin/sh

rm -f results.yaml
rm -rf tests/fixtures/http
echo "node:" >> results.yaml
status=0

resultToStatus() {
  if [ $1 -eq 0 ]; then
    echo "pass"
  else
    echo "fail"
  fi
}

npm install
result=$?
if [ $result -ne 0 ]; then
  status=1
fi

npm run test:native
result=$?
echo "    native: $(resultToStatus $result)" >> results.yaml
if [ $result -ne 0 ]; then
  status=1
fi

npm run test:jest
result=$?
echo "    jest: $(resultToStatus $result)" >> results.yaml
if [ $result -ne 0 ]; then
  status=1
fi

npm run test:vitest
result=$?
echo "    vitest: $(resultToStatus $result)" >> results.yaml
if [ $result -ne 0 ]; then
  status=1
fi

exit $status
