#!/bin/sh

rm -f results.yaml

for runtime in `find . -mindepth 1 -maxdepth 1 -type d`; do
  if [ -f $runtime/test.sh ]; then
    echo "--------------------"
    echo Runtime: $runtime
    echo "--------------------"
    cd $runtime
    sh test.sh
    cat results.yaml >> ../results.yaml
    cd ..
  fi
done

cat results.yaml