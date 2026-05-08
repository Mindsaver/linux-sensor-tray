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

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    err "Missing required command: $1"
    exit 1
  }
}

K10TEMP_BLACKLIST_FILE="/etc/modprobe.d/linux-sensor-tray-blacklist-k10temp.conf"

ZENPOWER_CLI=""
REPO_POS=""
ASSUME_YES=false
DRY_RUN=false
PRINT_PATHS=false
for arg in "$@"; do
  case "$arg" in
    --zenpower) ZENPOWER_CLI=yes ;;
    --no-zenpower) ZENPOWER_CLI=no ;;
    -y | --yes) ASSUME_YES=true ;;
    --dry-run) DRY_RUN=true ;;
    --print-paths) PRINT_PATHS=true ;;
    -*)
      err "Unknown option: $arg"
      exit 1
      ;;
    *) REPO_POS="$arg" ;;
  esac
done
if [[ -n "${LST_INSTALL_YES:-}" || -n "${MONITOR_INSTALL_YES:-}" ]]; then
  ASSUME_YES=true
fi

REPO="${LST_GH_REPO:-${MONITOR_GH_REPO:-}}"
if [[ -z "$REPO" && -n "${REPO_POS}" ]]; then REPO="$REPO_POS"; fi
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
ICON_NAME="linux-sensor-tray"
ICON_DIR="${XDG_DATA_HOME}/icons/hicolor/512x512/apps"
ICON_FILE="${ICON_DIR}/${ICON_NAME}.png"
SETUP_CLI_PATH="${LOCAL_BIN}/linux-sensor-tray-setup"

normalize_path() {
  python3 - <<'PY' "$1"
import os, sys
print(os.path.realpath(os.path.expanduser(sys.argv[1])))
PY
}

validate_install_dir() {
  local raw="$1"
  [[ -n "$raw" ]] || { err "INSTALL_DIR is empty."; exit 1; }
  local resolved
  resolved="$(normalize_path "$raw")"
  local home_resolved
  home_resolved="$(normalize_path "$HOME")"
  if [[ "$resolved" == "/" ]]; then
    err "Refusing to install into '/'. Set LST_INSTALL_DIR to a safe directory."
    exit 1
  fi
  if [[ "$resolved" == "$home_resolved" ]]; then
    err "Refusing to install into your home directory (${resolved})."
    exit 1
  fi
  # Ensure we only install under XDG_DATA_HOME by default, unless explicitly overridden.
  # Even when overridden, we still refuse broad locations above.
  INSTALL_DIR="$resolved"
  STABLE_APPIMAGE="${INSTALL_DIR}/linux-sensor-tray.AppImage"
  PARTIAL="${INSTALL_DIR}/linux-sensor-tray.AppImage.partial"
  MANIFEST="${INSTALL_DIR}/install-manifest.json"
}

validate_install_dir "$INSTALL_DIR"

print_paths() {
  info "Paths:"
  info "  Install dir: ${INSTALL_DIR}"
  info "  AppImage:    ${STABLE_APPIMAGE}"
  info "  Partial:     ${PARTIAL}"
  info "  Manifest:    ${MANIFEST}"
  info "  Bin link:    ${HOME}/.local/bin/linux-sensor-tray"
  info "  Setup CLI:   ${SETUP_CLI_PATH}"
  info "  Desktop:     ${DESKTOP_FILE}"
}

if [[ "$PRINT_PATHS" == true ]]; then
  print_paths
  if [[ "$DRY_RUN" == true ]]; then exit 0; fi
fi

if [[ "$DRY_RUN" == true ]]; then
  echo
  ok "Dry run only; no changes made."
  print_paths
  info "Would:"
  info "  - Fetch latest release metadata from GitHub (${REPO})"
  info "  - Download AppImage into: ${STABLE_APPIMAGE}"
  info "  - Create/update symlink:  ${HOME}/.local/bin/linux-sensor-tray"
  info "  - Create/update desktop:  ${DESKTOP_FILE}"
  if [[ "$ZENPOWER_CLI" == yes || -n "${LST_CONFIGURE_ZENPOWER:-${MONITOR_CONFIGURE_ZENPOWER:-}}" ]]; then
    warn "Note: zenpower configuration may write ${K10TEMP_BLACKLIST_FILE} with sudo and run modprobe."
  else
    info "  - (Optional) zenpower step only if you opt in / confirm"
  fi
  exit 0
fi

if [[ "$ASSUME_YES" != true ]]; then
  if can_prompt_tty; then
    echo
    warn "You are about to run an installer script from the internet."
    info "This will:"
    info "  - Download an AppImage into: ${STABLE_APPIMAGE}"
    info "  - Create a symlink:          ${HOME}/.local/bin/linux-sensor-tray"
    info "  - Create a desktop entry:    ${DESKTOP_FILE}"
    warn "Review the script first if you're unsure: https://github.com/${REPO}/blob/main/scripts/install.sh"
    echo
    printf '%s' "Proceed with install? [y/N] " > /dev/tty
    read -r reply < /dev/tty
    case "$reply" in
      y | Y | yes | YES) ;;
      *) info "Cancelled."; exit 0 ;;
    esac
  else
    err "No controlling terminal (piped install cannot read answers from stdin)."
    err "Use non-interactive: --yes / LST_INSTALL_YES=1"
    exit 1
  fi
fi

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

# Install an icon into the user's icon theme so the desktop menu and window
# title bar can resolve it reliably (some desktops do not use AppImage metadata).
mkdir -p "$ICON_DIR"
tmp_extract="$(mktemp -d)"
cleanup_extract() { rm -rf "$tmp_extract"; }
trap 'rm -f "$TMP_JSON"; cleanup_extract' EXIT
(
  cd "$tmp_extract"
  "${STABLE_APPIMAGE}" --appimage-extract >/dev/null 2>&1 || exit 0
  embedded_icon="squashfs-root/usr/share/icons/hicolor/512x512/apps/${ICON_NAME}.png"
  if [[ -f "$embedded_icon" ]]; then
    cp -f "$embedded_icon" "$ICON_FILE"
  fi
)

BIN_LINK="${LOCAL_BIN}/linux-sensor-tray"
if [[ -e "$BIN_LINK" || -L "$BIN_LINK" ]]; then
  rm -f "$BIN_LINK"
fi
ln -s "$STABLE_APPIMAGE" "$BIN_LINK"

# Ship the standalone setup CLI alongside the AppImage so optional steps (zenpower,
# polkit-rule, install-deps) are available from the terminal AND from the in-app wizard.
SETUP_CLI_URL="https://raw.githubusercontent.com/${REPO}/main/scripts/linux-sensor-tray-setup"
info "Installing setup CLI to ${SETUP_CLI_PATH}…"
if curl -fSL -o "${SETUP_CLI_PATH}.partial" "$SETUP_CLI_URL"; then
  chmod 755 "${SETUP_CLI_PATH}.partial"
  mv -f "${SETUP_CLI_PATH}.partial" "$SETUP_CLI_PATH"
else
  rm -f "${SETUP_CLI_PATH}.partial"
  warn "Could not download setup CLI from ${SETUP_CLI_URL}; optional zenpower / polkit setup will be skipped."
  SETUP_CLI_PATH=""
fi

cat >"$DESKTOP_FILE" <<EOF
[Desktop Entry]
Name=Linux Sensor Tray
Comment=Linux hardware sensor tray monitor
Exec=${STABLE_APPIMAGE} %U
Icon=${ICON_NAME}
Terminal=false
Type=Application
Categories=Utility;System;
StartupWMClass=linux-sensor-tray
EOF

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
fi

LST_K10TEMP_BLACKLIST=""
is_amd_cpu() {
  [[ -r /proc/cpuinfo ]] && grep -q "AuthenticAMD" /proc/cpuinfo
}

want_configure_zenpower() {
  if [[ -n "$ZENPOWER_CLI" ]]; then
    [[ "$ZENPOWER_CLI" == yes ]] && return 0
    return 1
  fi
  local e="${LST_CONFIGURE_ZENPOWER:-${MONITOR_CONFIGURE_ZENPOWER:-}}"
  case "$(printf '%s' "$e" | tr '[:upper:]' '[:lower:]')" in
    1 | yes | true | on) return 0 ;;
    0 | no | false | off) return 1 ;;
  esac
  if can_prompt_tty; then
    echo
    warn "zenpower needs k10temp blacklisted so it can own the CPU hwmon (see README)."
    printf '%s' "Install ${K10TEMP_BLACKLIST_FILE} and load zenpower now (sudo)? [y/N] " > /dev/tty
    read -r zreply < /dev/tty
    case "$zreply" in
      y | Y | yes | YES) return 0 ;;
    esac
  fi
  return 1
}

configure_zenpower_blacklist() {
  if [[ -z "$SETUP_CLI_PATH" || ! -x "$SETUP_CLI_PATH" ]]; then
    err "Setup CLI is missing; cannot configure zenpower."
    return 1
  fi
  if ! command -v sudo >/dev/null 2>&1; then
    err "sudo not found; cannot configure zenpower."
    return 1
  fi
  info "Running: sudo ${SETUP_CLI_PATH} zenpower"
  if sudo "$SETUP_CLI_PATH" zenpower; then
    LST_K10TEMP_BLACKLIST=1
  else
    err "linux-sensor-tray-setup zenpower failed."
    return 1
  fi
}

if is_amd_cpu && want_configure_zenpower; then
  configure_zenpower_blacklist || true
fi

export REPO STABLE_APPIMAGE DESKTOP_FILE BIN_LINK MACHINE LST_K10TEMP_BLACKLIST K10TEMP_BLACKLIST_FILE ICON_FILE SETUP_CLI_PATH
rm -f "$MANIFEST"
python3 - <<'PY' >"$MANIFEST"
import json, os

data = {
    "version": 3,
    "repo": os.environ["REPO"],
    "appimage": os.environ["STABLE_APPIMAGE"],
    "desktop": os.environ["DESKTOP_FILE"],
    "bin_symlink": os.environ["BIN_LINK"],
    "icon": os.environ.get("ICON_FILE", ""),
    "machine": os.environ.get("MACHINE", ""),
}
setup_cli = os.environ.get("SETUP_CLI_PATH") or ""
if setup_cli:
    data["setup_cli"] = setup_cli
if os.environ.get("LST_K10TEMP_BLACKLIST"):
    data["k10temp_blacklist_file"] = os.environ["K10TEMP_BLACKLIST_FILE"]
print(json.dumps(data, indent=2))
PY

ok "Linux Sensor Tray installed."
info "  AppImage:  ${STABLE_APPIMAGE}"
info "  Command:   ${BIN_LINK} (ensure ~/.local/bin is on PATH)"
if [[ -n "$SETUP_CLI_PATH" && -x "$SETUP_CLI_PATH" ]]; then
  info "  Setup CLI: ${SETUP_CLI_PATH}"
fi
info "  Uninstall: curl -fsSL https://raw.githubusercontent.com/${REPO%%/*}/${REPO#*/}/main/scripts/uninstall.sh | bash"
warn "Keep the AppImage at this path so in-app auto-updates can replace it."

missing=()
command -v lshw >/dev/null 2>&1 || missing+=("lshw")
command -v pkexec >/dev/null 2>&1 || missing+=("polkit (pkexec)")
if (( ${#missing[@]} > 0 )); then
  echo
  warn "Optional: System info enrichment needs: ${missing[*]}"
  if [[ -n "$SETUP_CLI_PATH" && -x "$SETUP_CLI_PATH" ]]; then
    info "  ${SETUP_CLI_PATH} doctor              (full setup status)"
    info "  sudo ${SETUP_CLI_PATH} install-deps lshw polkit"
  elif command -v pacman >/dev/null 2>&1; then
    info "  Arch/CachyOS: sudo pacman -S --needed lshw polkit"
  else
    info "  Install via your distro package manager: lshw + polkit (pkexec)"
  fi
fi
