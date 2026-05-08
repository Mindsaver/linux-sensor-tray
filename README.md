# Linux Sensor Tray

Tray-first Electron app for live CPU, GPU, mainboard, storage, and memory stats on Linux. Reads sensors directly from `/sys/class/hwmon` and `/proc` — **no daemon** and **no `sudo` for normal use**.

- **Repository**: [github.com/Mindsaver/linux-sensor-tray](https://github.com/Mindsaver/linux-sensor-tray)
- **Screenshot**:

![Linux Sensor Tray main window](docs/Screenshot.png)

## Install (recommended): Arch-based distros (AUR)

If you’re on Arch / CachyOS / EndeavourOS / Manjaro, this is the default path.

```bash
yay -S linux-sensor-tray-bin
```

- Installs `linux-sensor-tray` + `.desktop` entry and updates on `yay -Syu`.
- There is also a from-source AUR package (builds against system `electron41`):

```bash
yay -S linux-sensor-tray
```

The PKGBUILDs in [`aur/`](aur/) are the source of truth and are pushed to AUR by CI. (`linux-sensor-tray` and `linux-sensor-tray-bin` conflict with each other.)

## Run

Launch from your app menu, or run:

```bash
linux-sensor-tray
```

Closing the window keeps it in the tray. Use tray menu → **Quit** to stop.

## What it shows

- **CPU**: total + per-core load/frequency, temps, and (with `zenpower`) extra power/voltage/current and per-CCD detail
- **GPU** (`amdgpu`): usage, temps (edge/junction/memory), clocks, fan, power (PPT), plus read-only tuning state
- **Mainboard**: fans, temps, voltages (when your Super I/O driver exposes them)
- **Storage**: NVMe composite temperature per drive
- **Memory**: RAM + swap usage

If you tune AMDGPU with **[LACT](https://github.com/ilya-zlobintsev/LACT)** (or similar), those settings become visible once the driver exposes them.

## History viewer and disk logging

The **Storage** tab shows **live NVMe temperatures** regardless of logging. Disk logging only runs when enabled in **Settings**.

- **Default**: logging is **off**
- **Format**: JSON Lines (1 JSON object per second per line)
- **Filename**: `linux-sensor-tray-YYYY-MM-DD.jsonl` (older installs may use `monitor-*.jsonl`)
- **Default folder**: usually `~/.config/linux-sensor-tray/sensor_logs/` (Electron `userData/sensor_logs`)

On startup, the app writes `history-viewer.html` next to your logs (both the default log directory and your custom directory, if set). Open it in any browser and drag/drop `.jsonl` files to view offline synced charts (zoom + pan supported).

## Requirements

- Linux with hwmon/sysfs enabled
- Node.js 20+ and npm (only needed for “run from source” / building)
- Full feature set is aimed at **AMD CPU + AMD discrete GPU**, but the app degrades gracefully when sysfs nodes are missing

Recommended kernel modules (hardware-dependent):
- `zenpower` (Zen 1–4): more CPU sensors (otherwise the app falls back to `k10temp`)
- `nct6687d` (only if your board uses NCT6687D and it didn’t autoload)

## System info enrichment (optional)

The System info tab can optionally run a privileged `lshw` probe for richer SMBIOS data.

- **On demand**: click **Enrich with root data** (polkit prompt)
- **Always**: runs on every refresh (recommended only with a polkit rule installed)

<details>
<summary><strong>Optional: AppImage install (any distro)</strong></summary>

### Quick install (AppImage)

```bash
curl -fsSL https://raw.githubusercontent.com/Mindsaver/linux-sensor-tray/main/scripts/install.sh | bash -s -- Mindsaver/linux-sensor-tray
```

- Installs to `~/.local/share/linux-sensor-tray/linux-sensor-tray.AppImage`
- Adds `~/.local/bin/linux-sensor-tray`

Non-interactive:

```bash
curl -fsSL https://raw.githubusercontent.com/Mindsaver/linux-sensor-tray/main/scripts/install.sh | bash -s -- --yes Mindsaver/linux-sensor-tray
```

Dry run:

```bash
curl -fsSL https://raw.githubusercontent.com/Mindsaver/linux-sensor-tray/main/scripts/install.sh | bash -s -- --dry-run Mindsaver/linux-sensor-tray
```

### Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/Mindsaver/linux-sensor-tray/main/scripts/uninstall.sh | bash
```

Dry run:

```bash
curl -fsSL https://raw.githubusercontent.com/Mindsaver/linux-sensor-tray/main/scripts/uninstall.sh | bash -s -- --dry-run
```

### Security / trust notes

- The installer is convenience. If you’re unsure, inspect `scripts/install.sh` before running it.
- Safe-by-default: no `sudo` for normal install; optional privileged steps require explicit confirmation (or flags).
- Preview actions and paths with `--dry-run`.

Tip: print install locations without installing:

```bash
curl -fsSL https://raw.githubusercontent.com/Mindsaver/linux-sensor-tray/main/scripts/install.sh | bash -s -- --print-paths --dry-run Mindsaver/linux-sensor-tray
```

### Verify release asset (recommended)

Prefer downloading from GitHub Releases and verifying checksums:

```bash
# Example (replace VERSION / filename with the one from the release page)
sha256sum -c linux-sensor-tray-<VERSION>.AppImage.sha256
```

See also: `SECURITY.md`.

</details>

<details>
<summary><strong>Optional: zenpower setup (more AMD CPU sensors)</strong></summary>

`zenpower` and the in-kernel `k10temp` driver both bind to the same AMD monitoring hardware. Usually `k10temp` loads first, so the app may only see Tctl/Tdie unless you switch to `zenpower`.

The running app does not change kernel modules; it checks for `zenpower` first and falls back to `k10temp`.

### Easy setup (Arch / CachyOS)

Install the DKMS module:

```bash
yay -S --needed zenpower3-dkms
```

Then switch `k10temp` → `zenpower`:

```bash
sudo tee /etc/modprobe.d/linux-sensor-tray-blacklist-k10temp.conf >/dev/null <<'EOF'
# linux-sensor-tray: blacklist k10temp so zenpower can bind (managed by install.sh / uninstall.sh)
blacklist k10temp
EOF

sudo modprobe -r k10temp || true
sudo modprobe zenpower
```

Verify which driver is active:

```bash
lsmod | rg '^(zenpower|k10temp)\b'
```

### Automated (installer)

If you installed via AppImage scripts, you can enable it via the installer prompt or force it:

```bash
curl -fsSL https://raw.githubusercontent.com/Mindsaver/linux-sensor-tray/main/scripts/install.sh | bash -s -- --zenpower
```

### Trade-off

If the `zenpower` DKMS build breaks after a kernel upgrade, you may temporarily have **no** CPU hwmon until you rebuild DKMS or remove the blacklist file.

</details>

<details>
<summary><strong>Develop / build</strong></summary>

### Run from source

```bash
npm install
npm run dev
```

### Build a packaged app (maintainers)

```bash
npm run build
```

To produce an AppImage + metadata locally:

```bash
npm run dist
```

Artifacts land in `release/` (gitignored), including `linux-sensor-tray-<version>-*.AppImage` and `latest-linux.yml`.

Publishing: CI runs `scripts/apply-github-publish.mjs` then `npm run dist:publish` so `electron-updater` can find releases.

Icon: raster logo lives at `build/icon.png` (512×512).

</details>

## Notes / troubleshooting

- If a value shows `—`, your kernel/driver/hardware simply doesn’t expose that sysfs node.
- Polling rate is 1 Hz. The Settings tab can extend the in-memory ring buffer up to 7 days (~604k samples). Settings are stored under Electron `userData` as `linux-sensor-tray-settings.json` (older `monitor-settings.json` is imported on first launch if present).
- AppImage / FUSE: if an AppImage fails to run, install `fuse2` / `libfuse` (varies by distro).

## Roadmap ideas (optional reading)

Candidate “system report” features live in [`docs/system-report.md`](docs/system-report.md).

