import { Download } from 'lucide-react'
import { useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { formatEighths, toEighths } from '../core/paginate'
import { projectTitle, safeFileName } from '../core/project'
import { downloadFile, formatRuntime } from '../components/ui'
import { useApp } from '../store/app'
import { useAnalysis, useController, usePagination, useProject } from '../store/hooks'

interface Tip {
  x: number
  y: number
  content: ReactNode
}

/** A single hover tooltip shared by every chart on the page. */
function useTooltip() {
  const [tip, setTip] = useState<Tip | null>(null)
  const bind = (content: ReactNode) => ({
    onMouseMove: (e: MouseEvent) => setTip({ x: e.clientX, y: e.clientY, content }),
    onMouseLeave: () => setTip(null),
  })
  const node = tip ? (
    <div className="viz-tooltip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 260), top: tip.y + 14 }} role="tooltip">
      {tip.content}
    </div>
  ) : null
  return { bind, node }
}

interface Part {
  label: string
  value: number
  color: string
}

function SplitBar({ parts, unit, bind }: { parts: Part[]; unit: string; bind: ReturnType<typeof useTooltip>['bind'] }) {
  const total = parts.reduce((n, p) => n + p.value, 0) || 1
  const nonzero = parts.filter((p) => p.value > 0)
  return (
    <>
      <div className="split-bar" role="img" aria-label={nonzero.map((p) => `${p.label} ${p.value} ${unit}`).join(', ')}>
        {nonzero.map((p) => (
          <div key={p.label} style={{ flex: p.value, background: p.color }} {...bind(<><b>{p.label}</b><br />{p.value} {unit} · {Math.round((p.value / total) * 100)}%</>)} />
        ))}
      </div>
      <div className="legend">
        {nonzero.map((p) => (
          <span key={p.label}>
            <i style={{ background: p.color }} />
            {p.label} <b style={{ color: 'var(--text)' }}>{Math.round((p.value / total) * 100)}%</b>
          </span>
        ))}
      </div>
    </>
  )
}

export function ReportsView() {
  const project = useProject()
  const analysis = useAnalysis()
  const pagination = usePagination()
  const c = useController()
  const setView = useApp((s) => s.setView)
  const tooltip = useTooltip()
  const [metric, setMetric] = useState<'words' | 'speeches'>('words')

  const pages = pagination.pages.length
  const sceneRows = useMemo(
    () =>
      analysis.scenes.map((s) => {
        const layout = pagination.scenes.find((x) => x.elementIndex === s.index)
        const eighths = layout ? toEighths(layout.lines, pagination.linesPerPage) : 1
        return { scene: s, page: pagination.elementPage[s.index] ?? 1, eighths }
      }),
    [analysis, pagination],
  )

  const intExt = useMemo(() => {
    const counts = { INT: 0, EXT: 0, 'INT/EXT': 0, OTHER: 0 }
    for (const r of sceneRows) counts[r.scene.parts.intExt] += r.eighths
    return counts
  }, [sceneRows])

  const timeParts = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of sceneRows) {
      const t = r.scene.parts.time || 'UNSPECIFIED'
      m.set(t, (m.get(t) ?? 0) + r.eighths)
    }
    const sorted = [...m.entries()].sort((a, b) => b[1] - a[1])
    const top = sorted.slice(0, 3)
    const other = sorted.slice(3).reduce((n, [, v]) => n + v, 0)
    const colors = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)']
    const parts: Part[] = top.map(([label, value], i) => ({ label, value, color: colors[i] }))
    if (other) parts.push({ label: 'Other', value: other, color: 'var(--series-other)' })
    return parts
  }, [sceneRows])

  const chars = [...analysis.characters].sort((a, b) => b[metric] - a[metric]).slice(0, 12)
  const maxChar = Math.max(1, ...chars.map((ch) => ch[metric]))
  const maxEighths = Math.max(1, ...sceneRows.map((r) => r.eighths))
  const avgEighths = sceneRows.length ? sceneRows.reduce((n, r) => n + r.eighths, 0) / sceneRows.length : 0
  const dialoguePct = analysis.words ? Math.round((analysis.dialogueWords / analysis.words) * 100) : 0

  const open = (id: string) => {
    setView('script')
    setTimeout(() => c.revealScene(id), 0)
  }

  const exportCsv = () => {
    const esc = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
    const rows = [['Scene', 'Heading', 'INT/EXT', 'Location', 'Time', 'Page', 'Length (eighths)', 'Length', 'Characters', 'Synopsis']]
    for (const r of sceneRows) {
      const s = r.scene
      rows.push([String(s.number), s.heading, s.parts.intExt, s.parts.location, s.parts.time, String(r.page), String(r.eighths), formatEighths(r.eighths), s.characters.join('; '), s.synopsis])
    }
    downloadFile(`${safeFileName(projectTitle(project))} - scene report.csv`, rows.map((r) => r.map(esc).join(',')).join('\n'), 'text/csv;charset=utf-8')
  }

  return (
    <div className="view-scroll viz-root">
      <div className="view-inner">
        <div className="view-header">
          <div>
            <h1>Reports</h1>
            <p>Length, pacing, cast and locations at a glance. Runtime assumes one page per minute.</p>
          </div>
          <button className="btn" onClick={exportCsv} disabled={!sceneRows.length}>
            <Download size={16} /> Scene report (CSV)
          </button>
        </div>

        <div className="kpis">
          <div className="panel kpi">
            <b>{pages}</b>
            <span>pages</span>
          </div>
          <div className="panel kpi">
            <b>{formatRuntime(pages)}</b>
            <span>estimated runtime</span>
          </div>
          <div className="panel kpi">
            <b>{analysis.scenes.length}</b>
            <span>scenes · avg {sceneRows.length ? formatEighths(Math.max(1, Math.round(avgEighths))) : '–'} pg</span>
          </div>
          <div className="panel kpi">
            <b>{analysis.words.toLocaleString()}</b>
            <span>words</span>
          </div>
          <div className="panel kpi">
            <b>{analysis.characters.length}</b>
            <span>speaking characters</span>
          </div>
          <div className="panel kpi">
            <b>{analysis.locations.length}</b>
            <span>locations</span>
          </div>
          <div className="panel kpi">
            <b>{dialoguePct}%</b>
            <span>of words are dialogue</span>
          </div>
        </div>

        <div className="report-grid">
          <section className="panel report-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div>
                <h2>Dialogue by character</h2>
                <p className="muted" style={{ margin: '0 0 14px', fontSize: 12.5 }}>
                  Top {chars.length} by {metric === 'words' ? 'words spoken' : 'number of speeches'}
                </p>
              </div>
              <div className="segmented">
                <button className={metric === 'words' ? 'active' : ''} onClick={() => setMetric('words')}>
                  Words
                </button>
                <button className={metric === 'speeches' ? 'active' : ''} onClick={() => setMetric('speeches')}>
                  Speeches
                </button>
              </div>
            </div>
            {chars.length === 0 && <p className="faint">No dialogue yet.</p>}
            {chars.map((ch) => (
              <div
                className="bar-row"
                key={ch.name}
                {...tooltip.bind(
                  <>
                    <b>{ch.name}</b>
                    <br />
                    {ch.words.toLocaleString()} words · {ch.speeches} speeches
                    <br />
                    {ch.sceneIds.length} scenes · {Math.round((ch.words / (analysis.dialogueWords || 1)) * 100)}% of dialogue
                  </>,
                )}
              >
                <span className="label" title={ch.name}>
                  {ch.name}
                </span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${(ch[metric] / maxChar) * 100}%` }} />
                </div>
                <span className="value">{ch[metric].toLocaleString()}</span>
              </div>
            ))}
          </section>

          <section className="panel report-card">
            <h2>Interior / exterior</h2>
            <p>Share of script pages</p>
            <SplitBar
              unit="eighths"
              bind={tooltip.bind}
              parts={[
                { label: 'INT', value: intExt.INT, color: 'var(--series-1)' },
                { label: 'EXT', value: intExt.EXT, color: 'var(--series-2)' },
                { label: 'INT/EXT', value: intExt['INT/EXT'], color: 'var(--series-3)' },
                { label: 'Other', value: intExt.OTHER, color: 'var(--series-other)' },
              ]}
            />
            <h2 style={{ marginTop: 24 }}>Time of day</h2>
            <p>Share of script pages</p>
            <SplitBar unit="eighths" bind={tooltip.bind} parts={timeParts} />
          </section>
        </div>

        <section className="panel report-card" style={{ marginBottom: 20 }}>
          <h2>Scene lengths</h2>
          <p>Each column is a scene in script order; height is its length in eighths of a page. Click a column to open the scene.</p>
          {sceneRows.length === 0 ? (
            <p className="faint">No scenes yet.</p>
          ) : (
            <div className="columns" role="img" aria-label="Scene lengths in script order">
              {sceneRows.map((r) => (
                <button
                  key={r.scene.id}
                  className="column-hit"
                  onClick={() => open(r.scene.id)}
                  aria-label={`Scene ${r.scene.number}, ${formatEighths(r.eighths)} pages`}
                  {...tooltip.bind(
                    <>
                      <b>
                        {r.scene.number}. {r.scene.heading || 'Untitled'}
                      </b>
                      <br />
                      {formatEighths(r.eighths)} pg · starts p{r.page}
                    </>,
                  )}
                >
                  <span className="column" style={{ height: `${(r.eighths / maxEighths) * 100}%` }} />
                </button>
              ))}
            </div>
          )}
          <div className="columns-axis">
            <span>Scene 1</span>
            <span>longest: {formatEighths(maxEighths)} pg</span>
            <span>Scene {sceneRows.length}</span>
          </div>
        </section>

        <section className="panel report-card">
          <h2>Scene breakdown</h2>
          <p>Click a row to open the scene.</p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Heading</th>
                  <th className="num">Page</th>
                  <th className="num">Length</th>
                  <th>Characters</th>
                  <th>Synopsis</th>
                </tr>
              </thead>
              <tbody>
                {sceneRows.map((r) => (
                  <tr key={r.scene.id} className="clickable" onClick={() => open(r.scene.id)}>
                    <td className="num">{r.scene.number}</td>
                    <td className="script">{r.scene.heading || '—'}</td>
                    <td className="num">{r.page}</td>
                    <td className="num">{formatEighths(r.eighths)}</td>
                    <td>{r.scene.characters.join(', ')}</td>
                    <td className="muted">{r.scene.synopsis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {tooltip.node}
    </div>
  )
}
