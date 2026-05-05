import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import historyViewerHtml from './assets/history-viewer.html?raw'

const VIEWER_FILENAME = 'history-viewer.html'

export async function ensureHistoryViewerInDir(logDir: string): Promise<void> {
  await mkdir(logDir, { recursive: true })
  await writeFile(join(logDir, VIEWER_FILENAME), historyViewerHtml, 'utf8')
}
