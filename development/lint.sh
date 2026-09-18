#!/bin/sh

lint_dir=$(realpath $(dirname -- "$0")/lint)

cd $lint_dir

[ ! -d node_modules ] && npm clean-install

cd ../../

ln -s $lint_dir/node_modules
ln -s $lint_dir/eslint.config.js

node_modules/.bin/ci-run-eslint `ls *.js | grep -v eslint | xargs -I {} echo {}`

rm -rf node_modules eslint.config.js
