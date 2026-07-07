#!/bin/sh

rm -f results.yaml
status=0

for runtime in `find . -mindepth 1 -maxdepth 1 -type d`; do
  if [ -f $runtime/test.sh ]; then
    echo "--------------------"
    echo Runtime: $runtime
    echo "--------------------"
    cd $runtime
    sh test.sh
    result=$?
    if [ $result -ne 0 ]; then
      status=1
    fi
    cat results.yaml >> ../results.yaml
    cd ..
  fi
done

cat results.yaml
exit $status
