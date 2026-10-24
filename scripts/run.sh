#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
env_file=.env
if [[ ! -f "$env_file" && -f "$HOME/.openclaw/.env" ]]; then env_file="$HOME/.openclaw/.env"; fi
if [[ ! -f "$env_file" ]]; then echo 'Missing .env (see docs/setup.md)' >&2; exit 1; fi
set -a
# The env file is local and user-owned. Never source one from a stranger.
source "$env_file"
set +a
exec node scripts/mailbox.mjs "$@"
