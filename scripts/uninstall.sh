#!/usr/bin/env bash
set -euo pipefail

info() { printf '\033[0;36m%s\033[0m\n' "$*"; }
ok() { printf '\033[0;32m%s\033[0m\n' "$*"; }
warn() { printf '\033[0;33m%s\033[0m\n' "$*"; }
err() { printf '\033[0;31m%s\033[0m\n' "$*" >&2; }

# curl … | bash feeds the script on stdin; prompts must use the controlling TTY.
can_prompt_tty() {
  [[ -r /dev/tty && -w /dev/tty ]]
}

prompt_line_tty() {
  local prompt="$1"
  local varname="$2"
  printf '%s' "$prompt" > /dev/tty
  IFS= read -r "$varname" < /dev/tty
}

XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
POLKIT_RULE_PATH="/etc/polkit-1/rules.d/49-linux-sensor-tray.rules"

resolve_manifest() {
  local explicit="${LST_MANIFEST:-${MONITOR_MANIFEST:-}}"
  if [[ -n "$explicit" ]]; then
    echo "$explicit"
    return
  fi
  local a="$XDG_DATA_HOME/linux-sensor-tray/install-manifest.json"
  local b="$XDG_DATA_HOME/monitor/install-manifest.json"
  if [[ -f "$a" ]]; then echo "$a"
  elif [[ -f "$b" ]]; then echo "$b"
  else echo ""
  fi
}

MANIFEST="$(resolve_manifest)"

ASSUME_YES=false
for arg in "$@"; do
  case "$arg" in
    -y | --yes) ASSUME_YES=true ;;
  esac
done
if [[ -n "${LST_UNINSTALL_YES:-}" || -n "${MONITOR_UNINSTALL_YES:-}" ]]; then
  ASSUME_YES=true
fi

if [[ ! -f "$MANIFEST" ]]; then
  err "No install manifest found (looked under ${XDG_DATA_HOME}/linux-sensor-tray/ and legacy …/monitor/)."
  err "Nothing to remove (already uninstalled or non-standard install)."
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  err "python3 is required to read the install manifest."
  exit 1
fi

if [[ "$ASSUME_YES" != true ]]; then
  if ! can_prompt_tty; then
    err "No controlling terminal (piped install cannot read answers from stdin)."
    err "Run this script in a real terminal, or use non-interactive: --yes / LST_UNINSTALL_YES=1"
    exit 1
  fi
  prompt_line_tty "Remove Linux Sensor Tray (desktop entry, symlink, AppImage)? [y/N] " reply
  case "$reply" in
    y | Y | yes | YES) ;;
    *) info "Cancelled."; exit 0 ;;
  esac
fi

BLACKLIST_FILE="$(MANIFEST="$MANIFEST" python3 - <<'PY'
import json, os

path = os.environ["MANIFEST"]
with open(path, encoding="utf-8") as f:
    m = json.load(f)
print(m.get("k10temp_blacklist_file") or "")
PY
)"

want_revert_blacklist_env() {
  local e="${LST_UNINSTALL_REVERT_ZENPOWER:-${MONITOR_UNINSTALL_REVERT_ZENPOWER:-}}"
  case "$(printf '%s' "$e" | tr '[:upper:]' '[:lower:]')" in
    1 | yes | true | on) return 0 ;;
  *) return 1 ;;
  esac
}

revert_k10temp_blacklist() {
  local f="$1"
  [[ -n "$f" ]] || return 0
  [[ -f "$f" ]] || return 0
  if ! grep -q "linux-sensor-tray:" "$f" 2>/dev/null; then
    warn "Refusing to remove ${f} (missing linux-sensor-tray marker)."
    return 1
  fi
  if ! command -v sudo >/dev/null 2>&1; then
    err "sudo not found; remove ${f} manually if you want k10temp back."
    return 1
  fi
  info "Removing ${f} (sudo)…"
  sudo rm -f "$f"
  sudo modprobe -r zenpower 2>/dev/null || true
  if sudo modprobe k10temp 2>/dev/null; then
    ok "k10temp loaded."
  else
    warn "k10temp did not load immediately; try rebooting."
  fi
}

DO_REVERT_BLACKLIST=false
if [[ -n "$BLACKLIST_FILE" ]]; then
  if [[ "$ASSUME_YES" == true ]]; then
    if want_revert_blacklist_env; then
      DO_REVERT_BLACKLIST=true
    else
      info "Leaving k10temp blacklist in place (${BLACKLIST_FILE}). Set LST_UNINSTALL_REVERT_ZENPOWER=1 to remove it non-interactively."
    fi
  else
    prompt_line_tty "Remove k10temp blacklist installed with this app (${BLACKLIST_FILE}) and reload k10temp? [y/N] " rev
    case "$rev" in
      y | Y | yes | YES) DO_REVERT_BLACKLIST=true ;;
    esac
  fi
fi

if [[ "$DO_REVERT_BLACKLIST" == true ]]; then
  revert_k10temp_blacklist "$BLACKLIST_FILE" || true
fi

want_remove_polkit_rule_env() {
  local e="${LST_UNINSTALL_REMOVE_POLKIT_RULE:-${MONITOR_UNINSTALL_REMOVE_POLKIT_RULE:-}}"
  case "$(printf '%s' "$e" | tr '[:upper:]' '[:lower:]')" in
    1 | yes | true | on) return 0 ;;
    *) return 1 ;;
  esac
}

remove_polkit_rule() {
  if ! command -v sudo >/dev/null 2>&1; then
    err "sudo not found; remove ${POLKIT_RULE_PATH} manually if desired."
    return 1
  fi
  info "Removing ${POLKIT_RULE_PATH} (sudo)…"
  sudo rm -f "$POLKIT_RULE_PATH"
  ok "Polkit rule removed."
}

DO_REMOVE_POLKIT_RULE=false
if [[ "$ASSUME_YES" == true ]]; then
  if want_remove_polkit_rule_env; then
    DO_REMOVE_POLKIT_RULE=true
  else
    info "Leaving polkit rule in place (${POLKIT_RULE_PATH}). Set LST_UNINSTALL_REMOVE_POLKIT_RULE=1 to remove it non-interactively."
  fi
else
  prompt_line_tty "Also remove the optional polkit rule (${POLKIT_RULE_PATH})? [y/N] " polkit_rm
  case "$polkit_rm" in
    y | Y | yes | YES) DO_REMOVE_POLKIT_RULE=true ;;
  esac
fi

if [[ "$DO_REMOVE_POLKIT_RULE" == true ]]; then
  remove_polkit_rule || true
fi

rm_paths() {
  python3 - <<'PY' "$1"
import json, os, sys
path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    m = json.load(f)
for key in ("bin_symlink", "desktop", "appimage"):
    p = m.get(key)
    if p and os.path.lexists(p):
        os.remove(p)
        print("removed", p)
inst = os.path.dirname(path)
try:
    os.remove(path)
    print("removed", path)
except OSError:
    pass
try:
    if os.path.isdir(inst) and not os.listdir(inst):
        os.rmdir(inst)
        print("removed empty", inst)
except OSError:
    pass
PY
}

rm_paths "$MANIFEST"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "${XDG_DATA_HOME}/applications" 2>/dev/null || true
fi

prompt_rm_config() {
  local dir="$1"
  [[ -d "$dir" ]] || return 0
  if [[ "$ASSUME_YES" != true ]]; then
    prompt_line_tty "Also delete settings and logs under ${dir}? [y/N] " reply2
    case "$reply2" in
      y | Y | yes | YES) rm -rf "$dir"; info "Removed ${dir}." ;;
      *) info "Left user data at ${dir}." ;;
    esac
  else
    info "Left user data at ${dir} (use interactive uninstall to prompt)."
  fi
}

prompt_rm_config "${HOME}/.config/linux-sensor-tray"
prompt_rm_config "${HOME}/.config/monitor"

ok "Linux Sensor Tray uninstalled."
