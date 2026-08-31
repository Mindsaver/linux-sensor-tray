import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import historyViewerHtml from './assets/history-viewer.html?raw'
import chartJs from 'chart.js/dist/chart.umd.js?raw'
import chartDateAdapter from 'chartjs-adapter-date-fns/dist/chartjs-adapter-date-fns.bundle.min.js?raw'
import hammerJs from 'hammerjs/hammer.min.js?raw'
import chartZoomPlugin from 'chartjs-plugin-zoom/dist/chartjs-plugin-zoom.min.js?raw'

const VIEWER_FILENAME = 'history-viewer.html'

/** Markers the checked-in viewer ships with; both are substituted when we deploy it. */
const LIBS_MARKER = '<!-- LST_INLINE_CHART_LIBS -->'
const LOG_DIR_TOKEN = '"__LST_LOG_DIR__"'

/**
 * Chart.js and friends are inlined rather than pulled from a CDN so the viewer is a single
 * self-contained page: it opens in any browser, works with no network, and phones nobody home.
 */
const LIB_SOURCES = [chartJs, chartDateAdapter, hammerJs, chartZoomPlugin]

/** A `</script>` inside a library string would close the tag early; none has one today. */
function inlineScript(source: string): string {
  return `<script>\n${source.replace(/<\/script/gi, '<\\/script')}\n</script>`
}

function buildViewerHtml(logDir: string): string {
  return historyViewerHtml
    .replace(LIBS_MARKER, LIB_SOURCES.map(inlineScript).join('\n'))
    .replace(LOG_DIR_TOKEN, JSON.stringify(logDir))
}

export async function ensureHistoryViewerInDir(logDir: string): Promise<void> {
  await mkdir(logDir, { recursive: true })
  await writeFile(join(logDir, VIEWER_FILENAME), buildViewerHtml(logDir), 'utf8')
}
