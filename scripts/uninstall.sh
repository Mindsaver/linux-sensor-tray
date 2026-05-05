#!/usr/bin/env bash
set -euo pipefail

info() { printf '\033[0;36m%s\033[0m\n' "$*"; }
ok() { printf '\033[0;32m%s\033[0m\n' "$*"; }
err() { printf '\033[0;31m%s\033[0m\n' "$*" >&2; }

XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"

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
  echo -n "Remove Linux Sensor Tray (desktop entry, symlink, AppImage)? [y/N] "
  read -r reply
  case "$reply" in
    y | Y | yes | YES) ;;
    *) info "Cancelled."; exit 0 ;;
  esac
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
    echo -n "Also delete settings and logs under ${dir}? [y/N] "
    read -r reply2
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
