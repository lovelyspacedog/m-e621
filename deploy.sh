#!/usr/bin/env bash
# Deploy m-e621 to expedition and keep it synced with the GitHub fork.
set -euo pipefail

HOST="${EXPEDITION_HOST:-user@host.example}"
SECRET="${EXPEDITION_SECRET:-$HOME/.ssh/expedition_secret}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
REMOTE_DIR="${M_E621_DIR:-/home/user/m-e621}"
PORT="${M_E621_PORT:-18621}"
DOMAIN="${M_E621_DOMAIN:-localhost}"
# Expedition uses an SSH host alias + deploy key (see ~/.ssh/config Host github.com).
REPO_URL="${M_E621_REPO:-git@github.com:lovelyspacedog/material-e621.git}"
BRANCH="${M_E621_BRANCH:-master}"

if [[ ! -f "$SECRET" ]]; then
  printf 'missing expedition secret: %s\n' "$SECRET" >&2
  exit 1
fi
mode="$(stat -c '%a' "$SECRET" 2>/dev/null || stat -f '%OLp' "$SECRET")"
if [[ "$mode" != "600" && "$mode" != "400" ]]; then
  printf 'expedition secret must be mode 600 or 400 (currently %s)\n' "$mode" >&2
  exit 1
fi

export SSHPASS
SSHPASS="$(<"$SECRET")"
SSH_OPTS=(-4 -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20)

ssh_exp() {
  sshpass -e ssh "${SSH_OPTS[@]}" "$HOST" "$@"
}

chmod +x "$ROOT/start" "$ROOT/sync" "$ROOT/serve.py"

echo "- ensuring clone at $REMOTE_DIR"
ssh_exp env \
  REMOTE_DIR="$REMOTE_DIR" \
  REPO_URL="$REPO_URL" \
  BRANCH="$BRANCH" \
  bash -s <<'REMOTE'
set -euo pipefail
if [[ ! -d "$REMOTE_DIR/.git" ]]; then
  git clone --branch "$BRANCH" "$REPO_URL" "$REMOTE_DIR"
fi
mkdir -p "$HOME/.config/m-e621"
REMOTE

echo "- uploading start/sync/serve helpers"
rsync -a -e "sshpass -e ssh ${SSH_OPTS[*]}" \
  "$ROOT/start" "$ROOT/sync" "$ROOT/serve.py" \
  "$HOST:$REMOTE_DIR/"

ssh_exp "chmod +x '$REMOTE_DIR/start' '$REMOTE_DIR/sync' '$REMOTE_DIR/serve.py'"

echo "- first sync/build - may take a few minutes"
ssh_exp env \
  M_E621_DIR="$REMOTE_DIR" \
  M_E621_PORT="$PORT" \
  M_E621_DOMAIN="$DOMAIN" \
  M_E621_REPO="$REPO_URL" \
  M_E621_BRANCH="$BRANCH" \
  M_E621_FORCE_BUILD=1 \
  bash "$REMOTE_DIR/sync"

echo "- installing crontab keep-alive + periodic sync"
ssh_exp env REMOTE_DIR="$REMOTE_DIR" bash -s <<'REMOTE'
set -euo pipefail
tmp="$(mktemp)"
crontab -l 2>/dev/null >"$tmp" || true
grep -v 'm-e621/' "$tmp" >"${tmp}.new" || true
mv "${tmp}.new" "$tmp"
printf '%s\n' \
  "@reboot ${REMOTE_DIR}/start" \
  "*/5 * * * * ${REMOTE_DIR}/start" \
  "*/15 * * * * ${REMOTE_DIR}/sync" >>"$tmp"
crontab "$tmp"
rm -f "$tmp"
REMOTE

echo
echo "Deployed m-e621 on $HOST"
echo "  local port : 127.0.0.1:$PORT"
echo "  app dir    : $REMOTE_DIR"
echo "  syncs from : $REPO_URL ($BRANCH) every 15m"
echo
echo "Add a self-hosted custom app:"
echo "  Manage - Manage Links - Add a custom app"
echo "  App name / subdomain : m-e621"
echo "  App port             : $PORT"
echo "  - https://$DOMAIN"
