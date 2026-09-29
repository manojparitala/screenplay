import { useMemo } from 'react'
import { drawTitlePage, pageSize } from '../core/pdf'
import type { TitlePage } from '../core/types'
import { recordSheets, Sheet } from '../components/Sheets'
import { LazyInput, LazyTextarea } from '../components/ui'
import { useApp } from '../store/app'
import { useScriptFontsVersion } from '../store/fonts'
import { useProject } from '../store/hooks'

const CREDITS = ['Written by', 'Screenplay by', 'Teleplay by', 'Story by', 'Created by', 'by']

export function TitlePageView() {
  const project = useProject()
  const { updateProject, updateSettings } = useApp.getState()
  const tp = project.titlePage
  const set = (patch: Partial<TitlePage>) => updateProject((p) => ({ titlePage: { ...p.titlePage, ...patch } }))
  const fontsVersion = useScriptFontsVersion()
  const paper = project.settings.paper
  const sheet = useMemo(() => {
    const size = pageSize({ paper })
    return recordSheets((s) => drawTitlePage(s, tp, undefined, undefined, size), size)[0]
  }, [tp, paper, fontsVersion])

  return (
    <div className="view-scroll">
      <div className="view-inner">
        <div className="view-header">
          <div>
            <h1>Title page</h1>
            <p>Printed as the first page of your PDF, and included in Fountain and Final Draft exports.</p>
          </div>
          <label className="check">
            <input type="checkbox" checked={project.settings.includeTitlePage} onChange={(e) => updateSettings({ includeTitlePage: e.target.checked })} />
            <span>Include title page when printing</span>
          </label>
        </div>
        <div className="title-layout">
          <div className="panel title-form">
            <label className="field">
              <span>Title</span>
              <LazyInput className="input" value={tp.title} onCommit={(title) => set({ title })} placeholder="The Last Lighthouse" />
            </label>
            <label className="field">
              <span>Credit</span>
              <select className="select" value={tp.credit} onChange={(e) => set({ credit: e.target.value })}>
                {[...CREDITS, ...(tp.credit && !CREDITS.includes(tp.credit) ? [tp.credit] : [])].map((c) => (
                  <option key={c}>{c}</option>
                ))}
                <option value="">(no credit line)</option>
              </select>
            </label>
            <label className="field">
              <span>Author(s)</span>
              <LazyTextarea className="textarea" rows={2} value={tp.author} onCommit={(author) => set({ author })} placeholder="One name per line" />
            </label>
            <label className="field">
              <span>Source material</span>
              <LazyTextarea className="textarea" rows={2} value={tp.source} onCommit={(source) => set({ source })} placeholder="Based on the novel by…" />
            </label>
            <label className="field">
              <span>Draft / date</span>
              <LazyInput className="input" value={tp.draftDate} onCommit={(draftDate) => set({ draftDate })} placeholder="Second Draft – June 2026" />
            </label>
            <label className="field">
              <span>Contact</span>
              <LazyTextarea className="textarea" rows={3} value={tp.contact} onCommit={(contact) => set({ contact })} placeholder={'Name\nEmail\nPhone or agent'} />
            </label>
            <label className="field">
              <span>Copyright / registration</span>
              <LazyInput className="input" value={tp.copyright} onCommit={(copyright) => set({ copyright })} placeholder="© 2026 · WGA Registered" />
            </label>
            <label className="field">
              <span>Notes (not printed)</span>
              <LazyTextarea className="textarea" rows={2} value={tp.notes} onCommit={(notes) => set({ notes })} />
            </label>
          </div>
          <div className="title-preview-wrap">
            <div className="sheets" style={{ ['--sheet-scale' as string]: 0.75, padding: 0 }}>
              <Sheet data={sheet} label="Title page preview" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
