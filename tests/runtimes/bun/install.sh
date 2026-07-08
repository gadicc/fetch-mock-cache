#!/bin/sh

bun install --frozen-lockfile --ignore-scripts
result=$?
if [ $result -ne 0 ]; then
  exit $result
fi

# Bun resolves link:../../.. through its global link directory, so keep the
# fixture install but point the package under test at this checkout.
mkdir -p node_modules
rm -rf node_modules/fetch-mock-cache
ln -s ../../../.. node_modules/fetch-mock-cache
