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

unset npm_config_npm_globalconfig
unset npm_config_verify_deps_before_run
unset npm_config__jsr_registry
unset npm_config__gadicc_registry

npm ci --ignore-scripts --no-audit --fund=false
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
