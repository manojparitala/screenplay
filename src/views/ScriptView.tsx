import {
  Bold,
  ChevronDown,
  ChevronUp,
  Focus,
  Italic,
  PanelLeft,
  PanelRight,
  Redo2,
  ScanText,
  Underline,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { sceneAt } from '../core/analysis'
import { ELEMENT_ORDER, ELEMENTS } from '../core/elements'
import { formatEighths, toEighths } from '../core/paginate'
import type { ElementType } from '../core/types'
import { useApp } from '../store/app'
import { useAnalysis, useController, useEditorState, usePagination, useProject } from '../store/hooks'
import { colorVar, ColorPicker, LazyTextarea } from '../components/ui'

const SHORT_LABELS: Partial<Record<ElementType, string>> = {
  scene: 'Scene',
  parenthetical: 'Paren',
  section: 'Act/Seq',
}

function ElementToolbar() {
  const c = useController()
  const state = useEditorState()
  const prefs = useApp((s) => s.prefs)
  const focusMode = useApp((s) => s.focusMode)
  const { setPrefs, setFocusMode } = useApp.getState()
  const $from = state.selection.$from
  const current = ($from.depth >= 1 ? $from.node(1).type.name : null) as ElementType | null
  const mark = (name: 'bold' | 'italic' | 'underline') => c.isMarkActive(name)
  const keep = (e: MouseEvent) => e.preventDefault() // keep editor focus

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <button
        className={`icon-btn small${prefs.showNavigator ? ' active' : ''}`}
        onMouseDown={keep}
        onClick={() => setPrefs({ showNavigator: !prefs.showNavigator })}
        title="Scene navigator"
        aria-label="Toggle scene navigator"
        aria-pressed={prefs.showNavigator}
      >
        <PanelLeft size={16} />
      </button>
      <span className="sep" />
      <div className="element-chips" role="radiogroup" aria-label="Element type">
        {ELEMENT_ORDER.map((t) => (
          <button
            key={t}
            className={`element-chip${current === t ? ' active' : ''}`}
            onMouseDown={keep}
            onClick={() => c.setType(t)}
            title={`${ELEMENTS[t].label} (Alt+${ELEMENTS[t].shortcut})`}
            role="radio"
            aria-checked={current === t}
          >
            {SHORT_LABELS[t] ?? ELEMENTS[t].label}
          </button>
        ))}
      </div>
      <span className="sep" />
      <button className={`icon-btn small${mark('bold') ? ' active' : ''}`} onMouseDown={keep} onClick={() => c.toggleMark('bold')} title="Bold (Ctrl/⌘+B)" aria-label="Bold">
        <Bold size={16} />
      </button>
      <button className={`icon-btn small${mark('italic') ? ' active' : ''}`} onMouseDown={keep} onClick={() => c.toggleMark('italic')} title="Italic (Ctrl/⌘+I)" aria-label="Italic">
        <Italic size={16} />
      </button>
      <button className={`icon-btn small${mark('underline') ? ' active' : ''}`} onMouseDown={keep} onClick={() => c.toggleMark('underline')} title="Underline (Ctrl/⌘+U)" aria-label="Underline">
        <Underline size={16} />
      </button>
      <span className="sep" />
      <button className="icon-btn small" onMouseDown={keep} onClick={() => c.undo()} disabled={!c.canUndo()} title="Undo (Ctrl/⌘+Z)" aria-label="Undo">
        <Undo2 size={16} />
      </button>
      <button className="icon-btn small" onMouseDown={keep} onClick={() => c.redo()} disabled={!c.canRedo()} title="Redo (Ctrl/⌘+Shift+Z)" aria-label="Redo">
        <Redo2 size={16} />
      </button>
      <span className="sep" />
      <button className="icon-btn small" onMouseDown={keep} onClick={() => setPrefs({ zoom: Math.max(0.6, +(prefs.zoom - 0.1).toFixed(2)) })} title="Zoom out" aria-label="Zoom out">
        <ZoomOut size={16} />
      </button>
      <button className="btn ghost small" onMouseDown={keep} onClick={() => setPrefs({ zoom: 1 })} title="Reset zoom" style={{ minWidth: 48 }}>
        {Math.round(prefs.zoom * 100)}%
      </button>
      <button className="icon-btn small" onMouseDown={keep} onClick={() => setPrefs({ zoom: Math.min(2, +(prefs.zoom + 0.1).toFixed(2)) })} title="Zoom in" aria-label="Zoom in">
        <ZoomIn size={16} />
      </button>
      <span className="sep" />
      <button
        className={`icon-btn small${prefs.typewriter ? ' active' : ''}`}
        onMouseDown={keep}
        onClick={() => setPrefs({ typewriter: !prefs.typewriter })}
        title="Typewriter scrolling: keep the current line in the middle of the screen"
        aria-label="Typewriter scrolling"
        aria-pressed={prefs.typewriter}
      >
        <ScanText size={16} />
      </button>
      <button
        className={`icon-btn small${focusMode ? ' active' : ''}`}
        onMouseDown={keep}
        onClick={() => setFocusMode(!focusMode)}
        title="Focus mode: hide panels and dim everything but the current paragraph"
        aria-label="Focus mode"
        aria-pressed={focusMode}
      >
        <Focus size={16} />
      </button>
      <span style={{ flex: 1 }} />
      <button
        className={`icon-btn small${prefs.showInspector ? ' active' : ''}`}
        onMouseDown={keep}
        onClick={() => setPrefs({ showInspector: !prefs.showInspector })}
        title="Scene inspector"
        aria-label="Toggle scene inspector"
        aria-pressed={prefs.showInspector}
      >
        <PanelRight size={16} />
      </button>
    </div>
  )
}

function FindBar() {
  const c = useController()
  const state = useEditorState()
  const { setFindOpen, notify } = useApp.getState()
  const [text, setText] = useState(() => c.getSearch().query.text)
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCase] = useState(false)
  const [wholeWord, setWhole] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    c.setSearch({ text, caseSensitive, wholeWord })
  }, [c, text, caseSensitive, wholeWord])

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const search = c.getSearch()
  void state
  const count = search.matches.length
  const close = () => {
    setFindOpen(false)
    c.focus()
  }

  return (
    <div className="findbar" role="search">
      <input
        ref={inputRef}
        className="input"
        placeholder="Find"
        aria-label="Find"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            c.findNext(e.shiftKey ? -1 : 1)
            inputRef.current?.focus()
          } else if (e.key === 'Escape') close()
        }}
      />
      <span className="count" aria-live="polite">
        {text ? (count ? `${search.current >= 0 ? search.current + 1 : '–'} of ${count}` : 'No results') : ''}
      </span>
      <button className="icon-btn small" onClick={() => c.findNext(-1)} disabled={!count} aria-label="Previous match" title="Previous (Shift+Enter)">
        <ChevronUp size={16} />
      </button>
      <button className="icon-btn small" onClick={() => c.findNext(1)} disabled={!count} aria-label="Next match" title="Next (Enter)">
        <ChevronDown size={16} />
      </button>
      <label>
        <input type="checkbox" checked={caseSensitive} onChange={(e) => setCase(e.target.checked)} /> Match case
      </label>
      <label>
        <input type="checkbox" checked={wholeWord} onChange={(e) => setWhole(e.target.checked)} /> Whole word
      </label>
      <span className="sep" style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
      <input
        className="input"
        placeholder="Replace with"
        aria-label="Replace with"
        value={replacement}
        onChange={(e) => setReplacement(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            c.replaceCurrent(replacement)
          } else if (e.key === 'Escape') close()
        }}
      />
      <button className="btn small" onClick={() => c.replaceCurrent(replacement)} disabled={!count}>
        Replace
      </button>
      <button
        className="btn small"
        disabled={!count}
        onClick={() => {
          const n = c.replaceAll(replacement)
          notify(`Replaced ${n} occurrence${n === 1 ? '' : 's'}.`)
        }}
      >
        Replace all
      </button>
      <span style={{ flex: 1 }} />
      <button className="icon-btn small" onClick={close} aria-label="Close find bar">
        <X size={16} />
      </button>
    </div>
  )
}

function Editor() {
  const c = useController()
  const project = useProject()
  const zoom = useApp((s) => s.prefs.zoom)
  const focusMode = useApp((s) => s.focusMode)
  const mountRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!mountRef.current) return
    c.attach(mountRef.current)
    c.scroller = scrollerRef.current
    const t = setTimeout(() => {
      if (c.view && !c.view.hasFocus() && !document.activeElement?.closest('.findbar')) c.view.focus()
    }, 0)
    return () => {
      clearTimeout(t)
      c.scroller = null
      c.detach()
    }
  }, [c])

  const s = project.settings
  const classes = ['paper', s.showSceneNumbers && 'show-scene-numbers', s.boldSceneHeadings && 'bold-scenes', s.sceneSpacing === 2 && 'double-scene-spacing']
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={`paper-scroller${focusMode ? ' focus-mode' : ''}`}
      ref={scrollerRef}
      onMouseDown={(e) => {
        // Clicking the grey area around the page focuses the editor.
        if (e.target === e.currentTarget) {
          e.preventDefault()
          c.focus()
        }
      }}
    >
      <div className={classes} style={{ ['--zoom' as string]: zoom }}>
        <div ref={mountRef} />
      </div>
    </div>
  )
}

function SceneNavigator() {
  const c = useController()
  const analysis = useAnalysis()
  const pagination = usePagination()
  const state = useEditorState()
  const [filter, setFilter] = useState('')
  const $from = state.selection.$from
  const index = $from.depth >= 1 ? $from.index(0) : 0
  const current = sceneAt(analysis.scenes, index)
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [current?.id])

  const items = useMemo(() => {
    const q = filter.trim().toUpperCase()
    const list: ({ kind: 'section'; index: number; title: string } | { kind: 'scene'; scene: (typeof analysis.scenes)[number] })[] = []
    const scenes = analysis.scenes.filter(
      (s) => !q || s.heading.includes(q) || s.synopsis.toUpperCase().includes(q) || s.characters.some((ch) => ch.includes(q)),
    )
    let si = 0
    for (const sec of analysis.sections) {
      while (si < scenes.length && scenes[si].index < sec.index) list.push({ kind: 'scene', scene: scenes[si++] })
      if (!q) list.push({ kind: 'section', index: sec.index, title: sec.title })
    }
    while (si < scenes.length) list.push({ kind: 'scene', scene: scenes[si++] })
    return list
  }, [analysis, filter])

  return (
    <aside className="sidebar" aria-label="Scene navigator">
      <div className="sidebar-header">
        <span>Scenes</span>
        <span className="pill">{analysis.scenes.length}</span>
      </div>
      <div className="nav-filter">
        <input className="input" placeholder="Filter scenes, characters…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter scenes" />
      </div>
      <div className="sidebar-body">
        {items.length === 0 && <p className="faint" style={{ padding: 8, fontSize: 13 }}>{filter ? 'No matching scenes.' : 'Scene headings you write will appear here.'}</p>}
        {items.map((it) =>
          it.kind === 'section' ? (
            <button key={`sec-${it.index}`} className="nav-section" onClick={() => c.revealElement(it.index, true)}>
              {it.title || 'Untitled section'}
            </button>
          ) : (
            <button
              key={it.scene.id}
              ref={current?.id === it.scene.id ? activeRef : undefined}
              className={`nav-scene${current?.id === it.scene.id ? ' active' : ''}`}
              style={{ ['--dot' as string]: colorVar(it.scene.color) }}
              onClick={() => c.revealScene(it.scene.id)}
              title={it.scene.heading}
            >
              <span className="num">{it.scene.number}</span>
              <span className="heading">{it.scene.heading || <em className="faint">Untitled scene</em>}</span>
              <span className="page">p{pagination.elementPage[it.scene.index] ?? 1}</span>
              {it.scene.synopsis && <span className="synopsis">{it.scene.synopsis}</span>}
            </button>
          ),
        )}
      </div>
    </aside>
  )
}

function SceneInspector() {
  const c = useController()
  const analysis = useAnalysis()
  const pagination = usePagination()
  const state = useEditorState()
  const $from = state.selection.$from
  const index = $from.depth >= 1 ? $from.index(0) : 0
  const scene = sceneAt(analysis.scenes, index)
  const layout = scene ? pagination.scenes.find((s) => s.elementIndex === scene.index) : undefined

  return (
    <aside className="sidebar right" aria-label="Scene inspector">
      <div className="sidebar-header">
        <span>{scene ? `Scene ${scene.number}` : 'Script'}</span>
        {layout && <span className="pill">p. {layout.page}</span>}
      </div>
      <div className="sidebar-body" style={{ padding: 0 }}>
        {scene ? (
          <>
            <div className="inspector-section">
              <div className="inspector-heading">{scene.heading || 'Untitled scene'}</div>
              <div className="stat-grid">
                <div className="stat">
                  <b>{layout ? formatEighths(toEighths(layout.lines, pagination.linesPerPage)) : '–'}</b>
                  <span>length (pages)</span>
                </div>
                <div className="stat">
                  <b>{scene.words}</b>
                  <span>words</span>
                </div>
              </div>
            </div>
            <div className="inspector-section">
              <label className="field">
                <span>Synopsis</span>
                <LazyTextarea
                  key={`syn-${scene.id}`}
                  className="textarea"
                  rows={3}
                  placeholder="What happens in this scene?"
                  value={scene.synopsis}
                  onCommit={(v) => c.setSceneAttrs(scene.id, { synopsis: v })}
                />
              </label>
              <label className="field">
                <span>Notes</span>
                <LazyTextarea
                  key={`notes-${scene.id}`}
                  className="textarea"
                  rows={3}
                  placeholder="Ideas, problems, research…"
                  value={scene.notes}
                  onCommit={(v) => c.setSceneAttrs(scene.id, { notes: v })}
                />
              </label>
              <div className="field">
                <span>Card colour</span>
                <ColorPicker value={scene.color} onChange={(color) => c.setSceneAttrs(scene.id, { color })} />
              </div>
            </div>
            <div className="inspector-section">
              <span className="label">Characters in scene</span>
              {scene.characters.length ? (
                <div className="chips">
                  {scene.characters.map((ch) => (
                    <span key={ch} className="pill">
                      {ch}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="faint" style={{ fontSize: 13 }}>
                  No dialogue yet.
                </span>
              )}
              {scene.parts.location && (
                <>
                  <span className="label">Location</span>
                  <span style={{ fontSize: 13 }}>
                    {scene.parts.intExt !== 'OTHER' ? `${scene.parts.intExt} · ` : ''}
                    {scene.parts.location}
                    {scene.parts.time ? ` · ${scene.parts.time}` : ''}
                  </span>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="inspector-section">
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Put the cursor inside a scene to see its synopsis, notes, colour and cast here.
            </p>
            <div className="stat-grid">
              <div className="stat">
                <b>{pagination.pages.length}</b>
                <span>pages</span>
              </div>
              <div className="stat">
                <b>{analysis.scenes.length}</b>
                <span>scenes</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

export function ScriptView() {
  const findOpen = useApp((s) => s.findOpen)
  const prefs = useApp((s) => s.prefs)
  const focusMode = useApp((s) => s.focusMode)
  return (
    <div className="script-view">
      {prefs.showNavigator && !focusMode && <SceneNavigator />}
      <section className="editor-column">
        {!focusMode && <ElementToolbar />}
        {focusMode && <FocusExit />}
        {findOpen && <FindBar />}
        <Editor />
      </section>
      {prefs.showInspector && !focusMode && <SceneInspector />}
    </div>
  )
}

function FocusExit() {
  const setFocusMode = useApp((s) => s.setFocusMode)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && setFocusMode(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setFocusMode])
  return (
    <button className="btn small" style={{ position: 'absolute', top: 10, right: 16, zIndex: 5, opacity: 0.7 }} onClick={() => setFocusMode(false)}>
      Exit focus mode (Esc)
    </button>
  )
}
