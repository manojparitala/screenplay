import {
  ArrowLeft,
  ChartColumn,
  ChartGantt,
  ChartNetwork,
  CircleQuestionMark,
  Clock,
  Download,
  Eye,
  FileText,
  LayoutGrid,
  MapPin,
  Moon,
  Printer,
  Route,
  Search,
  Settings,
  StickyNote,
  Sun,
  Type,
  Users,
} from 'lucide-react'
import { useEffect, type ComponentType } from 'react'
import { ELEMENTS } from '../core/elements'
import { toFdx } from '../core/fdx'
import { toFountain } from '../core/fountain'
import { exportPdf, pdfScripts } from '../core/pdf'
import { projectTitle, safeFileName, serializeProject } from '../core/project'
import { SCRIPTS } from '../core/scripts'
import type { Shaper } from '../core/shaper'
import { useApp, type ViewId } from '../store/app'
import { loadShaper } from '../store/fonts'
import { useAnalysis, useEditorState, usePagination, useProject } from '../store/hooks'
import { BeatsView } from '../views/BeatsView'
import { CardsView } from '../views/CardsView'
import { CharactersView } from '../views/CharactersView'
import { LocationsView } from '../views/LocationsView'
import { NotesView } from '../views/NotesView'
import { PreviewView } from '../views/PreviewView'
import { RelationshipsView } from '../views/RelationshipsView'
import { ReportsView } from '../views/ReportsView'
import { ScriptView } from '../views/ScriptView'
import { TimelineView } from '../views/TimelineView'
import { TitlePageView } from '../views/TitlePageView'
import { HelpDialog } from './HelpDialog'
import { SettingsDialog } from './SettingsDialog'
import { SnapshotsDialog } from './SnapshotsDialog'
import { canPrint, saveFile } from './save'
import { formatRuntime, Menu } from './ui'

const TABS: { id: ViewId; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { id: 'script', label: 'Script', icon: FileText },
  { id: 'cards', label: 'Cards', icon: LayoutGrid },
  { id: 'beats', label: 'Beats', icon: Route },
  { id: 'characters', label: 'Characters', icon: Users },
  { id: 'timeline', label: 'Timeline', icon: ChartGantt },
  { id: 'relationships', label: 'Relationships', icon: ChartNetwork },
  { id: 'locations', label: 'Locations', icon: MapPin },
  { id: 'reports', label: 'Reports', icon: ChartColumn },
  { id: 'title', label: 'Title Page', icon: Type },
  { id: 'notes', label: 'Notes', icon: StickyNote },
  { id: 'preview', label: 'Preview', icon: Eye },
]

export async function exportAs(kind: 'pdf' | 'fountain' | 'fdx' | 'json') {
  const s = useApp.getState()
  const data = s.currentProjectData()
  if (!data) return
  const base = safeFileName(projectTitle(data))
  try {
    if (kind === 'pdf') {
      // Text in Indian scripts needs its fonts and the shaping engine, loaded only when used.
      const scripts = pdfScripts(data.script, data.settings.includeTitlePage ? data.titlePage : undefined)
      let shaper: Shaper | null = null
      let fontError = false
      if (scripts.size) {
        try {
          shaper = await loadShaper(scripts)
        } catch (e) {
          console.error(e)
          fontError = true
        }
      }
      const { blob, missing } = await exportPdf(data.script, { settings: data.settings, titlePage: data.titlePage, shaper })
      const saved = await saveFile(`${base}.pdf`, blob, 'application/pdf')
      if (saved && fontError) {
        const names = [...scripts].map((k) => SCRIPTS[k].label).join(', ')
        s.notify(
          `The ${names} text couldn’t be prepared for this PDF, so it appears as “?”. ` +
            (canPrint()
              ? 'Try again, or open Preview, choose Print and save as PDF.'
              : 'Try again, or export Fountain or Final Draft, which keep every character.'),
          'error',
        )
      } else if (saved && missing.length) {
        const sample = missing.slice(0, 6).join(' ')
        s.notify(
          `The PDF can’t show some characters in this script (${sample}${missing.length > 6 ? ' …' : ''}), so they appear as “?”. ` +
            'It can show Latin-alphabet text, Hindi, Tamil, Telugu, Kannada and Malayalam. ' +
            (canPrint()
              ? 'To keep the other characters, open Preview, choose Print and save as PDF.'
              : 'Fountain and Final Draft exports keep every character.'),
          'error',
        )
      }
    } else if (kind === 'fountain') {
      await saveFile(`${base}.fountain`, toFountain(data.script, data.titlePage))
    } else if (kind === 'fdx') {
      await saveFile(`${base}.fdx`, toFdx(data.script, data.titlePage), 'application/xml')
    } else {
      await saveFile(`${base}.screenplay.json`, serializeProject(data), 'application/json')
    }
  } catch (e) {
    s.notify(`Export failed: ${(e as Error).message}`, 'error')
  }
}

function ExportMenu() {
  const setView = useApp((s) => s.setView)
  return (
    <Menu
      trigger={(open, toggle) => (
        <button className={`btn small${open ? ' active' : ''}`} onClick={toggle} aria-haspopup="menu" aria-expanded={open}>
          <Download size={15} /> <span className="tab-label">Export</span>
        </button>
      )}
    >
      {(close) => {
        const item = (label: string, hint: string, fn: () => void) => (
          <button
            className="menu-item"
            role="menuitem"
            onClick={() => {
              close()
              fn()
            }}
          >
            {label}
            <small>{hint}</small>
          </button>
        )
        return (
          <>
            {item('PDF', '.pdf', () => void exportAs('pdf'))}
            {item('Fountain', '.fountain', () => void exportAs('fountain'))}
            {item('Final Draft', '.fdx', () => void exportAs('fdx'))}
            <div className="menu-sep" />
            {item('Project backup', '.json', () => void exportAs('json'))}
            {canPrint() && (
              <>
                <div className="menu-sep" />
                <button
                  className="menu-item"
                  role="menuitem"
                  onClick={() => {
                    close()
                    setView('preview')
                    setTimeout(() => window.print(), 300)
                  }}
                >
                  <Printer size={15} /> Print…
                </button>
              </>
            )}
          </>
        )
      }}
    </Menu>
  )
}

function SaveIndicator() {
  const state = useApp((s) => s.saveState)
  const label = state === 'saved' ? 'Saved' : state === 'saving' ? 'Saving…' : state === 'unsaved' ? 'Edited' : 'Save failed'
  return (
    <span
      className={`save-state${state === 'error' ? ' error' : ''}`}
      aria-live="polite"
      title={state === 'saved' ? 'All changes are saved in this browser' : undefined}
    >
      {label}
    </span>
  )
}

function StatusBar() {
  const state = useEditorState()
  const pagination = usePagination()
  const analysis = useAnalysis()
  const start = useApp((s) => s.sessionStartWords)
  const $from = state.selection.$from
  const index = $from.depth >= 1 ? $from.index(0) : 0
  const type = $from.depth >= 1 ? ($from.node(1).type.name as keyof typeof ELEMENTS) : 'action'
  const page = pagination.elementPage[index] ?? 1
  const pages = pagination.pages.length
  let sceneNo = 0
  for (const s of analysis.scenes) if (s.index <= index) sceneNo = s.number
  const delta = analysis.words - start
  return (
    <footer className="statusbar no-print">
      <span>
        <strong>{ELEMENTS[type]?.label}</strong>
      </span>
      <span>
        Page <strong>{page}</strong> of {pages}
      </span>
      <span>
        Scene <strong>{sceneNo || '–'}</strong> of {analysis.scenes.length}
      </span>
      <span className="grow" />
      <span>{analysis.words.toLocaleString()} words</span>
      <span title="One page is roughly one minute of screen time">≈ {formatRuntime(pages)}</span>
      <span title="Words written since you opened this script">
        Session {delta >= 0 ? '+' : ''}
        {delta.toLocaleString()}
      </span>
    </footer>
  )
}

export function ProjectShell() {
  const project = useProject()
  const view = useApp((s) => s.view)
  const dialog = useApp((s) => s.dialog)
  const theme = useApp((s) => s.prefs.theme)
  const focusMode = useApp((s) => s.focusMode && s.view === 'script')
  const { setView, setDialog, closeProject, setFindOpen, saveNow, setPrefs, notify } = useApp.getState()

  useEffect(() => {
    document.title = `${projectTitle(project)} – Screenplay`
    return () => {
      document.title = 'Screenplay'
    }
  }, [project])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setView('script')
        setFindOpen(true)
        setTimeout(() => document.querySelector<HTMLInputElement>('.findbar input')?.select(), 0)
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveNow().then(() => notify('Saved.'))
      } else if (mod && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        setView('preview')
        if (canPrint()) setTimeout(() => window.print(), 300)
      } else if (e.key === 'F1' || (mod && e.key === '/')) {
        e.preventDefault()
        setDialog('help')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setView, setFindOpen, saveNow, notify, setDialog])

  const isDark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <>
      <header className="topbar no-print" hidden={focusMode}>
        <button className="icon-btn" onClick={() => void closeProject()} aria-label="Back to library" title="Back to library">
          <ArrowLeft size={18} />
        </button>
        <span className="project-title" title={projectTitle(project)}>
          {projectTitle(project)}
        </span>
        <nav className="tabs" aria-label="Views">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab${view === t.id ? ' active' : ''}`}
              onClick={() => setView(t.id)}
              aria-current={view === t.id ? 'page' : undefined}
              title={t.label}
            >
              <t.icon size={16} />
              <span className="tab-label">{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="topbar-actions">
          <SaveIndicator />
          <button
            className="icon-btn"
            onClick={() => {
              setView('script')
              setFindOpen(true)
            }}
            aria-label="Find and replace"
            title="Find and replace (Ctrl/⌘+F)"
          >
            <Search size={18} />
          </button>
          <ExportMenu />
          <button className="icon-btn" onClick={() => setDialog('snapshots')} aria-label="Snapshots" title="Snapshots (saved drafts)">
            <Clock size={18} />
          </button>
          <button className="icon-btn" onClick={() => setDialog('settings')} aria-label="Settings" title="Settings">
            <Settings size={18} />
          </button>
          <button className="icon-btn" onClick={() => setPrefs({ theme: isDark ? 'light' : 'dark' })} aria-label="Toggle dark mode" title="Toggle dark mode">
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="icon-btn" onClick={() => setDialog('help')} aria-label="Help and shortcuts" title="Help and shortcuts (F1)">
            <CircleQuestionMark size={18} />
          </button>
        </div>
      </header>
      <main className="workspace">
        {view === 'script' && <ScriptView />}
        {view === 'cards' && <CardsView />}
        {view === 'beats' && <BeatsView />}
        {view === 'characters' && <CharactersView />}
        {view === 'timeline' && <TimelineView />}
        {view === 'relationships' && <RelationshipsView />}
        {view === 'locations' && <LocationsView />}
        {view === 'reports' && <ReportsView />}
        {view === 'title' && <TitlePageView />}
        {view === 'notes' && <NotesView />}
        {view === 'preview' && <PreviewView />}
      </main>
      <StatusBar />
      {dialog === 'settings' && <SettingsDialog onClose={() => setDialog(null)} />}
      {dialog === 'snapshots' && <SnapshotsDialog onClose={() => setDialog(null)} />}
      {dialog === 'help' && <HelpDialog onClose={() => setDialog(null)} />}
    </>
  )
}
