import { Pencil, Plus, Trash, UserPlus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { scenesMentioning, type SceneInfo } from '../core/analysis'
import { emptyCharacterProfile, type CharacterProfile } from '../core/types'
import { avatarColor, initials, LazyInput, LazyTextarea, Modal } from '../components/ui'
import { useApp } from '../store/app'
import { CharacterJourney } from './TimelineView'
import { useAnalysis, useController, useElements, usePagination, useProject } from '../store/hooks'

const FIELDS: { key: keyof CharacterProfile; label: string; placeholder: string; long?: boolean }[] = [
  { key: 'role', label: 'Role', placeholder: 'Protagonist, antagonist, mentor…' },
  { key: 'age', label: 'Age', placeholder: 'e.g. 34' },
  { key: 'description', label: 'Physical description', placeholder: 'How we see them on first appearance', long: true },
  { key: 'personality', label: 'Personality', placeholder: 'Temperament, voice, habits', long: true },
  { key: 'want', label: 'Want (external goal)', placeholder: 'What they are chasing', long: true },
  { key: 'need', label: 'Need (internal lesson)', placeholder: 'What they must learn', long: true },
  { key: 'flaw', label: 'Flaw', placeholder: 'What stands in their way from within', long: true },
  { key: 'arc', label: 'Arc', placeholder: 'Who they are at the start → at the end', long: true },
  { key: 'backstory', label: 'Backstory', placeholder: 'History that shapes them', long: true },
  { key: 'notes', label: 'Notes', placeholder: 'Anything else', long: true },
]

interface Row {
  name: string
  speeches: number
  words: number
  sceneIds: string[]
  firstScene: number
  extensions: string[]
  profile: CharacterProfile | null
}

export function CharactersView() {
  const project = useProject()
  const analysis = useAnalysis()
  const elements = useElements()
  const pagination = usePagination()
  const c = useController()
  const { updateProject, setView, notify } = useApp.getState()
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState(false)

  const rows = useMemo(() => {
    const map = new Map<string, Row>()
    for (const ch of analysis.characters) map.set(ch.name, { ...ch, profile: project.characters[ch.name] ?? null })
    for (const [name, profile] of Object.entries(project.characters)) {
      if (!map.has(name)) map.set(name, { name, speeches: 0, words: 0, sceneIds: [], firstScene: 0, extensions: [], profile })
    }
    return [...map.values()]
  }, [analysis, project.characters])

  const shown = rows.filter((r) => !filter || r.name.includes(filter.toUpperCase()))
  const current = rows.find((r) => r.name === selected) ?? shown[0] ?? null
  const totalWords = analysis.dialogueWords || 1

  const sceneMap = useMemo(() => new Map(analysis.scenes.map((s) => [s.id, s])), [analysis])
  const mentioned = useMemo(
    () => (current ? scenesMentioning(elements, analysis.scenes, current.name).filter((id) => !current.sceneIds.includes(id)) : []),
    [elements, analysis, current],
  )

  const saveProfile = (name: string, patch: Partial<CharacterProfile>) => {
    updateProject((p) => ({
      characters: { ...p.characters, [name]: { ...(p.characters[name] ?? emptyCharacterProfile(name)), ...patch } },
    }))
  }

  const open = (id: string) => {
    setView('script')
    setTimeout(() => c.revealScene(id), 0)
  }

  const sceneRow = (s: SceneInfo) => (
    <button key={s.id} className="scene-row" onClick={() => open(s.id)}>
      <span className="num">{s.number}</span>
      <span className="heading">{s.heading || 'Untitled scene'}</span>
      <span className="faint">p{pagination.elementPage[s.index] ?? 1}</span>
    </button>
  )

  return (
    <div className="split-view">
      <aside className="list-pane" aria-label="Characters">
        <div className="list-pane-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>Characters</strong>
            <button className="btn small" onClick={() => setAdding(true)}>
              <UserPlus size={14} /> Add
            </button>
          </div>
          <input className="input" placeholder="Search" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Search characters" />
        </div>
        <div className="list-pane-body">
          {shown.length === 0 && <p className="faint" style={{ padding: 8, fontSize: 13 }}>Characters appear here as soon as they speak in the script.</p>}
          {shown.map((r) => (
            <button key={r.name} className={`list-item${current?.name === r.name ? ' active' : ''}`} onClick={() => setSelected(r.name)}>
              <span className="avatar" style={{ ['--avatar' as string]: avatarColor(r.name) }}>
                {initials(r.name)}
              </span>
              <span className="name">
                {r.name}
                <span className="sub">
                  {r.speeches ? `${r.speeches} line${r.speeches === 1 ? '' : 's'} · ${r.sceneIds.length} scene${r.sceneIds.length === 1 ? '' : 's'}` : 'No dialogue yet'}
                  {r.profile?.role ? ` · ${r.profile.role}` : ''}
                </span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="detail-pane">
        {!current ? (
          <div className="empty-state">
            <Users size={36} />
            <h3>No characters yet</h3>
            <p>Write a character cue in the script, or add a character here to start their profile.</p>
            <button className="btn primary" onClick={() => setAdding(true)}>
              <Plus size={16} /> Add character
            </button>
          </div>
        ) : (
          <div className="detail-inner" key={current.name}>
            <div className="detail-title">
              <span className="avatar" style={{ ['--avatar' as string]: avatarColor(current.name) }}>
                {initials(current.name)}
              </span>
              <div style={{ flex: 1 }}>
                <h1>{current.name}</h1>
                {current.extensions.length > 0 && <span className="faint">Also appears as {current.extensions.map((e) => `(${e})`).join(', ')}</span>}
              </div>
              <button className="btn" onClick={() => setRenaming(true)}>
                <Pencil size={15} /> Rename…
              </button>
              {current.profile && (
                <button
                  className="btn danger"
                  onClick={() => {
                    updateProject((p) => {
                      const next = { ...p.characters }
                      delete next[current.name]
                      return { characters: next }
                    })
                    notify(`Removed the profile for ${current.name}. Their lines in the script are untouched.`)
                  }}
                >
                  <Trash size={15} /> Delete profile
                </button>
              )}
            </div>

            <div className="kpis" style={{ marginBottom: 0 }}>
              <div className="panel kpi">
                <b>{current.speeches}</b>
                <span>speeches</span>
              </div>
              <div className="panel kpi">
                <b>{current.words.toLocaleString()}</b>
                <span>words of dialogue</span>
              </div>
              <div className="panel kpi">
                <b>{Math.round((current.words / totalWords) * 100)}%</b>
                <span>of all dialogue</span>
              </div>
              <div className="panel kpi">
                <b>{current.sceneIds.length}</b>
                <span>scenes with dialogue</span>
              </div>
              <div className="panel kpi">
                <b>{current.firstScene || '–'}</b>
                <span>first speaks in scene</span>
              </div>
            </div>

            <div className="panel" style={{ padding: 16 }}>
              <h2 className="section-title">Journey</h2>
              <CharacterJourney name={current.name} />
            </div>

            <div className="panel" style={{ padding: 16 }}>
              <h2 className="section-title">Profile</h2>
              <div className="form-grid">
                {FIELDS.map((f) => (
                  <label key={f.key} className={`field${f.long ? ' span-2' : ''}`}>
                    <span>{f.label}</span>
                    {f.long ? (
                      <LazyTextarea
                        className="textarea"
                        rows={2}
                        placeholder={f.placeholder}
                        value={current.profile?.[f.key] ?? ''}
                        onCommit={(v) => saveProfile(current.name, { [f.key]: v })}
                      />
                    ) : (
                      <LazyInput
                        className="input"
                        placeholder={f.placeholder}
                        value={current.profile?.[f.key] ?? ''}
                        onCommit={(v) => saveProfile(current.name, { [f.key]: v })}
                      />
                    )}
                  </label>
                ))}
              </div>
            </div>

            <div className="panel" style={{ padding: 16 }}>
              <h2 className="section-title">Speaks in</h2>
              {current.sceneIds.length ? (
                <div className="scene-list">{current.sceneIds.map((id) => sceneMap.get(id)).filter((s): s is SceneInfo => !!s).map(sceneRow)}</div>
              ) : (
                <p className="faint" style={{ margin: 0 }}>No dialogue yet.</p>
              )}
              {mentioned.length > 0 && (
                <>
                  <h2 className="section-title" style={{ marginTop: 18 }}>
                    Mentioned in action (without dialogue)
                  </h2>
                  <div className="scene-list">{mentioned.map((id) => sceneMap.get(id)).filter((s): s is SceneInfo => !!s).map(sceneRow)}</div>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {adding && (
        <AddCharacter
          onClose={() => setAdding(false)}
          onAdd={(name) => {
            saveProfile(name, {})
            setSelected(name)
            setAdding(false)
          }}
          existing={rows.map((r) => r.name)}
        />
      )}
      {renaming && current && (
        <RenameCharacter
          name={current.name}
          onClose={() => setRenaming(false)}
          onRename={(to, inText) => {
            const target = to.trim().toUpperCase()
            const changes = c.renameCharacter(current.name, target, inText)
            updateProject((p) => {
              const next = { ...p.characters }
              const profile = next[current.name]
              if (profile) {
                delete next[current.name]
                next[target] = { ...profile, name: target }
              }
              return { characters: next }
            })
            setSelected(target)
            setRenaming(false)
            notify(`Renamed ${current.name} to ${target} (${changes} change${changes === 1 ? '' : 's'} in the script).`)
          }}
        />
      )}
    </div>
  )
}

function AddCharacter(props: { onClose: () => void; onAdd: (name: string) => void; existing: string[] }) {
  const [name, setName] = useState('')
  const clean = name.trim().toUpperCase()
  const exists = props.existing.includes(clean)
  return (
    <Modal
      title="Add character"
      onClose={props.onClose}
      footer={
        <>
          <button className="btn" onClick={props.onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!clean || exists} onClick={() => props.onAdd(clean)}>
            Add
          </button>
        </>
      }
    >
      <label className="field">
        <span>Name</span>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && clean && !exists && props.onAdd(clean)}
          placeholder="e.g. MAREN"
        />
        {exists && <small>That character already exists.</small>}
      </label>
    </Modal>
  )
}

function RenameCharacter(props: { name: string; onClose: () => void; onRename: (to: string, inText: boolean) => void }) {
  const [to, setTo] = useState(props.name)
  const [inText, setInText] = useState(true)
  const valid = to.trim() && to.trim().toUpperCase() !== props.name
  return (
    <Modal
      title={`Rename ${props.name}`}
      onClose={props.onClose}
      footer={
        <>
          <button className="btn" onClick={props.onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!valid} onClick={() => props.onRename(to, inText)}>
            Rename everywhere
          </button>
        </>
      }
    >
      <label className="field">
        <span>New name</span>
        <input className="input" value={to} onChange={(e) => setTo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && valid && props.onRename(to, inText)} />
      </label>
      <label className="check">
        <input type="checkbox" checked={inText} onChange={(e) => setInText(e.target.checked)} />
        <span>
          Also replace the name in action and dialogue
          <small>Matches whole words and keeps each occurrence’s capitalisation (MAREN, Maren).</small>
        </span>
      </label>
      <p className="faint" style={{ margin: 0, fontSize: 13 }}>
        Character cues keep their extensions, e.g. {props.name} (V.O.). You can undo the rename from the Script view.
      </p>
    </Modal>
  )
}
