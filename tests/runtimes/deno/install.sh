#!/bin/sh

deno install --frozen=true --unstable-sloppy-imports --entrypoint \
  src/direct-mock.test.ts
