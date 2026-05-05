import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { SensorSnapshot } from '@shared/types'
import { deriveDiskLogRecord } from '@shared/diskLog'

let chain: Promise<void> = Promise.resolve()

export function queueHistoryAppend(logDir: string, snap: SensorSnapshot): void {
  chain = chain
    .then(() => appendOne(logDir, snap))
    .catch((e) => {
      console.error('[lst] history log:', e)
    })
}

async function appendOne(logDir: string, snap: SensorSnapshot): Promise<void> {
  await mkdir(logDir, { recursive: true })
  const day = new Date(snap.timestamp).toISOString().slice(0, 10)
  const file = join(logDir, `linux-sensor-tray-${day}.jsonl`)
  const line = JSON.stringify(deriveDiskLogRecord(snap)) + '\n'
  await appendFile(file, line, 'utf8')
}
