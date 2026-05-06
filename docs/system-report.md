# System identity, health, and “system report” (proposed)

This document describes **candidate features** that would broaden Linux Sensor Tray from “live sensors” into a lightweight **system identity + health** and **bottleneck** view. Most items can be sourced from **read-only sysfs/procfs**, plus optional helpers (e.g. `smartctl`) when present.

## Hardware identity & health

- **CPU microcode + cpufreq policy**
  - Microcode revision + vendor: `/proc/cpuinfo`, `dmesg` (if accessible)
  - Governor, driver, min/max, boost: `/sys/devices/system/cpu/cpufreq/policy*/`
  - **EPP** and **amd-pstate mode** (`active`/`passive`/`guided`): `/sys/devices/system/cpu/amd_pstate/` and `energy_performance_preference`
  - Helpful “why boosts differ” explanation panel: show what’s limiting boosting right now (governor, EPP, thermal headroom, package power, scaling vs hardware max, BIOS cap when detectable)
- **Memory**
  - **ECC supported / enabled** where exposed (platform dependent): `edac` sysfs (when `edac_mc` is present)
  - **Memory controller errors / EDAC counters**: `/sys/devices/system/edac/mc/` (CE/UE counts and per-DIMM labels when available)
- **Storage health**
  - **SMART summary** (NVMe/SATA): via `smartctl` when installed (fallback to sysfs-only if not)
  - Key fields to surface:
    - Wear indicator (NVMe “percentage used”), media errors, error log entries
    - Reallocated sectors (SATA), pending sectors, UDMA CRC errors
    - Total bytes written / TBW estimate (NVMe “data units written”, vendor TBW if known)
  - NVMe-only fallback details (when `smartctl` unavailable): `/sys/class/nvme/nvme*/` + `/sys/class/nvme/nvme*n*/`
- **Battery (laptops)**
  - Health % and cycle count (if exposed): `/sys/class/power_supply/BAT*/`
  - Current charge/discharge power (W) + time remaining estimate when possible

## Performance & bottlenecks

- **Top processes**
  - Per-process CPU% + RAM: `/proc/[pid]/stat`, `/proc/[pid]/status`
  - Disk I/O per process: `/proc/[pid]/io` (read/write bytes)
  - GPU usage per process (best-effort):
    - AMDGPU: `amdgpu_top`-style accounting is not always available; can surface “not supported” clearly
    - NVIDIA: optional NVML integration (only if user enables and driver supports)
- **Disk I/O**
  - Throughput + latency per device: `/sys/block/*/stat` (derive r/s, w/s, await-style estimates)
  - NVMe queue depth and device model/firmware: `/sys/class/nvme/…`
- **Network**
  - Current throughput per interface: `/sys/class/net/*/statistics/{rx_bytes,tx_bytes}`
  - Wi‑Fi details (SSID/link rate/signal): optional `iw`/nl80211 query when available (fallback to “wired/unknown”)

## Firmware / platform signals

- **Secure Boot state**
  - `mokutil --sb-state` when present; otherwise check UEFI vars (requires permissions and is distro-dependent)
- **TPM presence**
  - `/dev/tpm0` and `/sys/class/tpm/` enumeration; version if readable
- **Kernel cmdline + relevant modules**
  - Command line: `/proc/cmdline`
  - Loaded modules relevant to sensors & performance: `/proc/modules` (highlight `k10temp`, `zenpower`, `amdgpu`, `nvme`, `drivetemp`, `edac_mc`, vendor WMI, etc.)

## “Quality of life” summaries

- **System report export**
  - One button: **Copy redacted summary** to clipboard (and/or save `.txt`/`.json`)
  - Redaction defaults: hash/trim serial numbers, MACs, hostnames; keep vendor/model + driver versions
  - Include: CPU/GPU/mainboard/storage identifiers, kernel + cmdline, driver modules, key sensor availability, SMART “OK/attention” summary, battery health
- **Change detection**
  - Notify on: “driver changed”, “kernel updated”, “new USB device”, “GPU power profile changed”, “battery health drop”, “SMART attributes worsened”
  - Implementation sketch: persist last-seen inventory snapshot and diff it at startup / periodic interval (with a “review changes” UI)

