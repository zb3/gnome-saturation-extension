#!/usr/bin/env bash
set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
METADATA_FILE="$REPO_DIR/metadata.json"

UUID=$(python3 -c "import json; print(json.load(open('$METADATA_FILE'))['uuid'])")
NAME=$(python3 -c "import json; print(json.load(open('$METADATA_FILE')).get('name', 'Extension'))")

EXT_BASE_DIR="$HOME/.local/share/gnome-shell/extensions"
mkdir -p "$EXT_BASE_DIR"
ln -sfn "$REPO_DIR" "$EXT_BASE_DIR/$UUID"

mkdir -p "$HOME/.local/bin" "$HOME/.local/share/applications"

PREFS_DESKTOP="$HOME/.local/share/applications/dev-prefs-$UUID.desktop"
cat <<EOF > "$PREFS_DESKTOP"
[Desktop Entry]
Type=Application
Name=$NAME (Prefs)
Comment=Enable and open settings for $NAME
Exec=sh -c "gnome-extensions enable '$UUID' && gnome-extensions prefs '$UUID'"
Icon=preferences-other
Terminal=false
Categories=Development;
EOF

chmod +x "$PREFS_DESKTOP"
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
