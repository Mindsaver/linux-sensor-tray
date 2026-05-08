---
name: Optional Setup CLI and Banner
overview: "Move the existing `install.sh` zenpower / polkit-rule prompts into a standalone `linux-sensor-tray-setup` CLI shipped by all install paths (AUR-bin, AUR source, AppImage installer). Surface it via three layers: a non-interactive post-install hint in pacman output, a first-run setup wizard the app shows once after install, an always-on \"Hardware setup\" panel in the System info tab, plus the targeted CPU-tab banner for the zenpower fallback case."
todos:
  - id: setup-cli
    content: Write scripts/linux-sensor-tray-setup with subcommands zenpower [--revert], polkit-rule [--remove], doctor; no internal sudo, EUID-0 enforcement, AMD guard, exit codes 0/1/2/3
    status: completed
  - id: refactor-installsh
    content: "Refactor scripts/install.sh: download linux-sensor-tray-setup to ~/.local/bin and chmod 755; replace inline configure_zenpower_blacklist with a call to it via sudo; record the new path in install-manifest.json so scripts/uninstall.sh removes it"
    status: completed
  - id: aur-bin
    content: "Update ~/Dev/aur/linux-sensor-tray-bin: add the GitHub raw URL for linux-sensor-tray-setup as a source entry, install -Dm755 to /usr/bin, add install=linux-sensor-tray.install with a non-interactive post_install/post_upgrade hint pointing users to the wizard or the CLI; bump pkgver to 0.3.0 pkgrel=1"
    status: completed
  - id: aur-src
    content: "Update ~/Dev/aur/linux-sensor-tray: install scripts/linux-sensor-tray-setup from the source tarball to /usr/bin, add the same install scriptlet, bump pkgver to 0.3.0 pkgrel=1"
    status: completed
  - id: main-ipc
    content: Add src/main/setup.ts with getSetupCapabilities() and runZenpowerSetup(); register setup:capabilities and setup:configure-zenpower IPC handlers in src/main/index.ts
    status: completed
  - id: preload-types
    content: Expose api.setup.getCapabilities and api.setup.configureZenpower in src/preload/index.ts and add SetupCapabilities to src/shared/types.ts
    status: completed
  - id: cpu-banner
    content: Replace the existing Tip card in src/renderer/tabs/Cpu.tsx with a capability-aware banner that calls api.setup.configureZenpower() (button) and falls back to the README link when CLI/pkexec missing or non-AMD
    status: completed
  - id: cli-deps-doctor
    content: Extend scripts/linux-sensor-tray-setup with `install-deps PKG...` (uses native pkg manager - pacman for arch family, apt/dnf/zypper for others) and `doctor --json` (machine-readable status for the app)
    status: completed
  - id: caps-detection
    content: Expand src/main/setup.ts with full getCapabilities() that parses `doctor --json` and adds distro/pkgManager + optional-pkg presence checks; expose a runInstallDeps(packages, manager) main-process helper
    status: completed
  - id: setup-status-component
    content: Build src/renderer/components/SetupStatus.tsx that renders the capability grid (zenpower bound, k10temp blacklisted, polkit rule, lshw, pkexec, AUR helper, optional packages installed) with per-row action buttons (Install, Configure, Revert)
    status: completed
  - id: setup-wizard
    content: Build src/renderer/components/SetupWizard.tsx (modal) that hosts SetupStatus and has two footer buttons - Skip (close for this session only, no setting write) and Don't show anymore (writes setupWizardSeenForVersion = current app version); auto-open on launch when the stored value is missing/older than current version
    status: completed
  - id: system-tab-panel
    content: Add a "Hardware setup" card to src/renderer/tabs/System.tsx using SetupStatus (always-on view of the same grid)
    status: completed
  - id: settings-replay
    content: Add a "Re-run setup wizard" button to src/renderer/tabs/Settings.tsx that resets `setupWizardSeenForVersion` and reopens the modal
    status: completed
  - id: release
    content: Tag v0.3.0 in the app repo so AppImage and source tarball ship the new CLI; bump both AUR PKGBUILDs to pkgver=0.3.0, regenerate .SRCINFO, push to ssh://aur@aur.archlinux.org
    status: in_progress
  - id: verify
    content: "Smoke test on a clean state: install linux-sensor-tray-bin via yay, confirm pacman prints the post-install hint, the linux-sensor-tray-setup CLI is on PATH, the first-run wizard opens, the System tab Hardware setup card renders the same grid, the CPU-tab banner appears on AMD without zenpower, and a Configure click triggers the polkit prompt and binds zenpower"
    status: pending
isProject: false
---

## Scope

Option B confirmed: CLI + post-install hint + in-app banner. `zenpower3-dkms` / `lshw` / `polkit` stay as `optdepends`. AUR rules forbid interactive scriptlets, so the install.sh-style `[y/N]` prompt cannot live inside `pacman` / `yay -S` — it has to move into either a follow-up CLI invocation or in-app UI. The plan now layers three in-app surfaces in addition to the post-install hint:

1. **First-run wizard** — modal shown once when `setupWizardSeenForVersion` is missing or older than the current app version. Closes the gap left by the non-interactive AUR install.
2. **System info tab "Hardware setup" card** — always-on status grid + actions, so the user can come back any time.
3. **CPU tab banner** — targeted, only for the `!hasZenpower && isAmd` case.

All three render the same `SetupStatus` component for consistency; the wizard adds explanatory copy and a two-button footer ("Skip" — close for this session only, no setting write; "Don't show anymore" — writes `setupWizardSeenForVersion`).

## Architecture

```mermaid
flowchart TB
  AUR[yay -S linux-sensor-tray] --> Pacman[pacman installs PKGBUILD]
  Pacman --> Bins["/usr/bin/linux-sensor-tray<br/>/usr/bin/linux-sensor-tray-setup"]
  Pacman --> Hint[".install post_install prints:<br/>sudo linux-sensor-tray-setup doctor"]
  AppImageInstall[curl install.sh | bash] --> LocalBins["~/.local/bin/linux-sensor-tray<br/>~/.local/bin/linux-sensor-tray-setup"]
  Bins --> Launch[App launch]
  LocalBins --> Launch
  Launch --> WizardCheck{"setupWizardSeenForVersion<br/>current?"}
  WizardCheck -->|no| Wizard["First-run modal:<br/>SetupStatus grid + intro copy"]
  WizardCheck -->|yes| Tabs[Normal app shell]
  Wizard -.->|user dismisses| Tabs
  Tabs --> CpuTab["CPU tab banner<br/>(only if !hasZenpower & AMD)"]
  Tabs --> SysTab["System info tab<br/>Hardware setup card"]
  Wizard --> Caps[api.setup.getCapabilities]
  CpuTab --> Caps
  SysTab --> Caps
  Caps --> Doctor["spawn linux-sensor-tray-setup doctor --json"]
  Wizard --> Action[Per-row action button]
  SysTab --> Action
  CpuTab --> Action
  Action --> Pkexec["pkexec linux-sensor-tray-setup <subcommand>"]
  Pkexec --> System["modprobe / pacman -S / polkit rule"]
  Hint --> Manual[user runs CLI in terminal]
  Manual --> System
```



## 1. New standalone setup CLI

Create `scripts/linux-sensor-tray-setup` (bash, no external deps):

- **Subcommands**:
  - `zenpower` — write `/etc/modprobe.d/linux-sensor-tray-blacklist-k10temp.conf`, `modprobe -r k10temp || true`, `modprobe zenpower`
  - `zenpower --revert` — remove the blacklist file, `modprobe -r zenpower || true`, `modprobe k10temp`
  - `polkit-rule` — install the always-on lshw rule (mirrors [src/main/linuxPolkitRule.ts](src/main/linuxPolkitRule.ts) lines 84-86)
  - `polkit-rule --remove` — remove that rule
  - `install-deps PKG...` — install repo packages via the detected package manager (`pacman -S --needed`, `apt-get install -y`, `dnf install -y`, `zypper install -y`). Used for `lshw` and `polkit`. Refuses to install AUR-only packages — prints the recommended `yay -S zenpower3-dkms` command and exits 4 instead. Requires root.
  - `doctor` — human-readable status (which hwmon driver is bound, which optdeps are installed, polkit rule presence, AUR helper detection). No root needed.
  - `doctor --json` — same data, machine-readable, consumed by the app's `getSetupCapabilities()`.
  - `--help` / `-h` — usage
- **Root requirement**: action subcommands (`zenpower`, `polkit-rule`) must run as EUID 0; print a clear error and exit non-zero otherwise. The CLI itself does NOT call `sudo` — the caller (user terminal, pkexec, the existing install.sh) handles elevation. Keeps the script auditable and lets pkexec rules be authored cleanly.
- **AMD guard**: `zenpower` action exits 2 with a clear message on non-AMD CPUs (mirrors `is_amd_cpu()` in [scripts/install.sh](scripts/install.sh) lines 259-261).
- **Exit codes**: 0 success, 1 generic error, 2 unsupported hardware, 3 missing root, 4 AUR-only package requested, 5 unknown package manager / unsupported distro.

The `doctor --json` payload (consumed by the app):

```json
{
  "version": 1,
  "cpuVendor": "AuthenticAMD" | "GenuineIntel" | "other",
  "distro": { "id": "arch", "idLike": ["arch"], "pkgManager": "pacman" },
  "hwmon": { "zenpower": true, "k10temp": false, "blacklistFile": "/etc/modprobe.d/linux-sensor-tray-blacklist-k10temp.conf", "blacklistInstalled": true },
  "polkitRule": { "installed": false, "path": "/etc/polkit-1/rules.d/49-linux-sensor-tray.rules" },
  "tools": { "pkexec": true, "lshw": false, "yay": true, "paru": false },
  "optionalPkgs": { "lshw": false, "polkit": true, "zenpower3-dkms": false }
}
```

Logic for each action is lifted as-is from [scripts/install.sh](scripts/install.sh) lines 258-309 and [scripts/uninstall.sh](scripts/uninstall.sh) (zenpower revert section). No new logic, just relocation.

## 2. Refactor existing AppImage installer to use the CLI

Edit [scripts/install.sh](scripts/install.sh):

- **Always download** `linux-sensor-tray-setup` from `https://raw.githubusercontent.com/Mindsaver/linux-sensor-tray/main/scripts/linux-sensor-tray-setup` and install to `~/.local/bin/linux-sensor-tray-setup` (chmod 755).
- **Replace** the inline `configure_zenpower_blacklist()` function (lines 285-309) with `sudo "${LOCAL_BIN}/linux-sensor-tray-setup" zenpower` — same prompt flow at the top, same outcome.
- **Update** `install-manifest.json` to record the setup CLI path so [scripts/uninstall.sh](scripts/uninstall.sh) removes it.

Keeps the AppImage user experience identical (still prompts via `/dev/tty`, still records manifest) but routes through one shared implementation.

## 3. AUR packaging changes (both PKGBUILDs)

For [~/Dev/aur/linux-sensor-tray-bin/PKGBUILD](~/Dev/aur/linux-sensor-tray-bin/PKGBUILD) and [~/Dev/aur/linux-sensor-tray/PKGBUILD](~/Dev/aur/linux-sensor-tray/PKGBUILD):

- **Add to `source=()`**: pull `linux-sensor-tray-setup`. The source PKGBUILD already has the source tarball, so for that one just `install -Dm755` from `${pkgname}-${pkgver}/scripts/linux-sensor-tray-setup`. For `-bin`, fetch directly from `${url}/raw/v${pkgver}/scripts/linux-sensor-tray-setup`.
- **Install** to `${pkgdir}/usr/bin/linux-sensor-tray-setup`, mode 755.
- **Add `install=linux-sensor-tray.install`** key.
- **Create** `linux-sensor-tray.install` (one copy in each AUR repo) with non-interactive `post_install`/`post_upgrade`:

```
>>> Optional setup:
      Launch the app once - the first-run wizard surfaces every optional step.
      Or from terminal:
        linux-sensor-tray-setup doctor             (check current state)
        sudo linux-sensor-tray-setup zenpower      (AMD: extra Vcore/V SoC/per-CCD telemetry)
        sudo linux-sensor-tray-setup polkit-rule   (always-on lshw enrichment)
        sudo linux-sensor-tray-setup install-deps lshw polkit
```

- **Version bump**: this work ships in app v0.3.0, so both PKGBUILDs go from `pkgver=0.2.0 pkgrel=2` (current AUR state) to `pkgver=0.3.0 pkgrel=1`. Regenerate `.SRCINFO` and push (this is what the §6 release section orchestrates).
- `**provides`/`conflicts`**: only `-bin` declares them; nothing changes there. The source PKGBUILD doesn't need any.

## 4. Main-process IPC: capabilities + privileged actions

`src/main/setup.ts` (new):

- `getSetupCapabilities()` — locate `linux-sensor-tray-setup` on `PATH` (`/usr/bin`, `~/.local/bin`), then `execFile` it with `doctor --json` and parse the result. Cache for ~5 s to avoid spamming subprocesses when multiple surfaces (wizard + System tab + CPU banner) mount simultaneously.
- **Fallback when the CLI is not on disk** (older AppImage installs, dev runs of the app outside any installer): synthesize a minimal `SetupCapabilities` object directly from the main process — read `/proc/cpuinfo` for `cpuVendor`, `/etc/os-release` for `distro.id` / `pkgManager`, `existsSync('/usr/bin/pkexec')`, etc. Set `cliMissing: true` so the renderer can show a clear "Update Linux Sensor Tray to enable in-app setup" notice. The grid still renders meaningful per-row status; only the action buttons are disabled.
- `runSetupCommand(args: string[], { privileged: boolean })` — single helper that either runs `linux-sensor-tray-setup ARGS...` directly (for `doctor`) or via `pkexec` (for `zenpower`, `polkit-rule`, `install-deps`). Returns `{ ok, stdout, stderr, exitCode }`.
- `shouldOpenSetupWizard(seenForVersion: string, currentVersion: string, caps: SetupCapabilities): boolean` — encapsulates wizard gating in one place (main process), using semver compare and the current capability state.
  - **Version gate**: only consider opening when `!seenForVersion || semver.lt(seenForVersion, currentVersion)` (avoid lexicographic traps like `'0.10.0' < '0.2.0'`).
  - **Actionable-missing gate**: only open when there is **at least one actionable missing setup item**, e.g.:
    - `caps.cliMissing` (wizard can explain how to upgrade/install)
    - `!caps.tools.pkexec` (wizard can explain “run in terminal” fallback)
    - `!caps.tools.lshw` / missing `optionalPkgs.lshw`
    - `!caps.polkitRule.installed` or missing `optionalPkgs.polkit`
    - `caps.cpuVendor === 'AuthenticAMD' && !caps.hwmon.zenpower` (the targeted zenpower setup case)
  - **No-op suppression**: if the version gate passes but **nothing actionable is missing**, return `false` (do not show the wizard).
  - **Optional UX**: when the version gate passes but nothing is actionable, proactively set `setupWizardSeenForVersion = currentVersion` so the user never sees a pointless first-run modal on an already-correctly-configured system.

`src/main/index.ts` IPC handlers (all dispatch to `runSetupCommand`):

- `setup:capabilities` → returns the parsed JSON, or the fallback `SetupCapabilities` with `cliMissing: true` when the CLI isn't on disk.
- `setup:configure-zenpower` / `setup:revert-zenpower`
- `setup:install-polkit-rule` / `setup:remove-polkit-rule`
- `setup:install-deps` (`{ packages: string[] }`)
- `setup:wizard-state` → `{ shouldOpen: boolean, currentVersion: string, seenForVersion: string }` — single call the renderer makes on mount; main computes `shouldOpen` via `shouldOpenSetupWizard()` so the renderer never has to do version math.
- `setup:mark-wizard-seen` → writes `setupWizardSeenForVersion = currentVersion` to settings JSON via the existing settings persistence (whatever module owns `linux-sensor-tray-settings.json`; reuse its `updateSettings()` rather than introducing a parallel write path).
- `setup:reset-wizard-seen` → writes empty string; called from the Settings tab "Re-run setup wizard" button.

`src/preload/index.ts` — expose `api.setup.{ getCapabilities, configureZenpower, revertZenpower, installPolkitRule, removePolkitRule, installDeps, getWizardState, markWizardSeen, resetWizardSeen }`. Mirrors the `api.systemInfo.refreshPrivileged()` shape at line 56.

`src/shared/types.ts` — add `SetupCapabilities` (matching the JSON above plus the `cliMissing: boolean` fallback flag), `SetupWizardState`, and all `api.setup.`* signatures.

## 5. Renderer surfaces

### 5a. SetupStatus component (shared)

`src/renderer/components/SetupStatus.tsx` — renders the capability grid as a single component used by the wizard, the System tab card, and (in compact form) the CPU tab banner. Each row shows status + a context-sensitive action button:

- **Zenpower module** — `Configure` if AMD + not bound; `Revert` if blacklist file installed.
- **k10temp blacklist file** — read-only mirror of the row above, useful for transparency.
- **lshw installed** — `Install` (calls `installDeps(['lshw'])`) when missing on a known distro.
- **polkit / pkexec** — `Install` if missing, `Install rule` to add the always-on lshw rule, `Remove rule` to undo.
- **AUR helper present** — informational; only shown on Arch family. Drives the zenpower3-dkms row's UX.
- `**zenpower3-dkms` package** — when AUR helper is detected: `Copy yay command` button (writes `yay -S --needed zenpower3-dkms` to clipboard via `navigator.clipboard.writeText`). When no helper: show a README link. **Never** runs the AUR install from inside the app — explicit constraint.
- **Other distros** — when `pkgManager` is `apt`/`dnf`/`zypper`, the same `installDeps` path works for `lshw` and `polkit`. Zenpower is Arch-only AUR; on other distros that row is informational only.

After every successful action the component re-fetches capabilities (`api.setup.getCapabilities()`) and re-renders.

### 5b. First-run wizard

`src/renderer/components/SetupWizard.tsx` — modal that wraps `SetupStatus` plus header copy ("Welcome — let's enable optional features"). Hosted in [src/renderer/App.tsx](src/renderer/App.tsx) so it can overlay any tab.

**Two distinct dismiss actions** (the user explicitly chose this UX):

- **"Skip"** (secondary, left) — closes the modal for this session only. Does **not** write any setting. Next app launch the wizard reopens. Use case: "I'm in a hurry, ask me again later."
- **"Don't show anymore"** (primary, right) — closes the modal **and** writes `setupWizardSeenForVersion = currentVersion`. The wizard will not auto-open on subsequent launches unless the user clicks Settings → Re-run setup wizard, or a future app version is newer than the stored value (so a major release can re-prompt for newly available steps).

Gating logic:

- New setting `setupWizardSeenForVersion: string` is added to the existing settings JSON managed in main. The renderer never reads it directly — it asks main on mount via `api.setup.getWizardState()`, which returns `{ shouldOpen, currentVersion, seenForVersion }`. Main computes `shouldOpen` using proper semver compare (see `shouldOpenSetupWizard()` in §4) so version math lives in one place.
- **Additional suppression rule**: even when the stored version is missing/older, the wizard must **not** open if `getSetupCapabilities()` reports that all relevant optional features are already in a “green” state (no actionable missing items). This prevents showing the modal on systems that already have `lshw` / polkit / zenpower configured.
- "Skip" → pure session close; no IPC, no setting change. Reopens next launch.
- "Don't show anymore" → `api.setup.markWizardSeen()` writes `setupWizardSeenForVersion = currentVersion` and the modal closes.
- Settings tab "Re-run setup wizard" → `api.setup.resetWizardSeen()` then sets local React state `setOpen(true)`.

Pseudocode for the modal footer:

```tsx
<footer>
  <button onClick={() => setOpen(false)}>Skip</button>
  <button onClick={async () => {
    await window.api.setup.markWizardSeen()
    setOpen(false)
  }}>Don't show anymore</button>
</footer>
```

### 5c. System info tab — "Hardware setup" card

[src/renderer/tabs/System.tsx](src/renderer/tabs/System.tsx) — add a new `<Card title="Hardware setup">` near the top of the tab that hosts `SetupStatus` directly (no modal wrapper). This is the always-on surface the user can come back to after dismissing the wizard.

### 5d. Settings tab — "Re-run setup wizard"

[src/renderer/tabs/Settings.tsx](src/renderer/tabs/Settings.tsx) — add a small "Setup" group with a "Re-run setup wizard" button that clears `setupWizardSeenForVersion` and triggers the modal to open immediately.

### 5e. CPU tab banner (unchanged from prior plan section)

[src/renderer/tabs/Cpu.tsx](src/renderer/tabs/Cpu.tsx) — replace the existing Tip card (lines 121-129) with the same banner described in the previous version of this plan: title "Enable full Ryzen telemetry", "Configure zenpower (root)" button using `api.setup.configureZenpower()`, README fallback when CLI/pkexec missing, hidden on non-AMD. After success, the next 1 Hz polling tick flips `hasZenpower` and the banner disappears automatically.

## 6. Release and AUR rollout

- **Tag** `v0.3.0` in the app repo so the new CLI is part of a published source tarball + AppImage. CI ([.github/workflows/release.yml](.github/workflows/release.yml)) handles publishing.
- **Bump** both AUR PKGBUILDs to `pkgver=0.3.0 pkgrel=1`, run `updpkgsums && makepkg --printsrcinfo > .SRCINFO`, push.
- **Verify** `yay -S linux-sensor-tray-bin` end-to-end on a clean test install: pacman prints the post-install hint, the CLI is on PATH, the in-app banner appears, the button triggers the polkit prompt, zenpower binds.

## Edge cases covered

- **Non-AMD CPU**: zenpower row in `SetupStatus` is informational ("not applicable on Intel"); CPU tab banner hidden; first-run wizard still appears (it has other rows like lshw / polkit).
- **No pkexec**: every row's action button is replaced with a "Run in terminal" hint that copies the equivalent `sudo` command to clipboard; `installDeps` and zenpower configuration both fall back to copy-to-clipboard.
- **CLI missing** (older AppImage installs, dev runs): main returns the synthesized fallback `SetupCapabilities` with `cliMissing: true`; the wizard and System tab card render the rows in read-only mode and show a "Update Linux Sensor Tray to enable in-app setup" notice with the README install link. CPU banner falls back to README link. No crashes, no broken buttons.
- **Zenpower already loaded**: row shows green "Configured", action button switches to `Revert`. CPU banner hidden by existing `!hasZenpower` guard.
- **AUR-only package install attempt**: the CLI returns exit 4; the renderer interprets that as "show AUR helper command + copy button" instead of erroring.
- **Distro is not Arch family**: `install-deps` still works for `lshw`/`polkit` via apt/dnf/zypper; the zenpower row is informational only and links to the upstream zenpower module repo.
- **Wizard "Skip"**: modal closes for the session only; reopens on next launch because no setting was written.
- **Wizard "Don't show anymore"**: writes `setupWizardSeenForVersion = currentVersion`; no auto-open until Settings "Re-run" clears it or a newer app version is installed.
- **App version bump**: when an upgrade lands (e.g. v0.3.0 → v0.4.0) and the stored `setupWizardSeenForVersion` is older, the wizard auto-opens once for the new version even if the user previously chose "Don't show anymore". This is intentional — major versions may add new optional steps. Can be turned into strict equality if you want stronger "never again" semantics later.
- **Capabilities cache invalidation**: every successful action triggers `api.setup.getCapabilities()` re-fetch so the grid updates immediately, no manual refresh.

