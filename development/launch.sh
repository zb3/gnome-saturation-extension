#!/usr/bin/env bash
set -e

script_dir="$(dirname "$0")"

[ "$1" = "--help" ] && echo "$0 [-v|-vv] [-gles2] [-multi]" && exit

multi_mode=

while [ $# -gt 0 ]; do
    [[ $1 != "-"* ]] && break

	arg="$1"
	shift

    if [ "$arg" = "-v" ] || [ "$arg" = "-vv" ]; then
		export G_MESSAGES_DEBUG=all
		export SHELL_DEBUG=all
    fi

    if [ "$arg" = "-vv" ]; then
		export COGL_DEBUG=all
    fi

	if [ "$arg" = "-gles2" ]; then
		export CLUTTER_DRIVER=gles2
	fi

	if [[ $arg == '-m'* ]]; then
		multi_mode=x
	fi
done

args=
[ -n "$multi_mode" ] && args+="--devkit-args=--monitor-size 800x600 --add-monitor --monitor-size 800x600" || true

pushd "$script_dir/.."
	glib-compile-schemas schemas/
popd

dbus-run-session -- gnome-shell --devkit "$args" |& tee devkit.log
