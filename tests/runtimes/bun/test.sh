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

bun install --frozen-lockfile --ignore-scripts
result=$?
if [ $result -ne 0 ]; then
  status=1
fi

# Bun resolves link:../../.. through its global link directory, so keep the
# fixture install but point the package under test at this checkout.
mkdir -p node_modules
rm -rf node_modules/fetch-mock-cache
ln -s ../../../.. node_modules/fetch-mock-cache

bun test
result=$?
echo "    native: $(resultToStatus $result)" >> results.yaml
if [ $result -ne 0 ]; then
  status=1
fi

exit $status
