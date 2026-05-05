#!/usr/bin/env bash
set -euo pipefail

info() { printf '\033[0;36m%s\033[0m\n' "$*"; }
ok() { printf '\033[0;32m%s\033[0m\n' "$*"; }
warn() { printf '\033[0;33m%s\033[0m\n' "$*"; }
err() { printf '\033[0;31m%s\033[0m\n' "$*" >&2; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    err "Missing required command: $1"
    exit 1
  }
}

REPO="${LST_GH_REPO:-${MONITOR_GH_REPO:-}}"
if [[ -z "$REPO" && -n "${1:-}" ]]; then REPO="$1"; fi
REPO="${REPO:-Mindsaver/linux-sensor-tray}"

require_cmd curl
require_cmd python3
require_cmd chmod

XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
INSTALL_DIR="${LST_INSTALL_DIR:-${MONITOR_INSTALL_DIR:-$XDG_DATA_HOME/linux-sensor-tray}}"
LOCAL_BIN="${HOME}/.local/bin"
DESKTOP_DIR="${XDG_DATA_HOME}/applications"
DESKTOP_FILE="${DESKTOP_DIR}/linux-sensor-tray.desktop"
STABLE_APPIMAGE="${INSTALL_DIR}/linux-sensor-tray.AppImage"
PARTIAL="${INSTALL_DIR}/linux-sensor-tray.AppImage.partial"
MANIFEST="${INSTALL_DIR}/install-manifest.json"

MACHINE="$(uname -m)"
TMP_JSON="$(mktemp)"
trap 'rm -f "$TMP_JSON"' EXIT

AUTH_HEADER=()
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  AUTH_HEADER=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
fi

info "Fetching latest release from GitHub (${REPO})…"
HTTP_CODE="$(curl -sSL -o "$TMP_JSON" -w '%{http_code}' "${AUTH_HEADER[@]}" \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  "https://api.github.com/repos/${REPO}/releases/latest")"

if [[ "$HTTP_CODE" != "200" ]]; then
  err "GitHub API returned HTTP ${HTTP_CODE}. Is the repo public and does a release exist?"
  if [[ -f "$TMP_JSON" ]]; then head -c 400 "$TMP_JSON" >&2 || true; fi
  exit 1
fi

DOWNLOAD_URL="$(
  MACHINE="$MACHINE" LST_RELEASE_JSON="$TMP_JSON" python3 - <<'PY'
import json, os, sys
path = os.environ.get("LST_RELEASE_JSON") or os.environ.get("MONITOR_RELEASE_JSON")
if not path:
    sys.stderr.write("Missing LST_RELEASE_JSON\n")
    sys.exit(1)
with open(path, encoding="utf-8") as f:
    data = json.load(f)
assets = data.get("assets") or []
cands = [
    (a["name"], a["browser_download_url"])
    for a in assets
    if str(a.get("name", "")).endswith(".AppImage")
]
if not cands:
    sys.stderr.write("No .AppImage asset in latest release (build a release with CI first).\n")
    sys.exit(1)
machine = os.environ.get("MACHINE", "")
pick = None
if machine == "x86_64":
    for n, u in cands:
        ln = n.lower()
        if "x86_64" in n or "amd64" in ln:
            pick = u
            break
elif machine in ("aarch64", "arm64"):
    for n, u in cands:
        ln = n.lower()
        if "aarch64" in ln or "arm64" in ln or "arm" in ln:
            pick = u
            break
if pick is None:
    pick = cands[0][1]
print(pick)
PY
)"

info "Installing to ${INSTALL_DIR}…"
mkdir -p "$INSTALL_DIR" "$DESKTOP_DIR" "$LOCAL_BIN"

rm -f "$PARTIAL"
info "Downloading…"
curl -fSL --progress-bar -o "$PARTIAL" "$DOWNLOAD_URL"
chmod +x "$PARTIAL"
mv -f "$PARTIAL" "$STABLE_APPIMAGE"

BIN_LINK="${LOCAL_BIN}/linux-sensor-tray"
if [[ -e "$BIN_LINK" || -L "$BIN_LINK" ]]; then
  rm -f "$BIN_LINK"
fi
ln -s "$STABLE_APPIMAGE" "$BIN_LINK"

cat >"$DESKTOP_FILE" <<EOF
[Desktop Entry]
Name=Linux Sensor Tray
Comment=Linux hardware sensor tray monitor
Exec=${STABLE_APPIMAGE} %U
Terminal=false
Type=Application
Categories=Utility;System;
StartupWMClass=linux-sensor-tray
EOF

MACHINE="$MACHINE" python3 - <<PY >"$MANIFEST"
import json, os
print(
    json.dumps(
        {
            "version": 1,
            "repo": "${REPO}",
            "appimage": "${STABLE_APPIMAGE}",
            "desktop": "${DESKTOP_FILE}",
            "bin_symlink": "${BIN_LINK}",
            "machine": os.environ.get("MACHINE", ""),
        },
        indent=2,
    )
)
PY

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
fi

ok "Linux Sensor Tray installed."
info "  AppImage: ${STABLE_APPIMAGE}"
info "  Command:  ${BIN_LINK} (ensure ~/.local/bin is on PATH)"
info "  Uninstall: curl -fsSL https://raw.githubusercontent.com/${REPO%%/*}/${REPO#*/}/main/scripts/uninstall.sh | bash"
warn "Keep the AppImage at this path so in-app auto-updates can replace it."
