#!/bin/sh

cd "$(dirname "$0")"

sh pack.sh

if [ ! -d venv ]; then
	python -m venv venv
	. venv/bin/activate
	pip install -U shexli
else
	. venv/bin/activate
fi

shexli ../saturation-extension@zb3.me.shell-extension.zip
