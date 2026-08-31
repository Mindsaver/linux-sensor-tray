import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import historyViewerHtml from './assets/history-viewer.html?raw'

const VIEWER_FILENAME = 'history-viewer.html'

/** Placeholder the checked-in viewer ships with; replaced by the real folder on deploy. */
const LOG_DIR_TOKEN = '"__LST_LOG_DIR__"'

export async function ensureHistoryViewerInDir(logDir: string): Promise<void> {
  await mkdir(logDir, { recursive: true })
  const html = historyViewerHtml.replace(LOG_DIR_TOKEN, JSON.stringify(logDir))
  await writeFile(join(logDir, VIEWER_FILENAME), html, 'utf8')
}
