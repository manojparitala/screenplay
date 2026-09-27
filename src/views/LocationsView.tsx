import { MapPin, Pencil } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { SceneInfo } from '../core/analysis'
import { formatEighths, toEighths } from '../core/paginate'
import type { LocationProfile } from '../core/types'
import { LazyTextarea, Modal } from '../components/ui'
import { useApp } from '../store/app'
import { useAnalysis, useController, usePagination, useProject } from '../store/hooks'

export function LocationsView() {
  const project = useProject()
  const analysis = useAnalysis()
  const pagination = usePagination()
  const c = useController()
  const { updateProject, setView, notify } = useApp.getState()
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [renaming, setRenaming] = useState(false)

  const sceneMap = useMemo(() => new Map(analysis.scenes.map((s) => [s.id, s])), [analysis])
  const eighthsOf = (s: SceneInfo) => {
    const l = pagination.scenes.find((x) => x.elementIndex === s.index)
    return l ? toEighths(l.lines, pagination.linesPerPage) : 0
  }

  const shown = analysis.locations.filter((l) => !filter || l.name.includes(filter.toUpperCase()))
  const current = analysis.locations.find((l) => l.name === selected) ?? shown[0] ?? null
  const profile = current ? project.locations[current.name] : undefined
  const scenes = current ? current.sceneIds.map((id) => sceneMap.get(id)).filter((s): s is SceneInfo => !!s) : []
  const totalEighths = scenes.reduce((n, s) => n + eighthsOf(s), 0)

  const save = (name: string, patch: Partial<LocationProfile>) =>
    updateProject((p) => ({
      locations: { ...p.locations, [name]: { ...(p.locations[name] ?? { name, description: '', notes: '' }), ...patch } },
    }))

  const open = (id: string) => {
    setView('script')
    setTimeout(() => c.revealScene(id), 0)
  }

  return (
    <div className="split-view">
      <aside className="list-pane" aria-label="Locations">
        <div className="list-pane-header">
          <strong>Locations</strong>
          <input className="input" placeholder="Search" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Search locations" />
        </div>
        <div className="list-pane-body">
          {shown.length === 0 && <p className="faint" style={{ padding: 8, fontSize: 13 }}>Locations are collected from your scene headings.</p>}
          {shown.map((l) => (
            <button key={l.name} className={`list-item${current?.name === l.name ? ' active' : ''}`} onClick={() => setSelected(l.name)}>
              <MapPin size={16} color="var(--accent)" style={{ flex: 'none' }} />
              <span className="name">
                <span style={{ fontFamily: 'var(--font-script)', fontSize: 13 }}>{l.name}</span>
                <span className="sub">
                  {l.sceneIds.length} scene{l.sceneIds.length === 1 ? '' : 's'}
                  {l.intExt.length ? ` · ${l.intExt.join(', ')}` : ''}
                </span>
              </span>
            </button>
          ))}
        </div>
      </aside>
      <section className="detail-pane">
        {!current ? (
          <div className="empty-state">
            <MapPin size={36} />
            <h3>No locations yet</h3>
            <p>Write scene headings like “INT. KITCHEN - NIGHT” and each location will be listed here with its scenes.</p>
          </div>
        ) : (
          <div className="detail-inner" key={current.name}>
            <div className="detail-title">
              <div style={{ flex: 1 }}>
                <h1 style={{ fontFamily: 'var(--font-script)' }}>{current.name}</h1>
              </div>
              <button className="btn" onClick={() => setRenaming(true)}>
                <Pencil size={15} /> Rename…
              </button>
            </div>
            <div className="kpis" style={{ marginBottom: 0 }}>
              <div className="panel kpi">
                <b>{current.sceneIds.length}</b>
                <span>scenes</span>
              </div>
              <div className="panel kpi">
                <b>{formatEighths(totalEighths || 1)}</b>
                <span>pages of script</span>
              </div>
              <div className="panel kpi">
                <b style={{ fontSize: 18, paddingTop: 6 }}>{current.intExt.join(' / ') || '–'}</b>
                <span>interior / exterior</span>
              </div>
              <div className="panel kpi">
                <b style={{ fontSize: 18, paddingTop: 6 }}>{current.times.join(', ') || '–'}</b>
                <span>times of day</span>
              </div>
            </div>
            <div className="panel" style={{ padding: 16 }}>
              <h2 className="section-title">Details</h2>
              <div className="form-grid">
                <label className="field span-2">
                  <span>Description</span>
                  <LazyTextarea
                    className="textarea"
                    rows={3}
                    placeholder="What does it look, sound and feel like?"
                    value={profile?.description ?? ''}
                    onCommit={(v) => save(current.name, { description: v })}
                  />
                </label>
                <label className="field span-2">
                  <span>Production notes</span>
                  <LazyTextarea
                    className="textarea"
                    rows={3}
                    placeholder="Real-world location, set requirements, permits…"
                    value={profile?.notes ?? ''}
                    onCommit={(v) => save(current.name, { notes: v })}
                  />
                </label>
              </div>
            </div>
            <div className="panel" style={{ padding: 16 }}>
              <h2 className="section-title">Scenes</h2>
              <div className="scene-list">
                {scenes.map((s) => (
                  <button key={s.id} className="scene-row" onClick={() => open(s.id)}>
                    <span className="num">{s.number}</span>
                    <span className="heading">{s.heading}</span>
                    <span className="faint">
                      p{pagination.elementPage[s.index] ?? 1} · {formatEighths(eighthsOf(s))}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
      {renaming && current && (
        <RenameLocation
          name={current.name}
          onClose={() => setRenaming(false)}
          onRename={(to) => {
            const target = to.trim().toUpperCase()
            const n = c.renameLocation(current.name, target)
            updateProject((p) => {
              const next = { ...p.locations }
              const prof = next[current.name]
              if (prof) {
                delete next[current.name]
                next[target] = { ...prof, name: target }
              }
              return { locations: next }
            })
            setSelected(target)
            setRenaming(false)
            notify(`Updated ${n} scene heading${n === 1 ? '' : 's'}.`)
          }}
        />
      )}
    </div>
  )
}

function RenameLocation(props: { name: string; onClose: () => void; onRename: (to: string) => void }) {
  const [to, setTo] = useState(props.name)
  const valid = to.trim() && to.trim().toUpperCase() !== props.name
  return (
    <Modal
      title="Rename location"
      onClose={props.onClose}
      footer={
        <>
          <button className="btn" onClick={props.onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!valid} onClick={() => props.onRename(to)}>
            Rename in all headings
          </button>
        </>
      }
    >
      <label className="field">
        <span>New name</span>
        <input className="input" value={to} onChange={(e) => setTo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && valid && props.onRename(to)} />
        <small>INT./EXT. and the time of day in each heading stay as they are.</small>
      </label>
    </Modal>
  )
}
