import { Download, Printer } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { drawScript } from '../core/pdf'
import { exportAs } from '../components/ProjectShell'
import { recordSheets, Sheet } from '../components/Sheets'
import { useElements, useProject } from '../store/hooks'

export function PreviewView() {
  const project = useProject()
  const elements = useDeferredValue(useElements())
  const [scale, setScale] = useState(0.9)
  const [busy, setBusy] = useState(false)

  const sheets = useMemo(
    () => recordSheets((s) => drawScript(s, elements, { settings: project.settings, titlePage: project.titlePage })),
    [elements, project.settings, project.titlePage],
  )
  const hasTitle = sheets.length > 0 && project.settings.includeTitlePage && !!(project.titlePage.title.trim() || project.titlePage.author.trim())

  return (
    <div className="view-scroll print-root">
      <div className="preview-toolbar no-print">
        <span className="muted" style={{ fontSize: 13 }}>
          {sheets.length - (hasTitle ? 1 : 0)} page{sheets.length - (hasTitle ? 1 : 0) === 1 ? '' : 's'}
          {hasTitle ? ' + title page' : ''}
        </span>
        <select className="select" style={{ width: 'auto' }} value={scale} onChange={(e) => setScale(Number(e.target.value))} aria-label="Zoom">
          {[0.5, 0.75, 0.9, 1, 1.25, 1.5].map((z) => (
            <option key={z} value={z}>
              {Math.round(z * 100)}%
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => window.print()}>
          <Printer size={16} /> Print
        </button>
        <button
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            await exportAs('pdf')
            setBusy(false)
          }}
        >
          <Download size={16} /> {busy ? 'Preparing…' : 'Download PDF'}
        </button>
      </div>
      <div className="sheets" style={{ ['--sheet-scale' as string]: scale }}>
        {sheets.map((data, i) => (
          <Sheet key={i} data={data} label={hasTitle && i === 0 ? 'Title page' : `Page ${hasTitle ? i : i + 1}`} />
        ))}
      </div>
    </div>
  )
}
