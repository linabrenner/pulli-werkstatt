#!/bin/sh
# Kopiert die App-Daten aus dem Obsidian-Vault (dort werden sie gepflegt) in die App.
QUELLE="$HOME/Documents/Obsidian Vault/03 Bereiche/Stricken/App-Daten"
ZIEL="$(dirname "$0")/../daten"
cp "$QUELLE"/*.json "$ZIEL"/ && echo "Daten aus dem Vault übernommen."
