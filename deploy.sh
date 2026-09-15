#!/usr/bin/env bash
# Deploy m-e621 to a remote host and keep it synced with the GitHub fork.
# Personal host/domain/repo values live in ~/.config/m-e621/env or ./deploy.env
# (see deploy.env.example). Nothing host-specific is hardcoded here.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=load-m-e621-env.sh
source "$ROOT/load-m-e621-env.sh"

HOST="${EXPEDITION_HOST:-}"
SECRET="${EXPEDITION_SECRET:-}"
REMOTE_DIR="${M_E621_DIR:-$HOME/m-e621}"
PORT="${M_E621_PORT:-18621}"
DOMAIN="${M_E621_DOMAIN:-localhost}"
REPO_URL="${M_E621_REPO:-https://github.com/lovelyspacedog/m-e621.git}"
BRANCH="${M_E621_BRANCH:-master}"
CONFIG_DIR="${M_E621_CONFIG:-$HOME/.config/m-e621}"

if [[ -z "$HOST" ]]; then
  printf 'missing EXPEDITION_HOST — set it in %s/env or %s/deploy.env (see deploy.env.example)\n' \
    "$CONFIG_DIR" "$ROOT" >&2
  exit 1
fi
if [[ -z "$SECRET" ]]; then
  printf 'missing EXPEDITION_SECRET — path to sshpass secret file (see deploy.env.example)\n' >&2
  exit 1
fi
# Expand ~ in secret path if present
SECRET="${SECRET/#\~/$HOME}"
if [[ ! -f "$SECRET" ]]; then
  printf 'missing deploy secret file: %s\n' "$SECRET" >&2
  exit 1
fi
mode="$(stat -c '%a' "$SECRET" 2>/dev/null || stat -f '%OLp' "$SECRET")"
if [[ "$mode" != "600" && "$mode" != "400" ]]; then
  printf 'deploy secret must be mode 600 or 400 (currently %s)\n' "$mode" >&2
  exit 1
fi

export SSHPASS
SSHPASS="$(<"$SECRET")"
SSH_OPTS=(-4 -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20)

ssh_exp() {
  sshpass -e ssh "${SSH_OPTS[@]}" "$HOST" "$@"
}

chmod +x "$ROOT/start" "$ROOT/sync" "$ROOT/serve.py" "$ROOT/load-m-e621-env.sh"

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
  "$ROOT/start" "$ROOT/sync" "$ROOT/serve.py" "$ROOT/load-m-e621-env.sh" \
  "$HOST:$REMOTE_DIR/"

# Install personal env on the remote (never commit this file).
LOCAL_ENV=""
if [[ -f "$CONFIG_DIR/env" ]]; then
  LOCAL_ENV="$CONFIG_DIR/env"
elif [[ -f "$ROOT/deploy.env" ]]; then
  LOCAL_ENV="$ROOT/deploy.env"
fi
if [[ -n "$LOCAL_ENV" ]]; then
  echo "- uploading host env from $LOCAL_ENV"
  rsync -a -e "sshpass -e ssh ${SSH_OPTS[*]}" \
    "$LOCAL_ENV" "$HOST:$HOME/.config/m-e621/env"
  ssh_exp "chmod 600 '$HOME/.config/m-e621/env'"
fi

ssh_exp "chmod +x '$REMOTE_DIR/start' '$REMOTE_DIR/sync' '$REMOTE_DIR/serve.py' '$REMOTE_DIR/load-m-e621-env.sh'"

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
echo "If using a reverse-proxied custom app:"
echo "  App name / subdomain : m-e621"
echo "  App port             : $PORT"
echo "  Public URL           : https://$DOMAIN"
