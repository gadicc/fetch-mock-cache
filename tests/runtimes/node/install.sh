#!/bin/sh

unset npm_config_npm_globalconfig
unset npm_config_verify_deps_before_run
unset npm_config__jsr_registry
unset npm_config__gadicc_registry

npm ci --ignore-scripts --no-audit --fund=false
