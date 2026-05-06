import { useCallback, useEffect, useState, type JSX } from 'react'
import { Card } from '../components/Card'
import type { SystemInfoSnapshot } from '@shared/types'
import { fmt } from '../format'
import { useSensorTray } from '../store'

function kv(label: string, value: string | number | null | undefined): JSX.Element {
  const v =
    value === '' || value === null || value === undefined
      ? '—'
      : typeof value === 'number' && !Number.isFinite(value)
        ? '—'
        : String(value)
  return (
    <div className="grid grid-cols-[minmax(8rem,11rem)_1fr] gap-x-3 gap-y-1 text-sm border-b border-slate-800/50 py-2 last:border-0">
      <div className="text-slate-500 shrink-0">{label}</div>
      <div className="text-slate-200 mono text-xs break-all">{v}</div>
    </div>
  )
}

export function SystemTab(): JSX.Element {
  const [data, setData] = useState<SystemInfoSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const probeMode = useSensorTray((s) => s.privilegedSystemProbe)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const s = await window.api.getSystemInfo()
      setData(s)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const enrich = useCallback(async () => {
    setEnriching(true)
    setErr(null)
    try {
      const s = await window.api.enrichSystemInfo()
      setData(s)
      if (s.lshwExtras?.probeSource !== 'pkexec') {
        // pkexec returned but didn't elevate (rule denied / dialog cancelled / no agent).
        setErr('pkexec did not elevate. Authentication was cancelled or no polkit rule matched.')
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setEnriching(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const showEnrichButton =
    probeMode === 'onDemand' && data != null && data.lshwExtras?.probeSource !== 'pkexec'

  const hintCmd = (() => {
    const h = data?.privilegedProbeHint
    if (!h) return null
    const cmds = [...h.matchAll(/`([^`]+)`/g)].map((m) => (m[1] ?? '').trim()).filter(Boolean)
    // Prefer copyable "install" commands (pacman / apt / etc) over generic tokens like `lshw`.
    const preferred = cmds.find((c) => /\bsudo\b/.test(c) || /\bpacman\b/.test(c) || /\bapt\b/.test(c) || /\bdnf\b/.test(c))
    return preferred ?? null
  })()

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || enriching}
          className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-800 text-cyan-200 hover:bg-slate-700 disabled:opacity-50 border border-slate-700"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
        {showEnrichButton && (
          <button
            type="button"
            onClick={() => void enrich()}
            disabled={enriching || loading}
            title="Run pkexec /usr/sbin/lshw -json (polkit). May prompt for auth on first use."
            className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-800 text-amber-200 hover:bg-slate-700 disabled:opacity-50 border border-slate-700"
          >
            {enriching ? 'Enriching…' : 'Enrich with root data'}
          </button>
        )}
        {data && (
          <span className="text-xs text-slate-500 mono tabular-nums">
            Collected {new Date(data.collectedAt).toLocaleString()}
          </span>
        )}
      </div>

      {err && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100">{err}</div>
      )}

      {data?.privilegedProbeHint && data.lshwExtras?.probeSource !== 'pkexec' && (
        <div className="rounded-lg border border-cyan-500/30 bg-slate-900/40 px-3 py-2 text-[12px] text-slate-300 leading-snug space-y-2">
          <div>{data.privilegedProbeHint}</div>
          {hintCmd && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="flex-1 min-w-[16rem] rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 font-mono text-[11px] text-slate-200"
                readOnly
                value={hintCmd}
              />
              <button
                type="button"
                className="px-2.5 py-1 rounded-md text-[11px] bg-slate-800 text-cyan-200 hover:bg-slate-700 border border-slate-700"
                onClick={() => {
                  void navigator.clipboard.writeText(hintCmd).then(
                    () => {
                      setCopied(true)
                      window.setTimeout(() => setCopied(false), 1200)
                    },
                    () => {
                      // ignore (clipboard blocked)
                    }
                  )
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
        </div>
      )}

      {!data && !err && <div className="text-slate-400 text-sm">Loading system information…</div>}

      {data && (
        <div className="grid grid-cols-12 gap-4">
          <Card title="Operating system" className="col-span-12 md:col-span-6">
            <div>
              {data.os ? (
                <>
                  {kv('Hostname', data.os.hostname)}
                  {kv('Distro', `${data.os.distro} ${data.os.release}`)}
                  {kv('Kernel', data.os.kernel)}
                  {kv('Architecture', data.os.arch)}
                  {kv('Platform', data.os.platform)}
                  {kv('Firmware', data.os.uefi === null ? '—' : data.os.uefi ? 'UEFI' : 'Legacy BIOS')}
                </>
              ) : (
                <p className="text-slate-500 text-sm">No OS info.</p>
              )}
            </div>
          </Card>

          <Card title="BIOS" className="col-span-12 md:col-span-6">
            <div>
              {data.bios ? (
                <>
                  {kv('Vendor', data.bios.vendor)}
                  {kv('Version', data.bios.version)}
                  {kv('Release date', data.bios.releaseDate)}
                </>
              ) : (
                <p className="text-slate-500 text-sm">No BIOS info.</p>
              )}
            </div>
          </Card>

          <Card title="Mainboard" className="col-span-12 md:col-span-6">
            <div>
              {data.baseboard ? (
                <>
                  {kv('Manufacturer', data.baseboard.manufacturer)}
                  {kv('Model', data.baseboard.model)}
                  {kv('Version', data.baseboard.version)}
                  {kv('Serial', data.baseboard.serial)}
                  {kv('Memory slots', data.baseboard.memSlots)}
                  {kv('Max memory', data.baseboard.memMaxMB != null ? `${data.baseboard.memMaxMB} MB` : null)}
                </>
              ) : (
                <p className="text-slate-500 text-sm">No baseboard info.</p>
              )}
              {data.lshwExtras?.systemProduct && kv('System product (DMI)', data.lshwExtras.systemProduct)}
            </div>
          </Card>

          {data.chassis && (
            <Card title="Chassis" className="col-span-12 md:col-span-6">
              <div>
                {kv('Manufacturer', data.chassis.manufacturer)}
                {kv('Model', data.chassis.model)}
                {kv('Type', data.chassis.type)}
              </div>
            </Card>
          )}

          <Card title="CPU" className="col-span-12 md:col-span-6">
            <div>
              {data.cpu ? (
                <>
                  {kv('Model', data.cpu.brand)}
                  {kv('Vendor', data.cpu.vendor)}
                  {kv('Socket', data.cpu.socket)}
                  {kv('Cores (logical / physical)', `${data.cpu.cores} / ${data.cpu.physicalCores}`)}
                  {kv('Packages', data.cpu.processors)}
                  {kv('Clock (base / min / max)', `${data.cpu.speedGHz} / ${data.cpu.speedMinGHz} / ${data.cpu.speedMaxGHz} GHz`)}
                  {kv('Governor', data.cpu.governor)}
                  {kv('Virtualization', data.cpu.virtualization ? 'yes' : 'no')}
                  {kv('L3 cache', data.cpu.cacheL3MB != null ? `${data.cpu.cacheL3MB} MB` : null)}
                  {data.lshwExtras?.cpuCacheBytes?.l1 != null &&
                    kv('L1 cache (DMI)', fmt.bytes(data.lshwExtras.cpuCacheBytes.l1))}
                  {data.lshwExtras?.cpuCacheBytes?.l2 != null &&
                    kv('L2 cache (DMI)', fmt.bytes(data.lshwExtras.cpuCacheBytes.l2))}
                  {data.lshwExtras?.cpuCacheBytes?.l3 != null && data.cpu.cacheL3MB == null &&
                    kv('L3 cache (DMI)', fmt.bytes(data.lshwExtras.cpuCacheBytes.l3))}
                  {data.lshwExtras?.amdCryptoCoprocessor && (
                    <p className="text-slate-500 text-xs mt-2 pt-2 border-t border-slate-800/50">
                      AMD cryptographic coprocessor (PSP/CCP) present — <span className="mono text-slate-400">ccp</span>
                    </p>
                  )}
                </>
              ) : (
                <p className="text-slate-500 text-sm">No CPU info.</p>
              )}
            </div>
          </Card>

          <Card title="RAM" className="col-span-12 md:col-span-6">
            <div>
              {data.memory ? (
                (() => {
                  const mem = data.memory
                  const mods = mem.modules
                  const showSlotCol = mods.some((m) => m.slot)
                  const showSerialCol = mods.some((m) => m.serialNum)
                  return (
                    <>
                      {kv('Total', fmt.bytes(mem.totalBytes))}
                      {mods.length === 0 ? (
                        <p className="text-slate-600 text-[11px] mt-2 italic">No DIMM details</p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs text-slate-500 uppercase tracking-wide">Modules</p>
                          <div className="rounded-lg border border-slate-800 overflow-x-auto">
                            <table className="w-full text-xs text-left">
                              <thead className="bg-slate-950/80 text-slate-400">
                                <tr>
                                  {showSlotCol && <th className="px-2 py-1.5 font-medium">Slot</th>}
                                  <th className="px-2 py-1.5 font-medium">Size</th>
                                  <th className="px-2 py-1.5 font-medium">Type</th>
                                  <th className="px-2 py-1.5 font-medium">Speed</th>
                                  <th className="px-2 py-1.5 font-medium">Manufacturer</th>
                                  <th className="px-2 py-1.5 font-medium">Part #</th>
                                  <th className="px-2 py-1.5 font-medium">Form</th>
                                  {showSerialCol && <th className="px-2 py-1.5 font-medium">Serial</th>}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/80">
                                {mods.map((m, i) => (
                                  <tr key={i} className="text-slate-200">
                                    {showSlotCol && <td className="px-2 py-1.5 mono">{m.slot || '—'}</td>}
                                    <td className="px-2 py-1.5 mono whitespace-nowrap">{fmt.bytes(m.sizeBytes)}</td>
                                    <td className="px-2 py-1.5">{m.type || '—'}</td>
                                    <td className="px-2 py-1.5 mono">{m.clockMHz != null ? `${m.clockMHz} MHz` : '—'}</td>
                                    <td className="px-2 py-1.5">{m.manufacturer || '—'}</td>
                                    <td className="px-2 py-1.5 mono">{m.partNum || '—'}</td>
                                    <td className="px-2 py-1.5">{m.formFactor || '—'}</td>
                                    {showSerialCol && <td className="px-2 py-1.5 mono">{m.serialNum || '—'}</td>}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </>
                  )
                })()
              ) : (
                <p className="text-slate-500 text-sm">No memory info.</p>
              )}
            </div>
          </Card>

          <Card title="Graphics" className="col-span-12">
            {data.gpus.length === 0 ? (
              <p className="text-slate-500 text-sm">No GPU controllers reported.</p>
            ) : (
              <div className="rounded-lg border border-slate-800 overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-950/80 text-slate-400">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Vendor</th>
                      <th className="px-2 py-1.5 font-medium">Model</th>
                      <th className="px-2 py-1.5 font-medium">Bus</th>
                      <th className="px-2 py-1.5 font-medium">VRAM</th>
                      <th className="px-2 py-1.5 font-medium">Driver</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {data.gpus.map((g, i) => (
                      <tr key={i} className="text-slate-200">
                        <td className="px-2 py-1.5">{g.vendor}</td>
                        <td className="px-2 py-1.5">{g.model}</td>
                        <td className="px-2 py-1.5 mono">{g.bus}</td>
                        <td className="px-2 py-1.5 mono">{g.vramBytes != null ? fmt.bytes(g.vramBytes) : '—'}</td>
                        <td className="px-2 py-1.5 mono">{g.driverVersion ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.lshwExtras?.primaryGpuProduct &&
              (data.gpus.length === 0 ||
                data.lshwExtras.primaryGpuProduct.trim().toLowerCase() !==
                  (data.gpus[0]?.model ?? '').trim().toLowerCase()) && (
                <div className="mt-4">
                  {kv('PCI adapter (lshw)', data.lshwExtras.primaryGpuProduct)}
                </div>
              )}
            {data.displays.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Displays</p>
                <div className="rounded-lg border border-slate-800 overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-950/80 text-slate-400">
                      <tr>
                        <th className="px-2 py-1.5 font-medium">Vendor</th>
                        <th className="px-2 py-1.5 font-medium">Model</th>
                        <th className="px-2 py-1.5 font-medium">Resolution</th>
                        <th className="px-2 py-1.5 font-medium">Refresh</th>
                        <th className="px-2 py-1.5 font-medium">Connection</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {data.displays.map((d, i) => (
                        <tr key={i} className="text-slate-200">
                          <td className="px-2 py-1.5">{d.vendor}</td>
                          <td className="px-2 py-1.5">{d.model}</td>
                          <td className="px-2 py-1.5 mono">{d.resolution}</td>
                          <td className="px-2 py-1.5 mono">{d.refreshHz != null ? `${d.refreshHz} Hz` : '—'}</td>
                          <td className="px-2 py-1.5">{d.connection ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>

          <Card title="Physical disks" subtitle="Disk layout + NVMe from lshw when available" className="col-span-12">
            {data.disks.length === 0 ? (
              <p className="text-slate-500 text-sm">No disks from disk layout.</p>
            ) : (
              <div className="rounded-lg border border-slate-800 overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-950/80 text-slate-400">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Device</th>
                      <th className="px-2 py-1.5 font-medium">Name</th>
                      <th className="px-2 py-1.5 font-medium">Type</th>
                      <th className="px-2 py-1.5 font-medium">Size</th>
                      <th className="px-2 py-1.5 font-medium">Interface</th>
                      <th className="px-2 py-1.5 font-medium">Firmware</th>
                      <th className="px-2 py-1.5 font-medium">Serial</th>
                      <th className="px-2 py-1.5 font-medium">Temp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {data.disks.map((d, i) => (
                      <tr key={i} className="text-slate-200">
                        <td className="px-2 py-1.5 mono whitespace-nowrap">{d.device}</td>
                        <td className="px-2 py-1.5">{d.name}</td>
                        <td className="px-2 py-1.5">{d.type}</td>
                        <td className="px-2 py-1.5 mono whitespace-nowrap">{fmt.bytes(d.sizeBytes)}</td>
                        <td className="px-2 py-1.5">{d.interfaceType}</td>
                        <td className="px-2 py-1.5 mono">{d.firmware}</td>
                        <td className="px-2 py-1.5 mono">{d.serialNum || '—'}</td>
                        <td className="px-2 py-1.5">{d.tempC != null ? fmt.temp(d.tempC, 0) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.lshwExtras?.nvmeDevices && data.lshwExtras.nvmeDevices.length > 0 && (
              <div className={data.disks.length > 0 ? 'mt-4' : ''}>
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">NVMe (lshw)</p>
                <div className="rounded-lg border border-slate-800 overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-950/80 text-slate-400">
                      <tr>
                        <th className="px-2 py-1.5 font-medium">Device</th>
                        <th className="px-2 py-1.5 font-medium">Model</th>
                        <th className="px-2 py-1.5 font-medium">Vendor</th>
                        <th className="px-2 py-1.5 font-medium">Serial</th>
                        <th className="px-2 py-1.5 font-medium">Size</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {data.lshwExtras.nvmeDevices.map((n, i) => (
                        <tr key={i} className="text-slate-200">
                          <td className="px-2 py-1.5 mono">{n.device}</td>
                          <td className="px-2 py-1.5">{n.product}</td>
                          <td className="px-2 py-1.5">{n.vendor}</td>
                          <td className="px-2 py-1.5 mono">{n.serial || '—'}</td>
                          <td className="px-2 py-1.5 mono whitespace-nowrap">
                            {n.sizeBytes != null ? fmt.bytes(n.sizeBytes) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>

          <Card title="Block devices" subtitle="Partitions & mounts" className="col-span-12 md:col-span-6">
            {data.blockDevices.length === 0 ? (
              <p className="text-slate-500 text-sm">None listed.</p>
            ) : (
              <div className="rounded-lg border border-slate-800 overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-950/80 text-slate-400 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Name</th>
                      <th className="px-2 py-1.5 font-medium">Size</th>
                      <th className="px-2 py-1.5 font-medium">Type</th>
                      <th className="px-2 py-1.5 font-medium">Mount</th>
                      <th className="px-2 py-1.5 font-medium">Rem.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {data.blockDevices.map((b, i) => (
                      <tr key={i} className="text-slate-200">
                        <td className="px-2 py-1.5 mono">{b.name}</td>
                        <td className="px-2 py-1.5 mono whitespace-nowrap">{fmt.bytes(b.sizeBytes)}</td>
                        <td className="px-2 py-1.5">{b.type}</td>
                        <td className="px-2 py-1.5 mono break-all">{b.mount || '—'}</td>
                        <td className="px-2 py-1.5">{b.removable ? 'yes' : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Filesystems" className="col-span-12 md:col-span-6">
            {data.filesystems.length === 0 ? (
              <p className="text-slate-500 text-sm">None listed.</p>
            ) : (
              <div className="rounded-lg border border-slate-800 overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-950/80 text-slate-400 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Mount</th>
                      <th className="px-2 py-1.5 font-medium">FS</th>
                      <th className="px-2 py-1.5 font-medium">Type</th>
                      <th className="px-2 py-1.5 font-medium">Used</th>
                      <th className="px-2 py-1.5 font-medium">Size</th>
                      <th className="px-2 py-1.5 font-medium">Use</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {data.filesystems.map((f, i) => (
                      <tr key={i} className="text-slate-200">
                        <td className="px-2 py-1.5 mono break-all">{f.mount}</td>
                        <td className="px-2 py-1.5">{f.fs}</td>
                        <td className="px-2 py-1.5">{f.type}</td>
                        <td className="px-2 py-1.5 mono whitespace-nowrap">{fmt.bytes(f.usedBytes)}</td>
                        <td className="px-2 py-1.5 mono whitespace-nowrap">{fmt.bytes(f.sizeBytes)}</td>
                        <td className="px-2 py-1.5 mono">{fmt.pct(f.usePct, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Network" className="col-span-12">
            {data.network.length === 0 ? (
              <p className="text-slate-500 text-sm">No interfaces (excluding loopback).</p>
            ) : (
              <div className="rounded-lg border border-slate-800 overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-950/80 text-slate-400">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Interface</th>
                      <th className="px-2 py-1.5 font-medium">IPv4</th>
                      <th className="px-2 py-1.5 font-medium">MAC</th>
                      <th className="px-2 py-1.5 font-medium">Speed</th>
                      <th className="px-2 py-1.5 font-medium">State</th>
                      <th className="px-2 py-1.5 font-medium">Int.</th>
                      <th className="px-2 py-1.5 font-medium">Virt.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {data.network.map((n, i) => (
                      <tr key={i} className="text-slate-200">
                        <td className="px-2 py-1.5 mono">{n.iface}</td>
                        <td className="px-2 py-1.5 mono">{n.ip4 || '—'}</td>
                        <td className="px-2 py-1.5 mono">{n.mac}</td>
                        <td className="px-2 py-1.5 mono">
                          {n.speedMbps != null ? `${n.speedMbps} Mbps` : '—'}
                        </td>
                        <td className="px-2 py-1.5">{n.operstate}</td>
                        <td className="px-2 py-1.5">{n.internal ? 'yes' : ''}</td>
                        <td className="px-2 py-1.5">{n.virtual ? 'yes' : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.lshwExtras?.notableUsb && data.lshwExtras.notableUsb.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">USB (audio / HID sample)</p>
                <ul className="list-disc pl-5 text-slate-300 text-xs space-y-0.5">
                  {data.lshwExtras.notableUsb.map((u, i) => (
                    <li key={i}>
                      {u.vendor}: {u.product}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
