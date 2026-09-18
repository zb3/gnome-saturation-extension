#!/bin/sh

cd "$(dirname "$0")/.."

glib-compile-schemas schemas/

rm -f saturation-extension@zb3.me.shell-extension.zip
zip -r saturation-extension@zb3.me.shell-extension.zip LICENSE metadata.json *.js
