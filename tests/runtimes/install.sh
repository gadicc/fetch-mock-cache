#!/bin/sh

status=0

for runtime in $(find . -mindepth 1 -maxdepth 1 -type d | sort); do
  if [ -f "$runtime/install.sh" ]; then
    echo "--------------------"
    echo Runtime install: "$runtime"
    echo "--------------------"
    cd "$runtime" || exit 1
    sh install.sh
    result=$?
    if [ $result -ne 0 ]; then
      status=1
    fi
    cd .. || exit 1
  fi
done

exit $status
