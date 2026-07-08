#!/bin/sh

rm -f results.yaml
skipInstall=0
status=0

if [ "$1" = "--skip-install" ]; then
  skipInstall=1
fi

for runtime in $(find . -mindepth 1 -maxdepth 1 -type d | sort); do
  if [ -f "$runtime/test.sh" ]; then
    echo "--------------------"
    echo Runtime: "$runtime"
    echo "--------------------"
    cd "$runtime" || exit 1
    if [ $skipInstall -eq 0 ] && [ -f install.sh ]; then
      sh install.sh
      installResult=$?
      if [ $installResult -ne 0 ]; then
        status=1
      fi
    fi
    sh test.sh
    result=$?
    if [ $result -ne 0 ]; then
      status=1
    fi
    cat results.yaml >> ../results.yaml
    cd .. || exit 1
  fi
done

cat results.yaml
exit $status
