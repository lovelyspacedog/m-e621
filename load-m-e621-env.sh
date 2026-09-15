# Shared env loader for start / sync / deploy.sh.
# shellcheck shell=bash
# Usage: source "$(dirname "$0")/load-m-e621-env.sh"

_m_e621_env_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_m_e621_config_dir="${M_E621_CONFIG:-$HOME/.config/m-e621}"

_m_e621_source_env() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  set -a
  # shellcheck disable=SC1090
  source "$f"
  set +a
}

_m_e621_source_env "$_m_e621_config_dir/env"
_m_e621_source_env "$_m_e621_env_root/deploy.env"

unset -f _m_e621_source_env
unset _m_e621_env_root _m_e621_config_dir
