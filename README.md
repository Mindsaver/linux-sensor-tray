# Linux Sensor Tray

Tray-first Electron app for live CPU, GPU, mainboard, and storage stats on Linux (built and tested on CachyOS with a Ryzen 7 5700X + Radeon RX 9070 XT). It reads sensors from `/sys/class/hwmon` and `/proc` — no daemon and no `sudo` for normal use.

Repository: [github.com/Mindsaver/linux-sensor-tray](https://github.com/Mindsaver/linux-sensor-tray). Packaged builds use **`Linux Sensor Tray`** / `linux-sensor-tray` (`executableName`); GitHub release assets are named by electron-builder (typically `linux-sensor-tray-<version>-*.AppImage`). The install script saves the stable path `~/.local/share/linux-sensor-tray/linux-sensor-tray.AppImage` and adds `~/.local/bin/linux-sensor-tray`.

## What it shows

- **CPU**: total + per-core load and frequency, Tctl/Tdie, per-CCD temps, Vcore, V SoC, P Core, P SoC, I Core, I SoC
- **CPU tuning** (read-only sysfs): cpufreq driver, governor, `amd_pstate` status, EPP, hardware vs scaling frequency limits, optional BIOS limit, parsed boost steps — useful to see how high the OS/BIOS allows the chip to go (not a full “Ryzen Master” view; PBO/CO are not exposed as one sysfs blob).
- **GPU** (`amdgpu`): GPU usage (`gpu_busy_percent`), edge/junction/memory temperatures, vddgfx, package power (PPT) with cap, core/memory clocks, fan RPM and PWM duty
- **GPU tuning** (read-only sysfs): `power_dpm_force_performance_level`, DPM state, power profile text, `pp_dpm_sclk` / `pp_dpm_mclk` tables, `pp_od_clk_voltage` when the driver exposes it, plus PPT default/max/min when available. If you apply OC with **[LACT](https://github.com/ilya-zlobintsev/LACT)** (or similar), those settings show up here once the driver is in the right mode (e.g. Overdrive enabled).
- **Mainboard** (super-IO chip, e.g. `nct6687`): all reported voltages, fan RPMs, mainboard temperatures
- **Storage**: NVMe composite temperature per drive
- **Memory**: RAM and swap usage

The Overview tab gives a single-page glanceable dashboard. The **Overclock** tab groups CPU frequency limits and AMDGPU DPM/overdrive sysfs. The CPU and GPU tabs focus on live sensors and charts, with pointers to Overclock for tuning details.

## Requirements

- Linux with sysfs hwmon enabled (any modern distro)
- Node.js 20+ and npm
- An AMD CPU and an AMD discrete GPU for the full feature set
- Recommended kernel modules:
  - `zenpower` (Zen 1–4) — exposes Vcore, V SoC, per-CCD temps, package power and current. Without it, the app falls back to `k10temp` and only Tctl/Tdie are reported. On Arch/CachyOS install `zenpower3-dkms` from the AUR.
  - `nct6687d` — required if your motherboard uses an NCT6687D super-IO chip and the kernel didn't autoload a driver. Other chips (NCT677x, IT87…) are auto-detected too.
  - The kernel's `amdgpu` driver is loaded automatically on AMD systems.

## Run from source

```bash
npm install
npm run dev
```

The app launches with a window and a tray icon. Closing the window hides it to the tray. Right-click the tray icon → **Quit** to stop.

## Install from GitHub (CachyOS / Arch Linux)

Releases publish a **Linux x64 AppImage** plus `latest-linux.yml` (required for in-app updates). You need at least one **GitHub Release** built by CI before the installer can download anything.

**One-line install** (defaults below use this repo; override with another `owner/repo` if you fork):

```bash
curl -fsSL https://raw.githubusercontent.com/Mindsaver/linux-sensor-tray/main/scripts/install.sh | bash -s -- Mindsaver/linux-sensor-tray
```

Alternatively:

```bash
export LST_GH_REPO=Mindsaver/linux-sensor-tray
curl -fsSL https://raw.githubusercontent.com/Mindsaver/linux-sensor-tray/main/scripts/install.sh | bash
```

(`MONITOR_GH_REPO`, `MONITOR_INSTALL_DIR`, etc. still work as fallbacks during migration.)

This installs the AppImage to `~/.local/share/linux-sensor-tray/linux-sensor-tray.AppImage`, adds `~/.local/bin/linux-sensor-tray`, and registers **`linux-sensor-tray.desktop`**. **Do not move or rename** that AppImage path if you want **auto-updates** to keep working (the updater replaces that file in place).

**Uninstall:**

```bash
curl -fsSL https://raw.githubusercontent.com/Mindsaver/linux-sensor-tray/main/scripts/uninstall.sh | bash
```

Non-interactive: `LST_UNINSTALL_YES=1` or `--yes` (`MONITOR_UNINSTALL_YES` still accepted). The script can prompt to remove `~/.config/linux-sensor-tray` and, if present, legacy `~/.config/monitor`.

**Auto-updates:** the packaged app checks your GitHub repo’s latest release after startup (tray → **Check for updates…** also works). Set `LST_SKIP_AUTO_UPDATE=1` to disable (`MONITOR_SKIP_AUTO_UPDATE` still accepted). `GITHUB_TOKEN` on the install script is only needed for higher GitHub API rate limits (optional).

## Build a packaged app (maintainers)

```bash
npm run build
```

Compiled app output is under `out/`. To produce an AppImage and metadata locally:

```bash
npm run dist
```

Artifacts land in `release/` (gitignored), including `linux-sensor-tray-<version>-*.AppImage` (exact suffix depends on arch) and `latest-linux.yml`.

**Publishing:** CI runs `scripts/apply-github-publish.mjs` (sets `owner` / `repo` / **`releaseType: release`** so GitHub gets a normal release, not a draft) then `npm run dist:publish`. That uploads AppImage, `latest-linux.yml`, etc., so **electron-updater** works. If nothing appears under **Releases**, check the workflow log for “skipped publishing” (often an existing release + electron-builder’s 2-hour guard — CI sets `EP_GH_IGNORE_TIME` to reduce that) and confirm **Settings → Actions → General → Workflow permissions** allows **Read and write** for `GITHUB_TOKEN`.

## Notes / troubleshooting

- If a value shows `—` it means the corresponding sysfs file isn't exposed by your kernel/driver/hardware. The app degrades gracefully.
- The polling rate is 1 Hz. **Settings** tab: extend the in-memory ring buffer up to **7 days** (~604k samples). **Chart time range** (what the sparklines show) is a **dropdown** in the top bar. Defaults are **6 h** buffer and **1 min** charts; settings are saved under Electron `userData` as **`linux-sensor-tray-settings.json`** (on first launch, **`monitor-settings.json`** under the old `~/.config/monitor` path is imported automatically if present).
- Optional **disk logging**: append one JSON object per second to **`linux-sensor-tray-YYYY-MM-DD.jsonl`** (legacy: `monitor-*.jsonl`) in a folder you choose (default: Electron `userData/sensor_logs`). Each line is **schema 3**: chart metrics (`t`, `cpuLoad`, temps, GPU power, …) plus **`mem`**, **`cpu`**, **`cpuTuning`**, **`gpu`**, **`mainboard`**, **`storage`** (same detail level as in-app; large AMDGPU sysfs blobs are omitted). Older logs may be **schema 2** and can include a legacy **`smu`** block. **`history-viewer.html`** is copied alongside for offline charts; use `jq` or scripts for the extended fields.
- All sensor reads happen in the Electron main process; the renderer only receives a typed `SensorSnapshot` over IPC. The preload script is the only bridge (`contextIsolation: true`, `nodeIntegration: false`).
- **AppImage / FUSE:** If the AppImage fails to run, install `fuse2` or `libfuse` (varies by distro) and try again.
