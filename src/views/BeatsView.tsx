import { X } from 'lucide-react'
import { BEAT_TEMPLATES, beatPages, beatTemplate } from '../core/beats'
import type { BeatEntry } from '../core/types'
import { colorVar, LazyTextarea } from '../components/ui'
import { useApp } from '../store/app'
import { useAnalysis, useController, usePagination, useProject } from '../store/hooks'

const ACTS = [
  { label: 'Act I', from: 0, to: 0.25 },
  { label: 'Act IIa', from: 0.25, to: 0.5 },
  { label: 'Act IIb', from: 0.5, to: 0.75 },
  { label: 'Act III', from: 0.75, to: 1 },
]

export function BeatsView() {
  const project = useProject()
  const analysis = useAnalysis()
  const pagination = usePagination()
  const c = useController()
  const { updateProject, updateSettings, setView } = useApp.getState()
  const template = beatTemplate(project.beats.templateId)
  const entries = project.beats.entries[template.id] ?? {}
  const actualPages = pagination.pages.length
  const target = project.settings.targetPages
  const total = target > 0 ? target : actualPages

  const setEntry = (beatId: string, patch: Partial<BeatEntry>) => {
    updateProject((p) => {
      const all = p.beats.entries[template.id] ?? {}
      const prev = all[beatId] ?? { text: '', sceneIds: [] }
      return {
        beats: {
          ...p.beats,
          entries: { ...p.beats.entries, [template.id]: { ...all, [beatId]: { ...prev, ...patch } } },
        },
      }
    })
  }

  const sceneById = new Map(analysis.scenes.map((s) => [s.id, s]))
  const scenePage = (index: number) => pagination.elementPage[index] ?? 1
  const scenesOnPages = (from: number, to: number) =>
    analysis.scenes.filter((s) => {
      const p = scenePage(s.index)
      return p >= from && p <= to
    })

  const open = (id: string) => {
    setView('script')
    setTimeout(() => c.revealScene(id), 0)
  }

  const pct = (page: number) => `${Math.min(100, Math.max(0, ((page - 1) / Math.max(1, total)) * 100))}%`

  return (
    <div className="view-scroll">
      <div className="view-inner">
        <div className="view-header">
          <div>
            <h1>Beat sheet</h1>
            <p>{template.description} Beats are placed on a {total}-page script.</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label className="field">
              <span>Template</span>
              <select
                className="select"
                value={template.id}
                onChange={(e) => updateProject((p) => ({ beats: { ...p.beats, templateId: e.target.value } }))}
              >
                {BEAT_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Target length (pages)</span>
              <input
                className="input"
                type="number"
                min={0}
                max={400}
                style={{ width: 150, height: 32 }}
                value={target || ''}
                placeholder={`Actual: ${actualPages}`}
                onChange={(e) => updateSettings({ targetPages: Math.max(0, Math.min(400, Number(e.target.value) || 0)) })}
              />
            </label>
          </div>
        </div>

        <div className="structure-bar" aria-hidden="true">
          {ACTS.map((a) => (
            <div key={a.label} className="act" style={{ left: `${a.from * 100}%`, width: `${(a.to - a.from) * 100}%` }}>
              {a.label}
            </div>
          ))}
          {analysis.scenes.map((s) => (
            <div key={s.id} className="scene-tick" style={{ left: pct(scenePage(s.index)), ['--dot' as string]: colorVar(s.color) }} title={`Scene ${s.number}`} />
          ))}
          {template.beats.map((b) => (
            <div key={b.id} className="beat-mark" style={{ left: `${b.start * 100}%` }} title={b.name} />
          ))}
        </div>

        <div className="beats-list">
          {template.beats.map((b) => {
            const [from, to] = beatPages(b, total)
            const entry = entries[b.id] ?? { text: '', sceneIds: [] }
            const here = scenesOnPages(from, to)
            const linked = entry.sceneIds.map((id) => sceneById.get(id)).filter((s) => !!s)
            return (
              <section key={b.id} className="panel beat">
                <div>
                  <h3>{b.name}</h3>
                  <div className="where">{from === to ? `Page ${from}` : `Pages ${from}–${to}`}</div>
                  <p className="desc">{b.description}</p>
                </div>
                <div>
                  <LazyTextarea
                    key={`${template.id}-${b.id}`}
                    className="textarea"
                    rows={3}
                    placeholder={`What happens at the ${b.name.replace(/^\d+\.\s*/, '').toLowerCase()}?`}
                    value={entry.text}
                    onCommit={(text) => setEntry(b.id, { text })}
                  />
                  <div className="beat-links">
                    {linked.map((s) => (
                      <span key={s.id} className="scene-chip" style={{ borderColor: colorVar(s.color) }}>
                        <span className="link" onClick={() => open(s.id)} title="Open in script">
                          {s.number}. {s.heading || 'Untitled'}
                        </span>
                        <button aria-label="Unlink scene" onClick={() => setEntry(b.id, { sceneIds: entry.sceneIds.filter((x) => x !== s.id) })}>
                          <X size={14} />
                        </button>
                      </span>
                    ))}
                    {analysis.scenes.length > 0 && (
                      <select
                        className="select"
                        style={{ width: 'auto', height: 28, fontSize: 12.5 }}
                        value=""
                        aria-label={`Link a scene to ${b.name}`}
                        onChange={(e) => e.target.value && setEntry(b.id, { sceneIds: [...entry.sceneIds, e.target.value] })}
                      >
                        <option value="">+ Link scene…</option>
                        {analysis.scenes
                          .filter((s) => !entry.sceneIds.includes(s.id))
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.number}. {s.heading || 'Untitled'} (p{scenePage(s.index)})
                            </option>
                          ))}
                      </select>
                    )}
                    {!linked.length && here.length > 0 && (
                      <span className="faint" style={{ fontSize: 12 }}>
                        On these pages now: {here.slice(0, 3).map((s) => `${s.number}. ${s.heading}`).join(' · ')}
                        {here.length > 3 ? ` +${here.length - 3}` : ''}
                      </span>
                    )}
                  </div>
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
